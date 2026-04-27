import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { PledgeInputSchema } from "../lib/schemas";
import { withIdempotency } from "../lib/idempotency";

/**
 * Pledge to a ticket need. Single PLEDGE_FIRST path for both NORMAL and
 * EMERGENCY tickets in the demo cut — Flow A AGREEMENT_FIRST (Google Docs
 * chain) is deferred per List.md §2.3. Single transaction commits the
 * contribution, bumps need + ticket progress, and denormalizes the
 * participantOrgIds + contributorCount aggregates.
 *
 * App Check disabled for demo (no site key wired client-side); add back
 * post-demo. Idempotent via `withIdempotency`.
 */
export const pledge = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const { uid, token } = request.auth;
  const orgId = token.orgId as string | undefined;
  if (!orgId) {
    throw new HttpsError("failed-precondition", "Your org isn't approved yet.");
  }

  const parsed = PledgeInputSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", parsed.error.message);
  }
  const input = parsed.data;

  return withIdempotency(uid, input.requestId, async () => {
    const db = admin.firestore();

    // Verify org is ACTIVE before entering the txn (cheap pre-check; the txn
    // re-reads the ticket but not the org — that's fine, ACTIVE rarely toggles).
    const orgSnap = await db.collection("organizations").doc(orgId).get();
    if (!orgSnap.exists || orgSnap.data()!.status !== "ACTIVE") {
      throw new HttpsError(
        "failed-precondition",
        "Only ACTIVE organizations can pledge.",
      );
    }

    const ticketRef = db.collection("tickets").doc(input.ticketId);
    const contributionsRef = ticketRef.collection("contributions");

    return db.runTransaction(async (tx) => {
      const ticketSnap = await tx.get(ticketRef);
      if (!ticketSnap.exists) {
        throw new HttpsError("not-found", "Ticket not found.");
      }
      const ticket = ticketSnap.data()!;

      if (ticket.hostOrgId === orgId) {
        throw new HttpsError(
          "failed-precondition",
          "Hosts cannot pledge on their own tickets.",
        );
      }
      if (ticket.phase !== "OPEN_FOR_CONTRIBUTIONS") {
        throw new HttpsError(
          "failed-precondition",
          `Ticket is not accepting pledges (phase: ${ticket.phase}).`,
        );
      }

      const needs = Array.isArray(ticket.needs) ? ticket.needs : [];
      if (input.needIndex < 0 || input.needIndex >= needs.length) {
        throw new HttpsError("out-of-range", "needIndex out of range.");
      }
      const need = needs[input.needIndex];
      if (need.resourceCategory !== input.offered.kind) {
        throw new HttpsError(
          "invalid-argument",
          `Offered kind '${input.offered.kind}' does not match need category '${need.resourceCategory}'.`,
        );
      }

      // Reject double-pledge from the same org on this ticket.
      const existing = await tx.get(
        contributionsRef.where("contributorOrgId", "==", orgId),
      );
      if (!existing.empty) {
        throw new HttpsError(
          "already-exists",
          "Your org has already pledged to this ticket.",
        );
      }

      // ── Compute new state ─────────────────────────────────────────────
      const needQty = Number(need.quantity ?? 0);
      const offeredQty = Number(input.offered.quantity);
      const pctAdded = needQty > 0 ? (offeredQty / needQty) * 100 : 0;
      const newNeedPct = Math.min(100, Number(need.progressPct ?? 0) + pctAdded);

      const newNeeds = needs.map((n: typeof need, i: number) =>
        i === input.needIndex ? { ...n, progressPct: newNeedPct } : n,
      );
      const totalValuation = newNeeds.reduce(
        (a: number, n: typeof need) => a + Number(n.valuationINR ?? 0),
        0,
      );
      const newProgressPct =
        totalValuation === 0
          ? 0
          : Math.round(
              (newNeeds.reduce(
                (a: number, n: typeof need) =>
                  a + (Number(n.progressPct ?? 0) / 100) * Number(n.valuationINR ?? 0),
                0,
              ) /
                totalValuation) *
                100,
            );

      // ── Writes ────────────────────────────────────────────────────────
      const now = Date.now();
      const contributionRef = contributionsRef.doc();
      tx.set(contributionRef, {
        contributorOrgId: orgId,
        resourceId: input.resourceId ?? null,
        needIndex: input.needIndex,
        offered: input.offered,
        status: "COMMITTED",
        commitPath: "PLEDGE_FIRST",
        requestId: input.requestId,
        createdAt: now,
        committedAt: now,
      });

      tx.update(ticketRef, {
        needs: newNeeds,
        progressPct: newProgressPct,
        contributorCount: FieldValue.increment(1),
        participantOrgIds: FieldValue.arrayUnion(orgId),
        lastUpdatedAt: now,
      });

      return {
        contributionId: contributionRef.id,
        progressPct: newProgressPct,
      };
    });
  });
});
