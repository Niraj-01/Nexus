"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";

/**
 * If a user lands on /login or /signup while already authenticated, send
 * them to /dashboard. The login form itself handles ?next= for the
 * logged-out-redirected-here case (it's wrapped in its own Suspense).
 * Keeping useSearchParams out of the layout — using it here would force
 * every page under /(auth) out of static prerender.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  return <div className="auth-shell">{children}</div>;
}
