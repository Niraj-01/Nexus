import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { RecordSignoffInputSchema } from "../lib/schemas";
import { withIdempotency } from "../lib/idempotency";

/**
 * Contributor records APPROVED or DISPUTED on a PENDING_SIGNOFF ticket.
 * Single transaction:
 *   - Confirms the caller's org has a contribution on this ticket whose
 *     status is EXECUTED (proves Step 4 ran for them).
 *   - Rejects double-signoff (one signoff per contributor per ticket).
 *   - Writes the signoff doc.
 *   - APPROVED → flips contribution EXECUTED → SIGNED_OFF (+ signedOffAt).
 *   - DISPUTED → flips contribution EXECUTED → DISPUTED.
 *
 * `onSignoffRecorded` runs after this and decides whether the ticket can
 * close (all contributors APPROVED, none DISPUTED). App Check disabled for
 * demo (no site key wired client-side); add back post-demo. Idempotent via
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
    const signoffsRef = ticketRef.collection("signoffs");

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

      const myContribs = await tx.get(
        contributionsRef
          .where("contributorOrgId", "==", orgId)
          .where("status", "==", "EXECUTED")
          .limit(1),
      );
      if (myContribs.empty) {
        throw new HttpsError(
          "failed-precondition",
          "No EXECUTED contribution found for your org on this ticket.",
        );
      }
      const contribDoc = myContribs.docs[0];

      const existingSignoff = await tx.get(
        signoffsRef.where("contributorOrgId", "==", orgId).limit(1),
      );
      if (!existingSignoff.empty) {
        throw new HttpsError(
          "already-exists",
          "Your org has already signed off on this ticket.",
        );
      }

      const now = Date.now();
      const signoffRef = signoffsRef.doc();
      tx.set(signoffRef, {
        contributorOrgId: orgId,
        decision: input.decision,
        note: input.note,
        signedAt: now,
      });

      const newStatus = input.decision === "APPROVED" ? "SIGNED_OFF" : "DISPUTED";
      const contribUpdate: Record<string, unknown> = { status: newStatus };
      if (input.decision === "APPROVED") {
        contribUpdate.signedOffAt = now;
      }
      tx.update(contribDoc.ref, contribUpdate);

      tx.update(ticketRef, { lastUpdatedAt: now });

      return { signoffId: signoffRef.id };
    });
  });
});
