import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
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

  return (
    <div className="landing-shell">
      <HomeTopbar />
      <main
        className="container"
        style={{ padding: "32px 24px 64px", maxWidth: 1080 }}
      >
        <article className="stack">
          <header className="stack-sm">
            <div
              className="row"
              style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: "var(--color-primary)",
                  color: "white",
                }}
              >
                {org.type}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: "var(--color-success)",
                  fontWeight: 600,
                }}
              >
                Verified · {verified}
              </span>
              <span className="muted-text" style={{ fontSize: 12 }}>·</span>
              <span className="muted-text" style={{ fontSize: 12 }}>
                {org.geo.adminRegion}
              </span>
            </div>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 36,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                margin: 0,
              }}
            >
              {org.name}
            </h1>
            <p className="muted-text" style={{ fontSize: 14 }}>
              {hostedCount} hosted · {contributedCount} contributions ·{" "}
              <span className="num">
                ₹
                {new Intl.NumberFormat("en-IN").format(
                  Math.round(totalDelivered),
                )}
              </span>{" "}
              delivered
            </p>
          </header>

          <section className="stack-sm">
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
              Reliability
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              <ReliabilityBar label="Agreement" score={reliability.agreement} />
              <ReliabilityBar label="Execution" score={reliability.execution} />
              <ReliabilityBar label="Closure" score={reliability.closure} />
            </div>
          </section>

          {resources.length > 0 && (
            <section className="stack-sm">
              <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
                Typical resources
              </h2>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: 12,
                }}
              >
                {resources.map((r) => (
                  <div key={r.category} className="card stack-sm">
                    <strong style={{ fontSize: 13 }}>{r.category}</strong>
                    <span className="muted-text" style={{ fontSize: 12 }}>
                      {r.count} listing{r.count === 1 ? "" : "s"} · ₹
                      <span className="num">
                        {new Intl.NumberFormat("en-IN").format(
                          Math.round(r.totalValuationINR),
                        )}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {badges.length > 0 && (
            <section className="stack-sm">
              <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
                Badge grid
              </h2>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                  gap: 12,
                }}
              >
                {badges.map((b) => (
                  <Link
                    key={`${b.ticketId}__${b.orgId}`}
                    href={`/ticket/${b.ticketId}`}
                    className="card stack-sm"
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                      display: "block",
                    }}
                  >
                    <div
                      className="row"
                      style={{
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        gap: 8,
                      }}
                    >
                      <strong style={{ fontSize: 14 }}>{b.ticketTitle}</strong>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          padding: "2px 6px",
                          borderRadius: 4,
                          background:
                            b.role === "HOST"
                              ? "var(--color-primary)"
                              : "var(--color-surface-3)",
                          color:
                            b.role === "HOST"
                              ? "white"
                              : "var(--color-text-2)",
                        }}
                      >
                        {b.role}
                      </span>
                    </div>
                    <span className="muted-text" style={{ fontSize: 12 }}>
                      {b.ticketCategory} ·{" "}
                      <span className="num">
                        ₹
                        {new Intl.NumberFormat("en-IN").format(
                          Math.round(b.contributedValuationINR),
                        )}
                      </span>{" "}
                      · score{" "}
                      <span className="num">{Math.round(b.scorePct)}</span>
                    </span>
                    <span className="muted-text" style={{ fontSize: 11 }}>
                      Closed {new Date(b.closedAt).toLocaleDateString()}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </article>
      </main>
    </div>
  );
}

function ReliabilityBar({ label, score }: { label: string; score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const tone =
    clamped >= 75
      ? "var(--color-success)"
      : clamped >= 40
        ? "var(--color-primary)"
        : "var(--color-danger)";
  return (
    <div className="card stack-sm">
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "baseline" }}
      >
        <strong style={{ fontSize: 13 }}>{label}</strong>
        <span className="num" style={{ fontWeight: 700, fontSize: 16 }}>
          {Math.round(clamped)}
        </span>
      </div>
      <div
        style={{
          height: 6,
          background: "var(--color-surface-2)",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${clamped}%`,
            height: "100%",
            background: tone,
          }}
        />
      </div>
    </div>
  );
}
