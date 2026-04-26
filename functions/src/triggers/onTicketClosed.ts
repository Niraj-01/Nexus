import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { reliabilityScore, type OrgLite } from "../lib/matching";

/**
 * Mints `badges/{ticketId__orgId}` for the host plus every SIGNED_OFF
 * contributor when a ticket transitions to CLOSED. Per List.md §3.1:
 *
 *   scorePct = proportionalSharePct * reliabilityMultiplier
 *   proportionalSharePct = (this org's signed-off valuation / total signed-off) * 100
 *   reliabilityMultiplier = reliabilityScore(org)  // [0, 1]; default 0.7
 *
 * Host badge gets `proportionalSharePct: 100` flat — see plan tradeoffs.
 * Doc IDs are deterministic so retries are idempotent. Org-side
 * `BadgeRefSchema` push uses `arrayUnion` for the same reason.
 *
 * Rules: badges are server-only-write + public-read (firestore.rules
 * §badges); organizations.badges is server-only-write per the generic
 * `badges in keys` block on org updates.
 */
export const onTicketClosed = onDocumentUpdated("tickets/{ticketId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  if (before.phase === "CLOSED" || after.phase !== "CLOSED") return;

  const { ticketId } = event.params;
  const db = admin.firestore();

  const signedSnap = await db
    .collection("tickets")
    .doc(ticketId)
    .collection("contributions")
    .where("status", "==", "SIGNED_OFF")
    .get();

  if (signedSnap.empty) {
    logger.warn("ticket closed with no SIGNED_OFF contributions — no badges minted", { ticketId });
    return;
  }

  const totalSigned = signedSnap.docs.reduce((sum, doc) => {
    const v = Number(doc.data().offered?.valuationINR ?? 0);
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);

  const hostOrgId = String(after.hostOrgId ?? "");
  const ticketTitle = String(after.title ?? "(untitled)");
  const ticketCategory = String(after.category ?? "");
  const closedAt = Number(after.closedAt ?? Date.now());
  const slug = `${slugify(ticketTitle)}-${ticketId.slice(0, 6)}`;

  // Batch-read all distinct orgs (host + signed-off contributors).
  const contributorOrgIds = Array.from(
    new Set(signedSnap.docs.map((d) => String(d.data().contributorOrgId ?? ""))),
  ).filter(Boolean);
  const distinctOrgIds = Array.from(new Set([hostOrgId, ...contributorOrgIds]));
  const orgRefs = distinctOrgIds.map((id) => db.collection("organizations").doc(id));
  const orgDocs = orgRefs.length > 0 ? await db.getAll(...orgRefs) : [];
  const orgMap = new Map<string, OrgLite>();
  orgDocs.forEach((s, i) => {
    if (!s.exists) return;
    const d = s.data()!;
    orgMap.set(distinctOrgIds[i], {
      status: String(d.status ?? ""),
      reliability: d.reliability,
    });
  });

  const batch = db.batch();

  for (const doc of signedSnap.docs) {
    const c = doc.data();
    const contributorOrgId = String(c.contributorOrgId ?? "");
    if (!contributorOrgId) continue;
    const valuation = Number(c.offered?.valuationINR ?? 0);
    const proportionalSharePct = totalSigned > 0 ? (valuation / totalSigned) * 100 : 0;
    const orgLite = orgMap.get(contributorOrgId) ?? { status: "" };
    const reliabilityMultiplier = reliabilityScore(orgLite);
    const scorePct = proportionalSharePct * reliabilityMultiplier;

    const badgeRef = db.collection("badges").doc(`${ticketId}__${contributorOrgId}`);
    batch.set(badgeRef, {
      ticketId,
      orgId: contributorOrgId,
      role: "CONTRIBUTOR",
      ticketTitle,
      ticketCategory,
      contributedValuationINR: valuation,
      totalTicketValuationINR: totalSigned,
      proportionalSharePct,
      reliabilityMultiplier,
      scorePct,
      closedAt,
      publicSlug: slug,
    });

    const orgRef = db.collection("organizations").doc(contributorOrgId);
    batch.update(orgRef, {
      badges: FieldValue.arrayUnion({
        ticketId,
        closedAt,
        contributionSummary: `${formatINR(valuation)} of ${ticketCategory} (${proportionalSharePct.toFixed(1)}% share)`,
      }),
    });
  }

  // Host badge — flat 100% proportional share, modulated by host reliability.
  if (hostOrgId) {
    const hostLite = orgMap.get(hostOrgId) ?? { status: "" };
    const hostReliability = reliabilityScore(hostLite);
    const hostScore = 100 * hostReliability;
    const hostBadgeRef = db.collection("badges").doc(`${ticketId}__${hostOrgId}`);
    batch.set(hostBadgeRef, {
      ticketId,
      orgId: hostOrgId,
      role: "HOST",
      ticketTitle,
      ticketCategory,
      contributedValuationINR: 0,
      totalTicketValuationINR: totalSigned,
      proportionalSharePct: 100,
      reliabilityMultiplier: hostReliability,
      scorePct: hostScore,
      closedAt,
      publicSlug: slug,
    });

    const hostOrgRef = db.collection("organizations").doc(hostOrgId);
    batch.update(hostOrgRef, {
      badges: FieldValue.arrayUnion({
        ticketId,
        closedAt,
        contributionSummary: `Hosted: ${ticketTitle} (${formatINR(totalSigned)} delivered)`,
      }),
    });
  }

  await batch.commit();
  logger.info("badges minted", {
    ticketId,
    contributors: contributorOrgIds.length,
    host: hostOrgId ? 1 : 0,
    totalSigned,
  });
});

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "ticket";
}

function formatINR(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "₹0";
  return `₹${new Intl.NumberFormat("en-IN").format(Math.round(n))}`;
}
