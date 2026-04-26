"use client";

import { useCallback, useEffect, useState } from "react";
import { signInWithPopup, signOut } from "firebase/auth";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { auth, db, googleProvider } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthProvider";

const ADMIN_EMAIL = "dhrupadrajpurohit@gmail.com";

interface PendingOrg {
  id: string;
  name: string;
  type: string;
  contactEmail: string | null;
  region: string | null;
  createdAt: number | null;
}

/**
 * Standalone platform-admin page. Lives outside the (app) route group.
 *
 * Flow:
 *   1. User signs in with Google (popup, on this page).
 *   2. If their email matches ADMIN_EMAIL, the page POSTs to
 *      /api/admin/bootstrap which grants the PLATFORM_ADMIN claim
 *      server-side (idempotent).
 *   3. Client force-refreshes the ID token; AuthProvider's
 *      onIdTokenChanged listener picks up the new claim into context.
 *   4. With the claim live, a Firestore onSnapshot subscribes to
 *      PENDING_REVIEW orgs — list updates in real time as new
 *      onboarding submissions land.
 *   5. Approve button POSTs to /api/admin/approve which sets
 *      status=ACTIVE and grants {role, orgId} claims to the org owner.
 */
export default function AdminPage() {
  const { user, loading, claims } = useAuth();
  const [orgs, setOrgs] = useState<PendingOrg[] | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);

  const isAdminEmail = user?.email?.toLowerCase() === ADMIN_EMAIL;
  const isPlatformAdmin = claims?.role === "PLATFORM_ADMIN";

  // Step 2 + 3: bootstrap claim + force token refresh after sign-in.
  // Idempotent on the server side, so safe to re-run on every render
  // where the email matches but the claim isn't in the token yet.
  useEffect(() => {
    if (!user || !isAdminEmail) return;
    if (isPlatformAdmin) return; // already in token, skip
    let cancelled = false;
    setBootstrapping(true);
    (async () => {
      try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/admin/bootstrap", {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (cancelled) return;
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        await user.getIdToken(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Bootstrap failed");
        }
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isAdminEmail, isPlatformAdmin]);

  // Step 4: live subscription to PENDING_REVIEW orgs. Only runs once the
  // claim is live in the token, otherwise Firestore rules reject the read.
  useEffect(() => {
    if (!isPlatformAdmin) return;
    const q = query(
      collection(db, "organizations"),
      where("status", "==", "PENDING_REVIEW"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const out: PendingOrg[] = snap.docs.map((doc) => {
          const data = doc.data() as Record<string, unknown>;
          const contact = data.contact as { email?: string } | undefined;
          const geo = data.geo as { adminRegion?: string } | undefined;
          const createdAtRaw = data.createdAt as unknown;
          return {
            id: doc.id,
            name: String(data.name ?? "(unnamed)"),
            type: String(data.type ?? "ORG"),
            contactEmail: contact?.email ?? null,
            region: geo?.adminRegion ?? null,
            createdAt: typeof createdAtRaw === "number" ? createdAtRaw : null,
          };
        });
        out.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        setOrgs(out);
      },
      (err) => {
        console.error("[/admin] snapshot error", err);
        setError(err instanceof Error ? err.message : "Failed to load orgs");
        setOrgs([]);
      },
    );
    return unsub;
  }, [isPlatformAdmin]);

  const approve = useCallback(
    async (orgId: string) => {
      if (!user) return;
      setActing(orgId);
      setError(null);
      try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/admin/approve", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ orgId }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        // Live snapshot will drop the row automatically once status flips.
      } catch (err) {
        setError(err instanceof Error ? err.message : "Approve failed");
      } finally {
        setActing(null);
      }
    },
    [user],
  );

  async function onSignIn() {
    setSigningIn(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setSigningIn(false);
    }
  }

  async function onSignOut() {
    await signOut(auth);
    setOrgs(null);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="card stack" style={{ maxWidth: 720, width: "100%" }}>
        <header className="stack-sm">
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" }}>
            Platform admin
          </h1>
          <p className="muted-text" style={{ fontSize: 13 }}>
            Restricted to <code>{ADMIN_EMAIL}</code>. Approving an org sets its status to ACTIVE
            and grants the owner their <code>{"{role, orgId}"}</code> claims live — no sign-out needed on their end.
          </p>
        </header>

        {loading && <p className="muted-text">Loading…</p>}

        {!loading && !user && (
          <div className="stack-sm">
            <p className="muted-text">Sign in with Google to continue.</p>
            <button
              type="button"
              className="btn btn-primary btn-full"
              onClick={onSignIn}
              disabled={signingIn}
            >
              {signingIn ? "Opening…" : "Sign in with Google"}
            </button>
          </div>
        )}

        {!loading && user && !isAdminEmail && (
          <div className="stack-sm">
            <strong style={{ color: "var(--color-danger, #dc2626)" }}>Access denied</strong>
            <p className="muted-text" style={{ fontSize: 13 }}>
              You&apos;re signed in as <code>{user.email}</code>. This page is restricted to{" "}
              <code>{ADMIN_EMAIL}</code>.
            </p>
            <button type="button" className="btn btn-ghost" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        )}

        {!loading && user && isAdminEmail && (
          <>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
              <span className="muted-text">
                Signed in as <strong>{user.email}</strong>
                {bootstrapping && " · setting up admin claim…"}
                {!bootstrapping && isPlatformAdmin && " · live"}
              </span>
              <button type="button" className="btn btn-ghost" onClick={onSignOut}>
                Sign out
              </button>
            </div>

            {error && (
              <div
                className="card"
                style={{
                  borderColor: "var(--color-danger, #dc2626)",
                  background: "rgba(220, 38, 38, 0.08)",
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}

            {!isPlatformAdmin && !error && <p className="muted-text">Granting admin claim…</p>}

            {isPlatformAdmin && orgs === null && <p className="muted-text">Loading pending organizations…</p>}

            {isPlatformAdmin && orgs !== null && orgs.length === 0 && (
              <div className="card stack-sm" style={{ textAlign: "center" }}>
                <strong>No pending organizations</strong>
                <p className="muted-text" style={{ fontSize: 13 }}>
                  New onboarding submissions appear here automatically.
                </p>
              </div>
            )}

            {isPlatformAdmin && orgs !== null && orgs.length > 0 && (
              <div className="stack-sm">
                {orgs.map((org) => (
                  <div key={org.id} className="card stack-sm">
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
                            }}
                          >
                            {org.type}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-warn, #d97706)" }}>
                            PENDING_REVIEW
                          </span>
                        </div>
                        <h3 style={{ fontWeight: 600, fontSize: 17, margin: 0 }}>{org.name}</h3>
                        <span className="muted-text" style={{ fontSize: 12 }}>
                          {org.contactEmail ?? "—"}
                          {org.region ? ` · ${org.region}` : ""}
                          {org.createdAt ? ` · ${new Date(org.createdAt).toLocaleDateString()}` : ""}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={acting === org.id}
                        onClick={() => approve(org.id)}
                      >
                        {acting === org.id ? "Approving…" : "Approve"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
