"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { signOutUser } from "@/lib/auth/actions";
import { NexusLogo } from "@/app/(public)/_components/NexusLogo";

function displayLabel(name: string | null | undefined, email: string | null | undefined) {
  if (name && name.trim()) return name.trim().split(/\s+/)[0];
  if (email) return email.split("@")[0];
  return "Account";
}

function initial(name: string | null | undefined, email: string | null | undefined) {
  const source = name?.trim() || email || "?";
  return source.charAt(0).toUpperCase();
}

export function AppTopbar() {
  const { user } = useAuth();
  const router = useRouter();
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

  const label = displayLabel(user?.displayName, user?.email);
  const avatar = initial(user?.displayName, user?.email);

  return (
    <header className="app-topbar">
      <Link href="/" aria-label="Nexus home" style={{ textDecoration: "none" }}>
        <NexusLogo size="sm" />
      </Link>
      <div className="row" style={{ gap: 8 }}>
        <Link href="/profile" className="profile-pill" aria-label="Account">
          <span className="profile-pill__avatar" aria-hidden>{avatar}</span>
          <span className="profile-pill__label">{label}</span>
        </Link>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onSignOut}
          disabled={busy}
          style={{ padding: "8px 14px", fontSize: 13 }}
        >
          {busy ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </header>
  );
}
