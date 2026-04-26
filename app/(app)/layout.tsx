"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { AppTopbar } from "./_components/AppTopbar";

export default function AppShellLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="auth-shell">
        <p className="muted-text">Loading…</p>
      </div>
    );
  }

  return (
    <>
      <AppTopbar />
      <div className="container" style={{ padding: "24px 24px 64px" }}>
        {children}
      </div>
    </>
  );
}

