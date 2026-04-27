import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { RecordSignoffInputSchema } from "../lib/schemas";
import { withIdempotency } from "../lib/idempotency";

/**
 * Contributor records APPROVED or DISPUTED on a PENDING_SIGNOFF ticket.
 * Single transaction:
 *   - Confirms the caller's org has at least one EXECUTED contribution on
 *     this ticket (proves Step 4 ran for them).
 *   - Rejects double-signoff (one signoff per contributor per ticket — keyed
 *     deterministically as `${ticketId}__${orgId}` for idempotency).
 *   - Writes the signoff doc.
 *   - APPROVED → flips EVERY EXECUTED contribution from this contributor
 *     to SIGNED_OFF (+ signedOffAt). Supports incremental pledges where a
 *     contributor pledged multiple times on the same ticket.
 *   - DISPUTED → flips EVERY EXECUTED contribution to DISPUTED.
 *
 * `onSignoffRecorded` runs after this and decides whether the ticket can
 * close (all contributors APPROVED, none DISPUTED). Idempotent via
 * `withIdempotency`.
 */
export const recordSignoff = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const { uid, token } = request.auth;
  const orgId = token.orgId as string | undefined;
  if (!orgId) {
    throw new HttpsError("failed-precondition", "Your org isn't approved yet.");
  }

  const parsed = RecordSignoffInputSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", parsed.error.message);
  }
  const input = parsed.data;

  return withIdempotency(uid, input.requestId, async () => {
    const db = admin.firestore();
    const ticketRef = db.collection("tickets").doc(input.ticketId);
    const contributionsRef = ticketRef.collection("contributions");
    // Deterministic doc id keeps signoffs idempotent and matches how
    // onSignoffRecorded counts contributors as a Set keyed by orgId.
    const signoffRef = ticketRef.collection("signoffs").doc(`${input.ticketId}__${orgId}`);

    return db.runTransaction(async (tx) => {
      const ticketSnap = await tx.get(ticketRef);
      if (!ticketSnap.exists) {
        throw new HttpsError("not-found", "Ticket not found.");
      }
      const ticket = ticketSnap.data()!;

      if (ticket.phase !== "PENDING_SIGNOFF") {
        throw new HttpsError(
          "failed-precondition",
          `Ticket is not awaiting signoff (phase: ${ticket.phase}).`,
        );
      }

      const myExecuted = await tx.get(
        contributionsRef
          .where("contributorOrgId", "==", orgId)
          .where("status", "==", "EXECUTED"),
      );
      if (myExecuted.empty) {
        throw new HttpsError(
          "failed-precondition",
          "No EXECUTED contribution found for your org on this ticket.",
        );
      }

      const existingSignoff = await tx.get(signoffRef);
      if (existingSignoff.exists) {
        throw new HttpsError(
          "already-exists",
          "Your org has already signed off on this ticket.",
        );
      }

      const now = Date.now();
      tx.set(signoffRef, {
        contributorOrgId: orgId,
        decision: input.decision,
        note: input.note,
        signedAt: now,
      });

      const newStatus = input.decision === "APPROVED" ? "SIGNED_OFF" : "DISPUTED";
      for (const contribDoc of myExecuted.docs) {
        const contribUpdate: Record<string, unknown> = { status: newStatus };
        if (input.decision === "APPROVED") {
          contribUpdate.signedOffAt = now;
        }
        tx.update(contribDoc.ref, contribUpdate);
      }

      tx.update(ticketRef, { lastUpdatedAt: now });

      return { signoffId: signoffRef.id, contributionsAffected: myExecuted.size };
    });
  });
});
