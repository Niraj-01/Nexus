"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { RaiseTicketInputSchema, type RaiseTicketInput } from "@/lib/schemas";
import { callRaiseTicket } from "@/lib/callables";
import { authErrorToMessage } from "@/lib/auth/errors";

const CATEGORIES = [
  "MATERIAL",
  "FUNDS",
  "MANUFACTURING",
  "VENUE",
  "VEHICLE",
  "VOLUNTEER_HOURS",
  "SERVICE",
  "SHELTER",
  "LOGISTICS",
  "FOOD_KIT",
] as const;

function randomRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function NewTicketPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // A single requestId lives for the lifetime of this page — if the user hits
  // submit twice (double-click, retry after a transient error), the callable
  // deduplicates via the idempotency helper. Per plan §A.8 #5.
  const requestId = useMemo(randomRequestId, []);

  const defaultDeadline = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  }, []);

  const form = useForm<RaiseTicketInput>({
    resolver: zodResolver(RaiseTicketInputSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "EDUCATION",
      urgency: "NORMAL",
      needs: [
        {
          resourceCategory: "MATERIAL",
          quantity: 1,
          unit: "units",
          valuationINR: 0,
          hostSelfPledge: { quantity: 0, valuationINR: 0, pctOfNeed: 0 },
        },
      ],
      geo: { lat: 0, lng: 0, adminRegion: "", operatingAreas: [] as string[] },
      deadline: new Date(defaultDeadline).getTime(),
      requestId,
    },
  });

  const needs = useFieldArray({ control: form.control, name: "needs" });

  async function onSubmit(values: RaiseTicketInput) {
    setBusy(true);
    try {
      const res = await callRaiseTicket(values);
      toast.success(res.rapid ? "Emergency ticket broadcast" : "Ticket raised");
      router.push(`/tickets/${res.ticketId}`);
    } catch (err) {
      toast.error(authErrorToMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function onInvalid() {
    toast.error("Please fix the highlighted fields before submitting.");
  }

  const urgency = form.watch("urgency");

  return (
    <div className="stack" style={{ maxWidth: 720, margin: "0 auto" }}>
      <header className="stack-sm">
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 700 }}>
          Raise a ticket
        </h1>
        <p className="muted-text">
          Tell Nexus what you need. We&apos;ll match you to verified contributors.
        </p>
      </header>

      <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="stack">
        <div className="card stack">
          <div className="form-row">
            <label htmlFor="title" className="label">Title</label>
            <input id="title" className="input" {...form.register("title")} />
            {form.formState.errors.title && (
              <span className="error-text">{form.formState.errors.title.message}</span>
            )}
          </div>

          <div className="form-row">
            <label htmlFor="description" className="label">What do you need, and why?</label>
            <textarea id="description" className="textarea"
                      {...form.register("description")} />
            {form.formState.errors.description && (
              <span className="error-text">{form.formState.errors.description.message}</span>
            )}
          </div>

          <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
            <div className="form-row" style={{ flex: 1, minWidth: 200 }}>
              <label htmlFor="category" className="label">Category</label>
              <input id="category" className="input" placeholder="e.g. EDUCATION, HEALTH, DISASTER"
                     {...form.register("category")} />
            </div>
            <div className="form-row" style={{ flex: 1, minWidth: 200 }}>
              <label htmlFor="urgency" className="label">Urgency</label>
              <select id="urgency" className="select" {...form.register("urgency")}>
                <option value="NORMAL">Normal — agreement-first</option>
                <option value="EMERGENCY">Emergency — broadcast + instant pledges</option>
              </select>
            </div>
          </div>

          {urgency === "EMERGENCY" && (
            <p className="badge badge-emergency" style={{ alignSelf: "flex-start" }}>
              Broadcast mode: all eligible orgs will be notified. You can&apos;t switch back.
            </p>
          )}
        </div>

        <div className="card stack">
          <header className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ fontSize: 18, fontWeight: 600 }}>Needs</h2>
            <button type="button" className="btn btn-ghost"
                    onClick={() => needs.append({
                      resourceCategory: "MATERIAL",
                      quantity: 1,
                      unit: "units",
                      valuationINR: 0,
                      hostSelfPledge: { quantity: 0, valuationINR: 0, pctOfNeed: 0 },
                    })}>
              + Add need
            </button>
          </header>

          {needs.fields.map((field, i) => (
            <div key={field.id} className="stack-sm"
                 style={{ padding: 16, background: "var(--color-surface-2)", borderRadius: "var(--radius-md)" }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>Need #{i + 1}</strong>
                {needs.fields.length > 1 && (
                  <button type="button" className="muted-text"
                          style={{ background: "none", border: "none", cursor: "pointer" }}
                          onClick={() => needs.remove(i)}>Remove</button>
                )}
              </div>

              <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
                <div className="form-row" style={{ flex: 1, minWidth: 180 }}>
                  <label className="label">Resource</label>
                  <Controller
                    control={form.control}
                    name={`needs.${i}.resourceCategory`}
                    render={({ field: f }) => (
                      <select className="select" {...f}>
                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    )}
                  />
                </div>
                <div className="form-row" style={{ flex: 1, minWidth: 120 }}>
                  <label className="label">Quantity</label>
                  <input type="number" className="input" step="any"
                         {...form.register(`needs.${i}.quantity`, { valueAsNumber: true })} />
                </div>
                <div className="form-row" style={{ flex: 1, minWidth: 120 }}>
                  <label className="label">Unit</label>
                  <input className="input" {...form.register(`needs.${i}.unit`)} />
                </div>
                <div className="form-row" style={{ flex: 1, minWidth: 140 }}>
                  <label className="label">Valuation (INR)</label>
                  <input type="number" className="input" step="any"
                         {...form.register(`needs.${i}.valuationINR`, { valueAsNumber: true })} />
                </div>
              </div>

              <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
                <div className="form-row" style={{ flex: 1, minWidth: 140 }}>
                  <label className="label">You pledge (qty)</label>
                  <input type="number" className="input" step="any"
                         {...form.register(`needs.${i}.hostSelfPledge.quantity`, { valueAsNumber: true })} />
                </div>
                <div className="form-row" style={{ flex: 1, minWidth: 140 }}>
                  <label className="label">You pledge (INR)</label>
                  <input type="number" className="input" step="any"
                         {...form.register(`needs.${i}.hostSelfPledge.valuationINR`, { valueAsNumber: true })} />
                </div>
                <div className="form-row" style={{ flex: 1, minWidth: 140 }}>
                  <label className="label">% of need covered by host</label>
                  <input type="number" className="input" step="any" min={0} max={100}
                         {...form.register(`needs.${i}.hostSelfPledge.pctOfNeed`, { valueAsNumber: true })} />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="card stack">
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Location & deadline</h2>
          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            <div className="form-row" style={{ flex: 1, minWidth: 200 }}>
              <label className="label">Admin region (city/state)</label>
              <input className="input" placeholder="e.g. Dharwad, KA"
                     {...form.register("geo.adminRegion")} />
              {form.formState.errors.geo?.adminRegion && (
                <span className="error-text">{form.formState.errors.geo.adminRegion.message}</span>
              )}
            </div>
            <div className="form-row" style={{ flex: 1, minWidth: 120 }}>
              <label className="label">Latitude</label>
              <input type="number" className="input" step="any" min={-90} max={90}
                     placeholder="-90 to 90"
                     {...form.register("geo.lat", { valueAsNumber: true })} />
              {form.formState.errors.geo?.lat && (
                <span className="error-text">
                  {form.formState.errors.geo.lat.message ?? "Latitude must be between -90 and 90."}
                </span>
              )}
            </div>
            <div className="form-row" style={{ flex: 1, minWidth: 120 }}>
              <label className="label">Longitude</label>
              <input type="number" className="input" step="any" min={-180} max={180}
                     placeholder="-180 to 180"
                     {...form.register("geo.lng", { valueAsNumber: true })} />
              {form.formState.errors.geo?.lng && (
                <span className="error-text">
                  {form.formState.errors.geo.lng.message ?? "Longitude must be between -180 and 180."}
                </span>
              )}
            </div>
          </div>

          <div className="form-row">
            <label className="label">Deadline</label>
            <Controller
              control={form.control}
              name="deadline"
              render={({ field }) => (
                <input
                  type="date"
                  className="input"
                  value={field.value ? new Date(field.value).toISOString().slice(0, 10) : ""}
                  onChange={(e) => field.onChange(new Date(e.target.value).getTime())}
                />
              )}
            />
            {form.formState.errors.deadline && (
              <span className="error-text">{form.formState.errors.deadline.message}</span>
            )}
          </div>
        </div>

        <button type="submit" className="btn btn-primary btn-full" disabled={busy}>
          {busy ? "Submitting…" : urgency === "EMERGENCY" ? "Broadcast emergency" : "Raise ticket"}
        </button>
      </form>
    </div>
  );
}
