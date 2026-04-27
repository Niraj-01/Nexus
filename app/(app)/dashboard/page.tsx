"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useUserProfile } from "@/lib/auth/useUserProfile";
import { useOrgRecord } from "@/lib/onboarding/useOrgRecord";
import { useOrgStatus } from "../resources/_lib/useOrgStatus";
import { RecommendedTicketsList } from "./_components/RecommendedTicketsList";
import { ActiveTicketsList } from "./_components/ActiveTicketsList";
import { ProfileCard } from "./_components/ProfileCard";

/**
 * Two-surface dashboard per Albin/Nexus_Dashboard_Logic.md + List.md §2.10.
 * Recommended (primary, AI-driven) on the left; Active (secondary,
 * state-driven) on the right. Stacks vertically below the bento breakpoint.
 *
 * Reads: 3 Firestore queries fired in parallel against the viewer's orgId
 *  - tickets array-contains orgId  (Active)
 *  - matches where orgId, score desc, rapidBroadcast=false  (Normal)
 *  - matches where orgId, rapidBroadcast=true               (Rapid)
 * No joins beyond a one-shot ticket-header batch fetch keyed by ticketId
 * for the Recommended cards.
 */
export default function Dashboard() {
  const { user, loading, claims } = useAuth();
  // Read users/{uid} directly for the canonical "did they onboard" signal.
  // claims.orgId is only issued post-approval, so during PENDING_REVIEW the
  // claim is empty and we'd otherwise show "Finish onboarding" by mistake.
  const profile = useUserProfile(user?.uid ?? null);
  const profileOrgId = profile.loading ? null : profile.orgId;
  const orgId = claims?.orgId ?? profileOrgId;
  const orgStatus = useOrgStatus(orgId);
  const orgRecord = useOrgRecord(user?.uid ?? null);

  // Token refresh on approval is now handled centrally in AuthProvider so
  // every page (including /resources) picks up the new orgId claim without
  // a sign-out/in. No dashboard-local effect needed.

  if (loading || profile.loading || orgStatus.loading) {
    return (
      <p className="muted-text" style={{ textAlign: "center", marginTop: 64 }}>
        Loading…
      </p>
    );
  }
  if (!user) return null;

  const onboarded = Boolean(orgId);
  // The full dashboard requires both ACTIVE status AND a claim-issued orgId
  // (server-only writes / member-gated rules check the claim, not Firestore).
  const isActive = orgStatus.status === "ACTIVE" && Boolean(claims?.orgId);

  if (!onboarded) {
    return (
      <div className="stack" style={{ maxWidth: 640, margin: "64px auto", textAlign: "center" }}>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 36,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          Set up your organization
        </h1>
        <p className="muted-text">
          Tell us who you are and upload your government documents. Takes about 2 minutes.
        </p>
        <div className="row" style={{ justifyContent: "center" }}>
          <Link href="/onboard" className="btn btn-primary">
            Start setup
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="stack" style={{ maxWidth: 1200, margin: "0 auto" }}>
      <header className="stack-sm">
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          Dashboard
        </h1>
        <p className="muted-text">
          {isActive
            ? "Your org is approved. Recommended tickets and active work below."
            : "Track your profile and unlock matching once approved."}
        </p>
      </header>

      <ProfileCard orgRecord={orgRecord} />

      {isActive && orgId && (
        <>
          <div className="row" style={{ justifyContent: "flex-start" }}>
            <Link href="/tickets/new" className="btn btn-primary">
              Raise a ticket
            </Link>
          </div>
          <div className="dashboard-bento">
            <RecommendedTicketsList orgId={orgId} />
            <ActiveTicketsList orgId={orgId} />
          </div>
        </>
      )}
    </div>
  );
}

