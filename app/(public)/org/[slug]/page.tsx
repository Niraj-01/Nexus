import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, MapPin, ShieldCheck } from "lucide-react";
import { adminDb } from "@/lib/firebase/admin";
import { HomeTopbar } from "../../_components/HomeTopbar";

export const revalidate = 60;

// Every Firestore read goes through a normalizer — never a bare `as` cast.
// Legacy docs may be missing fields the schema later added; the normalizer
// applies safe defaults once, so render code can trust the shape.

interface OrgDoc {
  name: string;
  type: "NGO" | "ORG";
  status: string;
  geo: { adminRegion: string };
  reliability: {
    agreement: { score: number };
    execution: { score: number };
    closure: { score: number };
  };
  createdAt: number | null;
}

interface BadgeDoc {
  ticketId: string;
  orgId: string;
  role: "HOST" | "CONTRIBUTOR";
  ticketTitle: string;
  ticketCategory: string;
  contributedValuationINR: number;
  proportionalSharePct: number;
  scorePct: number;
  closedAt: number;
}

function parseOrg(raw: unknown): OrgDoc {
  const d = (raw ?? {}) as Record<string, unknown>;
  const geoRaw = (d.geo ?? {}) as { adminRegion?: unknown };
  const relRaw = (d.reliability ?? {}) as Record<string, unknown>;
  const stat = (key: string): { score: number } => {
    const s = (relRaw[key] ?? {}) as { score?: unknown };
    return { score: Number(s.score ?? 0) };
  };
  return {
    name: typeof d.name === "string" && d.name ? d.name : "Untitled organization",
    type: d.type === "NGO" ? "NGO" : "ORG",
    status: typeof d.status === "string" ? d.status : "",
    geo: {
      adminRegion: typeof geoRaw.adminRegion === "string" ? geoRaw.adminRegion : "—",
    },
    reliability: {
      agreement: stat("agreement"),
      execution: stat("execution"),
      closure: stat("closure"),
    },
    createdAt: typeof d.createdAt === "number" ? d.createdAt : null,
  };
}

function parseBadge(raw: unknown): BadgeDoc {
  const d = (raw ?? {}) as Record<string, unknown>;
  return {
    ticketId: typeof d.ticketId === "string" ? d.ticketId : "",
    orgId: typeof d.orgId === "string" ? d.orgId : "",
    role: d.role === "HOST" ? "HOST" : "CONTRIBUTOR",
    ticketTitle: typeof d.ticketTitle === "string" ? d.ticketTitle : "(untitled)",
    ticketCategory: typeof d.ticketCategory === "string" ? d.ticketCategory : "",
    contributedValuationINR: Number(d.contributedValuationINR ?? 0),
    proportionalSharePct: Number(d.proportionalSharePct ?? 0),
    scorePct: Number(d.scorePct ?? 0),
    closedAt: Number(d.closedAt ?? 0),
  };
}

interface ResourceSummary {
  category: string;
  count: number;
  totalValuationINR: number;
}

const loadOrg = cache(async (orgId: string): Promise<OrgDoc | null> => {
  try {
    const snap = await adminDb.collection("organizations").doc(orgId).get();
    if (!snap.exists) return null;
    const data = parseOrg(snap.data());
    if (data.status !== "ACTIVE") return null;
    return data;
  } catch {
    return null;
  }
});

async function loadBadges(orgId: string): Promise<BadgeDoc[]> {
  try {
    const snap = await adminDb
      .collection("badges")
      .where("orgId", "==", orgId)
      .orderBy("closedAt", "desc")
      .limit(60)
      .get();
    return snap.docs.map((d) => parseBadge(d.data()));
  } catch {
    return [];
  }
}

async function loadResourceSummary(orgId: string): Promise<ResourceSummary[]> {
  try {
    const snap = await adminDb
      .collection("resources")
      .where("orgId", "==", orgId)
      .get();
    const byCat = new Map<string, ResourceSummary>();
    snap.docs.forEach((d) => {
      const data = d.data();
      const cat = String(data.category ?? "OTHER");
      const v = Number(data.valuationINR ?? 0);
      const cur = byCat.get(cat) ?? { category: cat, count: 0, totalValuationINR: 0 };
      cur.count += 1;
      cur.totalValuationINR += Number.isFinite(v) ? v : 0;
      byCat.set(cat, cur);
    });
    return Array.from(byCat.values()).sort(
      (a, b) => b.totalValuationINR - a.totalValuationINR,
    );
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const org = await loadOrg(slug);
  if (!org) return { title: "Organization — Nexus" };
  const desc = `${org.name} — verified ${org.type} on Nexus (${org.geo.adminRegion}).`;
  return {
    title: `${org.name} — Nexus`,
    description: desc,
    openGraph: {
      title: org.name,
      description: desc,
      type: "profile",
    },
  };
}

export default async function PublicOrgPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await loadOrg(slug);
  if (!org) notFound();

  const [badges, resources] = await Promise.all([
    loadBadges(slug),
    loadResourceSummary(slug),
  ]);

  const verified = org.createdAt
    ? new Date(org.createdAt).toLocaleDateString()
    : "—";

  const reliability = {
    agreement: org.reliability.agreement.score,
    execution: org.reliability.execution.score,
    closure: org.reliability.closure.score,
  };

  const totalDelivered = badges.reduce(
    (a, b) => a + Number(b.contributedValuationINR ?? 0),
    0,
  );

  const hostedCount = badges.filter((b) => b.role === "HOST").length;
  const contributedCount = badges.filter((b) => b.role === "CONTRIBUTOR").length;

  const fmt = (v: number) =>
    new Intl.NumberFormat("en-IN").format(Math.round(v));

  return (
    <div className="pd-shell">
      <HomeTopbar />
      <main className="pd-main">
        <Link href="/" className="pd-back">
          <ArrowLeft size={14} /> Back to home
        </Link>

        {/* ── Hero ── */}
        <header className="pd-hero">
          <div className="pd-hero-meta">
            <span className="pd-chip pd-chip--type">{org.type}</span>
            <span className="pd-chip pd-chip--closed">
              <ShieldCheck size={12} /> Verified · {verified}
            </span>
            <span className="pd-chip">
              <MapPin size={12} /> {org.geo.adminRegion}
            </span>
          </div>
          <h1 className="pd-title">{org.name}</h1>
          <p className="pd-desc">
            Verified {org.type === "NGO" ? "non-profit" : "organization"} on the
            Nexus network. All activity below is attributed via on-chain badges
            issued at ticket closure.
          </p>
        </header>

        {/* ── Stat trio ── */}
        <div className="po-stat-grid">
          <div className="po-stat-card">
            <span className="po-stat-key">Hosted</span>
            <span className="po-stat-val">{hostedCount}</span>
          </div>
          <div className="po-stat-card">
            <span className="po-stat-key">Contributions</span>
            <span className="po-stat-val">{contributedCount}</span>
          </div>
          <div className="po-stat-card">
            <span className="po-stat-key">Total delivered</span>
            <span className="po-stat-val po-stat-val--money">
              ₹{fmt(totalDelivered)}
            </span>
          </div>
        </div>

        {/* ── Reliability ── */}
        <section className="pd-section">
          <div className="pd-section-head">
            <h2 className="pd-section-title">Reliability</h2>
            <p className="pd-section-sub">
              Performance across the three lifecycle phases. Decays slowly with
              inactivity.
            </p>
          </div>
          <div className="po-rel-grid">
            <ReliabilityBar label="Agreement" score={reliability.agreement} />
            <ReliabilityBar label="Execution" score={reliability.execution} />
            <ReliabilityBar label="Closure" score={reliability.closure} />
          </div>
        </section>

        {/* ── Typical resources ── */}
        {resources.length > 0 && (
          <section className="pd-section">
            <div className="pd-section-head">
              <h2 className="pd-section-title">Typical resources</h2>
              <p className="pd-section-sub">
                Categories this organization commonly lists, ranked by total
                valuation.
              </p>
            </div>
            <div className="po-resource-grid">
              {resources.map((r) => (
                <div key={r.category} className="po-resource-chip">
                  <span className="po-resource-cat">{r.category}</span>
                  <span className="po-resource-meta">
                    {r.count} listing{r.count === 1 ? "" : "s"} · ₹
                    <span className="num">{fmt(r.totalValuationINR)}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Badge history ── */}
        {badges.length > 0 && (
          <section className="pd-section">
            <div className="pd-section-head">
              <h2 className="pd-section-title">Badge history</h2>
              <p className="pd-section-sub">
                Every closed ticket where this org participated. Click for the
                public dossier.
              </p>
            </div>
            <div className="po-badge-grid">
              {badges.map((b) => {
                const isHost = b.role === "HOST";
                return (
                  <Link
                    key={`${b.ticketId}__${b.orgId}`}
                    href={`/ticket/${b.ticketId}`}
                    className="po-badge-card"
                  >
                    <div className="po-badge-head">
                      <span className="po-badge-title">{b.ticketTitle}</span>
                      <span
                        className={`pd-contrib-role${isHost ? " pd-contrib-role--host" : ""}`}
                      >
                        {b.role}
                      </span>
                    </div>
                    <div className="po-badge-meta">
                      <span>{b.ticketCategory}</span>
                      <span className="po-badge-meta-dot" />
                      <span>
                        ₹<span className="num">{fmt(b.contributedValuationINR)}</span>
                      </span>
                      <span className="po-badge-meta-dot" />
                      <span>
                        score <span className="num">{Math.round(b.scorePct)}</span>
                      </span>
                    </div>
                    <div className="po-badge-foot">
                      Closed {new Date(b.closedAt).toLocaleDateString()}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function ReliabilityBar({ label, score }: { label: string; score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const tone = clamped >= 75 ? "high" : clamped >= 40 ? "mid" : "low";
  return (
    <div className="po-rel-card">
      <div className="po-rel-head">
        <span className="po-rel-label">{label}</span>
        <span className={`po-rel-score po-rel--${tone}`}>{Math.round(clamped)}</span>
      </div>
      <div className="po-rel-bar">
        <div
          className={`po-rel-bar-fill po-rel-bar-fill--${tone}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
