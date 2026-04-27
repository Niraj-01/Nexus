"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  documentId,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { toast } from "sonner";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ImageIcon,
  MapPin,
  ShieldCheck,
  TrendingUp,
  Upload,
  Users,
  Zap,
} from "lucide-react";
import { db, storage } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { callAdvancePhase, callRecordSignoff, callRespondToPledge } from "@/lib/callables";
import { authErrorToMessage } from "@/lib/auth/errors";
import { PledgeForm } from "./PledgeForm";

const TABS = ["Contributions", "Proof", "Activity"] as const;
type Tab = (typeof TABS)[number];

function randomRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Every Firestore read goes through a normalizer — never a bare `as` cast.
// Legacy docs may be missing fields the schema later added; the normalizer
// applies safe defaults once, so render code can trust the shape.

interface TicketDoc {
  hostOrgId: string;
  host: { name: string; type: "NGO" | "ORG" };
  title: string;
  description: string;
  category: string;
  urgency: "NORMAL" | "EMERGENCY";
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
  deadline: number;
  phase: "RAISED" | "OPEN_FOR_CONTRIBUTIONS" | "EXECUTION" | "PENDING_SIGNOFF" | "CLOSED";
  progressPct: number;
  participantOrgIds: string[];
  contributorCount: number;
  createdAt: number;
  closedAt: number | null;
}

interface MatchDoc {
  ticketId: string;
  topResourceId: string;
  bestNeedIndex: number;
  maxContributionPossible: number;
  contributionFeasibility: boolean;
  contributionImpactPct: number;
  geoDistanceKm?: number;
  rapidBroadcast: boolean;
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
  const geo: TicketDoc["geo"] = {
    adminRegion: typeof geoRaw.adminRegion === "string" ? geoRaw.adminRegion : "—",
  };

  const phaseRaw = d.phase;
  const phase: TicketDoc["phase"] =
    phaseRaw === "RAISED" ||
    phaseRaw === "OPEN_FOR_CONTRIBUTIONS" ||
    phaseRaw === "EXECUTION" ||
    phaseRaw === "PENDING_SIGNOFF" ||
    phaseRaw === "CLOSED"
      ? phaseRaw
      : "OPEN_FOR_CONTRIBUTIONS";

  return {
    hostOrgId: typeof d.hostOrgId === "string" ? d.hostOrgId : "",
    host,
    title: typeof d.title === "string" && d.title ? d.title : "(untitled)",
    description: typeof d.description === "string" ? d.description : "",
    category: typeof d.category === "string" ? d.category : "",
    urgency: d.urgency === "EMERGENCY" ? "EMERGENCY" : "NORMAL",
    rapid: Boolean(d.rapid),
    needs,
    geo,
    deadline: typeof d.deadline === "number" ? d.deadline : 0,
    phase,
    progressPct: Number(d.progressPct ?? 0),
    participantOrgIds: Array.isArray(d.participantOrgIds)
      ? d.participantOrgIds.filter((x): x is string => typeof x === "string")
      : [],
    contributorCount: Number(d.contributorCount ?? 0),
    createdAt: typeof d.createdAt === "number" ? d.createdAt : 0,
    closedAt: typeof d.closedAt === "number" ? d.closedAt : null,
  };
}

function parseMatch(raw: unknown): MatchDoc {
  const d = (raw ?? {}) as Record<string, unknown>;
  return {
    ticketId: typeof d.ticketId === "string" ? d.ticketId : "",
    topResourceId: typeof d.topResourceId === "string" ? d.topResourceId : "",
    bestNeedIndex: Number(d.bestNeedIndex ?? 0),
    maxContributionPossible: Number(d.maxContributionPossible ?? 0),
    contributionFeasibility: Boolean(d.contributionFeasibility),
    contributionImpactPct: Number(d.contributionImpactPct ?? 0),
    geoDistanceKm: typeof d.geoDistanceKm === "number" ? d.geoDistanceKm : undefined,
    rapidBroadcast: Boolean(d.rapidBroadcast),
  };
}

interface ContributionDoc {
  id: string;
  contributorOrgId: string;
  needIndex: number;
  offered: { quantity: number; unit: string; kind: string };
  status:
    | "PROPOSED"
    | "AGREEMENT_PENDING"
    | "COMMITTED"
    | "EXECUTED"
    | "SIGNED_OFF"
    | "DISPUTED"
    | "REJECTED";
  committedAt?: number;
  signedOffAt?: number;
}

interface PhotoProofDoc {
  id: string;
  uploaderOrgId: string;
  storagePath: string;
  caption: string;
  contentType: string;
  size: number;
  createdAt: number;
}

const PHASE_LABEL: Record<TicketDoc["phase"], string> = {
  RAISED: "Raised",
  OPEN_FOR_CONTRIBUTIONS: "Open for contributions",
  EXECUTION: "In execution",
  PENDING_SIGNOFF: "Awaiting sign-off",
  CLOSED: "Closed",
};

const PHASE_DOT_COLOR: Record<TicketDoc["phase"], string> = {
  RAISED: "#94a3b8",
  OPEN_FOR_CONTRIBUTIONS: "#2563eb",
  EXECUTION: "#d97706",
  PENDING_SIGNOFF: "#f59e0b",
  CLOSED: "#10b981",
};

const STATUS_LABEL: Record<ContributionDoc["status"], { label: string; cls: string }> = {
  PROPOSED:           { label: "Proposed",     cls: "td-contrib-status--pledged" },
  AGREEMENT_PENDING:  { label: "Agreement",    cls: "td-contrib-status--pledged" },
  COMMITTED:          { label: "Committed",    cls: "td-contrib-status--pledged" },
  EXECUTED:           { label: "Host signed",  cls: "td-contrib-status--host-signed" },
  SIGNED_OFF:         { label: "Fully signed", cls: "td-contrib-status--fully-signed" },
  DISPUTED:           { label: "Disputed",     cls: "td-contrib-status--host-signed" },
  REJECTED:           { label: "Rejected",     cls: "td-contrib-status--host-signed" },
};

function hueFor(orgId: string): number {
  let h = 0;
  for (let i = 0; i < orgId.length; i++) h = (h * 31 + orgId.charCodeAt(i)) >>> 0;
  return h % 360;
}

function formatQty(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  if (n < 10) return Number(n.toFixed(1)).toString();
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

function formatTime(ms: number | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-IN", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TicketDetail({ ticketId }: { ticketId: string }) {
  const { user, loading, claims } = useAuth();
  const orgId = claims?.orgId ?? null;

  const [ticket, setTicket] = useState<TicketDoc | null | undefined>(undefined);
  const [match, setMatch] = useState<MatchDoc | null>(null);
  const [contribs, setContribs] = useState<ContributionDoc[]>([]);
  const [proofs, setProofs] = useState<PhotoProofDoc[]>([]);
  const [orgNames, setOrgNames] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<Tab>("Contributions");

  // Live ticket — drives the progress bar.
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "tickets", ticketId),
      (snap) => {
        if (!snap.exists()) {
          setTicket(null);
          return;
        }
        setTicket(parseTicket(snap.data()));
      },
      () => setTicket(null),
    );
    return unsub;
  }, [ticketId]);

  // Viewer's match doc — only if viewer is not the host.
  useEffect(() => {
    if (!orgId || !ticket || ticket.hostOrgId === orgId) {
      setMatch(null);
      return;
    }
    const unsub = onSnapshot(
      doc(db, "matches", `${ticketId}__${orgId}`),
      (snap) => setMatch(snap.exists() ? parseMatch(snap.data()) : null),
      () => setMatch(null),
    );
    return unsub;
  }, [ticketId, orgId, ticket]);

  // Contributions — live, for contributors strip + my-contribution check.
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "tickets", ticketId, "contributions"),
      (snap) => {
        const out: ContributionDoc[] = snap.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id,
            contributorOrgId: String(x.contributorOrgId ?? ""),
            needIndex: Number(x.needIndex ?? 0),
            offered: {
              quantity: Number(x.offered?.quantity ?? 0),
              unit: String(x.offered?.unit ?? ""),
              kind: String(x.offered?.kind ?? ""),
            },
            status: (x.status as ContributionDoc["status"]) ?? "COMMITTED",
            committedAt: typeof x.committedAt === "number" ? x.committedAt : undefined,
            signedOffAt: typeof x.signedOffAt === "number" ? x.signedOffAt : undefined,
          };
        });
        out.sort((a, b) => (b.committedAt ?? 0) - (a.committedAt ?? 0));
        setContribs(out);
      },
      () => setContribs([]),
    );
    return unsub;
  }, [ticketId]);

  // Photo proofs — live.
  useEffect(() => {
    const q = query(
      collection(db, "tickets", ticketId, "photoProofs"),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const out: PhotoProofDoc[] = snap.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id,
            uploaderOrgId: String(x.uploaderOrgId ?? ""),
            storagePath: String(x.storagePath ?? ""),
            caption: String(x.caption ?? ""),
            contentType: String(x.contentType ?? ""),
            size: Number(x.size ?? 0),
            createdAt: Number(x.createdAt ?? 0),
          };
        });
        setProofs(out);
      },
      () => setProofs([]),
    );
    return unsub;
  }, [ticketId]);

  // Hydrate contributor org names — single batched fetch, not realtime.
  const allOrgIds = useMemo(() => {
    if (!ticket) return [] as string[];
    const ids = new Set<string>();
    if (ticket.hostOrgId) ids.add(ticket.hostOrgId);
    for (const id of ticket.participantOrgIds) ids.add(id);
    for (const c of contribs) ids.add(c.contributorOrgId);
    return Array.from(ids);
  }, [ticket, contribs]);

  useEffect(() => {
    const missing = allOrgIds.filter((id) => id && !orgNames[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const fetched: Record<string, string> = {};
      for (let i = 0; i < missing.length; i += 30) {
        const chunk = missing.slice(i, i + 30);
        const q = query(collection(db, "organizations"), where(documentId(), "in", chunk));
        const snap = await getDocs(q);
        snap.forEach((d) => {
          fetched[d.id] = String(d.data().name ?? d.id);
        });
      }
      if (!cancelled) setOrgNames((prev) => ({ ...prev, ...fetched }));
    })();
    return () => {
      cancelled = true;
    };
  }, [allOrgIds, orgNames]);

  if (loading || ticket === undefined) {
    return <p className="muted-text">Loading ticket…</p>;
  }
  if (!user) return <p className="muted-text">Sign in to view this ticket.</p>;
  if (ticket === null) {
    return (
      <div className="td-shell">
        <div className="td-empty">Ticket {ticketId.slice(0, 8)} not found.</div>
      </div>
    );
  }

  const isHost = orgId === ticket.hostOrgId;

  // Multiple non-REJECTED contributions per (ticket, org) are now allowed
  // to support incremental partial fulfillment. REJECTED contributions are
  // historical and don't block re-pledging.
  const myContributions = orgId
    ? contribs.filter((c) => c.contributorOrgId === orgId && c.status !== "REJECTED")
    : [];
  const myContribution = myContributions[0];
  const hasExecutedSelf = myContributions.some((c) => c.status === "EXECUTED");
  const proposedForHost = isHost
    ? contribs.filter((c) => c.status === "PROPOSED")
    : [];

  // Sum of non-REJECTED contribution quantities per need index — mirrors
  // the server-side per-need cap so PledgeForm can clamp input client-side.
  const fulfilledByNeed = ticket.needs.map((_, i) =>
    contribs
      .filter((c) => c.status !== "REJECTED" && c.needIndex === i)
      .reduce((sum, c) => sum + c.offered.quantity, 0),
  );

  const phaseLabel = PHASE_LABEL[ticket.phase];
  const isEmergency = ticket.urgency === "EMERGENCY";

  const totalRequired = ticket.needs.reduce((s, n) => s + n.quantity, 0);
  const totalFulfilled = ticket.needs.reduce((s, n) => s + (n.quantity * n.progressPct) / 100, 0);
  const totalRemaining = Math.max(0, totalRequired - totalFulfilled);

  return (
    <div className="td-shell">
      {/* ── Header ── */}
      <header className={`td-header${isEmergency ? " td-header--emergency" : ""}`}>
        <div className="td-header-top">
          <div className="td-header-pills">
            <span className="td-id-pill num">{ticketId.slice(0, 8)}</span>
            <span className="td-status-pill">
              <span
                className="td-status-dot"
                aria-hidden
                style={{ background: PHASE_DOT_COLOR[ticket.phase] }}
              />
              {phaseLabel}
            </span>
            <span className="td-urgency-label">
              {ticket.urgency} · {ticket.category}
              {ticket.rapid ? " · rapid flow" : " · structured flow"}
            </span>
          </div>
          <span className="td-expires">
            {ticket.phase === "CLOSED" && ticket.closedAt
              ? `closed · ${new Date(ticket.closedAt).toLocaleDateString()}`
              : `deadline · ${new Date(ticket.deadline).toLocaleDateString()}`}
          </span>
        </div>

        <h1 className="td-title">{ticket.title}</h1>
        <p className="td-contribute-body" style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>
          {ticket.description}
        </p>

        <div className="td-meta-row">
          <span className="td-meta-item">
            <MapPin size={15} /> {ticket.geo.adminRegion}
            {match?.geoDistanceKm !== undefined && match.geoDistanceKm > 0 && (
              <span className="muted-text num" style={{ marginLeft: 6 }}>
                · {Math.round(match.geoDistanceKm)} km
              </span>
            )}
          </span>
          <span className="td-meta-item">
            <Building2 size={15} /> Host: {ticket.host.name}
            <ShieldCheck
              size={14}
              style={{ color: "var(--color-primary)", marginLeft: 4 }}
            />
          </span>
          <span className="td-meta-item">
            <Users size={15} /> {ticket.contributorCount} contributor
            {ticket.contributorCount === 1 ? "" : "s"}
          </span>
        </div>
      </header>

      {/* ── Two-column ── */}
      <div className="td-2col">
        {/* Coverage + needs */}
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
            <div className="td-coverage-num num">{Math.round(ticket.progressPct)}%</div>
          </div>

          <div className="muted-text" style={{ fontSize: "12px" }}>
            <span className="num">{formatQty(totalFulfilled)}</span> of{" "}
            <span className="num">{formatQty(totalRequired)}</span> units fulfilled ·{" "}
            <span className="num">{formatQty(totalRemaining)}</span> remaining
          </div>

          <div className="td-resources">
            {ticket.needs.map((n, i) => {
              const fulfilled = (n.quantity * n.progressPct) / 100;
              const pct = Math.min(100, Math.max(0, n.progressPct));
              return (
                <div key={i} className="td-resource">
                  <div className="td-resource-head">
                    <span className="td-resource-name">
                      #{i + 1} · {n.resourceCategory}
                      {n.subtype ? ` · ${n.subtype}` : ""}
                    </span>
                    <span className="td-resource-count num">
                      {formatQty(fulfilled)} / {formatQty(n.quantity)} {n.unit}
                    </span>
                  </div>
                  <div className="td-resource-bar">
                    <div
                      className="td-resource-bar-fill"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Right column: viewer-aware action card */}
        <section className="td-card">
          {isHost ? (
            <HostControls
              ticketId={ticketId}
              ticket={ticket}
              orgId={orgId!}
              proofCount={proofs.length}
              outstandingSignoffs={contribs.filter((c) => c.status === "EXECUTED").length}
            />
          ) : myContribution ? (
            <ContributorPanel
              ticketId={ticketId}
              ticket={ticket}
              myContribution={myContribution}
            />
          ) : ticket.phase === "OPEN_FOR_CONTRIBUTIONS" ? (
            <ContributeCard
              ticketId={ticketId}
              ticket={ticket}
              match={match}
              fulfilledByNeed={fulfilledByNeed}
            />
          ) : (
            <ClosedOrLockedCard ticket={ticket} />
          )}
        </section>
      </div>

      {/* ── Tabs ── */}
      <div className="td-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`td-tab${activeTab === tab ? " is-active" : ""}`}
          >
            {tab}
            {tab === "Proof" && proofs.length > 0 && (
              <span className="num muted-text" style={{ marginLeft: 6 }}>
                · {proofs.length}
              </span>
            )}
            {tab === "Contributions" && contribs.length > 0 && (
              <span className="num muted-text" style={{ marginLeft: 6 }}>
                · {contribs.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {activeTab === "Contributions" && (
        <ContributionsTab
          ticket={ticket}
          contribs={contribs}
          orgNames={orgNames}
          isHost={isHost}
          ticketId={ticketId}
          proposedForHost={proposedForHost}
        />
      )}

      {activeTab === "Proof" && (
        <ProofTab proofs={proofs} orgNames={orgNames} />
      )}

      {activeTab === "Activity" && (
        <ActivityTab
          ticket={ticket}
          contribs={contribs}
          proofs={proofs}
          orgNames={orgNames}
        />
      )}
    </div>
  );
}

// ── Right-column panels ────────────────────────────────────────────────

function ContributeCard({
  ticketId,
  ticket,
  match,
  fulfilledByNeed,
}: {
  ticketId: string;
  ticket: TicketDoc;
  match: MatchDoc | null;
  fulfilledByNeed: number[];
}) {
  const canPledge = match?.contributionFeasibility ?? false;

  return (
    <>
      <h2 className="td-card-title">Contribute to this ticket</h2>
      <p className="td-contribute-body">
        {ticket.rapid
          ? "Rapid flow — your pledge reflects immediately. Delivery verification handled after the fact."
          : "Structured flow — your pledge starts as PROPOSED and waits for the host to approve before reserving inventory."}
      </p>

      {match && (
        <div className="stack" style={{ gap: 6, margin: "10px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span className="muted-text">You can contribute up to</span>
            <span className="num" style={{ fontWeight: 600 }}>
              {formatQty(match.maxContributionPossible)}{" "}
              {ticket.needs[match.bestNeedIndex]?.unit ?? "units"}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span className="muted-text" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <TrendingUp size={12} /> Your impact
            </span>
            <span className="num" style={{ fontWeight: 600, color: "var(--color-primary)" }}>
              +{Math.round(match.contributionImpactPct)}%
            </span>
          </div>
        </div>
      )}

      {canPledge ? (
        <PledgeForm
          ticketId={ticketId}
          needs={ticket.needs}
          rapid={ticket.rapid}
          match={match}
          fulfilledByNeed={fulfilledByNeed}
        />
      ) : (
        <div className="td-empty" style={{ padding: 20 }}>
          {match
            ? "No matching capacity available for this ticket."
            : "You don't have a matching resource for this ticket. List a resource in the right category to start receiving matches."}
        </div>
      )}

      {ticket.rapid && canPledge && (
        <div
          className="badge badge-emergency"
          style={{
            marginTop: 4,
            alignSelf: "flex-start",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Zap size={11} /> Rapid mode active
        </div>
      )}
    </>
  );
}

function ContributorPanel({
  ticketId,
  ticket,
  myContribution,
}: {
  ticketId: string;
  ticket: TicketDoc;
  myContribution: ContributionDoc;
}) {
  const status = STATUS_LABEL[myContribution.status];
  return (
    <>
      <h2 className="td-card-title">Your contribution</h2>
      <div
        style={{
          padding: 16,
          border: "1px solid rgba(5, 150, 105, 0.22)",
          borderRadius: 8,
          background: "rgba(5, 150, 105, 0.08)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <CheckCircle2 size={18} style={{ color: "var(--color-success)" }} />
          <strong style={{ fontSize: 14 }}>{status?.label ?? "Committed"}</strong>
        </div>
        <p style={{ fontSize: 14, margin: 0 }}>
          <span className="num">{formatQty(myContribution.offered.quantity)}</span>{" "}
          {myContribution.offered.unit} of {myContribution.offered.kind}
          {myContribution.committedAt && (
            <span className="muted-text">
              {" "}· committed {formatTime(myContribution.committedAt)}
            </span>
          )}
        </p>
      </div>

      {ticket.phase === "PENDING_SIGNOFF" && myContribution.status === "EXECUTED" && (
        <SignoffPanel ticketId={ticketId} />
      )}

      {myContribution.status === "SIGNED_OFF" && (
        <p className="muted-text" style={{ fontSize: 13, margin: 0 }}>
          You&apos;ve confirmed delivery. The ticket auto-closes once every contributor signs off.
        </p>
      )}
    </>
  );
}

function ClosedOrLockedCard({ ticket }: { ticket: TicketDoc }) {
  const isClosed = ticket.phase === "CLOSED";
  return (
    <>
      <h2 className="td-card-title">
        {isClosed ? "Ticket closed" : "No longer accepting pledges"}
      </h2>
      <p className="td-contribute-body">
        {isClosed
          ? "All contributions have been verified and badges minted to participants."
          : `Currently in ${PHASE_LABEL[ticket.phase].toLowerCase()}. New pledges open only during the contribution phase.`}
      </p>
    </>
  );
}

// ── Host controls ──────────────────────────────────────────────────────

function HostControls({
  ticketId,
  ticket,
  orgId,
  proofCount,
  outstandingSignoffs,
}: {
  ticketId: string;
  ticket: TicketDoc;
  orgId: string;
  proofCount: number;
  outstandingSignoffs: number;
}) {
  const [busy, setBusy] = useState(false);
  const [proofBusy, setProofBusy] = useState(false);
  const requestId = useMemo(randomRequestId, [ticket.phase]);

  async function advance(target: "EXECUTION" | "PENDING_SIGNOFF") {
    setBusy(true);
    try {
      const res = await callAdvancePhase({ ticketId, target, requestId });
      toast.success(`Phase: ${res.phase}`);
    } catch (err) {
      toast.error(authErrorToMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function uploadProof(file: File) {
    setProofBusy(true);
    try {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
      const filename = `${randomRequestId()}.${ext}`;
      const path = `tickets/${ticketId}/photoProofs/${filename}`;
      await uploadBytes(storageRef(storage, path), file, { contentType: file.type });
      await addDoc(collection(db, "tickets", ticketId, "photoProofs"), {
        uploaderOrgId: orgId,
        storagePath: path,
        caption: "",
        contentType: file.type,
        size: file.size,
        createdAt: Date.now(),
      });
      toast.success("Photo proof uploaded.");
    } catch (err) {
      toast.error(authErrorToMessage(err));
    } finally {
      setProofBusy(false);
    }
  }

  if (ticket.phase === "OPEN_FOR_CONTRIBUTIONS") {
    return (
      <>
        <h2 className="td-card-title">Host controls</h2>
        <p className="td-contribute-body">
          When contributions look sufficient, advance the ticket to execution.
          {ticket.progressPct < 100 && (
            <>
              {" "}<strong>You&apos;re at {Math.round(ticket.progressPct)}%</strong> — moving forward early flags <code>advancedEarly</code> on the ticket.
            </>
          )}
        </p>
        <button
          type="button"
          className="td-pledge-btn"
          onClick={() => advance("EXECUTION")}
          disabled={busy}
        >
          {busy ? "Advancing…" : (
            <>
              Move to execution <ArrowRight size={16} strokeWidth={2.5} />
            </>
          )}
        </button>
      </>
    );
  }

  if (ticket.phase === "EXECUTION") {
    return (
      <>
        <h2 className="td-card-title">Host controls — execution</h2>
        <p className="td-contribute-body">
          Upload at least one photo proof, then mark execution complete to send the ticket to contributor sign-off.
        </p>

        <label
          className="row"
          style={{
            gap: 10,
            padding: 14,
            border: "1px dashed var(--color-border)",
            borderRadius: 8,
            cursor: proofBusy ? "wait" : "pointer",
            background: "var(--color-surface-2)",
          }}
        >
          <Upload size={18} />
          <span style={{ fontSize: 14 }}>
            {proofBusy ? "Uploading…" : "Upload photo proof"}
          </span>
          <input
            type="file"
            accept="image/*"
            disabled={proofBusy}
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadProof(f);
              e.target.value = "";
            }}
          />
        </label>

        <p className="muted-text" style={{ fontSize: 12, margin: 0 }}>
          {proofCount === 0
            ? "No proofs uploaded yet."
            : `${proofCount} proof${proofCount === 1 ? "" : "s"} uploaded.`}
        </p>

        <button
          type="button"
          className="td-pledge-btn"
          onClick={() => advance("PENDING_SIGNOFF")}
          disabled={busy || proofCount === 0}
          style={proofCount === 0 ? { opacity: 0.55 } : undefined}
        >
          {busy ? "Advancing…" : "Mark execution complete"}
        </button>
      </>
    );
  }

  if (ticket.phase === "PENDING_SIGNOFF") {
    return (
      <>
        <h2 className="td-card-title">Awaiting contributor sign-off</h2>
        <p className="td-contribute-body">
          The ticket auto-closes once every contributor has confirmed delivery. A single dispute pauses closure for review.
        </p>
        <div
          style={{
            padding: 14,
            background: "var(--color-surface-2)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
          }}
        >
          <strong style={{ fontSize: 14, display: "block", marginBottom: 4 }}>
            {outstandingSignoffs} contributor{outstandingSignoffs === 1 ? "" : "s"} still to confirm
          </strong>
          <span className="muted-text" style={{ fontSize: 12 }}>
            Contributors see a sign-off button when they open this ticket.
          </span>
        </div>
      </>
    );
  }

  return (
    <>
      <h2 className="td-card-title">
        Ticket {ticket.phase === "CLOSED" ? "closed" : ticket.phase.toLowerCase()}
      </h2>
      <p className="td-contribute-body">
        {ticket.phase === "CLOSED"
          ? "Badges have been minted to all participants."
          : "No host actions are available in the current phase."}
      </p>
    </>
  );
}

// ── Signoff panel (contributor) ────────────────────────────────────────

function SignoffPanel({ ticketId }: { ticketId: string }) {
  const [busy, setBusy] = useState(false);
  const [showDispute, setShowDispute] = useState(false);
  const [note, setNote] = useState("");

  async function submit(decision: "APPROVED" | "DISPUTED") {
    setBusy(true);
    try {
      // Fresh requestId per click — APPROVED then DISPUTED on retry is a
      // logically distinct call, not a network retry.
      await callRecordSignoff({ ticketId, decision, note, requestId: randomRequestId() });
      toast.success(decision === "APPROVED" ? "Delivery confirmed." : "Dispute recorded.");
    } catch (err) {
      toast.error(authErrorToMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        padding: 14,
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        background: "var(--color-surface-2)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <strong style={{ fontSize: 14 }}>Sign off on this delivery</strong>
      <p className="muted-text" style={{ fontSize: 12, margin: 0 }}>
        Confirm what the host delivered, or flag a dispute for admin review.
      </p>
      {showDispute && (
        <textarea
          className="textarea input"
          placeholder="Why are you disputing? (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          disabled={busy}
        />
      )}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="td-pledge-btn"
          onClick={() => submit("APPROVED")}
          disabled={busy}
          style={{ flex: 1 }}
        >
          {busy ? "Submitting…" : "Confirm delivery"}
        </button>
        {!showDispute ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setShowDispute(true)}
            disabled={busy}
          >
            Dispute
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => submit("DISPUTED")}
            disabled={busy}
          >
            Submit dispute
          </button>
        )}
      </div>
    </div>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────

function ContributionsTab({
  ticket,
  contribs,
  orgNames,
  isHost,
  ticketId,
  proposedForHost,
}: {
  ticket: TicketDoc;
  contribs: ContributionDoc[];
  orgNames: Record<string, string>;
  isHost: boolean;
  ticketId: string;
  proposedForHost: ContributionDoc[];
}) {
  return (
    <div className="stack" style={{ gap: 16 }}>
      {/* Host: proposed pledges awaiting approval */}
      {isHost && proposedForHost.length > 0 && (
        <ProposedPledgesPanel
          ticketId={ticketId}
          proposed={proposedForHost}
          orgNames={orgNames}
        />
      )}

      {contribs.length === 0 ? (
        <div className="td-empty">No contributions yet.</div>
      ) : (
        <div className="td-contrib-list">
          {contribs.map((c) => {
            const orgName = orgNames[c.contributorOrgId] ?? c.contributorOrgId.slice(0, 6);
            const need = ticket.needs[c.needIndex];
            const status = STATUS_LABEL[c.status] ?? { label: c.status, cls: "" };
            return (
              <div key={c.id} className="td-contrib-row">
                <div
                  className="td-contrib-avatar"
                  style={{ "--av-hue": hueFor(c.contributorOrgId) } as React.CSSProperties}
                >
                  {orgName.charAt(0).toUpperCase()}
                </div>
                <div className="td-contrib-info">
                  <span className="td-contrib-org">{orgName}</span>
                  <span className="td-contrib-detail">
                    {need?.resourceCategory ?? c.offered.kind} ×{" "}
                    {formatQty(c.offered.quantity)} {c.offered.unit}
                  </span>
                </div>
                <span className={`td-contrib-status ${status.cls}`}>{status.label}</span>
                <span className="td-contrib-time">{formatTime(c.committedAt)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProofTab({
  proofs,
  orgNames,
}: {
  proofs: PhotoProofDoc[];
  orgNames: Record<string, string>;
}) {
  if (proofs.length === 0) {
    return <div className="td-empty">No proof uploads yet.</div>;
  }
  return (
    <div className="stack" style={{ gap: 10 }}>
      {proofs.map((p) => {
        const author = orgNames[p.uploaderOrgId] ?? p.uploaderOrgId.slice(0, 6);
        return (
          <div
            key={p.id}
            className="td-contrib-row"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 4,
            }}
          >
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <ImageIcon size={16} style={{ color: "var(--color-primary)" }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{author}</span>
              <span className="muted-text" style={{ fontSize: 12 }}>
                · {(p.size / 1024).toFixed(0)} KB · {p.contentType}
              </span>
            </div>
            {p.caption && <span className="td-contrib-detail">{p.caption}</span>}
            <span className="td-contrib-time">{formatTime(p.createdAt)}</span>
            <span className="muted-text" style={{ fontSize: 11, fontFamily: "monospace" }}>
              {p.storagePath}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ActivityTab({
  ticket,
  contribs,
  proofs,
  orgNames,
}: {
  ticket: TicketDoc;
  contribs: ContributionDoc[];
  proofs: PhotoProofDoc[];
  orgNames: Record<string, string>;
}) {
  type Event = { id: string; at: number; title: string; detail: string };
  const events: Event[] = [];

  events.push({
    id: "created",
    at: ticket.createdAt,
    title: "Ticket created",
    detail: `${ticket.host.name} opened this ${ticket.rapid ? "rapid" : "structured"} ticket.`,
  });

  for (const c of contribs) {
    if (!c.committedAt) continue;
    const orgName = orgNames[c.contributorOrgId] ?? c.contributorOrgId.slice(0, 6);
    events.push({
      id: `c-${c.id}`,
      at: c.committedAt,
      title: `${orgName} pledged`,
      detail: `${formatQty(c.offered.quantity)} ${c.offered.unit} of ${c.offered.kind}`,
    });
  }

  for (const p of proofs) {
    const orgName = orgNames[p.uploaderOrgId] ?? p.uploaderOrgId.slice(0, 6);
    events.push({
      id: `p-${p.id}`,
      at: p.createdAt,
      title: `${orgName} uploaded proof`,
      detail: p.caption || "Photo proof attached",
    });
  }

  for (const c of contribs) {
    if (!c.signedOffAt) continue;
    const orgName = orgNames[c.contributorOrgId] ?? c.contributorOrgId.slice(0, 6);
    events.push({
      id: `s-${c.id}`,
      at: c.signedOffAt,
      title: `${orgName} signed off`,
      detail: c.status === "DISPUTED" ? "Disputed delivery" : "Confirmed delivery",
    });
  }

  if (ticket.closedAt) {
    events.push({
      id: "closed",
      at: ticket.closedAt,
      title: "Ticket closed",
      detail: "All contributions verified. Badges minted to participants.",
    });
  }

  events.sort((a, b) => b.at - a.at);

  if (events.length === 0) {
    return <div className="td-empty">No activity yet.</div>;
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      {events.map((e) => (
        <div
          key={e.id}
          className="td-contrib-row"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 4,
          }}
        >
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{e.title}</span>
          <span className="td-contrib-detail">{e.detail}</span>
          <span className="td-contrib-time">{formatTime(e.at)}</span>
        </div>
      ))}
    </div>
  );
}

// Used by the back link in tickets/[id]/page.tsx — re-export here so the
// page wrapper can render the back link consistently.
export function TicketDetailBack() {
  return (
    <Link
      href="/tickets"
      className="td-back"
      style={{ textDecoration: "none" }}
    >
      ← Back to tickets
    </Link>
  );
}

function ProposedPledgesPanel({
  ticketId,
  proposed,
  orgNames,
}: {
  ticketId: string;
  proposed: ContributionDoc[];
  orgNames: Record<string, string>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  async function respond(
    contributionId: string,
    decision: "APPROVE" | "REJECT",
    rejectNote?: string,
  ) {
    setBusyId(contributionId);
    try {
      await callRespondToPledge({
        ticketId,
        contributionId,
        decision,
        note: rejectNote ?? "",
        requestId: randomRequestId(),
      });
      toast.success(
        decision === "APPROVE" ? "Pledge approved." : "Pledge rejected.",
      );
      setRejectingId(null);
      setNote("");
    } catch (err) {
      toast.error(authErrorToMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="stack-sm">
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
        Proposed pledges ({proposed.length})
      </h2>
      <p className="muted-text" style={{ margin: 0, fontSize: 13 }}>
        Approving reserves the contributor&apos;s resource and moves your progress bar.
        Rejecting frees nothing — the contributor can re-pledge with a different resource.
      </p>
      {proposed.map((c) => {
        const isRejecting = rejectingId === c.id;
        return (
          <div key={c.id} className="card stack-sm">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
              <strong>{orgNames[c.contributorOrgId] ?? c.contributorOrgId.slice(0, 6)}</strong>
              <span style={{ fontSize: 13 }}>
                {formatQty(c.offered.quantity)} {c.offered.unit} · need #{c.needIndex + 1}
              </span>
            </div>
            {isRejecting && (
              <input
                type="text"
                className="input"
                placeholder="Reason (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={busyId === c.id}
                maxLength={500}
              />
            )}
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => respond(c.id, "APPROVE")}
                disabled={busyId === c.id}
              >
                {busyId === c.id ? "Working…" : "Approve"}
              </button>
              {!isRejecting ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setRejectingId(c.id)}
                  disabled={busyId !== null}
                >
                  Reject
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => respond(c.id, "REJECT", note)}
                    disabled={busyId === c.id}
                  >
                    Confirm reject
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setRejectingId(null);
                      setNote("");
                    }}
                    disabled={busyId === c.id}
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

