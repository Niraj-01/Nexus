"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import {
  AlertCircle,
  ArrowLeft,
  Box,
  Building,
  Clock,
  Coins,
  Hammer,
  Heart,
  MapPin,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { callRetryResourceEmbedding } from "@/lib/callables";
import { useOrgStatus } from "./_lib/useOrgStatus";
import type { EmbeddingStatus, ResourceCategory, ResourceStatus } from "@/lib/schemas";

interface ResourceRow {
  id: string;
  category: ResourceCategory;
  title: string;
  quantity: number;
  unit: string;
  valuationINR: number;
  geo: { adminRegion: string; serviceRadiusKm: number };
  status: ResourceStatus;
  embeddingStatus: EmbeddingStatus | undefined;
  createdAt: number;
}

const CATEGORY_META: Record<
  ResourceCategory,
  { icon: React.ReactNode; hue: number; label: string }
> = {
  MATERIAL:        { icon: <Box size={16} />,      hue: 25,  label: "Material" },
  FUNDS:           { icon: <Coins size={16} />,    hue: 142, label: "Funds" },
  MANUFACTURING:   { icon: <Hammer size={16} />,   hue: 200, label: "Manufacturing" },
  VENUE:           { icon: <Building size={16} />, hue: 280, label: "Venue" },
  VEHICLE:         { icon: <Truck size={16} />,    hue: 0,   label: "Vehicle" },
  VOLUNTEER_HOURS: { icon: <Heart size={16} />,    hue: 340, label: "Volunteer hours" },
  SERVICE:         { icon: <Package size={16} />,  hue: 220, label: "Service" },
  SHELTER:         { icon: <Building size={16} />, hue: 35,  label: "Shelter" },
  LOGISTICS:       { icon: <Truck size={16} />,    hue: 195, label: "Logistics" },
  FOOD_KIT:        { icon: <Package size={16} />,  hue: 90,  label: "Food kit" },
};

const STATUS_TONE: Record<ResourceStatus, string> = {
  AVAILABLE: "var(--color-success)",
  RESERVED: "var(--color-warn, #d97706)",
  DEPLETED: "var(--color-muted)",
};

export default function ResourcesPage() {
  const { user, loading: authLoading, claims } = useAuth();
  const orgId = claims?.orgId ?? null;
  const orgStatus = useOrgStatus(orgId);
  const [rows, setRows] = useState<ResourceRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleDelete(r: ResourceRow) {
    if (!confirm(`Delete "${r.title || "this resource"}"? This can't be undone.`)) return;
    setBusyId(r.id);
    try {
      await deleteDoc(doc(db, "resources", r.id));
      toast.success("Resource deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRetryEmbedding(r: ResourceRow) {
    setBusyId(r.id);
    try {
      await callRetryResourceEmbedding({ resourceId: r.id });
      toast.success("Embedding retry queued.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    if (!orgId) return;
    const q = query(
      collection(db, "resources"),
      where("orgId", "==", orgId),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setLoadError(null);
        const out: ResourceRow[] = snap.docs.map((d) => {
          const x = d.data();
          const geo = (x.geo as { adminRegion?: string; serviceRadiusKm?: number }) ?? {};
          return {
            id: d.id,
            category: (x.category as ResourceCategory) ?? "MATERIAL",
            title: String(x.title ?? ""),
            quantity: Number(x.quantity ?? 0),
            unit: String(x.unit ?? ""),
            valuationINR: Number(x.valuationINR ?? 0),
            geo: {
              adminRegion: String(geo.adminRegion ?? "—"),
              serviceRadiusKm: Number(geo.serviceRadiusKm ?? 0),
            },
            status: (x.status as ResourceStatus) ?? "AVAILABLE",
            embeddingStatus: x.embeddingStatus as EmbeddingStatus | undefined,
            createdAt: Number(x.createdAt ?? 0),
          };
        });
        setRows(out);
      },
      (err) => {
        console.error("[resources] snapshot error", err);
        setLoadError(err.message || "Failed to load resources.");
        setRows([]);
      },
    );
    return unsub;
  }, [orgId]);

  if (authLoading || orgStatus.loading) return <p className="muted-text">Loading…</p>;
  if (!user) return <p className="muted-text">Sign in to manage resources.</p>;

  if (!orgId) {
    return (
      <div className="card stack" style={{ maxWidth: 600, margin: "40px auto", textAlign: "center", gap: 12 }}>
        <Package size={32} style={{ color: "var(--color-muted)", margin: "0 auto" }} />
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Finish onboarding first</h2>
        <p className="muted-text">
          You need to register your organization before you can list resources.
        </p>
        <div className="row" style={{ justifyContent: "center" }}>
          <Link href="/onboard" className="btn btn-primary">Start onboarding</Link>
        </div>
      </div>
    );
  }

  const canAdd = orgStatus.status === "ACTIVE";
  const totalUnits = rows?.reduce((sum, r) => sum + r.quantity, 0) ?? 0;
  const distinctCategories = rows ? new Set(rows.map((r) => r.category)).size : 0;

  return (
    <div className="stack" style={{ gap: "24px" }}>
      <Link href="/dashboard" className="process-back">
        <ArrowLeft size={14} /> Back to dashboard
      </Link>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "16px", flexWrap: "wrap" }}>
        <div className="stack" style={{ gap: "4px" }}>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "28px",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <Package size={24} style={{ color: "var(--color-primary)" }} />
            Resource Dashboard
          </h1>
          <p className="muted-text" style={{ fontSize: "13px" }}>
            {rows === null
              ? "Loading…"
              : `${distinctCategories} categor${distinctCategories === 1 ? "y" : "ies"} · ${totalUnits.toLocaleString()} total units listed`}
          </p>
        </div>
        {canAdd ? (
          <Link
            href="/resources/new"
            className="btn btn-primary"
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <Plus size={16} /> Add resource
          </Link>
        ) : (
          <span className="badge badge-normal" title="Wait for platform admin approval">
            {orgStatus.status === "PENDING_REVIEW" ? "Pending review" : orgStatus.status ?? "—"}
          </span>
        )}
      </div>

      {!canAdd && (
        <div
          className="card stack-sm"
          style={{
            borderLeft: "3px solid var(--color-warn, #d97706)",
            background: "var(--color-surface-2)",
          }}
        >
          <strong style={{ fontSize: 14, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <AlertCircle size={14} /> Listing locked until approval
          </strong>
          <p className="muted-text" style={{ fontSize: 13, margin: 0 }}>
            A Platform Admin needs to approve your organization before you can list resources. You can still browse this page.
          </p>
        </div>
      )}

      {loadError ? (
        <div
          className="card stack-sm"
          style={{
            borderLeft: "3px solid var(--color-danger, #dc2626)",
            background: "var(--color-surface-2)",
          }}
        >
          <strong style={{ fontSize: 14, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <AlertCircle size={14} /> Couldn't load resources
          </strong>
          <p className="muted-text" style={{ fontSize: 13, margin: 0 }}>{loadError}</p>
        </div>
      ) : null}

      {rows === null ? (
        <p className="muted-text">Loading your resources…</p>
      ) : rows.length === 0 ? (
        <div
          className="card stack"
          style={{ alignItems: "center", textAlign: "center", padding: 32, gap: 12 }}
        >
          <Package size={28} style={{ color: "var(--color-muted)" }} />
          <strong>No resources yet</strong>
          <p className="muted-text" style={{ fontSize: 13 }}>
            List your first resource so the matching engine can connect you with tickets.
          </p>
          {canAdd && (
            <Link href="/resources/new" className="btn btn-primary">
              List a resource
            </Link>
          )}
        </div>
      ) : (
        <div className="resource-grid">
          {rows.map((r) => {
            const meta = CATEGORY_META[r.category];
            return (
              <div key={r.id} className="resource-card">
                <div className="resource-card-top">
                  <span
                    className="resource-icon"
                    style={{ "--res-hue": meta.hue } as React.CSSProperties}
                  >
                    {meta.icon}
                  </span>
                  <span className="resource-category-label">{meta.label}</span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 11,
                      fontWeight: 600,
                      color: STATUS_TONE[r.status],
                    }}
                  >
                    {r.status}
                  </span>
                </div>
                <div className="resource-card-body">
                  <span className="resource-count num">
                    {r.quantity.toLocaleString()}
                    <span className="resource-unit">{r.unit}</span>
                  </span>
                  <span className="resource-label">{r.title}</span>
                </div>
                {r.valuationINR > 0 && (
                  <p className="resource-note">
                    ≈ ₹{new Intl.NumberFormat("en-IN").format(r.valuationINR)} valuation
                  </p>
                )}
                <div className="resource-meta">
                  <span className="resource-meta-item">
                    <MapPin size={12} /> {r.geo.adminRegion}
                    {r.geo.serviceRadiusKm > 0 && ` · ${r.geo.serviceRadiusKm} km`}
                  </span>
                  <span className="resource-meta-item">
                    <Clock size={12} />{" "}
                    {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}
                  </span>
                  {r.embeddingStatus === "pending" && (
                    <span
                      className="resource-meta-item"
                      style={{ color: "var(--color-warn, #d97706)" }}
                    >
                      Embedding…
                    </span>
                  )}
                  {r.embeddingStatus === "failed" && (
                    <button
                      type="button"
                      onClick={() => handleRetryEmbedding(r)}
                      disabled={busyId === r.id}
                      className="resource-meta-item"
                      style={{
                        color: "var(--color-danger, #dc2626)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                      title="Retry embedding"
                    >
                      <RefreshCw size={12} />
                      {busyId === r.id ? "Retrying…" : "Retry embedding"}
                    </button>
                  )}
                </div>
                <div
                  className="row"
                  style={{
                    gap: 6,
                    marginTop: 8,
                    paddingTop: 8,
                    borderTop: "1px dashed var(--color-border, rgba(0,0,0,0.08))",
                  }}
                >
                  <Link
                    href={`/resources/${r.id}/edit`}
                    className="btn btn-ghost"
                    style={{
                      flex: 1,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      fontSize: 12,
                      padding: "6px 8px",
                    }}
                  >
                    <Pencil size={12} /> Edit
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(r)}
                    disabled={busyId === r.id}
                    className="btn btn-ghost"
                    style={{
                      flex: 1,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      fontSize: 12,
                      padding: "6px 8px",
                      color: "var(--color-danger, #dc2626)",
                    }}
                  >
                    <Trash2 size={12} />
                    {busyId === r.id ? "…" : "Delete"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
