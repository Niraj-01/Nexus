"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useUserProfile } from "@/lib/auth/useUserProfile";
import { signOutUser } from "@/lib/auth/actions";

/** Minimal profile page — shows who's signed in and a Sign out button. */
export default function ProfilePage() {
  const router = useRouter();
  const { user, claims } = useAuth();
  const profile = useUserProfile(user?.uid ?? null);
  const [busy, setBusy] = useState(false);

  async function onSignOut() {
    setBusy(true);
    try {
      await signOutUser();
      router.push("/login");
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  const role = claims?.role ?? (profile.loading ? null : profile.role) ?? "—";
  const orgId = claims?.orgId ?? (profile.loading ? null : profile.orgId) ?? "—";

  return (
    <div className="stack" style={{ maxWidth: 560, margin: "0 auto" }}>
      <header className="stack-sm">
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          Profile
        </h1>
        <p className="muted-text">Account details for the currently signed-in user.</p>
      </header>

      <div className="card stack-sm">
        <div className="stack-sm">
          <Field label="Name" value={user.displayName ?? "—"} />
          <Field label="Email" value={user.email ?? "—"} />
          <Field label="Role (claim)" value={role} mono />
          <Field label="Org ID (claim)" value={orgId} mono />
          <Field label="UID" value={user.uid} mono />
        </div>
      </div>

      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onSignOut}
          disabled={busy}
        >
          {busy ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
      <span className="muted-text" style={{ fontSize: 13 }}>{label}</span>
      <span style={{ fontSize: 13, fontFamily: mono ? "var(--font-mono, monospace)" : undefined, wordBreak: "break-all", textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}

