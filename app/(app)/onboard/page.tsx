"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useOrgRecord } from "@/lib/onboarding/useOrgRecord";
import { EntitySelector } from "./_components/EntitySelector";
import { loadSession } from "./_lib/sessionStore";

/**
 * Type-picker page. Industry-standard policy: a user picks NGO vs ORG
 * exactly once. Loopholes we close here:
 *
 *   1. Org already exists (any state) → redirect to the form with the
 *      committed type. Type is immutable post-create.
 *   2. No org yet, but session storage carries an in-progress type AND
 *      at least one uploaded doc → redirect to the form with the
 *      session type. Prevents "started uploading ORG docs, then went
 *      back and re-picked NGO" hybrid orgs.
 *   3. Otherwise → show the picker.
 *
 * The parent layout already redirects users with a *complete* org to
 * /dashboard, so we don't need to re-check that here.
 */
export default function OnboardPickerPage() {
  const { user, loading: authLoading } = useAuth();
  const orgRecord = useOrgRecord(user?.uid ?? null);
  const router = useRouter();

  useEffect(() => {
    if (authLoading || orgRecord.loading) return;

    // 1) Firestore-committed type wins.
    if (orgRecord.exists && orgRecord.type) {
      router.replace(`/onboard/form?type=${orgRecord.type}`);
      return;
    }

    // 2) Session-only lock: type chosen + at least one doc uploaded
    //    locally but never finalized to Firestore.
    if (typeof window !== "undefined") {
      const session = loadSession();
      const sessionType = session.partialData.type;
      const hasSessionDocs = Object.keys(session.docs).length > 0;
      if ((sessionType === "NGO" || sessionType === "ORG") && hasSessionDocs) {
        router.replace(`/onboard/form?type=${sessionType}`);
        return;
      }
    }
  }, [authLoading, orgRecord, router]);

  if (
    authLoading ||
    orgRecord.loading ||
    (orgRecord.exists && orgRecord.type)
  ) {
    return (
      <p className="muted-text" style={{ textAlign: "center", marginTop: 64 }}>
        Loading…
      </p>
    );
  }

  return <EntitySelector />;
}
