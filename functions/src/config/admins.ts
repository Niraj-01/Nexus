/**
 * Hardcoded allowlist of emails that are auto-promoted to PLATFORM_ADMIN
 * on first sign-in via the bootstrapPlatformAdmin callable.
 *
 * Source of truth. The client-side mirror at `lib/auth/adminEmails.ts` is
 * only a no-op gate to avoid firing the callable for non-admin users.
 */
export const PLATFORM_ADMIN_EMAILS = ["dhrupadrajpurohit@gmail.com"] as const;

export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase();
  return (PLATFORM_ADMIN_EMAILS as readonly string[]).includes(normalized);
}
