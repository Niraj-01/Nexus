"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { callApproveOrg } from "@/lib/callables";

interface PendingOrg {
  id: string;
  name: string;
  type: "NGO" | "ORG" | string;
  contactEmail: string | null;
  region: string | null;
  createdAt: number | null;
}

/**
 * Platform admin dashboard. Lists organizations with status=PENDING_REVIEW
 * and exposes an Approve button that calls the existing `approveOrg`
 * callable (flips status to ACTIVE + sets {role, orgId} claims on every
 * user in the org). Replaces the manual Firestore-Console flow from
 * DRY_RUN §A.2.
 */
export default function AdminOrganizationsPage() {
  const { user, loading, claims } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<PendingOrg[] | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [errorByOrg, setErrorByOrg] = useState<Record<string, string>>({});

  const isAdmin = claims?.role === "PLATFORM_ADMIN";

  useEffect(() => {
    if (loading) return;
    if (!user) return; // outer (app) layout will redirect to /login
    if (!isAdmin) router.replace("/dashboard");
  }, [loading, user, isAdmin, router]);

  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, "organizations"), where("status", "==", "PENDING_REVIEW"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const out: PendingOrg[] = snap.docs.map((d) => {
          const x = d.data();
          const createdAtRaw = x.createdAt;
          const createdAt =
            typeof createdAtRaw === "number"
              ? createdAtRaw
              : createdAtRaw && typeof createdAtRaw.toMillis === "function"
                ? createdAtRaw.toMillis()
                : null;
          return {
            id: d.id,
            name: String(x.name ?? "(unnamed)"),
            type: String(x.type ?? "ORG"),
            contactEmail: x.contact?.email ?? x.contactEmail ?? null,
            region: x.geo?.region ?? x.region ?? null,
            createdAt,
          };
        });
        out.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        setRows(out);
      },
      (err) => {
        console.error("[admin/organizations] snapshot error", err);
        setRows([]);
      },
    );
    return unsub;
  }, [isAdmin]);

  if (loading || !isAdmin) {
    return <p className="muted-text" style={{ textAlign: "center", marginTop: 64 }}>Loading…</p>;
  }

  async function approve(orgId: string) {
    setActingId(orgId);
    setErrorByOrg((m) => {
      const next = { ...m };
      delete next[orgId];
      return next;
    });
    try {
      await callApproveOrg({ orgId, requestId: crypto.randomUUID() });
      // onSnapshot will drop the row from the list automatically.
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Approve failed";
      setErrorByOrg((m) => ({ ...m, [orgId]: msg }));
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 960, margin: "0 auto" }}>
      <header className="stack-sm">
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          Pending organizations
        </h1>
        <p className="muted-text">
          Approve to activate the org and grant {"{role, orgId}"} claims to its members.
          Approved users must sign out and back in to refresh their token.
        </p>
      </header>

      {rows === null && <p className="muted-text">Loading pending organizations…</p>}

      {rows !== null && rows.length === 0 && (
        <div className="card stack-sm" style={{ textAlign: "center", padding: 24 }}>
          <strong>No pending organizations</strong>
          <p className="muted-text" style={{ fontSize: 13 }}>
            New onboarding submissions appear here automatically.
          </p>
        </div>
      )}

      {rows !== null && rows.length > 0 && (
        <div className="stack-sm">
          {rows.map((row) => (
            <div key={row.id} className="card stack-sm">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div className="stack-sm" style={{ minWidth: 0, flex: 1 }}>
                  <div className="row" style={{ gap: 6, alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: "var(--color-muted-bg, #e5e7eb)",
                        color: "var(--color-fg, #111827)",
                      }}
                    >
                      {row.type}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-warn, #d97706)" }}>
                      PENDING_REVIEW
                    </span>
                  </div>
                  <h3 style={{ fontWeight: 600, fontSize: 17, margin: 0 }}>{row.name}</h3>
                  <span className="muted-text" style={{ fontSize: 12 }}>
                    {row.contactEmail ?? "—"}
                    {row.region ? ` · ${row.region}` : ""}
                    {row.createdAt ? ` · ${new Date(row.createdAt).toLocaleDateString()}` : ""}
                  </span>
                  <span className="muted-text" style={{ fontSize: 11 }}>
                    orgId: {row.id}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={actingId === row.id}
                  onClick={() => approve(row.id)}
                >
                  {actingId === row.id ? "Approving…" : "Approve"}
                </button>
              </div>
              {errorByOrg[row.id] && (
                <p style={{ fontSize: 12, color: "var(--color-danger, #dc2626)", margin: 0 }}>
                  {errorByOrg[row.id]}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
