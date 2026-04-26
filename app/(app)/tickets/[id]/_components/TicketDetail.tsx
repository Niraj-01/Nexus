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
  query,
  where,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { toast } from "sonner";
import { db, storage } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { callAdvancePhase, callRecordSignoff } from "@/lib/callables";
import { authErrorToMessage } from "@/lib/auth/errors";
import { PledgeForm } from "./PledgeForm";

function randomRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

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

interface ContributionDoc {
  id: string;
  contributorOrgId: string;
  needIndex: number;
  offered: { quantity: number; unit: string };
  status: string;
  committedAt?: number;
}

const PHASE_LABEL: Record<TicketDoc["phase"], { label: string; tone: string }> = {
  RAISED: { label: "Raised", tone: "var(--color-muted, #6b7280)" },
  OPEN_FOR_CONTRIBUTIONS: { label: "Open", tone: "var(--color-accent, #2563eb)" },
  EXECUTION: { label: "Executing", tone: "var(--color-warn, #d97706)" },
  PENDING_SIGNOFF: { label: "Awaiting sign-off", tone: "var(--color-warn, #d97706)" },
  CLOSED: { label: "Closed", tone: "var(--color-muted, #6b7280)" },
};

export function TicketDetail({ ticketId }: { ticketId: string }) {
  const { user, loading, claims } = useAuth();
  const orgId = claims?.orgId ?? null;

  const [ticket, setTicket] = useState<TicketDoc | null | undefined>(undefined);
  const [match, setMatch] = useState<MatchDoc | null>(null);
  const [contribs, setContribs] = useState<ContributionDoc[]>([]);
  const [orgNames, setOrgNames] = useState<Record<string, string>>({});

  // Ticket — live listener (drives the progress bar).
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "tickets", ticketId),
      (snap) => {
        if (!snap.exists()) {
          setTicket(null);
          return;
        }
        setTicket(snap.data() as TicketDoc);
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
      (snap) => setMatch(snap.exists() ? (snap.data() as MatchDoc) : null),
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
            },
            status: String(x.status ?? ""),
            committedAt: typeof x.committedAt === "number" ? x.committedAt : undefined,
          };
        });
        setContribs(out);
      },
      () => setContribs([]),
    );
    return unsub;
  }, [ticketId]);

  // Hydrate contributor org names — single batched fetch, not realtime.
  const contributorOrgIds = useMemo(() => {
    if (!ticket) return [] as string[];
    return ticket.participantOrgIds.filter((id) => id !== ticket.hostOrgId);
  }, [ticket]);

  useEffect(() => {
    const missing = contributorOrgIds.filter((id) => !orgNames[id]);
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
  }, [contributorOrgIds, orgNames]);

  if (loading || ticket === undefined) {
    return <p className="muted-text">Loading ticket…</p>;
  }
  if (!user) return <p className="muted-text">Sign in to view this ticket.</p>;
  if (ticket === null) {
    return (
      <div className="card stack">
        <strong>Ticket not found</strong>
        <Link href="/dashboard" className="btn btn-ghost">Back to dashboard</Link>
      </div>
    );
  }

  const isHost = orgId === ticket.hostOrgId;
  const myContribution = orgId
    ? contribs.find((c) => c.contributorOrgId === orgId)
    : undefined;
  const phase = PHASE_LABEL[ticket.phase];

  return (
    <article className="stack">
      {/* Hero */}
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
                background: "var(--color-danger, #dc2626)",
                color: "white",
              }}
            >
              Emergency
            </span>
          )}
          <span style={{ fontSize: 12, color: phase.tone, fontWeight: 600 }}>
            {phase.label}
          </span>
          <span className="muted-text" style={{ fontSize: 12 }}>·</span>
          <span style={{ fontSize: 12, color: "var(--color-muted, #6b7280)" }}>
            {ticket.host.name} · {ticket.host.type}
          </span>
          {match?.geoDistanceKm !== undefined && (
            <>
              <span className="muted-text" style={{ fontSize: 12 }}>·</span>
              <span className="muted-text" style={{ fontSize: 12 }}>
                {Math.round(match.geoDistanceKm)} km away
              </span>
            </>
          )}
        </div>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 32,
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
        <span className="muted-text" style={{ fontSize: 13 }}>
          {ticket.geo.adminRegion} · Deadline {new Date(ticket.deadline).toLocaleDateString()}
        </span>
      </header>

      {/* Overall progress */}
      <div className="card stack-sm">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <strong>Overall progress</strong>
          <span style={{ fontSize: 24, fontWeight: 700 }}>
            {Math.round(ticket.progressPct)}%
          </span>
        </div>
        <div
          style={{
            height: 6,
            background: "var(--color-surface-2, #f6f7f9)",
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${Math.min(100, Math.max(0, ticket.progressPct))}%`,
              height: "100%",
              background: "var(--color-accent, #2563eb)",
              transition: "width 0.4s ease-out",
            }}
          />
        </div>
      </div>

      {/* Per-need rows */}
      <section className="stack-sm">
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Needs</h2>
        {ticket.needs.map((n, i) => {
          const fulfilled = (n.quantity * n.progressPct) / 100;
          const remaining = Math.max(0, n.quantity - fulfilled);
          return (
            <div key={i} className="card stack-sm">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                <strong>
                  {n.resourceCategory}
                  {n.subtype ? ` · ${n.subtype}` : ""}
                </strong>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {Math.round(n.progressPct)}%
                </span>
              </div>
              <div className="row" style={{ gap: 16, fontSize: 13, flexWrap: "wrap" }}>
                <span className="muted-text">
                  Required: <strong>{n.quantity} {n.unit}</strong>
                </span>
                <span className="muted-text">
                  Fulfilled: <strong>{formatQty(fulfilled)} {n.unit}</strong>
                </span>
                <span className="muted-text">
                  Remaining: <strong>{formatQty(remaining)} {n.unit}</strong>
                </span>
              </div>
              <div
                style={{
                  height: 4,
                  background: "var(--color-surface-2, #f6f7f9)",
                  borderRadius: 999,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, Math.max(0, n.progressPct))}%`,
                    height: "100%",
                    background: "var(--color-accent, #2563eb)",
                    transition: "width 0.4s ease-out",
                  }}
                />
              </div>
            </div>
          );
        })}
      </section>

      {/* Your contribution potential — match-doc backed */}
      {!isHost && match?.contributionFeasibility && !myContribution && (
        <div
          className="card stack-sm"
          style={{
            background: "var(--color-surface-2, #f6f7f9)",
          }}
        >
          <strong>Your contribution potential</strong>
          <p style={{ margin: 0, fontSize: 14 }}>
            You can fill <strong>{Math.round(match.contributionImpactPct)}%</strong>{" "}
            of remaining
            {ticket.needs[match.bestNeedIndex] && (
              <>
                {" "}
                ({formatQty(match.maxContributionPossible)}{" "}
                {ticket.needs[match.bestNeedIndex].unit})
              </>
            )}
            .
          </p>
        </div>
      )}

      {/* Pledge CTA */}
      {!isHost && (
        <PledgeCTA
          ticketId={ticketId}
          ticket={ticket}
          match={match}
          alreadyPledged={Boolean(myContribution)}
        />
      )}

      {myContribution && (
        <div className="card stack-sm" style={{ borderColor: "var(--color-accent, #2563eb)" }}>
          <strong>Your contribution is committed</strong>
          <span style={{ fontSize: 13 }}>
            {formatQty(myContribution.offered.quantity)} {myContribution.offered.unit} ·
            status <strong>{myContribution.status}</strong>
          </span>
        </div>
      )}

      {/* Host lifecycle controls */}
      {isHost && (
        <HostLifecyclePanel ticketId={ticketId} ticket={ticket} />
      )}

      {/* Contributor signoff panel */}
      {!isHost && myContribution && ticket.phase === "PENDING_SIGNOFF" && myContribution.status === "EXECUTED" && (
        <SignoffPanel ticketId={ticketId} />
      )}

      {/* Contributors strip */}
      {contributorOrgIds.length > 0 && (
        <section className="stack-sm">
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
            Contributors ({ticket.contributorCount})
          </h2>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {contributorOrgIds.map((id) => (
              <span
                key={id}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "var(--color-surface-2, #f6f7f9)",
                  fontSize: 13,
                }}
              >
                {orgNames[id] ?? id.slice(0, 6)}
              </span>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

function PledgeCTA({
  ticketId,
  ticket,
  match,
  alreadyPledged,
}: {
  ticketId: string;
  ticket: TicketDoc;
  match: MatchDoc | null;
  alreadyPledged: boolean;
}) {
  if (alreadyPledged) return null;
  if (ticket.phase !== "OPEN_FOR_CONTRIBUTIONS") return null;
  return (
    <PledgeForm
      ticketId={ticketId}
      needs={ticket.needs}
      match={match}
    />
  );
}

function HostLifecyclePanel({
  ticketId,
  ticket,
}: {
  ticketId: string;
  ticket: TicketDoc;
}) {
  const { claims } = useAuth();
  const orgId = claims?.orgId ?? null;
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
    if (!orgId) {
      toast.error("Missing org claim — try signing out and back in.");
      return;
    }
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
      <div className="card stack-sm">
        <strong>Host controls</strong>
        <p className="muted-text" style={{ margin: 0, fontSize: 13 }}>
          When contributions look sufficient, advance the ticket to execution.
          {ticket.progressPct < 100 && " You're below 100% — `advancedEarly` will be flagged."}
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => advance("EXECUTION")}
          disabled={busy}
        >
          {busy ? "Advancing…" : "Move to execution"}
        </button>
      </div>
    );
  }

  if (ticket.phase === "EXECUTION") {
    return (
      <div className="card stack-sm">
        <strong>Host controls — execution</strong>
        <p className="muted-text" style={{ margin: 0, fontSize: 13 }}>
          Upload at least one photo proof, then mark execution complete.
        </p>
        <input
          type="file"
          accept="image/*"
          disabled={proofBusy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadProof(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => advance("PENDING_SIGNOFF")}
          disabled={busy}
        >
          {busy ? "Advancing…" : "Mark execution complete"}
        </button>
      </div>
    );
  }

  if (ticket.phase === "PENDING_SIGNOFF") {
    return (
      <div className="card stack-sm">
        <strong>Awaiting contributor signoffs</strong>
        <p className="muted-text" style={{ margin: 0, fontSize: 13 }}>
          The ticket closes automatically once every contributor has approved.
        </p>
      </div>
    );
  }

  return null;
}

function SignoffPanel({ ticketId }: { ticketId: string }) {
  const [busy, setBusy] = useState(false);
  const [showDispute, setShowDispute] = useState(false);
  const [note, setNote] = useState("");
  const requestId = useMemo(randomRequestId, []);

  async function submit(decision: "APPROVED" | "DISPUTED") {
    setBusy(true);
    try {
      await callRecordSignoff({ ticketId, decision, note, requestId });
      toast.success(decision === "APPROVED" ? "Delivery confirmed." : "Dispute recorded.");
    } catch (err) {
      toast.error(authErrorToMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack-sm" style={{ borderColor: "var(--color-accent, #2563eb)" }}>
      <strong>Sign off on this delivery</strong>
      <p className="muted-text" style={{ margin: 0, fontSize: 13 }}>
        Confirm what the host delivered, or flag a dispute for admin review.
      </p>
      {showDispute && (
        <textarea
          className="textarea"
          placeholder="Why are you disputing? (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy}
        />
      )}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => submit("APPROVED")}
          disabled={busy}
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

function formatQty(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  if (n < 10) return Number(n.toFixed(1)).toString();
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}
