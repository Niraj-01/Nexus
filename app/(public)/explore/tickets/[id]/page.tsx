"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, MapPin, Building2, Users } from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { HomeTopbar } from "../../../_components/HomeTopbar";
import { db } from "@/lib/firebase/client";
import type { TicketPhase, TicketUrgency } from "@/lib/schemas/ticket";

type TicketView = {
  id: string;
  title: string;
  description: string;
  category: string;
  urgency: TicketUrgency;
  rapid: boolean;
  phase: TicketPhase;
  progressPct: number;
  deadline: number;
  contributorCount: number;
  hostName: string;
  region: string;
  needs: Array<{
    label: string;
    unit: string;
    quantity: number;
    progressPct: number;
  }>;
};

type ContributionView = {
  id: string;
  contributorOrgId: string;
  needIndex: number;
  status: string;
  offered: {
    kind: string;
    quantity: number;
    unit: string;
  };
  createdAt: number;
};

const PHASE_LABEL: Record<TicketPhase, string> = {
  RAISED: "Just raised",
  OPEN_FOR_CONTRIBUTIONS: "Open for contributions",
  EXECUTION: "Execution",
  PENDING_SIGNOFF: "Pending sign-off",
  CLOSED: "Closed",
};

const STATUS_LABEL: Record<string, string> = {
  PROPOSED: "PLEDGED",
  AGREEMENT_PENDING: "AGREEMENT PENDING",
  COMMITTED: "COMMITTED",
  EXECUTED: "DELIVERED",
  SIGNED_OFF: "SIGNED OFF",
  DISPUTED: "DISPUTED",
  REJECTED: "REJECTED",
};

function hueFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}

function formatDeadline(deadlineMs: number): string {
  if (!deadlineMs) return "";
  const ms = deadlineMs - Date.now();
  if (ms <= 0) return "Deadline passed";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 48) {
    const h = hours;
    const m = Math.floor((ms - h * 3_600_000) / 60_000);
    return `${h}h ${m}m left`;
  }
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} left`;
}

export default function PublicTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [ticket, setTicket] = useState<TicketView | null | undefined>(undefined);
  const [contribs, setContribs] = useState<ContributionView[]>([]);
  const [orgNames, setOrgNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "tickets", id),
      (snap) => {
        if (!snap.exists()) {
          setTicket(null);
          return;
        }
        const x = snap.data() as Record<string, unknown>;
        const host = (x.host as { name?: string } | undefined) ?? {};
        const geo = (x.geo as { adminRegion?: string } | undefined) ?? {};
        const rawNeeds = Array.isArray(x.needs) ? (x.needs as Record<string, unknown>[]) : [];
        setTicket({
          id: snap.id,
          title: String(x.title ?? "Untitled"),
          description: String(x.description ?? ""),
          category: String(x.category ?? "—"),
          urgency: (x.urgency as TicketUrgency) ?? "NORMAL",
          rapid: Boolean(x.rapid),
          phase: (x.phase as TicketPhase) ?? "OPEN_FOR_CONTRIBUTIONS",
          progressPct: Number(x.progressPct ?? 0),
          deadline: Number(x.deadline ?? 0),
          contributorCount: Number(x.contributorCount ?? 0),
          hostName: String(host.name ?? "Verified host"),
          region: String(geo.adminRegion ?? "—"),
          needs: rawNeeds.map((n, i) => ({
            label: String(n.subtype ?? n.resourceCategory ?? `Need ${i + 1}`),
            unit: String(n.unit ?? ""),
            quantity: Number(n.quantity ?? 0),
            progressPct: Number(n.progressPct ?? 0),
          })),
        });
      },
      () => setTicket(null),
    );
    return unsub;
  }, [id]);

  useEffect(() => {
    const q = query(
      collection(db, "tickets", id, "contributions"),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const out: ContributionView[] = snap.docs.map((d) => {
          const x = d.data() as Record<string, unknown>;
          const offered = (x.offered as Record<string, unknown> | undefined) ?? {};
          return {
            id: d.id,
            contributorOrgId: String(x.contributorOrgId ?? ""),
            needIndex: Number(x.needIndex ?? 0),
            status: String(x.status ?? "PROPOSED"),
            offered: {
              kind: String(offered.kind ?? "Resource"),
              quantity: Number(offered.quantity ?? 0),
              unit: String(offered.unit ?? ""),
            },
            createdAt: Number(x.createdAt ?? 0),
          };
        });
        setContribs(out);
      },
      () => setContribs([]),
    );
    return unsub;
  }, [id]);

  useEffect(() => {
    const missing = Array.from(
      new Set(contribs.map((c) => c.contributorOrgId).filter((o) => o && !(o in orgNames))),
    );
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(
      missing.map(async (orgId) => {
        try {
          const snap = await getDoc(doc(db, "organizations", orgId));
          const name = snap.exists() ? String(snap.data().name ?? orgId) : orgId;
          return [orgId, name] as const;
        } catch {
          return [orgId, orgId] as const;
        }
      }),
    ).then((rows) => {
      if (cancelled) return;
      setOrgNames((prev) => {
        const next = { ...prev };
        for (const [k, v] of rows) next[k] = v;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [contribs, orgNames]);

  if (ticket === undefined) {
    return (
      <div className="landing-shell">
        <HomeTopbar />
        <div className="td-shell" style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 28px" }}>
          <p className="muted-text">Loading ticket…</p>
        </div>
      </div>
    );
  }

  if (ticket === null) {
    return (
      <div className="landing-shell">
        <HomeTopbar />
        <div className="td-shell" style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 28px" }}>
          <Link href="/" className="td-back">
            <ArrowLeft size={15} /> Back to home
          </Link>
          <p className="muted-text" style={{ marginTop: 24 }}>This ticket is not available.</p>
        </div>
      </div>
    );
  }

  const isEmergency = ticket.urgency === "EMERGENCY";
  const loginHref = `/login?next=/explore/tickets/${ticket.id}`;
  const deadlineText = formatDeadline(ticket.deadline);
  const totalRequired = ticket.needs.reduce((sum, n) => sum + n.quantity, 0);
  const totalFulfilled = ticket.needs.reduce(
    (sum, n) => sum + Math.round((n.quantity * n.progressPct) / 100),
    0,
  );
  const totalRemaining = Math.max(0, totalRequired - totalFulfilled);

  const stats = [
    { value: String(ticket.contributorCount), label: "orgs responding" },
    { value: `${ticket.progressPct}%`, label: "covered" },
    { value: totalRemaining.toLocaleString(), label: "units remaining" },
  ];

  return (
    <div className="landing-shell">
      <HomeTopbar />

      <div
        className="td-shell"
        style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 28px 64px", width: "100%" }}
      >
        <Link href="/" className="td-back">
          <ArrowLeft size={15} /> Back to home
        </Link>

        <header className={`td-header${isEmergency ? " td-header--emergency" : ""}`}>
          <div className="td-header-top">
            <div className="td-header-pills">
              <span className="td-id-pill num">{ticket.id.slice(0, 8)}</span>
              <span className="td-status-pill">
                <span className="td-status-dot" aria-hidden /> {PHASE_LABEL[ticket.phase]}
              </span>
              <span className="td-urgency-label">
                {ticket.urgency} · {ticket.category}
                {ticket.rapid ? " · rapid flow" : ""}
              </span>
            </div>
            {deadlineText && <span className="td-expires">{deadlineText}</span>}
          </div>

          <h1 className="td-title">{ticket.title}</h1>

          <div className="td-meta-row">
            <span className="td-meta-item">
              <MapPin size={15} /> {ticket.region}
            </span>
            <span className="td-meta-item">
              <Building2 size={15} /> Host: {ticket.hostName}
            </span>
            <span className="td-meta-item">
              <Users size={15} /> {ticket.contributorCount} contributors
            </span>
          </div>

          {ticket.description && (
            <p className="td-description" style={{ marginTop: 16, color: "var(--color-text-2)", lineHeight: 1.55 }}>
              {ticket.description}
            </p>
          )}
        </header>

        <div className="td-2col">
          <section className="td-card">
            <div className="td-card-head">
              <h2 className="td-card-title">Overall coverage</h2>
              <span className="td-live">
                <span className="td-live-dot" aria-hidden />
                Live · updates in real time
              </span>
            </div>

            <div className="td-coverage">
              <div className="td-coverage-bar">
                <div
                  className="td-coverage-bar-fill"
                  style={{ width: `${Math.min(100, ticket.progressPct)}%` }}
                />
              </div>
              <div className="td-coverage-num num">{ticket.progressPct}%</div>
            </div>

            <div className="td-resources">
              {ticket.needs.map((n, i) => {
                const fulfilled = Math.round((n.quantity * n.progressPct) / 100);
                return (
                  <div key={`${n.label}-${i}`} className="td-resource">
                    <div className="td-resource-head">
                      <span className="td-resource-name">{n.label}</span>
                      <span className="td-resource-count num">
                        {fulfilled} / {n.quantity} {n.unit}
                      </span>
                    </div>
                    <div className="td-resource-bar">
                      <div
                        className="td-resource-bar-fill"
                        style={{ width: `${Math.min(100, n.progressPct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="td-card">
            <h2 className="td-card-title">Contribute to this ticket</h2>
            <p className="td-contribute-body">
              Only verified NGOs and organisations can pledge. Sign in to review open
              needs and commit resources.
            </p>

            <Link href={loginHref} className="td-pledge-btn" style={{ textDecoration: "none" }}>
              Contribute <ArrowRight size={16} strokeWidth={2.5} />
            </Link>

            <div className="td-stat-grid">
              {stats.map((s) => (
                <div key={s.label} className="td-stat-chip">
                  <span className="td-stat-value num">{s.value}</span>
                  <span className="td-stat-label">{s.label}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="td-tabs" role="tablist">
          <button role="tab" aria-selected className="td-tab is-active">
            Contributions
          </button>
        </div>

        <div className="td-contrib-list">
          {contribs.length === 0 ? (
            <div className="td-empty">No contributions yet — be the first to help.</div>
          ) : (
            contribs.map((c) => {
              const orgName = orgNames[c.contributorOrgId] ?? c.contributorOrgId.slice(0, 8);
              const statusKey = STATUS_LABEL[c.status] ? c.status : "PROPOSED";
              return (
                <div key={c.id} className="td-contrib-row">
                  <div
                    className="td-contrib-avatar"
                    style={{ "--av-hue": hueFor(c.contributorOrgId || c.id) } as React.CSSProperties}
                  >
                    {(orgName || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="td-contrib-info">
                    <span className="td-contrib-org">{orgName}</span>
                    <span className="td-contrib-detail">
                      {c.offered.kind} × {c.offered.quantity} {c.offered.unit}
                    </span>
                  </div>
                  <span className={`td-contrib-status td-contrib-status--${statusSlug(statusKey)}`}>
                    {STATUS_LABEL[statusKey]}
                  </span>
                  <span className="td-contrib-time num">
                    {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ""}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function statusSlug(s: string) {
  return (STATUS_LABEL[s] ?? s).toLowerCase().replace(/\s+/g, "-");
}
