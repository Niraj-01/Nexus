"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { FirebaseError } from "firebase/app";
import { onIdTokenChanged, signOut, type User } from "firebase/auth";
import { auth, getAppCheckClient } from "@/lib/firebase/client";

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

  return <Ctx.Provider value={{ user, loading, claims }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
