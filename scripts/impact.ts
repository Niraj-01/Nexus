/**
 * NEXUS — impact metrics aggregator.
 *
 * Run against the live project (admin creds required):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json npx tsx scripts/impact.ts
 *
 * Or against the emulator:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/impact.ts
 *
 * Outputs: totals, close rate, median time-to-close by flow, top-5 contributors.
 * Screenshot the table for the pitch deck.
 */
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const projectId =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "buffet-493105";

if (!getApps().length) {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  initializeApp({
    credential: sa ? cert(JSON.parse(sa)) : applicationDefault(),
    projectId,
  });
}

const db = getFirestore();

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function fmtINR(n: number): string {
  return `₹${new Intl.NumberFormat("en-IN").format(Math.round(n))}`;
}

function fmtMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const days = ms / 86_400_000;
  if (days >= 1) return `${days.toFixed(1)}d`;
  const hours = ms / 3_600_000;
  if (hours >= 1) return `${hours.toFixed(1)}h`;
  return `${(ms / 60_000).toFixed(0)}m`;
}

async function main() {
  const [ticketsSnap, badgesSnap, orgsSnap] = await Promise.all([
    db.collection("tickets").get(),
    db.collection("badges").get(),
    db.collection("organizations").get(),
  ]);

  const tickets = ticketsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const badges = badgesSnap.docs.map((d) => d.data());
  const orgNames = new Map<string, string>();
  orgsSnap.docs.forEach((d) =>
    orgNames.set(d.id, String(d.data().name ?? d.id)),
  );

  const total = tickets.length;
  const closed = tickets.filter((t) => t.phase === "CLOSED");
  const open = tickets.filter((t) => t.phase !== "CLOSED");
  const closeRatePct = total > 0 ? (closed.length / total) * 100 : 0;

  const totalDelivered = badges.reduce(
    (a, b) => a + Number(b.contributedValuationINR ?? 0),
    0,
  );

  const ttcByFlow = { rapid: [] as number[], normal: [] as number[] };
  for (const t of closed) {
    const created = Number(t.createdAt ?? 0);
    const closedAt = Number(t.closedAt ?? 0);
    if (created <= 0 || closedAt <= 0 || closedAt < created) continue;
    const diff = closedAt - created;
    (t.rapid ? ttcByFlow.rapid : ttcByFlow.normal).push(diff);
  }

  const topContributors = new Map<
    string,
    { orgId: string; totalINR: number; sumScorePct: number; badges: number }
  >();
  for (const b of badges) {
    if (b.role !== "CONTRIBUTOR") continue;
    const orgId = String(b.orgId ?? "");
    if (!orgId) continue;
    const cur = topContributors.get(orgId) ?? {
      orgId,
      totalINR: 0,
      sumScorePct: 0,
      badges: 0,
    };
    cur.totalINR += Number(b.contributedValuationINR ?? 0);
    cur.sumScorePct += Number(b.scorePct ?? 0);
    cur.badges += 1;
    topContributors.set(orgId, cur);
  }
  const top5 = Array.from(topContributors.values())
    .sort((a, b) => b.sumScorePct - a.sumScorePct)
    .slice(0, 5);

  console.log("\n══════════════════════════════════════════════════════════");
  console.log("  NEXUS — Impact metrics");
  console.log("══════════════════════════════════════════════════════════\n");

  console.log("Tickets");
  console.log(`  total .............. ${total}`);
  console.log(`  closed ............. ${closed.length}`);
  console.log(`  in flight .......... ${open.length}`);
  console.log(`  close rate ......... ${closeRatePct.toFixed(1)}%\n`);

  console.log("Value delivered");
  console.log(`  total .............. ${fmtINR(totalDelivered)}`);
  console.log(`  badges minted ...... ${badges.length}\n`);

  console.log("Median time-to-close");
  console.log(
    `  rapid (n=${ttcByFlow.rapid.length}) ............ ${fmtMs(median(ttcByFlow.rapid))}`,
  );
  console.log(
    `  normal (n=${ttcByFlow.normal.length}) ........... ${fmtMs(median(ttcByFlow.normal))}\n`,
  );

  console.log("Top 5 contributors (by sum of score%)");
  if (top5.length === 0) {
    console.log("  (no contributor badges yet)");
  } else {
    top5.forEach((c, i) => {
      const name = orgNames.get(c.orgId) ?? c.orgId.slice(0, 8);
      console.log(
        `  ${i + 1}. ${name.padEnd(28)} ${fmtINR(c.totalINR).padStart(12)} · ${c.badges} badges · score ${Math.round(c.sumScorePct)}`,
      );
    });
  }
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
