"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { OnboardingData, OrgType } from "@/lib/schemas";
import type { DocsByType, DocType, UploadedDoc } from "../_lib/types";
import { clearSession, loadSession, saveSession } from "../_lib/sessionStore";
import { finalizeOrg, OnboardingDataIncompleteError } from "../_lib/finalize";
import { DocPicker } from "./DocPicker";
import { uploadDocPhoto } from "../_lib/uploadDoc";

const Schema = z.object({
  legalName: z.string().min(1, "Required"),
  email: z.string().email(),
  phone: z.string().optional(),
  adminRegion: z.string().min(1, "Required"),
  lat: z.number(),
  lng: z.number(),
});
type FormValues = z.infer<typeof Schema>;

const DOC_LABEL: Record<DocType, string> = {
  PAN: "PAN card",
  "80G": "80G certificate",
  "12A": "12A registration",
  REG_CERT: "Registration / Incorporation Certificate",
  GST: "GST registration",
  CIN: "CIN",
};

function requiredDocs(type: OrgType | undefined): DocType[] {
  if (type === "NGO") return ["PAN", "REG_CERT", "80G", "12A"];
  if (type === "ORG") return ["PAN", "REG_CERT", "GST", "CIN"];
  return ["PAN", "REG_CERT"];
}

export function OnboardingFormPage({ type }: { type: OrgType | undefined }) {
  const { user } = useAuth();
  const router = useRouter();

  const [booted, setBooted] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [partialData, setPartialData] = useState<OnboardingData>({});
  const [docs, setDocs] = useState<DocsByType>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyType, setBusyType] = useState<DocType | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: { legalName: "", email: "", phone: "", adminRegion: "", lat: 0, lng: 0 },
  });

  useEffect(() => {
    const seed: Partial<OnboardingData> = type ? { type } : {};
    const loaded = loadSession(seed);
    setSessionId(loaded.sessionId);
    setPartialData(loaded.partialData);
    setDocs(loaded.docs);
    form.reset({
      legalName: loaded.partialData.legalName ?? "",
      email: loaded.partialData.email ?? "",
      phone: loaded.partialData.phone ?? "",
      adminRegion: loaded.partialData.geo?.adminRegion ?? "",
      lat: typeof loaded.partialData.geo?.lat === "number" ? loaded.partialData.geo.lat : 0,
      lng: typeof loaded.partialData.geo?.lng === "number" ? loaded.partialData.geo.lng : 0,
    });
    setBooted(true);
  }, [type, form]);

  const effectiveType = type ?? partialData.type;
  const neededDocs = requiredDocs(effectiveType);

  async function onSubmit(values: FormValues) {
    if (!user) return toast.error("Sign in first.");
    if (!effectiveType) {
      toast.error("Pick NGO or Organization first.");
      router.replace("/onboard");
      return;
    }
    const anyDoc = neededDocs.some((d) => docs[d]);
    if (!anyDoc) {
      toast.error("Attach at least one document photo to continue.");
      return;
    }

    const data: OnboardingData = {
      type: effectiveType,
      legalName: values.legalName,
      email: values.email,
      phone: values.phone,
      geo: {
        lat: values.lat,
        lng: values.lng,
        adminRegion: values.adminRegion,
        operatingAreas: partialData.geo?.operatingAreas ?? [],
      },
      docsUploaded: neededDocs.reduce<Record<string, boolean>>(
        (acc, d) => ({ ...acc, [d.toLowerCase()]: Boolean(docs[d]) }),
        {},
      ),
    };

    setSaving(true);
    try {
      await finalizeOrg(user.uid, data, docs);
      clearSession();
      toast.success("Organization saved.");
      router.replace("/dashboard");
    } catch (err) {
      console.error("[finalizeOrg] write failed:", err);
      if (err instanceof OnboardingDataIncompleteError) {
        toast.error(`Missing: ${err.missing.join(", ")}`);
        return;
      }
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function handleUploaded(doc: UploadedDoc) {
    const next: DocsByType = { ...docs, [doc.docType]: doc };
    setDocs(next);
    saveSession({ history: [], partialData, sessionId, docs: next });
  }

  async function replaceDoc(docType: DocType, file: File) {
    if (!user) return;
    setBusyType(docType);
    try {
      const d = await uploadDocPhoto(user.uid, docType, file);
      handleUploaded(d);
      toast.success(`${DOC_LABEL[docType]} updated.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusyType(null);
    }
  }

  if (!booted) {
    return <div className="onboarding-shell"><div className="onboarding-container"><p className="muted-text">Loading…</p></div></div>;
  }
  if (!user) {
    return <div className="onboarding-shell"><div className="onboarding-container"><p className="muted-text">Sign in to continue.</p></div></div>;
  }

  return (
    <div className="onboarding-shell">
      <div className="onboarding-container stack">
        <div className="onboarding-header">
          <div>
            <h1 className="onboarding-title">Register your {effectiveType === "NGO" ? "NGO" : effectiveType === "ORG" ? "organization" : "entity"}</h1>
            <p className="muted-text">Fill this out &mdash; your chat progress is prefilled.</p>
          </div>
          <Link href="/onboard/chat" className="btn btn-ghost">Use chat instead</Link>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="stack">
          <div className="card stack">
            <div className="form-row">
              <label className="label">Legal name</label>
              <input className="input" {...form.register("legalName")} />
              {form.formState.errors.legalName && (
                <span className="error-text">{form.formState.errors.legalName.message}</span>
              )}
            </div>
            <div className="form-row">
              <label className="label">Contact email</label>
              <input className="input" type="email" {...form.register("email")} />
              {form.formState.errors.email && (
                <span className="error-text">{form.formState.errors.email.message}</span>
              )}
            </div>
            <div className="form-row">
              <label className="label">Phone (optional)</label>
              <input className="input" {...form.register("phone")} />
            </div>
            <div className="form-row">
              <label className="label">City / state</label>
              <input className="input" placeholder="e.g. Bengaluru, Karnataka" {...form.register("adminRegion")} />
              {form.formState.errors.adminRegion && (
                <span className="error-text">{form.formState.errors.adminRegion.message}</span>
              )}
            </div>
            <div className="row" style={{ gap: 12 }}>
              <div className="form-row" style={{ flex: 1 }}>
                <label className="label">Latitude</label>
                <input className="input" type="number" step="any" {...form.register("lat", { valueAsNumber: true })} />
              </div>
              <div className="form-row" style={{ flex: 1 }}>
                <label className="label">Longitude</label>
                <input className="input" type="number" step="any" {...form.register("lng", { valueAsNumber: true })} />
              </div>
            </div>
          </div>

          <div className="card stack">
            <div>
              <strong>Document photos</strong>
              <div className="muted-text">Capture each document with your camera, or upload from files.</div>
            </div>
            <div className="doc-picker-grid">
              {neededDocs.map((d) => {
                const already = docs[d];
                return (
                  <div key={d} className={already ? "doc-pill is-uploaded" : "doc-pill"} style={{ cursor: "default" }}>
                    <span>{already ? "✓ " : "📷 "}{d}</span>
                    <small>{DOC_LABEL[d]}</small>
                    <label className="btn btn-ghost" style={{ padding: "6px 10px", fontSize: 12, cursor: "pointer", marginTop: 4 }}>
                      {busyType === d ? "Uploading…" : already ? "Replace" : "Take / upload"}
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        capture="environment"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) void replaceDoc(d, f);
                        }}
                      />
                    </label>
                    {already && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={already.fileUrl} alt={d} style={{ width: "100%", borderRadius: 8, marginTop: 8, maxHeight: 120, objectFit: "cover" }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={saving}>
            {saving ? "Saving…" : "Save organization"}
          </button>
        </form>
      </div>

      <DocPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        type={effectiveType}
        uid={user.uid}
        uploaded={docs}
        onUploaded={handleUploaded}
      />
    </div>
  );
}
