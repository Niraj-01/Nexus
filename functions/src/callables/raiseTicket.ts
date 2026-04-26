import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { RaiseTicketInputSchema } from "../lib/schemas";
import { withIdempotency } from "../lib/idempotency";

/**
 * Server-side ticket creation. Plan §1a/§1b.
 *
 * Sets phase=RAISED→OPEN_FOR_CONTRIBUTIONS (jumped directly — contributors
 * can start pledging immediately), computes `rapid` from urgency, initialises
 * per-need progressPct using hostSelfPledge, and stamps timestamps.
 *
 * urgency + rapid are immutable after this write (enforced by firestore.rules).
 * Embedding is NOT written here — onTicketCreated trigger (future) calls
 * Vertex text-embedding-004.
 */
export const raiseTicket = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const { uid, token } = request.auth;
  const orgId = token.orgId as string | undefined;
  if (!orgId) {
    throw new HttpsError("failed-precondition", "Your org isn't approved yet.");
  }

  const parsed = RaiseTicketInputSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", parsed.error.message);
  }
  const input = parsed.data;

  return withIdempotency(uid, input.requestId, async () => {
    const db = admin.firestore();

    // Verify the org exists and is ACTIVE.
    const orgSnap = await db.collection("organizations").doc(orgId).get();
    if (!orgSnap.exists) {
      throw new HttpsError("failed-precondition", "Organization not found.");
    }
    const orgData = orgSnap.data()!;
    if (orgData.status !== "ACTIVE") {
      throw new HttpsError(
        "failed-precondition",
        "Only ACTIVE organizations can raise tickets.",
      );
    }

    const now = Date.now();
    const rapid = input.urgency === "EMERGENCY";

    // Seed per-need progressPct from hostSelfPledge. `subtype` (optional) flows
    // through; the onTicketCreated embedding trigger reads it.
    const needs = input.needs.map((n) => ({
      ...n,
      progressPct: Math.min(100, n.hostSelfPledge.pctOfNeed),
    }));

    // Overall progress is valuation-weighted across needs.
    const totalValuation = needs.reduce((a, n) => a + n.valuationINR, 0);
    const progressPct =
      totalValuation === 0
        ? 0
        : Math.round(
            needs.reduce(
              (a, n) => a + (n.hostSelfPledge.pctOfNeed / 100) * n.valuationINR,
              0,
            ) / totalValuation * 100,
          );

    // Denormalize host snapshot — name + type only. Status is implicit ACTIVE
    // (gate above) and reliability is read from the org doc when needed.
    const host = {
      name: String(orgData.name ?? ""),
      type: orgData.type as "NGO" | "ORG",
    };

    const ticketRef = db.collection("tickets").doc();
    await ticketRef.set({
      hostOrgId: orgId,
      host,
      title: input.title,
      description: input.description,
      category: input.category,
      urgency: input.urgency,
      rapid,
      needs,
      geo: input.geo,
      deadline: input.deadline,
      // Skip RAISED — per plan the ticket goes directly to OPEN_FOR_CONTRIBUTIONS
      // once the raise callable returns; dashboards immediately start matching.
      phase: "OPEN_FOR_CONTRIBUTIONS",
      progressPct,
      advancedEarly: false,
      // Dashboard Active Tickets feed queries on this single field.
      participantOrgIds: [orgId],
      contributorCount: 0,
      createdAt: now,
      phaseChangedAt: now,
      lastUpdatedAt: now,
      closedAt: null,
    });

    return { ticketId: ticketRef.id, phase: "OPEN_FOR_CONTRIBUTIONS", rapid };
  });
});
