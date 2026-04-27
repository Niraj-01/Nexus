"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { TicketPhase } from "@/lib/schemas";
import {
  deriveDisplayStatus,
  sortKey,
  statusLabel,
  type DashboardRole,
} from "../_lib/activeTicket";

interface ActiveRow {
  id: string;
  title: string;
  hostOrgId: string;
  host: { name: string; type: "NGO" | "ORG" };
  phase: TicketPhase;
  rapid: boolean;
  progressPct: number;
  contributorCount: number;
  lastUpdatedAt: number;
}

/**
 * Single Firestore listener: `tickets where participantOrgIds array-contains
 * viewerOrgId order by lastUpdatedAt desc limit 50`. Per `Albin/Nexus_Dashboard_Logic.md`
 * §3 + List.md §2.10 contract.
 */
export function ActiveTicketsList({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<ActiveRow[] | null>(null);

  useEffect(() => {
    if (!orgId) return;
    const q = query(
      collection(db, "tickets"),
      where("participantOrgIds", "array-contains", orgId),
      orderBy("lastUpdatedAt", "desc"),
      limit(50),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const out: ActiveRow[] = snap.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id,
            title: String(x.title ?? "(untitled)"),
            hostOrgId: String(x.hostOrgId ?? ""),
            host: { name: String(x.host?.name ?? "—"), type: x.host?.type ?? "ORG" },
            phase: x.phase as TicketPhase,
            rapid: Boolean(x.rapid),
            progressPct: Number(x.progressPct ?? 0),
            contributorCount: Number(x.contributorCount ?? 0),
            lastUpdatedAt: Number(x.lastUpdatedAt ?? x.createdAt ?? 0),
          };
        });
        setRows(out);
      },
      () => setRows([]),
    );
    return unsub;
  }, [orgId]);

  if (rows === null) {
    return (
      <section className="dash-col">
        <header className="dash-col-head">
          <h2 className="dash-col-title">Active tickets</h2>
          <p className="dash-col-sub">Tickets you&apos;re hosting or contributing to.</p>
        </header>
        <p className="muted-text" style={{ paddingLeft: 4 }}>Loading active tickets…</p>
      </section>
    );
  }
  if (rows.length === 0) {
    return (
      <section className="dash-col">
        <header className="dash-col-head">
          <h2 className="dash-col-title">Active tickets</h2>
          <p className="dash-col-sub">Tickets you&apos;re hosting or contributing to.</p>
        </header>
        <div className="dash-empty">
          <strong>No active tickets yet</strong>
          <p>Tickets you raise or contribute to appear here.</p>
          <Link href="/tickets/new" className="btn btn-primary">Raise a ticket</Link>
        </div>
      </section>
    );
  }

  // Client-side sort per spec §3.5: phase=EXECUTION first, then pending-action,
  // then recently updated. We don't have viewer-action data without an extra
  // contributions read — using phase-only proxy for now (good enough for demo).
  const sorted = rows
    .map((r) => ({ ...r, role: r.hostOrgId === orgId ? ("HOST" as DashboardRole) : ("CONTRIBUTOR" as DashboardRole) }))
    .sort((a, b) => sortKey(b) - sortKey(a));

  return (
    <section className="dash-col">
      <header className="dash-col-head">
        <h2 className="dash-col-title">Active tickets</h2>
        <p className="dash-col-sub">Tickets you&apos;re hosting or contributing to.</p>
      </header>
      {sorted.map((r) => (
        <ActiveCard key={r.id} row={r} />
      ))}
    </section>
  );
}

function ActiveCard({
  row,
}: {
  row: ActiveRow & { role: DashboardRole };
}) {
  const display = deriveDisplayStatus(row.phase);
  const status = statusLabel(display);
  const statusToneCls =
    row.phase === "EXECUTION"
      ? "dash-card-status--executing"
      : row.phase === "OPEN_FOR_CONTRIBUTIONS"
        ? "dash-card-status--open"
        : row.phase === "PENDING_SIGNOFF"
          ? "dash-card-status--signoff"
          : row.phase === "CLOSED"
            ? "dash-card-status--closed"
            : "dash-card-status--raised";

  return (
    <Link
      href={`/tickets/${row.id}`}
      className={`dash-card${row.rapid ? " dash-card--rapid" : ""}`}
    >
      <div className="dash-card-body">
        <div className="dash-card-meta">
          {row.role === "HOST" ? (
            <span className="dash-tag dash-tag--host">Host</span>
          ) : (
            <span className="dash-tag" style={{
              background: "var(--color-surface-2)",
              color: "var(--color-text-2)",
              border: "1px solid var(--glass-border)",
            }}>Contributor</span>
          )}
          <span className={`dash-card-status ${statusToneCls}`}>
            {status.label}
          </span>
          {row.rapid && (
            <span className="dash-tag dash-tag--emergency" style={{ marginLeft: "auto" }}>
              Emergency
            </span>
          )}
        </div>
        <h4 className="dash-card-title">{row.title}</h4>
        <div className="dash-card-foot">
          <span>
            {row.host.name} · {row.host.type}
          </span>
          {row.contributorCount > 0 && (
            <>
              <span className="dash-card-foot-divider" />
              <span>
                {row.contributorCount} contributor{row.contributorCount === 1 ? "" : "s"}
              </span>
            </>
          )}
        </div>
      </div>
      <span className="dash-card-pct">{Math.round(row.progressPct)}%</span>
    </Link>
  );
}
