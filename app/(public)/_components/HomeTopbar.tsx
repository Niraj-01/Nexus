"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";
import { NexusLogo } from "./NexusLogo";

export function HomeTopbar() {
  const { user, loading } = useAuth();
  return (
    <header className="home-topbar">
      <Link href="/" style={{ textDecoration: "none" }}>
        <NexusLogo size="sm" />
      </Link>
      {loading ? (
        <span style={{ width: 92 }} />
      ) : user ? (
        <Link href="/dashboard" className="btn btn-primary" style={{ padding: "8px 14px" }}>
          Dashboard
        </Link>
      ) : (
        <Link href="/signup" className="btn btn-primary" style={{ padding: "8px 14px" }}>
          Join us
        </Link>
      )}
    </header>
  );
}

