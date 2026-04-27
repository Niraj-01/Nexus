import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { adminDb, adminStorage } from "@/lib/firebase/admin";

export const revalidate = 60;

// Every Firestore read goes through a normalizer — never a bare `as` cast.
// Legacy docs may be missing fields the schema later added; the normalizer
// applies safe defaults once, so render code can trust the shape.

interface TicketDoc {
  hostOrgId: string;
  host: { name: string; type: "NGO" | "ORG" };
  title: string;
  description: string;
  category: string;
  rapid: boolean;
  needs: Array<{
    resourceCategory: string;
    subtype?: string;
    quantity: number;
    unit: string;
    valuationINR: number;
    progressPct: number;
  }>;
  geo: { adminRegion: string };
  phase: string;
  progressPct: number;
  participantOrgIds: string[];
  closedAt: number | null;
}

interface BadgeDoc {
  ticketId: string;
  orgId: string;
  role: "HOST" | "CONTRIBUTOR";
  contributedValuationINR: number;
  proportionalSharePct: number;
  scorePct: number;
}

function parseTicket(raw: unknown): TicketDoc {
  const d = (raw ?? {}) as Record<string, unknown>;
  const hostRaw = (d.host ?? {}) as { name?: unknown; type?: unknown };
  const host: TicketDoc["host"] = {
    name: typeof hostRaw.name === "string" && hostRaw.name ? hostRaw.name : "—",
    type: hostRaw.type === "NGO" ? "NGO" : "ORG",
  };
  const needs: TicketDoc["needs"] = Array.isArray(d.needs)
    ? d.needs.map((n) => {
        const x = (n ?? {}) as Record<string, unknown>;
        return {
          resourceCategory: String(x.resourceCategory ?? ""),
          subtype: typeof x.subtype === "string" ? x.subtype : undefined,
          quantity: Number(x.quantity ?? 0),
          unit: String(x.unit ?? ""),
          valuationINR: Number(x.valuationINR ?? 0),
          progressPct: Number(x.progressPct ?? 0),
        };
      })
    : [];
  const geoRaw = (d.geo ?? {}) as { adminRegion?: unknown };
  return {
    hostOrgId: typeof d.hostOrgId === "string" ? d.hostOrgId : "",
    host,
    title: typeof d.title === "string" && d.title ? d.title : "(untitled)",
    description: typeof d.description === "string" ? d.description : "",
    category: typeof d.category === "string" ? d.category : "",
    rapid: Boolean(d.rapid),
    needs,
    geo: {
      adminRegion: typeof geoRaw.adminRegion === "string" ? geoRaw.adminRegion : "—",
    },
    phase: typeof d.phase === "string" ? d.phase : "",
    progressPct: Number(d.progressPct ?? 0),
    participantOrgIds: Array.isArray(d.participantOrgIds)
      ? d.participantOrgIds.filter((x): x is string => typeof x === "string")
      : [],
    closedAt: typeof d.closedAt === "number" ? d.closedAt : null,
  };
}

function parseBadge(raw: unknown): BadgeDoc {
  const d = (raw ?? {}) as Record<string, unknown>;
  return {
    ticketId: typeof d.ticketId === "string" ? d.ticketId : "",
    orgId: typeof d.orgId === "string" ? d.orgId : "",
    role: d.role === "HOST" ? "HOST" : "CONTRIBUTOR",
    contributedValuationINR: Number(d.contributedValuationINR ?? 0),
    proportionalSharePct: Number(d.proportionalSharePct ?? 0),
    scorePct: Number(d.scorePct ?? 0),
  };
}

interface ProofWithUrl {
  storagePath: string;
  caption: string;
  contentType: string;
  createdAt: number;
  url: string;
}

const loadTicket = cache(async (id: string): Promise<TicketDoc | null> => {
  try {
    const snap = await adminDb.collection("tickets").doc(id).get();
    if (!snap.exists) return null;
    const data = parseTicket(snap.data());
    if (data.phase !== "CLOSED") return null;
    return data;
  } catch {
    return null;
  }
});

async function loadBadges(ticketId: string): Promise<BadgeDoc[]> {
  const snap = await adminDb.collection("badges").where("ticketId", "==", ticketId).get();
  return snap.docs.map((d) => parseBadge(d.data()));
}

async function loadOrgNames(orgIds: string[]): Promise<Record<string, string>> {
  if (orgIds.length === 0) return {};
  const refs = orgIds.map((id) => adminDb.collection("organizations").doc(id));
  const docs = await adminDb.getAll(...refs);
  const out: Record<string, string> = {};
  docs.forEach((d) => {
    if (d.exists) out[d.id] = String(d.data()?.name ?? d.id);
  });
  return out;
}

async function loadProofs(ticketId: string): Promise<ProofWithUrl[]> {
  const snap = await adminDb.collection("tickets").doc(ticketId).collection("photoProofs").get();
  const bucket = adminStorage.bucket();
  const expires = Date.now() + 60 * 60 * 1000;
  const items = await Promise.all(
    snap.docs.map(async (d): Promise<ProofWithUrl | null> => {
      const data = d.data();
      const storagePath = String(data.storagePath ?? "");
      if (!storagePath) return null;
      try {
        const [url] = await bucket.file(storagePath).getSignedUrl({ action: "read", expires });
        return {
          storagePath,
          caption: String(data.caption ?? ""),
          contentType: String(data.contentType ?? ""),
          createdAt: Number(data.createdAt ?? 0),
          url,
        };
      } catch {
        return null;
      }
    }),
  );
  return items.filter((p): p is ProofWithUrl => p !== null);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const ticket = await loadTicket(id);
  if (!ticket) return { title: "Ticket — Nexus" };
  const description = ticket.description.slice(0, 160);
  return {
    title: `${ticket.title} — Nexus`,
    description,
    openGraph: {
      title: ticket.title,
      description,
      type: "article",
    },
  };
}

export default async function PublicTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ticket = await loadTicket(id);
  if (!ticket) notFound();

  const [badges, proofs] = await Promise.all([loadBadges(id), loadProofs(id)]);
  const orgIds = Array.from(new Set(badges.map((b) => b.orgId).filter(Boolean)));
  const orgNames = await loadOrgNames(orgIds);

  const totalDelivered = badges.reduce(
    (a, b) => a + Number(b.contributedValuationINR ?? 0),
    0,
  );
  const closedDate = ticket.closedAt
    ? new Date(ticket.closedAt).toLocaleDateString()
    : "—";

  const sortedBadges = badges.slice().sort((a, b) => {
    if (a.role === "HOST") return -1;
    if (b.role === "HOST") return 1;
    return (b.proportionalSharePct ?? 0) - (a.proportionalSharePct ?? 0);
  });

  return (
    <main className="container" style={{ padding: "32px 24px 64px", maxWidth: 960 }}>
      <article className="stack">
        <header className="stack-sm">
          <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {ticket.rapid && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: "var(--color-danger)",
                  color: "white",
                }}
              >
                Emergency
              </span>
            )}
            <span style={{ fontSize: 12, color: "var(--color-success)", fontWeight: 600 }}>
              Closed · {closedDate}
            </span>
            <span className="muted-text" style={{ fontSize: 12 }}>·</span>
            <span style={{ fontSize: 12, color: "var(--color-muted)" }}>
              Hosted by {ticket.host.name} · {ticket.host.type}
            </span>
            <span className="muted-text" style={{ fontSize: 12 }}>·</span>
            <span className="muted-text" style={{ fontSize: 12 }}>
              {ticket.geo.adminRegion}
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
            {ticket.title}
          </h1>
          <p className="muted-text" style={{ whiteSpace: "pre-wrap" }}>
            {ticket.description}
          </p>
        </header>

        <div className="card stack-sm">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <strong>Impact delivered</strong>
            <span className="num" style={{ fontSize: 28, fontWeight: 700 }}>
              ₹{new Intl.NumberFormat("en-IN").format(Math.round(totalDelivered))}
            </span>
          </div>
          <span className="muted-text" style={{ fontSize: 13 }}>
            {badges.length} {badges.length === 1 ? "participant" : "participants"} ·{" "}
            {ticket.needs.length}{" "}
            {ticket.needs.length === 1 ? "need" : "needs"} fulfilled
          </span>
        </div>

        {ticket.needs.length > 0 && (
          <section className="stack-sm">
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>What was delivered</h2>
            {ticket.needs.map((n, i) => (
              <div key={i} className="card stack-sm">
                <div
                  className="row"
                  style={{ justifyContent: "space-between", alignItems: "baseline" }}
                >
                  <strong>
                    {n.resourceCategory}
                    {n.subtype ? ` · ${n.subtype}` : ""}
                  </strong>
                  <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>
                    {Math.round(n.progressPct)}%
                  </span>
                </div>
                <span className="muted-text" style={{ fontSize: 13 }}>
                  <span className="num">{n.quantity}</span> {n.unit}
                </span>
                <div
                  style={{
                    height: 4,
                    background: "var(--color-surface-2)",
                    borderRadius: 999,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(0, n.progressPct))}%`,
                      height: "100%",
                      background: "var(--color-primary)",
                    }}
                  />
                </div>
              </div>
            ))}
          </section>
        )}

        {sortedBadges.length > 0 && (
          <section className="stack-sm">
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Contributors</h2>
            <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
              {sortedBadges.map((b) => (
                <div
                  key={b.orgId}
                  className="card stack-sm"
                  style={{ minWidth: 220, flex: "1 1 220px" }}
                >
                  <div
                    className="row"
                    style={{ justifyContent: "space-between", alignItems: "baseline", gap: 8 }}
                  >
                    <strong style={{ fontSize: 14 }}>
                      {orgNames[b.orgId] ?? b.orgId.slice(0, 6)}
                    </strong>
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
                        color: b.role === "HOST" ? "white" : "var(--color-text-2)",
                      }}
                    >
                      {b.role}
                    </span>
                  </div>
                  <span className="muted-text" style={{ fontSize: 12 }}>
                    <span className="num">
                      {Number(b.proportionalSharePct ?? 0).toFixed(1)}%
                    </span>{" "}
                    share · score{" "}
                    <span className="num">{Math.round(Number(b.scorePct ?? 0))}</span>
                  </span>
                  <div
                    style={{
                      height: 3,
                      background: "var(--color-surface-2)",
                      borderRadius: 999,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, Math.max(0, Number(b.scorePct ?? 0)))}%`,
                        height: "100%",
                        background: "var(--color-primary)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {proofs.length > 0 && (
          <section className="stack-sm">
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Proof of delivery</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              {proofs.map((p, i) => (
                <a
                  key={i}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "block",
                    borderRadius: 8,
                    overflow: "hidden",
                    border: "1px solid var(--color-border)",
                    aspectRatio: "4 / 3",
                    background: "var(--color-surface-2)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={p.caption || "Proof of delivery"}
                    loading="lazy"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                </a>
              ))}
            </div>
          </section>
        )}
      </article>
    </main>
  );
}
