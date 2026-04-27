"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { toast } from "sonner";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { callPledge } from "@/lib/callables";
import { authErrorToMessage } from "@/lib/auth/errors";

interface NeedRow {
  resourceCategory: string;
  quantity: number;
  unit: string;
  valuationINR: number;
  progressPct: number;
}

interface ResourceOption {
  id: string;
  title: string;
  category: string;
  quantity: number;
  reservedQuantity: number;
  unit: string;
  valuationINR: number;
}

function randomRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Pledge form. Contributors must point at a resource they have already
 * listed — the server validates ownership, category, available quantity,
 * and (for rapid tickets) emergency contract terms before accepting.
 * Valuation and pctOfNeed are derived server-side from the chosen
 * resource; the client only sends `resourceId` and `quantity`.
 */
export function PledgeForm({
  ticketId,
  needs,
  rapid,
  match,
  fulfilledByNeed,
}: {
  ticketId: string;
  needs: NeedRow[];
  rapid: boolean;
  match: { bestNeedIndex: number; maxContributionPossible: number } | null;
  /** Sum of non-REJECTED contribution quantities per need index, supplied
   * by the parent so the form can cap input at the remaining headroom.
   * Mirrors the server-side cap in pledge.ts (counts PROPOSED too). */
  fulfilledByNeed: number[];
}) {
  const { claims } = useAuth();
  const orgId = claims?.orgId ?? null;
  const initialNeed = match?.bestNeedIndex ?? 0;

  const [needIndex, setNeedIndex] = useState(initialNeed);
  const [resources, setResources] = useState<ResourceOption[] | null>(null);
  const [resourceId, setResourceId] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(0);
  const [notes, setNotes] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const need = needs[needIndex];

  useEffect(() => {
    if (!orgId) return;
    const q = query(collection(db, "resources"), where("orgId", "==", orgId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const out: ResourceOption[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: String(data.title ?? ""),
            category: String(data.category ?? ""),
            quantity: Number(data.quantity ?? 0),
            reservedQuantity: Number(data.reservedQuantity ?? 0),
            unit: String(data.unit ?? ""),
            valuationINR: Number(data.valuationINR ?? 0),
          };
        });
        setResources(out);
      },
      (err) => toast.error(`Couldn't load your resources: ${err.message}`),
    );
    return unsub;
  }, [orgId]);

  const eligible = useMemo(() => {
    if (!resources || !need) return [];
    return resources.filter(
      (r) => r.category === need.resourceCategory && r.quantity > r.reservedQuantity,
    );
  }, [resources, need]);

  useEffect(() => {
    // Auto-pick first eligible resource when need or list changes. Suggest
    // a quantity capped by both inventory headroom AND remaining-need
    // capacity (sum of non-REJECTED contributions on this need).
    if (!eligible.length) {
      setResourceId("");
      setQuantity(0);
      return;
    }
    if (!eligible.find((r) => r.id === resourceId)) {
      const first = eligible[0];
      setResourceId(first.id);
      const free = first.quantity - first.reservedQuantity;
      const need = needs[needIndex];
      const fulfilled = fulfilledByNeed[needIndex] ?? 0;
      const remainingOnNeed = need ? Math.max(0, need.quantity - fulfilled) : 0;
      const initialMax = match?.maxContributionPossible;
      const cap = Math.min(
        free,
        remainingOnNeed,
        initialMax && initialMax > 0 ? initialMax : Infinity,
      );
      setQuantity(Number(cap.toFixed(2)) || 0);
    }
  }, [eligible, resourceId, match, needs, needIndex, fulfilledByNeed]);

  if (!need) return null;

  const chosen = eligible.find((r) => r.id === resourceId);
  const free = chosen ? chosen.quantity - chosen.reservedQuantity : 0;
  const unitValuation = chosen && chosen.quantity > 0 ? chosen.valuationINR / chosen.quantity : 0;
  const projectedValuation = Math.round(unitValuation * quantity);
  // Per-need cap mirrors the server-side check in pledge.ts (counts every
  // non-REJECTED contribution toward "already pledged"). PROPOSED counts.
  const fulfilledOnNeed = fulfilledByNeed[needIndex] ?? 0;
  const remainingOnNeed = Math.max(0, need.quantity - fulfilledOnNeed);
  const maxAllowed = Math.min(free, remainingOnNeed);
  const ratio = need.quantity > 0 ? quantity / need.quantity : 0;
  const fillsPct = Math.min(100, Math.max(0, ratio * 100));

  async function submit() {
    if (!resourceId) {
      toast.error("Pick a listed resource to pledge from.");
      return;
    }
    if (quantity <= 0 || quantity > maxAllowed) {
      toast.error(
        quantity <= 0
          ? "Quantity must be positive."
          : quantity > free
            ? `Only ${free} ${chosen?.unit ?? ""} available in your inventory.`
            : `Need only has ${remainingOnNeed} ${need.unit} of remaining capacity.`,
      );
      return;
    }
    setBusy(true);
    try {
      // Mint a fresh requestId per submission so back-to-back partial
      // pledges (50 then 30) don't collide on the idempotency key.
      const res = await callPledge({
        ticketId,
        needIndex,
        resourceId,
        quantity,
        notes,
        requestId: randomRequestId(),
      });
      if (res.status === "PROPOSED") {
        toast.success("Pledge proposed. Waiting for the host to approve it.");
      } else {
        toast.success(`Pledge committed. Ticket is now ${res.progressPct}% fulfilled.`);
      }
    } catch (err) {
      toast.error(authErrorToMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack-sm" style={{ borderColor: "var(--color-accent, #2563eb)" }}>
      <strong>Pledge to this ticket</strong>
      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        <div className="form-row" style={{ flex: 1, minWidth: 200 }}>
          <label className="label">Need</label>
          <select
            className="select"
            value={needIndex}
            onChange={(e) => setNeedIndex(Number(e.target.value))}
            disabled={busy}
          >
            {needs.map((n, i) => (
              <option key={i} value={i}>
                #{i + 1} · {n.resourceCategory} ({n.quantity} {n.unit})
              </option>
            ))}
          </select>
        </div>
        <div className="form-row" style={{ flex: 1, minWidth: 240 }}>
          <label className="label">Your resource</label>
          <select
            className="select"
            value={resourceId}
            onChange={(e) => setResourceId(e.target.value)}
            disabled={busy || eligible.length === 0}
          >
            {eligible.length === 0 ? (
              <option value="">No matching resource listed</option>
            ) : (
              eligible.map((r) => {
                const f = r.quantity - r.reservedQuantity;
                return (
                  <option key={r.id} value={r.id}>
                    {r.title} — {f} {r.unit} free
                  </option>
                );
              })
            )}
          </select>
        </div>
        <div className="form-row" style={{ flex: 1, minWidth: 160 }}>
          <label className="label">Quantity ({chosen?.unit ?? need.unit})</label>
          <input
            type="number"
            className="input"
            step="any"
            min={0}
            max={maxAllowed}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            disabled={busy || !chosen}
          />
        </div>
      </div>
      <div className="form-row">
        <label className="label">Notes (optional)</label>
        <input
          type="text"
          className="input"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          disabled={busy}
          placeholder="Delivery window, contact, etc."
        />
      </div>
      <div className="muted-text" style={{ fontSize: 12 }}>
        Fills <strong>{Math.round(fillsPct)}%</strong> of the need ·
        valued at ~₹{new Intl.NumberFormat("en-IN").format(projectedValuation)} ·
        {rapid ? " commits instantly (rapid ticket)" : " awaits host approval"}
      </div>
      <div className="muted-text" style={{ fontSize: 12 }}>
        Remaining capacity on this need: <strong>{remainingOnNeed} {need.unit}</strong>
        {chosen ? <> · your inventory free: <strong>{free} {chosen.unit}</strong></> : null}
      </div>
      {eligible.length === 0 ? (
        <div className="muted-text" style={{ fontSize: 12 }}>
          You need to list a {need.resourceCategory} resource on your /resources page before pledging.
        </div>
      ) : null}
      <button
        type="button"
        className="btn btn-primary"
        onClick={submit}
        disabled={busy || !resourceId || quantity <= 0 || quantity > maxAllowed}
      >
        {busy ? "Submitting…" : rapid ? "Pledge now" : "Submit for approval"}
      </button>
    </div>
  );
}
