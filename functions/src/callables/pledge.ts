import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { PledgeInputSchema } from "../lib/schemas";
import { withIdempotency } from "../lib/idempotency";
import { reserveInventory } from "../lib/inventory";

/**
 * Pledge to a ticket need. Single PLEDGE_FIRST path; Flow A AGREEMENT_FIRST
 * deferred per List.md §2.3.
 *
 * The server is the source of truth — the contributor names a `resourceId`
 * and a `quantity`; everything else (offered.kind, unit, valuationINR,
 * pctOfNeed) is derived from the resource doc inside the transaction. This
 * closes V1–V7 in the audit (resource ownership, inventory cap, emergency
 * gating, valuation inflation, status, availability window).
 *
 * Status assignment depends on rapid:
 *   ticket.rapid === true   → status='COMMITTED', inventory reserved now,
 *                             progressPct bumped, host has no veto
 *                             (emergency: speed > consent)
 *   ticket.rapid === false  → status='PROPOSED', no inventory change yet,
 *                             progressPct unchanged. Host calls
 *                             respondToPledge to APPROVE/REJECT.
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

    const orgSnap = await db.collection("organizations").doc(orgId).get();
    if (!orgSnap.exists || orgSnap.data()!.status !== "ACTIVE") {
      throw new HttpsError(
        "failed-precondition",
        "Only ACTIVE organizations can pledge.",
      );
    }

    const ticketRef = db.collection("tickets").doc(input.ticketId);
    const contributionsRef = ticketRef.collection("contributions");
    const resourceRef = db.collection("resources").doc(input.resourceId);

    return db.runTransaction(async (tx) => {
      // ── Reads (all reads must precede any writes in a Firestore txn) ──
      const [ticketSnap, resourceSnap] = await Promise.all([
        tx.get(ticketRef),
        tx.get(resourceRef),
      ]);
      if (!ticketSnap.exists) {
        throw new HttpsError("not-found", "Ticket not found.");
      }
      if (!resourceSnap.exists) {
        throw new HttpsError("not-found", "Resource not found.");
      }
      const ticket = ticketSnap.data()!;
      const resource = resourceSnap.data()!;

      // ── Ticket-side checks ────────────────────────────────────────────
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

      // ── Resource-side checks (V1, V2, V5, V6, V7) ─────────────────────
      if (resource.orgId !== orgId) {
        throw new HttpsError(
          "permission-denied",
          "You can only pledge resources owned by your org.",
        );
      }
      if (resource.status !== "AVAILABLE") {
        throw new HttpsError(
          "failed-precondition",
          `Resource is ${resource.status}, not AVAILABLE.`,
        );
      }
      if (resource.category !== need.resourceCategory) {
        throw new HttpsError(
          "invalid-argument",
          `Resource category '${resource.category}' does not match need category '${need.resourceCategory}'.`,
        );
      }
      const availableUntil = Number(resource.terms?.availableUntil ?? 0);
      const ticketDeadline = Number(ticket.deadline ?? 0);
      if (availableUntil > 0 && ticketDeadline > 0 && availableUntil < ticketDeadline) {
        throw new HttpsError(
          "failed-precondition",
          "Resource availability window ends before the ticket deadline.",
        );
      }
      const resQty = Number(resource.quantity ?? 0);
      const resReserved = Number(resource.reservedQuantity ?? 0);
      const free = resQty - resReserved;
      if (input.quantity > free) {
        throw new HttpsError(
          "failed-precondition",
          `Resource has only ${free} units available (you asked for ${input.quantity}).`,
        );
      }

      // Rapid-only checks (V5).
      if (ticket.rapid === true) {
        const ec = resource.emergencyContract ?? {};
        if (ec.enabled !== true) {
          throw new HttpsError(
            "failed-precondition",
            "Resource is not flagged for emergency contracts; cannot be pledged on a rapid ticket.",
          );
        }
        const cats: string[] = Array.isArray(ec.emergencyCategories) ? ec.emergencyCategories : [];
        if (cats.length > 0 && !cats.includes(String(ticket.category ?? ""))) {
          throw new HttpsError(
            "failed-precondition",
            `Resource emergency contract does not cover ticket category '${ticket.category}'.`,
          );
        }
        const cap = Number(ec.maxQuantityPerTicket ?? 0);
        if (cap > 0 && input.quantity > cap) {
          throw new HttpsError(
            "failed-precondition",
            `Pledge exceeds resource maxQuantityPerTicket (${cap}).`,
          );
        }
      }

      // Multiple pledges from the same org on the same ticket are allowed
      // — supports incremental partial fulfillment (e.g. pledge 50 today,
      // 30 more next week). Inventory is the only resource-side cap.

      // ── Per-need cap (closes follow-up #2) ────────────────────────────
      // Sum the quantities of every non-REJECTED contribution already on
      // THIS need from any contributor. PROPOSED counts toward the cap so
      // two contributors can't simultaneously pledge the same headroom.
      const allContribs = await tx.get(contributionsRef);
      let alreadyPledgedOnNeed = 0;
      for (const doc of allContribs.docs) {
        const d = doc.data();
        if (Number(d.needIndex ?? -1) !== input.needIndex) continue;
        if (String(d.status ?? "") === "REJECTED") continue;
        alreadyPledgedOnNeed += Number(d.offered?.quantity ?? 0);
      }
      const remainingOnNeed = Math.max(0, Number(need.quantity ?? 0) - alreadyPledgedOnNeed);
      if (input.quantity > remainingOnNeed) {
        throw new HttpsError(
          "failed-precondition",
          `This need has only ${remainingOnNeed} ${String(need.unit ?? "")} of remaining capacity (you asked for ${input.quantity}).`,
        );
      }

      // ── Server-derived offered (closes V3, V14) ───────────────────────
      const unitValuation = resQty > 0 ? Number(resource.valuationINR ?? 0) / resQty : 0;
      const derivedValuation = unitValuation * input.quantity;
      const needQty = Number(need.quantity ?? 0);
      const pctOfNeed = needQty > 0 ? Math.min(100, (input.quantity / needQty) * 100) : 0;

      const offered = {
        kind: resource.category,
        quantity: input.quantity,
        unit: String(resource.unit ?? ""),
        valuationINR: derivedValuation,
        pctOfNeed,
        notes: input.notes ?? "",
      };

      const isRapid = ticket.rapid === true;
      const status = isRapid ? "COMMITTED" : "PROPOSED";

      // For rapid: reserve inventory NOW. The reserveInventory helper does
      // its own tx.get on the resource doc — this must happen BEFORE any
      // writes in the transaction, so call it before tx.set below.
      if (isRapid) {
        await reserveInventory(tx, input.resourceId, input.quantity);
      }

      // ── Writes ────────────────────────────────────────────────────────
      const now = Date.now();
      const contributionRef = contributionsRef.doc();
      const contributionDoc: Record<string, unknown> = {
        contributorOrgId: orgId,
        resourceId: input.resourceId,
        needIndex: input.needIndex,
        offered,
        status,
        commitPath: "PLEDGE_FIRST",
        requestId: input.requestId,
        createdAt: now,
      };
      if (isRapid) contributionDoc.committedAt = now;
      tx.set(contributionRef, contributionDoc);

      let newProgressPct = Number(ticket.progressPct ?? 0);
      if (isRapid) {
        const newNeedPct = Math.min(100, Number(need.progressPct ?? 0) + pctOfNeed);
        const newNeeds = needs.map((n: typeof need, i: number) =>
          i === input.needIndex ? { ...n, progressPct: newNeedPct } : n,
        );
        const totalValuation = newNeeds.reduce(
          (a: number, n: typeof need) => a + Number(n.valuationINR ?? 0),
          0,
        );
        newProgressPct =
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

        tx.update(ticketRef, {
          needs: newNeeds,
          progressPct: newProgressPct,
          contributorCount: FieldValue.increment(1),
          participantOrgIds: FieldValue.arrayUnion(orgId),
          lastUpdatedAt: now,
        });
      } else {
        tx.update(ticketRef, { lastUpdatedAt: now });
      }

      return {
        contributionId: contributionRef.id,
        status,
        progressPct: newProgressPct,
      };
    });
  });
});
