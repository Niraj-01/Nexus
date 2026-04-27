import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";

/**
 * Backfill match docs for one resource against currently-open tickets.
 *
 * The forward path (`onTicketCreated`) only runs when a ticket is created,
 * so resources listed AFTER a ticket exists never get a match doc. This
 * helper closes that gap: when a resource is created or its embedding is
 * (re)generated, scan tickets in OPEN_FOR_CONTRIBUTIONS phase and write a
 * match if the resource fits a need.
 *
 * Match shape mirrors `onTicketCreated.runFlowAMatching` so the dashboard
 * can read both with one query. Scoring here is deliberately simple
 * (category + geo + capacity) since a single-resource pass can't compete
 * with the full top-K cross-org tournament; the goal is to surface a
 * reasonable feed when resources land late.
 */

const TOP_OPEN_TICKETS = 100;

interface ResourceLite {
  orgId: string;
  category: string;
  quantity: number;
  geo?: { lat?: number; lng?: number; serviceRadiusKm?: number };
  terms?: { availableUntil?: number };
  emergencyContract?: { enabled?: boolean; emergencyCategories?: string[] };
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) *
      Math.cos(toRad(b.lat)) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export async function backfillMatchesForResource(
  resourceId: string,
  data: admin.firestore.DocumentData,
): Promise<{ scanned: number; written: number }> {
  const db = admin.firestore();

  const orgId = String(data.orgId ?? "");
  const category = String(data.category ?? "");
  if (!orgId || !category) return { scanned: 0, written: 0 };
  if (data.embeddingStatus !== "ok") return { scanned: 0, written: 0 };

  const resource: ResourceLite = {
    orgId,
    category,
    quantity: Number(data.quantity ?? 0),
    geo: data.geo as ResourceLite["geo"],
    terms: data.terms as ResourceLite["terms"],
    emergencyContract: data.emergencyContract as ResourceLite["emergencyContract"],
  };

  // Pull open tickets. We can't filter by needs[].resourceCategory in
  // Firestore (array of objects), so we filter in-memory. The OPEN_FOR_
  // CONTRIBUTIONS phase is small enough that this stays cheap.
  const ticketSnap = await db
    .collection("tickets")
    .where("phase", "==", "OPEN_FOR_CONTRIBUTIONS")
    .limit(TOP_OPEN_TICKETS)
    .get();

  if (ticketSnap.empty) return { scanned: 0, written: 0 };

  const batch = db.batch();
  let written = 0;

  for (const tDoc of ticketSnap.docs) {
    const t = tDoc.data();
    const ticketId = tDoc.id;
    const hostOrgId = String(t.hostOrgId ?? "");
    if (!hostOrgId || hostOrgId === orgId) continue; // host can't match own resource
    const isRapid = Boolean(t.rapid);

    const needs = Array.isArray(t.needs) ? (t.needs as Array<Record<string, unknown>>) : [];
    if (needs.length === 0) continue;

    // Find the best matching need (same category, lowest progress).
    let bestNeedIndex = -1;
    let bestRemaining = 0;
    let bestUnit = "";
    let bestNeed: { quantity: number; progressPct: number } | null = null;
    needs.forEach((n, i) => {
      if (String(n.resourceCategory ?? "") !== category) return;
      const qty = Number(n.quantity ?? 0);
      const progressPct = Number(n.progressPct ?? 0);
      const remaining = qty * (1 - progressPct / 100);
      if (remaining > bestRemaining) {
        bestRemaining = remaining;
        bestNeedIndex = i;
        bestUnit = String(n.unit ?? "");
        bestNeed = { quantity: qty, progressPct };
      }
    });
    if (bestNeedIndex < 0 || !bestNeed) continue;

    // Geo gate: if the resource has a serviceRadius, check the ticket falls in.
    const ticketGeo = (t.geo ?? {}) as { lat?: number; lng?: number; adminRegion?: string };
    let distanceKm = 0;
    if (
      typeof ticketGeo.lat === "number" &&
      typeof ticketGeo.lng === "number" &&
      typeof resource.geo?.lat === "number" &&
      typeof resource.geo?.lng === "number"
    ) {
      distanceKm = haversineKm(
        { lat: resource.geo.lat, lng: resource.geo.lng },
        { lat: ticketGeo.lat, lng: ticketGeo.lng },
      );
      const radius = Number(resource.geo.serviceRadiusKm ?? 0);
      if (radius > 0 && distanceKm > radius) continue;
    }

    // Availability window gate.
    const availableUntil = Number(resource.terms?.availableUntil ?? 0);
    const deadline = Number(t.deadline ?? 0);
    if (availableUntil > 0 && deadline > 0 && availableUntil < deadline) continue;

    // Rapid emergency contract gate.
    if (isRapid) {
      const ec = resource.emergencyContract ?? {};
      if (ec.enabled !== true) continue;
      const cats = Array.isArray(ec.emergencyCategories) ? ec.emergencyCategories : [];
      const ticketCategory = String(t.category ?? "");
      if (cats.length > 0 && !cats.includes(ticketCategory)) continue;
    }

    const maxContributionPossible = Math.min(resource.quantity, bestRemaining);
    if (maxContributionPossible <= 0) continue;
    const contributionImpactPct = bestRemaining > 0
      ? Math.min(100, (maxContributionPossible / bestRemaining) * 100)
      : 0;

    // Lightweight scoring: category match (0.6) + capacity fit (0.25) + geo (0.15)
    const capacityScore = Math.min(1, maxContributionPossible / Math.max(1, bestRemaining));
    const geoScore = distanceKm > 0
      ? Math.max(0, 1 - distanceKm / Math.max(50, distanceKm))
      : 1;
    const score = 0.6 + 0.25 * capacityScore + 0.15 * geoScore;

    const matchId = `${ticketId}__${orgId}`;
    const ref = db.collection("matches").doc(matchId);
    batch.set(
      ref,
      {
        ticketId,
        orgId,
        topResourceId: resourceId,
        score,
        semanticScore: 0,
        reason: `Backfill: matches ${category}${
          ticketGeo.adminRegion ? ` in ${ticketGeo.adminRegion}` : ""
        }`,
        bestNeedIndex,
        bestNeedUnit: bestUnit,
        maxContributionPossible,
        contributionFeasibility: maxContributionPossible > 0,
        contributionImpactPct,
        geoDistanceKm: distanceKm,
        rapidBroadcast: isRapid,
        surfaced: false,
        dismissed: false,
        createdAt: Date.now(),
        backfilled: true,
      },
      { merge: true },
    );
    written += 1;
  }

  if (written > 0) {
    await batch.commit();
    logger.info("backfilled resource → ticket matches", {
      resourceId,
      orgId,
      scanned: ticketSnap.size,
      written,
    });
  }

  return { scanned: ticketSnap.size, written };
}
