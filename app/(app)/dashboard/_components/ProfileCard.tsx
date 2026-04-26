"use client";

import Link from "next/link";
import type { OrgRecordState } from "@/lib/onboarding/useOrgRecord";
import { docsUploadedKey, requiredDocs } from "@/lib/onboarding/requirements";
import type { DocType } from "@/app/(app)/onboard/_lib/types";

const DOC_LABELS: Record<DocType, string> = {
  PAN: "PAN",
  REG_CERT: "Registration Certificate",
  GST: "GST",
  CIN: "CIN",
  "80G": "80G Certificate",
  "12A": "12A Certificate",
};

function statusLabel(status: string | null): string {
  if (!status) return "Not submitted";
  if (status === "PENDING_REVIEW") return "Pending review";
  if (status === "ACTIVE") return "Active";
  if (status === "REJECTED") return "Rejected";
  if (status === "SUSPENDED") return "Suspended";
  return status;
}

function statusBadgeClass(status: string | null): string {
  if (status === "ACTIVE") return "badge badge-success";
  if (status === "PENDING_REVIEW") return "badge badge-pending";
  if (status === "REJECTED" || status === "SUSPENDED") return "badge badge-emergency";
  return "badge badge-normal";
}

export function ProfileCard({ orgRecord }: { orgRecord: OrgRecordState }) {
  if (orgRecord.loading) {
    return (
      <div className="card profile-card">
        <p className="muted-text">Loading your organization…</p>
      </div>
    );
  }
  if (!orgRecord.exists) return null;

  const { name, type, status, docsUploaded, isComplete } = orgRecord;
  const required = requiredDocs(type);
  const uploadedCount = required.filter((d) => docsUploaded[docsUploadedKey(d)] === true).length;
  const missing = required.filter((d) => docsUploaded[docsUploadedKey(d)] !== true);
  const progressPct = required.length > 0 ? Math.round((uploadedCount / required.length) * 100) : 0;
  const orgName = (name && name.trim()) || "Your organization";
  const editHref = type ? `/onboard/form?type=${type}` : "/onboard";

  return (
    <section className="card profile-card">
      <header className="profile-card__head">
        <div className="profile-card__title-block">
          <h2 className="profile-card__title">{orgName}</h2>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {type && <span className="badge badge-primary">{type}</span>}
            <span className={statusBadgeClass(status)}>{statusLabel(status)}</span>
          </div>
        </div>
      </header>

      {status === "PENDING_REVIEW" && (
        <p className="muted-text" style={{ margin: 0 }}>
          A Platform Admin will approve your documents shortly. Matching and ticket-raising
          unlock once approved.
        </p>
      )}

      <div className="profile-card__progress">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Documents</span>
          <span className="muted-text num">
            {uploadedCount} of {required.length} uploaded
          </span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {missing.length > 0 && (
        <div className="stack-sm">
          <span style={{ fontSize: 13, fontWeight: 600 }}>Still needed</span>
          <ul className="profile-card__missing">
            {missing.map((d) => (
              <li key={d}>
                <span className="profile-card__dot" aria-hidden />
                {DOC_LABELS[d] ?? d}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
        {!isComplete ? (
          <Link href={editHref} className="btn btn-primary">
            Complete profile
          </Link>
        ) : (
          <span className="muted-text">All required documents uploaded ✓</span>
        )}
      </div>
    </section>
  );
}
