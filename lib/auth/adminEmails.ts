/**
 * Client-side mirror of the platform-admin email allowlist.
 *
 * KEEP IN SYNC with `functions/src/config/admins.ts`. The server-side list
 * is the source of truth — this file is only used as a no-op gate so we
 * don't fire the bootstrap callable for every random user signing in.
 */
export const PLATFORM_ADMIN_EMAILS = ["dhrupadrajpurohit@gmail.com"] as const;

export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return (PLATFORM_ADMIN_EMAILS as readonly string[]).includes(email.toLowerCase());
}
