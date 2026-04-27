"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { Plus, Search, ShieldCheck, Zap, MapPin } from "lucide-react";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthProvider";

interface TicketRow {
  id: string;
  title: string;
  description: string;
  category: string;
  urgency: "NORMAL" | "EMERGENCY";
  rapid: boolean;
  phase: "RAISED" | "OPEN_FOR_CONTRIBUTIONS" | "EXECUTION" | "PENDING_SIGNOFF" | "CLOSED";
  progressPct: number;
  hostOrgId: string;
  host: { name: string; type: "NGO" | "ORG" };
  geo: { adminRegion: string };
  contributorCount: number;
  deadline: number;
  lastUpdatedAt: number;
}

const TABS = ["All", "Open", "Executing", "Sign-off", "Closed"] as const;
type Tab = (typeof TABS)[number];

const PHASE_LABEL: Record<TicketRow["phase"], string> = {
  RAISED: "Raised",
  OPEN_FOR_CONTRIBUTIONS: "Open",
  EXECUTION: "Executing",
  PENDING_SIGNOFF: "Awaiting sign-off",
  CLOSED: "Closed",
};

function tabMatches(tab: Tab, phase: TicketRow["phase"]): boolean {
  if (tab === "All") return true;
  if (tab === "Open") return phase === "OPEN_FOR_CONTRIBUTIONS" || phase === "RAISED";
  if (tab === "Executing") return phase === "EXECUTION";
  if (tab === "Sign-off") return phase === "PENDING_SIGNOFF";
  if (tab === "Closed") return phase === "CLOSED";
  return false;
}

export default function TicketsPage() {
  const { user, loading: authLoading } = useAuth();
  const [tickets, setTickets] = useState<TicketRow[] | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("All");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "tickets"), orderBy("lastUpdatedAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const out: TicketRow[] = snap.docs.map((d) => {
          const x = d.data();
          const host = (x.host as { name?: string; type?: "NGO" | "ORG" }) ?? {};
          const geo = (x.geo as { adminRegion?: string }) ?? {};
          return {
            id: d.id,
            title: String(x.title ?? "Untitled"),
            description: String(x.description ?? ""),
            category: String(x.category ?? "—"),
            urgency: (x.urgency as "NORMAL" | "EMERGENCY") ?? "NORMAL",
            rapid: Boolean(x.rapid),
            phase: (x.phase as TicketRow["phase"]) ?? "OPEN_FOR_CONTRIBUTIONS",
            progressPct: Number(x.progressPct ?? 0),
            hostOrgId: String(x.hostOrgId ?? ""),
            host: { name: String(host.name ?? "Unknown"), type: host.type ?? "ORG" },
            geo: { adminRegion: String(geo.adminRegion ?? "—") },
            contributorCount: Number(x.contributorCount ?? 0),
            deadline: Number(x.deadline ?? 0),
            lastUpdatedAt: Number(x.lastUpdatedAt ?? 0),
          };
        });
        setTickets(out);
      },
      () => setTickets([]),
    );
    return unsub;
  }, [user]);

  const filtered = useMemo(() => {
    if (!tickets) return [];
    const term = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (!tabMatches(activeTab, t.phase)) return false;
      if (!term) return true;
      return (
        t.title.toLowerCase().includes(term) ||
        t.host.name.toLowerCase().includes(term) ||
        t.geo.adminRegion.toLowerCase().includes(term) ||
        t.category.toLowerCase().includes(term)
      );
    });
  }, [tickets, activeTab, search]);

  const phaseCounts = useMemo(() => {
    const counts: Record<Tab, number> = { All: 0, Open: 0, Executing: 0, "Sign-off": 0, Closed: 0 };
    if (!tickets) return counts;
    counts.All = tickets.length;
    for (const t of tickets) {
      if (tabMatches("Open", t.phase)) counts.Open++;
      if (tabMatches("Executing", t.phase)) counts.Executing++;
      if (tabMatches("Sign-off", t.phase)) counts["Sign-off"]++;
      if (tabMatches("Closed", t.phase)) counts.Closed++;
    }
    return counts;
  }, [tickets]);

  if (authLoading) return <p className="muted-text">Loading…</p>;
  if (!user) return <p className="muted-text">Sign in to browse tickets.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "28px", fontWeight: 700, letterSpacing: "-0.025em", color: "var(--color-text)", lineHeight: 1.15 }}>
            Tickets
          </h1>
          <p style={{ fontSize: "13px", color: "var(--color-muted)", marginTop: "3px" }}>
            {tickets === null
              ? "Loading…"
              : `${tickets.length} ticket${tickets.length === 1 ? "" : "s"} across the platform`}
          </p>
        </div>
        <Link href="/tickets/new" className="btn btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Plus size={16} />
          New ticket
        </Link>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div
          style={{
            display: "flex",
            gap: "2px",
            background: "var(--color-surface-2)",
            borderRadius: "var(--radius-md)",
            padding: "3px",
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "5px 14px",
                borderRadius: "9px",
                border: "none",
                background: activeTab === tab ? "#ffffff" : "transparent",
                color: activeTab === tab ? "var(--color-text)" : "var(--color-muted)",
                fontWeight: activeTab === tab ? 600 : 500,
                fontSize: "13px",
                cursor: "pointer",
                boxShadow: activeTab === tab ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.15s ease",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {tab}
              {tickets !== null && (
                <span
                  className="num"
                  style={{
                    fontSize: 11,
                    color: activeTab === tab ? "var(--color-muted)" : "var(--color-placeholder)",
                  }}
                >
                  {phaseCounts[tab]}
                </span>
              )}
            </button>
          ))}
        </div>

        <div style={{ position: "relative", width: "240px" }}>
          <Search size={14} style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)", color: "var(--color-placeholder)", pointerEvents: "none" }} />
          <input
            type="text"
            placeholder="Search title, host, region…"
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: "32px", height: "34px", fontSize: "13px", borderRadius: "var(--radius-md)" }}
          />
        </div>
      </div>

      {tickets === null ? (
        <p className="muted-text">Loading tickets…</p>
      ) : filtered.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "64px 24px",
            color: "var(--color-muted)",
            fontSize: 14,
            background: "var(--color-surface-2)",
            border: "1px dashed var(--color-border)",
            borderRadius: "var(--radius-md)",
          }}
        >
          {tickets.length === 0
            ? "No tickets yet. Be the first to raise one."
            : "No tickets match this filter."}
        </div>
      ) : (
        <div className="tkt-grid">
          {filtered.map((t) => (
            <LiveTicketCard key={t.id} ticket={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function LiveTicketCard({ ticket }: { ticket: TicketRow }) {
  const urgencyClass = ticket.urgency === "EMERGENCY" ? "tkt-badge--emergency" : "tkt-badge--normal";
  const urgencyLabel = ticket.urgency === "EMERGENCY" ? "Emergency" : "Normal";

  return (
    <Link
      href={`/tickets/${ticket.id}`}
      className="tkt-card"
      style={{
        textDecoration: "none",
        cursor: "pointer",
        "--tkt-progress": ticket.progressPct,
      } as React.CSSProperties}
    >
      <div className="tkt-thumb">
        <div className="tkt-thumb-placeholder" />
        <div className="tkt-thumb-overlay">
          <span className="tkt-id-chip">{ticket.id.slice(0, 6)}</span>
          <span className={`tkt-badge ${urgencyClass}`}>{urgencyLabel}</span>
          {ticket.rapid && (
            <span
              className="tkt-badge tkt-badge--rapid"
              style={{ display: "inline-flex", alignItems: "center", gap: 3 }}
            >
              <Zap size={10} /> Rapid
            </span>
          )}
        </div>
      </div>

      <div className="tkt-info">
        <p
          className="tkt-category"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
        >
          {ticket.category}
          <span>·</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <MapPin size={11} /> {ticket.geo.adminRegion}
          </span>
        </p>
        <h3 className="tkt-title">{ticket.title}</h3>
        <p
          className="muted-text"
          style={{
            fontSize: 12,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            margin: 0,
          }}
        >
          {ticket.host.name}{" "}
          <ShieldCheck size={11} style={{ color: "var(--color-primary)" }} />
        </p>

        <div className="tkt-footer">
          <div className="tkt-bar-wrap">
            <div className="tkt-bar-fill" style={{ width: `${ticket.progressPct}%` }} />
          </div>
          <div className="tkt-footer-meta">
            <span className="tkt-phase">{PHASE_LABEL[ticket.phase]}</span>
            <span className="tkt-pct">{Math.round(ticket.progressPct)}%</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
