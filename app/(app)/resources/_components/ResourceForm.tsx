"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ResourceCategory, ResourceClientWriteSchema } from "@/lib/schemas";
import type { ResourceClientWrite, ResourceClientWriteInput } from "@/lib/schemas";
import { callCreateResource, callUpdateResource } from "@/lib/callables";
import { useOrgStatus } from "../_lib/useOrgStatus";
import { newRequestId } from "../_lib/requestId";

const CATEGORY_OPTIONS = ResourceCategory.options;

const DAY = 86_400_000;

function emptyDefaults(): ResourceClientWriteInput {
  const now = Date.now();
  return {
    category: "MATERIAL",
    title: "",
    quantity: 1,
    unit: "units",
    valuationINR: 0,
    terms: {
      availableFrom: now,
      availableUntil: now + 30 * DAY,
      conditions: "",
    },
    geo: {
      lat: 0,
      lng: 0,
      adminRegion: "",
      operatingAreas: [],
      serviceRadiusKm: 0,
    },
    emergencyContract: {
      enabled: false,
      emergencyCategories: [],
      maxQuantityPerTicket: 0,
      autoNotify: false,
    },
    requestId: newRequestId(),
  };
}

function toDateInput(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function fromDateInput(v: string, fallback: number): number {
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : fallback;
}

type Mode =
  | { kind: "create" }
  | { kind: "edit"; resourceId: string; initial: ResourceClientWriteInput };

export function ResourceForm({ mode }: { mode: Mode }) {
  const { user, loading, claims } = useAuth();
  const router = useRouter();
  const orgStatus = useOrgStatus(claims?.orgId ?? null);
  const [saving, setSaving] = useState(false);
  const defaults = useMemo(
    () => (mode.kind === "edit" ? mode.initial : emptyDefaults()),
    [mode],
  );

  const form = useForm<ResourceClientWriteInput, unknown, ResourceClientWrite>({
    resolver: zodResolver(ResourceClientWriteSchema),
    defaultValues: defaults,
  });

  if (loading || orgStatus.loading) {
    return <p className="muted-text">Loading…</p>;
  }
  if (!user) {
    return <p className="muted-text">Sign in to manage resources.</p>;
  }
  if (!claims?.orgId) {
    return (
      <div className="card stack">
        <h2>Finish onboarding first</h2>
        <p className="muted-text">
          You need an organization profile before you can list resources.
        </p>
        <Link href="/onboard" className="btn btn-primary">Start onboarding</Link>
      </div>
    );
  }
  if (orgStatus.status !== "ACTIVE") {
    return (
      <div className="card stack">
        <h2>Waiting for admin approval</h2>
        <p className="muted-text">
          Your organization is {orgStatus.status === "PENDING_REVIEW" ? "under review" : orgStatus.status?.toLowerCase() ?? "not active yet"}.
          Once a Platform Admin approves your documents, you&apos;ll be able to list resources here.
        </p>
        <Link href="/dashboard" className="btn btn-ghost">Back to dashboard</Link>
      </div>
    );
  }

  async function onSubmit(values: ResourceClientWrite) {
    setSaving(true);
    try {
      if (mode.kind === "create") {
        const payload: ResourceClientWrite = { ...values, requestId: newRequestId() };
        const { resourceId } = await callCreateResource(payload);
        toast.success("Resource listed. Embedding is processing in the background.");
        router.replace(`/resources?new=${resourceId}`);
      } else {
        await callUpdateResource({ ...values, resourceId: mode.resourceId });
        toast.success("Resource updated. Re-running embedding…");
        router.replace("/resources");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "save failed";
      toast.error(`Couldn't save resource: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  const submitLabel = mode.kind === "create"
    ? (saving ? "Listing…" : "List resource")
    : (saving ? "Saving…" : "Save changes");

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="stack">
      <div className="card stack">
        <div className="form-row">
          <label className="label">Category</label>
          <select className="input" {...form.register("category")}>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label className="label">Title</label>
          <input className="input" placeholder="e.g. 500 classroom tables" {...form.register("title")} />
          {form.formState.errors.title && (
            <span className="error-text">{form.formState.errors.title.message}</span>
          )}
        </div>

        <div className="row" style={{ gap: 12 }}>
          <div className="form-row" style={{ flex: 1 }}>
            <label className="label">Quantity</label>
            <input
              className="input"
              type="number"
              step="any"
              {...form.register("quantity", { valueAsNumber: true })}
            />
          </div>
          <div className="form-row" style={{ flex: 1 }}>
            <label className="label">Unit</label>
            <input className="input" placeholder="units / kg / hours" {...form.register("unit")} />
          </div>
          <div className="form-row" style={{ flex: 1 }}>
            <label className="label">Valuation (INR)</label>
            <input
              className="input"
              type="number"
              step="any"
              {...form.register("valuationINR", { valueAsNumber: true })}
            />
          </div>
        </div>

        <div className="row" style={{ gap: 12 }}>
          <div className="form-row" style={{ flex: 1 }}>
            <label className="label">Available from</label>
            <input
              className="input"
              type="date"
              defaultValue={toDateInput(defaults.terms.availableFrom)}
              onChange={(e) =>
                form.setValue(
                  "terms.availableFrom",
                  fromDateInput(e.target.value, defaults.terms.availableFrom),
                )
              }
            />
          </div>
          <div className="form-row" style={{ flex: 1 }}>
            <label className="label">Available until</label>
            <input
              className="input"
              type="date"
              defaultValue={toDateInput(defaults.terms.availableUntil)}
              onChange={(e) =>
                form.setValue(
                  "terms.availableUntil",
                  fromDateInput(e.target.value, defaults.terms.availableUntil),
                )
              }
            />
          </div>
        </div>

        <div className="form-row">
          <label className="label">Conditions (optional)</label>
          <textarea
            className="input"
            rows={3}
            placeholder="Pickup, lead time, delivery terms, restrictions…"
            {...form.register("terms.conditions")}
          />
        </div>
      </div>

      <div className="card stack">
        <strong>Service region</strong>
        <div className="form-row">
          <label className="label">City / state</label>
          <input
            className="input"
            placeholder="e.g. Bengaluru, Karnataka"
            {...form.register("geo.adminRegion")}
          />
          {form.formState.errors.geo?.adminRegion && (
            <span className="error-text">{form.formState.errors.geo.adminRegion.message}</span>
          )}
        </div>
        <div className="row" style={{ gap: 12 }}>
          <div className="form-row" style={{ flex: 1 }}>
            <label className="label">Latitude</label>
            <input
              className="input"
              type="number"
              step="any"
              {...form.register("geo.lat", { valueAsNumber: true })}
            />
          </div>
          <div className="form-row" style={{ flex: 1 }}>
            <label className="label">Longitude</label>
            <input
              className="input"
              type="number"
              step="any"
              {...form.register("geo.lng", { valueAsNumber: true })}
            />
          </div>
          <div className="form-row" style={{ flex: 1 }}>
            <label className="label">Service radius (km)</label>
            <input
              className="input"
              type="number"
              step="any"
              {...form.register("geo.serviceRadiusKm", { valueAsNumber: true })}
            />
          </div>
        </div>
      </div>

      <div className="card stack">
        <strong>Emergency opt-in</strong>
        <label className="row" style={{ gap: 8, alignItems: "center" }}>
          <input type="checkbox" {...form.register("emergencyContract.enabled")} />
          <span>Accept emergency / rapid-mode requests for this resource</span>
        </label>
        <div className="row" style={{ gap: 12 }}>
          <div className="form-row" style={{ flex: 1 }}>
            <label className="label">Max quantity per emergency ticket</label>
            <input
              className="input"
              type="number"
              step="1"
              {...form.register("emergencyContract.maxQuantityPerTicket", { valueAsNumber: true })}
            />
          </div>
          <label className="row" style={{ gap: 8, alignItems: "center", flex: 1 }}>
            <input type="checkbox" {...form.register("emergencyContract.autoNotify")} />
            <span>Auto-notify via push</span>
          </label>
        </div>
      </div>

      <button type="submit" className="btn btn-primary btn-full" disabled={saving}>
        {submitLabel}
      </button>
    </form>
  );
}
