"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { TicketPhase, TicketUrgency } from "@/lib/schemas";

interface MatchRow {
  id: string;
  ticketId: string;
  rapidBroadcast: boolean;
  score: number;
  contributionImpactPct: number;
  reason: string;
  geoDistanceKm?: number;
}

interface TicketHeader {
  id: string;
  title: string;
  category: string;
  urgency: TicketUrgency;
  rapid: boolean;
  phase: TicketPhase;
  host: { name: string; type: "NGO" | "ORG" };
  needs: Array<{ resourceCategory: string; quantity: number; unit: string }>;
  geo?: { adminRegion?: string };
}

/**
 * Match-driven recommendation feed. Two parallel queries against `matches/`:
 *   - Flow A: orgId ASC, rapidBroadcast=false, ORDER BY score DESC
 *   - Flow B: orgId ASC, rapidBroadcast=true,  ORDER BY createdAt DESC
 * Rapid-broadcast matches float to the top regardless of score. Closed
 * tickets are filtered client-side after a one-shot ticket-header fetch
 * (matches don't currently get GC'd when a ticket closes).
 *
 * Composite indexes required (firestore.indexes.json):
 *   - matches: orgId, rapidBroadcast, score DESC
 *   - matches: orgId, rapidBroadcast, createdAt DESC
 */
export function RecommendedTicketsList({ orgId }: { orgId: string }) {
  const [normalMatches, setNormalMatches] = useState<MatchRow[] | null>(null);
  const [rapidMatches, setRapidMatches] = useState<MatchRow[] | null>(null);
  const [headers, setHeaders] = useState<Record<string, TicketHeader | null>>({});

  // Flow A — ranked top matches.
  useEffect(() => {
    const q = query(
      collection(db, "matches"),
      where("orgId", "==", orgId),
      where("rapidBroadcast", "==", false),
      orderBy("score", "desc"),
      limit(25),
    );
    const unsub = onSnapshot(
      q,
      (snap) => setNormalMatches(snap.docs.map(parseMatchRow)),
      () => setNormalMatches([]),
    );
    return unsub;
  }, [orgId]);

  // Flow B — rapid broadcast.
  useEffect(() => {
    const q = query(
      collection(db, "matches"),
      where("orgId", "==", orgId),
      where("rapidBroadcast", "==", true),
      orderBy("createdAt", "desc"),
      limit(25),
    );
    const unsub = onSnapshot(
      q,
      (snap) => setRapidMatches(snap.docs.map(parseMatchRow)),
      () => setRapidMatches([]),
    );
    return unsub;
  }, [orgId]);

  const matches = useMemo(() => {
    if (normalMatches === null || rapidMatches === null) return null;
    // Rapid first, then ranked normals. Dedupe by ticketId in case the
    // matching pipeline ever writes both a normal and rapid match for the
    // same ticket — rapid wins.
    const seen = new Set<string>();
    const out: MatchRow[] = [];
    for (const m of [...rapidMatches, ...normalMatches]) {
      if (seen.has(m.ticketId)) continue;
      seen.add(m.ticketId);
      out.push(m);
    }
    return out;
  }, [normalMatches, rapidMatches]);

  // Fetch ticket headers for any match we don't already have. One-shot per
  // ticket; cached in component state.
  useEffect(() => {
    if (!matches) return;
    const missing = matches.map((m) => m.ticketId).filter((id) => !(id in headers));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const fetched: Record<string, TicketHeader | null> = {};
      await Promise.all(
        missing.map(async (id) => {
          try {
            const snap = await getDoc(doc(db, "tickets", id));
            fetched[id] = snap.exists() ? parseTicketHeader(id, snap.data()) : null;
          } catch {
            fetched[id] = null;
          }
        }),
      );
      if (!cancelled) setHeaders((prev) => ({ ...prev, ...fetched }));
    })();
    return () => {
      cancelled = true;
    };
  }, [matches, headers]);

  const visible = useMemo(() => {
    if (!matches) return null;
    return matches
      .map((m) => ({ match: m, ticket: headers[m.ticketId] }))
      .filter(
        (row): row is { match: MatchRow; ticket: TicketHeader } =>
          row.ticket !== undefined && row.ticket !== null && row.ticket.phase !== "CLOSED",
      );
  }, [matches, headers]);

  return (
    <section className="stack">
      <header className="stack-sm">
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em" }}>
          Recommended for you
        </h2>
        <p className="muted-text" style={{ fontSize: 13 }}>
          Tickets that match your listed resources, ranked by fit.
        </p>
      </header>

      {visible === null ? (
        <p className="muted-text">Loading matches…</p>
      ) : visible.length === 0 ? (
        <div className="card stack-sm" style={{ textAlign: "center", padding: 24 }}>
          <strong>No matches yet</strong>
          <p className="muted-text" style={{ fontSize: 13 }}>
            List more resources or wait for new tickets to land — your dashboard updates live as matches arrive.
          </p>
          <div className="row" style={{ justifyContent: "center" }}>
            <Link href="/resources/new" className="btn btn-ghost">
              List a resource
            </Link>
          </div>
        </div>
      ) : (
        <div className="stack-sm">
          {visible.map(({ match, ticket }) => (
            <TicketCard key={match.id} match={match} ticket={ticket} />
          ))}
        </div>
      )}
    </section>
  );
}

function parseMatchRow(d: { id: string; data: () => Record<string, unknown> }): MatchRow {
  const data = d.data();
  return {
    id: d.id,
    ticketId: String(data.ticketId ?? ""),
    rapidBroadcast: Boolean(data.rapidBroadcast),
    score: Number(data.score ?? 0),
    contributionImpactPct: Number(data.contributionImpactPct ?? 0),
    reason: String(data.reason ?? ""),
    geoDistanceKm: typeof data.geoDistanceKm === "number" ? data.geoDistanceKm : undefined,
  };
}

function parseTicketHeader(id: string, data: Record<string, unknown>): TicketHeader {
  const hostRaw = (data.host ?? {}) as { name?: unknown; type?: unknown };
  return {
    id,
    title: String(data.title ?? "(untitled)"),
    category: String(data.category ?? ""),
    urgency: (data.urgency as TicketUrgency) ?? "NORMAL",
    rapid: Boolean(data.rapid),
    phase: (data.phase as TicketPhase) ?? "OPEN_FOR_CONTRIBUTIONS",
    host: {
      name: String(hostRaw.name ?? "—"),
      type: hostRaw.type === "NGO" ? "NGO" : "ORG",
    },
    needs: Array.isArray(data.needs)
      ? (data.needs as Array<Record<string, unknown>>).map((n) => ({
          resourceCategory: String(n.resourceCategory ?? ""),
          quantity: Number(n.quantity ?? 0),
          unit: String(n.unit ?? ""),
        }))
      : [],
    geo: data.geo as { adminRegion?: string } | undefined,
  };
}

function TicketCard({ match, ticket }: { match: MatchRow; ticket: TicketHeader }) {
  const need = ticket.needs[0];
  return (
    <article
      className="card stack-sm"
      style={{
        borderColor: ticket.rapid ? "var(--color-danger, #dc2626)" : undefined,
        borderWidth: ticket.rapid ? 2 : 1,
      }}
    >
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div className="stack-sm" style={{ minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {ticket.rapid && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: "var(--color-danger, #dc2626)",
                  color: "white",
                }}
              >
                Emergency
              </span>
            )}
            <span style={{ fontSize: 12, color: "var(--color-muted, #6b7280)" }}>
              {ticket.host.name} · {ticket.host.type}
            </span>
          </div>
          <h4 style={{ fontWeight: 600, fontSize: 16, margin: 0 }}>{ticket.title}</h4>
        </div>
        <Link href={`/tickets/${ticket.id}`} className="btn btn-primary" style={{ flexShrink: 0 }}>
          {ticket.rapid ? "Respond" : "View"}
        </Link>
      </div>

      <div className="row" style={{ gap: 16, fontSize: 13, flexWrap: "wrap" }}>
        {ticket.geo?.adminRegion && (
          <span className="muted-text">{ticket.geo.adminRegion}</span>
        )}
        {need && (
          <span className="muted-text">
            Needs {need.quantity} {need.unit} ({need.resourceCategory})
          </span>
        )}
        {match.contributionImpactPct > 0 && (
          <span className="muted-text">
            You can fill <strong>{Math.round(match.contributionImpactPct)}%</strong>
          </span>
        )}
        {typeof match.geoDistanceKm === "number" && (
          <span className="muted-text">{Math.round(match.geoDistanceKm)} km away</span>
        )}
      </div>
      {match.reason && (
        <p className="muted-text" style={{ fontSize: 12, margin: 0 }}>
          {match.reason}
        </p>
      )}
    </article>
  );
}
