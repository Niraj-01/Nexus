"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { FirebaseError } from "firebase/app";
import { onIdTokenChanged, signOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db, getAppCheckClient } from "@/lib/firebase/client";

type AuthCtx = {
  user: User | null;
  loading: boolean;
  claims: { role?: string; orgId?: string } | null;
};

const Ctx = createContext<AuthCtx>({ user: null, loading: true, claims: null });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [claims, setClaims] = useState<AuthCtx["claims"]>(null);
  const [loading, setLoading] = useState(true);
  // Tracks the last refresh attempt so we don't spam getIdToken(true).
  const refreshedForUidRef = useRef<string | null>(null);

  useEffect(() => {
    // App Check must initialize on the client before any secured call.
    getAppCheckClient();

    // onIdTokenChanged fires on sign-in/out AND token refresh, so claims set
    // by bootstrapPlatformAdmin (which calls getIdToken(true)) flow into state
    // without requiring a sign-out/sign-in cycle.
    const unsub = onIdTokenChanged(auth, async (u) => {
      try {
        setUser(u);
        if (!u) {
          setClaims(null);
          return;
        }

        const tokenResult = await u.getIdTokenResult();
        setClaims({
          role: tokenResult.claims.role as string | undefined,
          orgId: tokenResult.claims.orgId as string | undefined,
        });
      } catch (err) {
        console.error("Failed to restore Firebase auth session", err);
        setClaims(null);
        setUser(null);
        refreshedForUidRef.current = null;

        if (err instanceof FirebaseError && err.code === "auth/network-request-failed") {
          try {
            await signOut(auth);
          } catch (signOutErr) {
            console.error("Failed to clear broken Firebase auth session", signOutErr);
          }
        }
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  // Universal post-approval token refresh. The org doc lives at
  // organizations/{uid} during the self-onboard scheme, so subscribing by
  // uid covers both PENDING_REVIEW and ACTIVE states. When status flips to
  // ACTIVE while claims.orgId is still missing, force a refresh once.
  // Lifted from app/(app)/dashboard/page.tsx so every page (including
  // /resources) benefits without copying the effect.
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      doc(db, "organizations", user.uid),
      (snap) => {
        const data = snap.data();
        const status = data?.status as string | undefined;
        if (
          status === "ACTIVE" &&
          !claims?.orgId &&
          refreshedForUidRef.current !== user.uid
        ) {
          refreshedForUidRef.current = user.uid;
          void user.getIdToken(true).catch((err) => {
            console.warn("[auth] post-approval token refresh failed", err);
          });
        }
      },
      () => {
        // Snapshot error (rules deny, doc missing): nothing to refresh.
      },
    );
    return unsub;
  }, [user, claims?.orgId]);

  return <Ctx.Provider value={{ user, loading, claims }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
