"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useOrgRecord } from "@/lib/onboarding/useOrgRecord";

/**
 * Gate the entire /onboard/* subtree. The (app) parent already
 * redirects unauthenticated users to /login, so here we only need to
 * decide whether the SIGNED-IN user should be allowed in:
 *
 *   - Org doesn't exist yet → allow (initial setup).
 *   - Org exists, incomplete (missing required docs) → allow (so they
 *     can finish uploading).
 *   - Org exists, complete → bounce to /dashboard. Onboarding wizard is
 *     a one-time flow; edits to a complete profile happen elsewhere
 *     (post-MVP).
 */
export default function OnboardLayout({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const orgRecord = useOrgRecord(user?.uid ?? null);
  const router = useRouter();

  const isComplete = orgRecord.loading
    ? false
    : orgRecord.exists && orgRecord.isComplete;

  useEffect(() => {
    if (authLoading || orgRecord.loading) return;
    if (isComplete) router.replace("/dashboard");
  }, [authLoading, orgRecord.loading, isComplete, router]);

  if (authLoading || orgRecord.loading || isComplete) {
    return (
      <p className="muted-text" style={{ textAlign: "center", marginTop: 64 }}>
        Loading…
      </p>
    );
  }

  return <>{children}</>;
}
