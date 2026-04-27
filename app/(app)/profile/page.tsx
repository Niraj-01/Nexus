"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import {
  Award,
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  LogOut,
  Mail,
  MapPin,
  Phone,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useUserProfile } from "@/lib/auth/useUserProfile";
import { signOutUser } from "@/lib/auth/actions";

interface ReliabilityStat {
  score: number;
  lastDecayAt: number | null;
}

interface BadgeRef {
  ticketId: string;
  closedAt: number;
  contributionSummary: string;
}

interface GovtDoc {
  docType: "PAN" | "80G" | "12A" | "REG_CERT" | "GST" | "CIN";
  fileUrl: string;
  verifiedAt: number | null;
  verifiedBy: string | null;
}

interface OrgDoc {
  name: string;
  type: "NGO" | "ORG";
  status: "PENDING_REVIEW" | "ACTIVE" | "SUSPENDED";
  geo: { adminRegion: string; lat: number; lng: number };
  contact: { email: string; phone?: string };
  govtDocs?: GovtDoc[];
  reliability?: {
    agreement: ReliabilityStat;
    execution: ReliabilityStat;
    closure: ReliabilityStat;
  };
  badges?: BadgeRef[];
  createdAt: number;
}

const DOC_LABEL: Record<GovtDoc["docType"], string> = {
  PAN: "PAN card",
  "80G": "80G certificate",
  "12A": "12A certificate",
  REG_CERT: "Registration certificate",
  GST: "GST certificate",
  CIN: "Company Identification Number",
};

export default function ProfilePage() {
  const router = useRouter();
  const { user, claims, loading: authLoading } = useAuth();
  const profile = useUserProfile(user?.uid ?? null);
  const orgId =
    claims?.orgId ?? (profile.loading ? null : profile.orgId) ?? null;

  const [org, setOrg] = useState<OrgDoc | null | undefined>(undefined);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!orgId) {
      setOrg(null);
      return;
    }
    const unsub = onSnapshot(
      doc(db, "organizations", orgId),
      (snap) => setOrg(snap.exists() ? (snap.data() as OrgDoc) : null),
      () => setOrg(null),
    );
    return unsub;
  }, [orgId]);

  async function onSignOut() {
    setSigningOut(true);
    try {
      await signOutUser();
      router.push("/login");
    } finally {
      setSigningOut(false);
    }
  }

  if (authLoading || profile.loading) return <p className="muted-text">Loading…</p>;
  if (!user) return null;

  if (!orgId) {
    return (
      <div className="stack" style={{ maxWidth: 600, margin: "40px auto", gap: 16 }}>
        <div className="card stack" style={{ textAlign: "center", gap: 12 }}>
          <Building2 size={32} style={{ color: "var(--color-muted)", margin: "0 auto" }} />
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>Finish onboarding first</h2>
          <p className="muted-text">
            Register your organization to see your profile, reliability, and badges.
          </p>
          <div className="row" style={{ justifyContent: "center" }}>
            <Link href="/onboard" className="btn btn-primary">Start onboarding</Link>
          </div>
        </div>
        <AccountFooter user={user} claims={claims} signingOut={signingOut} onSignOut={onSignOut} />
      </div>
    );
  }

  if (org === undefined) return <p className="muted-text">Loading organization…</p>;
  if (org === null) {
    return (
      <div className="stack" style={{ maxWidth: 600, margin: "40px auto", gap: 16 }}>
        <div className="card stack" style={{ textAlign: "center" }}>
          <strong>Organization not found</strong>
          <p className="muted-text">Try signing out and back in.</p>
        </div>
        <AccountFooter user={user} claims={claims} signingOut={signingOut} onSignOut={onSignOut} />
      </div>
    );
  }

  const verified = org.status === "ACTIVE";
  const reliability = org.reliability ?? null;
  const badges = org.badges ?? [];
  const govtDocs = org.govtDocs ?? [];

  return (
    <div className="stack" style={{ gap: "32px" }}>
      {/* ── Org header card ── */}
      <div className="card stack" style={{ gap: "24px" }}>
        <div className="profile-header">
          <div
            className="chat-avatar"
            style={{
              width: "80px",
              height: "80px",
              fontSize: "32px",
              background: "var(--color-surface-2)",
              color: "var(--color-primary)",
              border: "1px solid var(--color-border)",
            }}
          >
            <Building2 size={40} />
          </div>

          <div className="stack-sm" style={{ flex: 1, gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "28px",
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                }}
              >
                {org.name}
              </h1>
              {verified ? (
                <span
                  className="badge badge-success"
                  style={{ padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 4 }}
                >
                  <ShieldCheck size={14} /> Platform Verified
                </span>
              ) : (
                <span
                  className="badge badge-normal"
                  style={{ padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 4 }}
                >
                  <ShieldAlert size={14} /> {org.status === "PENDING_REVIEW" ? "Pending review" : org.status}
                </span>
              )}
            </div>

            <div className="row muted-text" style={{ flexWrap: "wrap", gap: "16px" }}>
              <span className="row" style={{ gap: 6 }}>
                <Building2 size={16} /> {org.type}
              </span>
              <span className="row" style={{ gap: 6 }}>
                <MapPin size={16} /> {org.geo?.adminRegion ?? "—"}
              </span>
              <span className="row" style={{ gap: 6 }}>
                <Mail size={16} /> {org.contact?.email ?? "—"}
              </span>
              {org.contact?.phone && (
                <span className="row" style={{ gap: 6 }}>
                  <Phone size={16} /> {org.contact.phone}
                </span>
              )}
              <span className="row" style={{ gap: 6 }}>
                <Clock size={16} /> Joined {new Date(org.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        {!verified && (
          <div
            className="stack-sm"
            style={{
              padding: 16,
              borderRadius: 8,
              background: "var(--color-surface-2)",
              borderLeft: "3px solid var(--color-warn, #d97706)",
            }}
          >
            <strong style={{ fontSize: 14 }}>Awaiting platform admin approval</strong>
            <p className="muted-text" style={{ fontSize: 13, margin: 0 }}>
              You can finish browsing the platform, but you cannot list resources, raise tickets, or pledge until a Platform Admin approves your documents. Once approved you must sign out and back in to refresh your token.
            </p>
          </div>
        )}
      </div>

      {/* ── Reliability + Badges ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "24px",
        }}
      >
        <div className="card stack" style={{ gap: "20px" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ fontSize: "18px", fontWeight: 700 }}>Reliability Score</h2>
          </div>

          {reliability ? (
            <div className="reliability-gauges">
              <ReliabilityGauge label="Agreement" stat={reliability.agreement} tone="primary" />
              <ReliabilityGauge label="Execution" stat={reliability.execution} tone="primary" />
              <ReliabilityGauge label="Closure" stat={reliability.closure} tone="success" />
            </div>
          ) : (
            <p className="muted-text" style={{ fontSize: 13 }}>
              Reliability scores will be initialized when an admin approves your org.
            </p>
          )}

          <p className="muted-text" style={{ fontSize: "13px" }}>
            Scores update automatically as you sign agreements, complete executions, and close tickets. Reliability decays over time without activity.
          </p>
        </div>

        <div className="card stack" style={{ gap: "20px" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2
              style={{
                fontSize: "18px",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Award size={18} style={{ color: "var(--color-primary)" }} /> Badges
              <span className="num muted-text" style={{ fontSize: 14, fontWeight: 500 }}>
                · {badges.length}
              </span>
            </h2>
          </div>

          {badges.length === 0 ? (
            <p className="muted-text" style={{ fontSize: 13 }}>
              No badges yet. Each closed ticket you participate in mints one verifiable badge.
            </p>
          ) : (
            <div className="stack-sm">
              {badges
                .slice()
                .sort((a, b) => b.closedAt - a.closedAt)
                .slice(0, 6)
                .map((b) => (
                  <Link
                    key={b.ticketId}
                    href={`/tickets/${b.ticketId}`}
                    className="row"
                    style={{
                      gap: 10,
                      padding: 10,
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <Award size={18} style={{ color: "var(--color-primary)", flexShrink: 0 }} />
                    <div className="stack-sm" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>
                        {b.contributionSummary}
                      </span>
                      <span className="muted-text" style={{ fontSize: 12 }}>
                        Closed {new Date(b.closedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </Link>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Verification Documents ── */}
      <div className="card stack" style={{ gap: "20px" }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 700 }}>Verification Documents</h2>
        </div>

        {govtDocs.length === 0 ? (
          <p className="muted-text" style={{ fontSize: 13 }}>
            No documents on file.
          </p>
        ) : (
          <div className="stack-sm">
            {govtDocs.map((d, i) => (
              <div
                key={`${d.docType}-${i}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                <div className="row" style={{ gap: 12 }}>
                  <div
                    style={{
                      padding: "8px",
                      background: "var(--color-surface-2)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--color-text-2)",
                    }}
                  >
                    <FileText size={20} />
                  </div>
                  <div className="stack-sm" style={{ gap: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{DOC_LABEL[d.docType]}</span>
                    <div className="row muted-text" style={{ fontSize: 12, gap: 4 }}>
                      {d.verifiedAt ? (
                        <>
                          <CheckCircle2 size={12} color="var(--color-success)" /> Verified{" "}
                          {new Date(d.verifiedAt).toLocaleDateString()}
                        </>
                      ) : (
                        <>
                          <Clock size={12} /> Awaiting verification
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {d.fileUrl && (
                  <a
                    href={d.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-ghost"
                    style={{ fontSize: 13 }}
                  >
                    View
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <AccountFooter user={user} claims={claims} signingOut={signingOut} onSignOut={onSignOut} />
    </div>
  );
}

function ReliabilityGauge({
  label,
  stat,
  tone,
}: {
  label: string;
  stat: ReliabilityStat;
  tone: "primary" | "success";
}) {
  const score = Math.max(0, Math.min(100, Math.round(stat.score)));
  const color = tone === "success" ? "var(--color-success)" : "var(--color-primary)";
  return (
    <div className="gauge">
      <span className="stat-label">{label}</span>
      <span className="stat-value num">{score}%</span>
      <div className="progress-bar" style={{ width: "100%", height: "4px", marginTop: "4px" }}>
        <div className="progress-fill" style={{ width: `${score}%`, background: color }} />
      </div>
    </div>
  );
}

function AccountFooter({
  user,
  claims,
  signingOut,
  onSignOut,
}: {
  user: { displayName: string | null; email: string | null; uid: string };
  claims: { role?: string; orgId?: string } | null;
  signingOut: boolean;
  onSignOut: () => void;
}) {
  return (
    <div className="card stack-sm">
      <h2 style={{ fontSize: 16, fontWeight: 700 }}>Account</h2>
      <div className="stack-sm">
        <Field label="Name" value={user.displayName ?? "—"} />
        <Field label="Email" value={user.email ?? "—"} />
        <Field label="Role" value={claims?.role ?? "—"} mono />
        <Field label="UID" value={user.uid} mono />
      </div>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onSignOut}
          disabled={signingOut}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <LogOut size={14} /> {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
      <span className="muted-text" style={{ fontSize: 13 }}>{label}</span>
      <span
        style={{
          fontSize: 13,
          fontFamily: mono ? "var(--font-mono, monospace)" : undefined,
          wordBreak: "break-all",
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
  );
}
