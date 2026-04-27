"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { TicketPhase, TicketUrgency } from "@/lib/schemas";

interface TicketRow {
  id: string;
  title: string;
  category: string;
  urgency: TicketUrgency;
  rapid: boolean;
  phase: TicketPhase;
  host: { name: string; type: "NGO" | "ORG" };
  needs: Array<{ resourceCategory: string; quantity: number; unit: string }>;
  geo?: { adminRegion?: string };
  participantOrgIds: string[];
  createdAt: number;
}

// Until the matches pipeline is ranking by listed resources, this is a flat
// real-time feed of every active (non-closed) ticket on the platform — minus
// tickets the viewer is already participating in (host or contributor), which
// would otherwise duplicate the Active Tickets panel. When the matches
// collection has data, swap this listener back to `matches` filtered by
// viewer orgId.
export function RecommendedTicketsList({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<TicketRow[] | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, "tickets"),
      orderBy("createdAt", "desc"),
      limit(50),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const out: TicketRow[] = snap.docs
          .map((d) => {
            const x = d.data();
            return {
              id: d.id,
              title: String(x.title ?? "(untitled)"),
              category: String(x.category ?? ""),
              urgency: x.urgency,
              rapid: Boolean(x.rapid),
              phase: x.phase as TicketPhase,
              host: { name: String(x.host?.name ?? "—"), type: x.host?.type ?? "ORG" },
              needs: Array.isArray(x.needs) ? x.needs : [],
              geo: x.geo,
              participantOrgIds: Array.isArray(x.participantOrgIds) ? x.participantOrgIds : [],
              createdAt: Number(x.createdAt ?? 0),
            };
          })
          .filter((t) => t.phase !== "CLOSED")
          .filter((t) => !t.participantOrgIds.includes(orgId));
        setRows(out);
      },
      () => setRows([]),
    );
    return unsub;
  }, [orgId]);

  return (
    <section className="stack">
      <header className="stack-sm">
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em" }}>
          Recommended for you
        </h2>
        <p className="muted-text" style={{ fontSize: 13 }}>
          Live feed of active tickets across the network.
        </p>
      </header>

      {rows === null ? (
        <p className="muted-text">Loading tickets…</p>
      ) : rows.length === 0 ? (
        <div className="card stack-sm" style={{ textAlign: "center", padding: 24 }}>
          <strong>No active tickets yet</strong>
          <p className="muted-text" style={{ fontSize: 13 }}>
            Tickets raised by any organization will appear here as soon as they&apos;re posted.
          </p>
        </div>
      ) : (
        <div className="stack-sm">
          {rows.map((t) => (
            <TicketCard key={t.id} t={t} />
          ))}
        </div>
      )}
    </section>
  );
}

function TicketCard({ t }: { t: TicketRow }) {
  const need = t.needs[0];
  return (
    <article
      className="card stack-sm"
      style={{
        borderColor: t.rapid ? "var(--color-danger, #dc2626)" : undefined,
        borderWidth: t.rapid ? 2 : 1,
      }}
    >
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div className="stack-sm" style={{ minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {t.rapid && (
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
              {t.host.name} · {t.host.type}
            </span>
          </div>
          <h4 style={{ fontWeight: 600, fontSize: 16, margin: 0 }}>{t.title}</h4>
        </div>
        <Link href={`/tickets/${t.id}`} className="btn btn-primary" style={{ flexShrink: 0 }}>
          {t.rapid ? "Respond" : "View"}
        </Link>
      </div>

      <div className="row" style={{ gap: 16, fontSize: 13, flexWrap: "wrap" }}>
        {t.geo?.adminRegion && (
          <span className="muted-text">{t.geo.adminRegion}</span>
        )}
        {need && (
          <span className="muted-text">
            Needs {need.quantity} {need.unit} ({need.resourceCategory})
          </span>
        )}
      </div>
    </article>
  );
}
