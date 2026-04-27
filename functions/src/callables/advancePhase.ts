import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { AdvancePhaseInputSchema } from "../lib/schemas";
import { withIdempotency } from "../lib/idempotency";

/**
 * Host-only phase transitions. Two legal targets:
 *
 *   OPEN_FOR_CONTRIBUTIONS → EXECUTION:
 *     - No progress floor (host's judgment per design choice).
 *     - Sets `advancedEarly = (progressPct < 100)` for the audit trail.
 *     - Batch-flips every COMMITTED contribution → EXECUTED in the same
 *       transaction so contributors see the new status when the next
 *       listener fires.
 *
 *   EXECUTION → PENDING_SIGNOFF:
 *     - Requires ≥1 doc in `tickets/{id}/photoProofs`. Reads with limit(1)
 *       inside the transaction so the proof check + phase write commit
 *       atomically.
 *     - Contribution statuses unchanged at this step (they remain EXECUTED
 *       until each contributor signs off).
 *
 * App Check disabled for demo (no site key wired client-side); add back
 * post-demo. Idempotent via `withIdempotency`.
 */
export const advancePhase = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const { uid, token } = request.auth;
  const orgId = token.orgId as string | undefined;
  if (!orgId) {
    throw new HttpsError("failed-precondition", "Your org isn't approved yet.");
  }

  const parsed = AdvancePhaseInputSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", parsed.error.message);
  }
  const input = parsed.data;

  return withIdempotency(uid, input.requestId, async () => {
    const db = admin.firestore();
    const ticketRef = db.collection("tickets").doc(input.ticketId);
    const contributionsRef = ticketRef.collection("contributions");
    const photoProofsRef = ticketRef.collection("photoProofs");

    return db.runTransaction(async (tx) => {
      const ticketSnap = await tx.get(ticketRef);
      if (!ticketSnap.exists) {
        throw new HttpsError("not-found", "Ticket not found.");
      }
      const ticket = ticketSnap.data()!;

      if (ticket.hostOrgId !== orgId) {
        throw new HttpsError("permission-denied", "Only the host can advance this ticket.");
      }

      const now = Date.now();

      if (input.target === "EXECUTION") {
        if (ticket.phase !== "OPEN_FOR_CONTRIBUTIONS") {
          throw new HttpsError(
            "failed-precondition",
            `Cannot advance to EXECUTION from phase ${ticket.phase}.`,
          );
        }

        const committed = await tx.get(
          contributionsRef.where("status", "==", "COMMITTED"),
        );

        const progressPct = Number(ticket.progressPct ?? 0);
        tx.update(ticketRef, {
          phase: "EXECUTION",
          phaseChangedAt: now,
          lastUpdatedAt: now,
          advancedEarly: progressPct < 100,
        });

        for (const doc of committed.docs) {
          tx.update(doc.ref, { status: "EXECUTED" });
        }

        return { phase: "EXECUTION" as const };
      }

      // target === "PENDING_SIGNOFF"
      if (ticket.phase !== "EXECUTION") {
        throw new HttpsError(
          "failed-precondition",
          `Cannot advance to PENDING_SIGNOFF from phase ${ticket.phase}.`,
        );
      }

      const proofs = await tx.get(photoProofsRef.limit(1));
      if (proofs.empty) {
        throw new HttpsError(
          "failed-precondition",
          "Upload at least one photo proof before marking execution complete.",
        );
      }

      tx.update(ticketRef, {
        phase: "PENDING_SIGNOFF",
        phaseChangedAt: now,
        lastUpdatedAt: now,
      });

      return { phase: "PENDING_SIGNOFF" as const };
    });
  });
});
