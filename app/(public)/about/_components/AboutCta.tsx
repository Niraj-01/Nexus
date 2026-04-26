"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";

/** Auth-aware CTA on /about: routes to /signup (anon) or /dashboard (signed in). */
export function AboutCta() {
  const { user, loading } = useAuth();
  return (
    <div className="row" style={{ gap: 12, marginTop: 8 }}>
      {loading ? (
        <span className="btn btn-primary" style={{ visibility: "hidden" }}>
          Loading
        </span>
      ) : user ? (
        <Link href="/dashboard" className="btn btn-primary">
          Go to dashboard
        </Link>
      ) : (
        <Link href="/signup" className="btn btn-primary">
          Register your organization
        </Link>
      )}
      <Link href="/" className="btn btn-ghost">
        Back home
      </Link>
    </div>
  );
}
