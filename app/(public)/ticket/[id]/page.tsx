import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, MapPin } from "lucide-react";
import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { HomeTopbar } from "../../_components/HomeTopbar";

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

  const fmt = (v: number) => new Intl.NumberFormat("en-IN").format(Math.round(v));

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
            {ticket.rapid && (
              <span className="pd-chip pd-chip--rapid">Emergency</span>
            )}
            <span className="pd-chip pd-chip--closed">
              <span className="pd-chip-dot" /> Closed · {closedDate}
            </span>
            <span className="pd-chip">
              Hosted by {ticket.host.name} · {ticket.host.type}
            </span>
            <span className="pd-chip">
              <MapPin size={12} /> {ticket.geo.adminRegion}
            </span>
          </div>
          <h1 className="pd-title">{ticket.title}</h1>
          {ticket.description && (
            <p className="pd-desc">{ticket.description}</p>
          )}
        </header>

        {/* ── Impact card ── */}
        <div className="pd-impact">
          <div className="pd-impact-l">
            <span className="pd-impact-label">Total impact delivered</span>
            <span className="pd-impact-value">₹{fmt(totalDelivered)}</span>
          </div>
          <div className="pd-impact-meta">
            <div>
              {badges.length} {badges.length === 1 ? "participant" : "participants"}
            </div>
            <div>
              {ticket.needs.length}{" "}
              {ticket.needs.length === 1 ? "need" : "needs"} fulfilled
            </div>
          </div>
        </div>

        {/* ── Needs ── */}
        {ticket.needs.length > 0 && (
          <section className="pd-section">
            <div className="pd-section-head">
              <h2 className="pd-section-title">What was delivered</h2>
              <p className="pd-section-sub">
                Each line is a discrete need. Progress reflects committed and
                signed-off contributions.
              </p>
            </div>
            <div className="pd-needs-grid">
              {ticket.needs.map((n, i) => {
                const pct = Math.min(100, Math.max(0, n.progressPct));
                return (
                  <div key={i} className="pd-need-card">
                    <div className="pd-need-head">
                      <span className="pd-need-name">
                        {n.resourceCategory}
                        {n.subtype ? ` · ${n.subtype}` : ""}
                      </span>
                      <span className="pd-need-pct">{Math.round(pct)}%</span>
                    </div>
                    <span className="pd-need-qty">
                      <span className="num">{n.quantity}</span> {n.unit}
                      {n.valuationINR > 0 && (
                        <> · ≈ ₹<span className="num">{fmt(n.valuationINR)}</span></>
                      )}
                    </span>
                    <div className="pd-need-bar">
                      <div className="pd-need-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Contributors ── */}
        {sortedBadges.length > 0 && (
          <section className="pd-section">
            <div className="pd-section-head">
              <h2 className="pd-section-title">Contributors</h2>
              <p className="pd-section-sub">
                Verified orgs that hosted or contributed. Click to view their profile.
              </p>
            </div>
            <div className="pd-contrib-grid">
              {sortedBadges.map((b) => {
                const score = Math.min(100, Math.max(0, Number(b.scorePct ?? 0)));
                const isHost = b.role === "HOST";
                return (
                  <Link
                    key={`${b.orgId}-${b.role}`}
                    href={`/org/${b.orgId}`}
                    className={`pd-contrib-card${isHost ? " pd-contrib-card--host" : ""}`}
                  >
                    <div className="pd-contrib-head">
                      <span className="pd-contrib-name">
                        {orgNames[b.orgId] ?? b.orgId.slice(0, 8)}
                      </span>
                      <span className={`pd-contrib-role${isHost ? " pd-contrib-role--host" : ""}`}>
                        {b.role}
                      </span>
                    </div>
                    <div className="pd-contrib-stats">
                      <div>
                        <span className="pd-contrib-stat-key">Share</span>
                        <span className="pd-contrib-stat-val">
                          {Number(b.proportionalSharePct ?? 0).toFixed(1)}%
                        </span>
                      </div>
                      <div>
                        <span className="pd-contrib-stat-key">Score</span>
                        <span className="pd-contrib-stat-val">{Math.round(score)}</span>
                      </div>
                      <div>
                        <span className="pd-contrib-stat-key">Value</span>
                        <span className="pd-contrib-stat-val">
                          ₹{fmt(b.contributedValuationINR)}
                        </span>
                      </div>
                    </div>
                    <div className="pd-contrib-bar">
                      <div className="pd-contrib-bar-fill" style={{ width: `${score}%` }} />
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Proofs ── */}
        {proofs.length > 0 && (
          <section className="pd-section">
            <div className="pd-section-head">
              <h2 className="pd-section-title">Proof of delivery</h2>
              <p className="pd-section-sub">
                Photographs uploaded by the host as evidence of execution.
              </p>
            </div>
            <div className="pd-proof-grid">
              {proofs.map((p, i) => (
                <a
                  key={i}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pd-proof-tile"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={p.caption || "Proof of delivery"}
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
