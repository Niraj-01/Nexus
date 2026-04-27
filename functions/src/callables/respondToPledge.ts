import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { RespondToPledgeInputSchema } from "../lib/schemas";
import { withIdempotency } from "../lib/idempotency";
import { reserveInventory } from "../lib/inventory";

/**
 * Host responds to a PROPOSED contribution on their ticket. APPROVE flips
 * status → COMMITTED, reserves inventory on the contributor's resource, and
 * advances ticket progress. REJECT flips status → REJECTED with no
 * inventory side-effects.
 *
 * The pledge callable parks non-rapid contributions in PROPOSED so the
 * host owns consent. Rapid tickets bypass this gate entirely (pledge
 * commits directly).
 *
 * Re-runs the resource-side validity checks at decision time because
 * resource state may have drifted between pledge and approval (inventory
 * consumed by another approval, resource taken offline, etc.).
 *
 * Idempotent via `withIdempotency`.
 */
export const respondToPledge = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const { uid, token } = request.auth;
  const orgId = token.orgId as string | undefined;
  if (!orgId) {
    throw new HttpsError("failed-precondition", "Your org isn't approved yet.");
  }

  const parsed = RespondToPledgeInputSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", parsed.error.message);
  }
  const input = parsed.data;

  return withIdempotency(uid, input.requestId, async () => {
    const db = admin.firestore();
    const ticketRef = db.collection("tickets").doc(input.ticketId);
    const contributionRef = ticketRef
      .collection("contributions")
      .doc(input.contributionId);

    return db.runTransaction(async (tx) => {
      const [ticketSnap, contribSnap] = await Promise.all([
        tx.get(ticketRef),
        tx.get(contributionRef),
      ]);
      if (!ticketSnap.exists) {
        throw new HttpsError("not-found", "Ticket not found.");
      }
      if (!contribSnap.exists) {
        throw new HttpsError("not-found", "Contribution not found.");
      }
      const ticket = ticketSnap.data()!;
      const contribution = contribSnap.data()!;

      if (ticket.hostOrgId !== orgId) {
        throw new HttpsError(
          "permission-denied",
          "Only the host can respond to pledges on this ticket.",
        );
      }
      if (ticket.phase !== "OPEN_FOR_CONTRIBUTIONS") {
        throw new HttpsError(
          "failed-precondition",
          `Ticket is not accepting pledges (phase: ${ticket.phase}).`,
        );
      }
      if (contribution.status !== "PROPOSED") {
        throw new HttpsError(
          "failed-precondition",
          `Contribution is not awaiting approval (status: ${contribution.status}).`,
        );
      }

      const now = Date.now();

      if (input.decision === "REJECT") {
        tx.update(contributionRef, {
          status: "REJECTED",
          rejectedAt: now,
          rejectReason: input.note ?? "",
        });
        tx.update(ticketRef, { lastUpdatedAt: now });
        return { status: "REJECTED" as const };
      }

      // APPROVE: re-check resource state (it may have drifted) and reserve.
      const resourceId = String(contribution.resourceId ?? "");
      if (!resourceId) {
        throw new HttpsError(
          "failed-precondition",
          "Contribution has no resource reference; cannot approve.",
        );
      }
      const resourceRef = db.collection("resources").doc(resourceId);
      const resourceSnap = await tx.get(resourceRef);
      if (!resourceSnap.exists) {
        throw new HttpsError(
          "failed-precondition",
          "Pledged resource no longer exists.",
        );
      }
      const resource = resourceSnap.data()!;
      const offered = contribution.offered ?? {};
      const offeredQty = Number(offered.quantity ?? 0);

      if (resource.orgId !== contribution.contributorOrgId) {
        throw new HttpsError(
          "failed-precondition",
          "Pledged resource is no longer owned by the contributor.",
        );
      }
      if (resource.status === "DEPLETED") {
        throw new HttpsError(
          "failed-precondition",
          "Pledged resource is depleted.",
        );
      }
      const free = Number(resource.quantity ?? 0) - Number(resource.reservedQuantity ?? 0);
      if (offeredQty > free) {
        throw new HttpsError(
          "failed-precondition",
          `Resource only has ${free} units free; pledge of ${offeredQty} cannot be approved.`,
        );
      }

      const needs = Array.isArray(ticket.needs) ? ticket.needs : [];
      const needIndex = Number(contribution.needIndex ?? -1);
      if (needIndex < 0 || needIndex >= needs.length) {
        throw new HttpsError(
          "failed-precondition",
          "Contribution references an invalid need.",
        );
      }
      const need = needs[needIndex];
      const needQty = Number(need.quantity ?? 0);

      // Re-check the per-need cap. State may have drifted since the pledge
      // landed: the host may have approved another contributor's PROPOSED
      // first, eating the headroom this contribution was counting on. Sum
      // every COMMITTED / EXECUTED / SIGNED_OFF on this need (excluding the
      // contribution we're about to approve) and verify approval doesn't
      // exceed need.quantity.
      const ticketContribs = await tx.get(
        ticketRef.collection("contributions"),
      );
      let consumedOnNeed = 0;
      for (const doc of ticketContribs.docs) {
        if (doc.id === input.contributionId) continue;
        const d = doc.data();
        if (Number(d.needIndex ?? -1) !== needIndex) continue;
        const s = String(d.status ?? "");
        if (s === "REJECTED" || s === "PROPOSED") continue;
        consumedOnNeed += Number(d.offered?.quantity ?? 0);
      }
      const remainingOnNeed = Math.max(0, needQty - consumedOnNeed);
      if (offeredQty > remainingOnNeed) {
        throw new HttpsError(
          "failed-precondition",
          `Need only has ${remainingOnNeed} ${String(need.unit ?? "")} of remaining capacity; cannot approve a ${offeredQty}-unit pledge. Reject this proposal instead.`,
        );
      }

      const pctOfNeed = needQty > 0 ? Math.min(100, (offeredQty / needQty) * 100) : 0;

      const newNeedPct = Math.min(100, Number(need.progressPct ?? 0) + pctOfNeed);
      const newNeeds = needs.map((n: typeof need, i: number) =>
        i === needIndex ? { ...n, progressPct: newNeedPct } : n,
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
                  a +
                  (Number(n.progressPct ?? 0) / 100) * Number(n.valuationINR ?? 0),
                0,
              ) /
                totalValuation) *
                100,
            );

      // reserveInventory does an internal tx.get(resource) — already-read
      // doc returns from the tx cache, so this is safe ordering-wise (still
      // a read), and must run before any tx writes below.
      await reserveInventory(tx, resourceId, offeredQty);

      tx.update(contributionRef, {
        status: "COMMITTED",
        committedAt: now,
      });
      tx.update(ticketRef, {
        needs: newNeeds,
        progressPct: newProgressPct,
        contributorCount: FieldValue.increment(1),
        participantOrgIds: FieldValue.arrayUnion(contribution.contributorOrgId),
        lastUpdatedAt: now,
      });

      return { status: "COMMITTED" as const, progressPct: newProgressPct };
    });
  });
});
