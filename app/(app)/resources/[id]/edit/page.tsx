"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { ResourceClientWriteInput } from "@/lib/schemas";
import { ResourceForm } from "../../_components/ResourceForm";
import { newRequestId } from "../../_lib/requestId";

const DAY = 86_400_000;

function toFormValues(data: Record<string, unknown>): ResourceClientWriteInput {
  const now = Date.now();
  const terms = (data.terms ?? {}) as Record<string, unknown>;
  const geo = (data.geo ?? {}) as Record<string, unknown>;
  const ec = (data.emergencyContract ?? {}) as Record<string, unknown>;
  return {
    category: (data.category as ResourceClientWriteInput["category"]) ?? "MATERIAL",
    title: String(data.title ?? ""),
    quantity: Number(data.quantity ?? 1),
    unit: String(data.unit ?? "units"),
    valuationINR: Number(data.valuationINR ?? 0),
    terms: {
      availableFrom: Number(terms.availableFrom ?? now),
      availableUntil: Number(terms.availableUntil ?? now + 30 * DAY),
      conditions: String(terms.conditions ?? ""),
    },
    geo: {
      lat: Number(geo.lat ?? 0),
      lng: Number(geo.lng ?? 0),
      adminRegion: String(geo.adminRegion ?? ""),
      operatingAreas: Array.isArray(geo.operatingAreas) ? (geo.operatingAreas as string[]) : [],
      serviceRadiusKm: Number(geo.serviceRadiusKm ?? 0),
    },
    emergencyContract: {
      enabled: Boolean(ec.enabled ?? false),
      emergencyCategories: Array.isArray(ec.emergencyCategories)
        ? (ec.emergencyCategories as string[])
        : [],
      maxQuantityPerTicket: Number(ec.maxQuantityPerTicket ?? 0),
      autoNotify: Boolean(ec.autoNotify ?? false),
    },
    requestId: newRequestId(),
  };
}

export default function EditResourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading, claims } = useAuth();
  const [initial, setInitial] = useState<ResourceClientWriteInput | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !claims?.orgId) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "resources", id));
        if (!snap.exists()) {
          if (!cancelled) setError("Resource not found.");
          return;
        }
        const data = snap.data();
        if (data.orgId !== claims.orgId) {
          if (!cancelled) setError("You don't own this resource.");
          return;
        }
        if (!cancelled) setInitial(toFormValues(data));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, user, claims?.orgId]);

  return (
    <div className="stack" style={{ maxWidth: 760, margin: "0 auto" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em" }}>
            Edit resource
          </h1>
          <p className="muted-text">
            Saving will re-run the embedding so search stays in sync.
          </p>
        </div>
        <Link href="/resources" className="btn btn-ghost">Cancel</Link>
      </div>

      {loading ? (
        <p className="muted-text">Loading…</p>
      ) : error ? (
        <div className="card stack-sm">
          <strong>Couldn&apos;t open editor</strong>
          <p className="muted-text" style={{ fontSize: 13 }}>{error}</p>
          <Link href="/resources" className="btn btn-ghost">Back to resources</Link>
        </div>
      ) : initial ? (
        <ResourceForm mode={{ kind: "edit", resourceId: id, initial }} />
      ) : (
        <p className="muted-text">Loading resource…</p>
      )}
    </div>
  );
}
