import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { verifyAdminRequest } from "@/lib/admin/verifyAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Idempotently grant PLATFORM_ADMIN to the calling user, provided their
 * email matches the hardcoded ADMIN_EMAIL allowlist.
 *
 * The /admin page calls this on sign-in, then force-refreshes the local
 * ID token. The next AuthProvider tick picks up the claim, which then
 * unlocks reading PENDING_REVIEW org docs from Firestore directly
 * (rules: allow read if isPlatformAdmin()).
 *
 * Without this, a brand-new admin (claim never set) would have to run
 * the CLI script before the /admin page would work for them.
 */
export async function POST(req: Request) {
  const gate = await verifyAdminRequest(req);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: gate.status });
  }

  const auth = getAuth();
  const user = await auth.getUser(gate.uid);
  const existing = (user.customClaims ?? {}) as Record<string, unknown>;

  if (existing.role === "PLATFORM_ADMIN") {
    return NextResponse.json({ ok: true, alreadyAdmin: true });
  }

  await auth.setCustomUserClaims(gate.uid, {
    ...existing,
    role: "PLATFORM_ADMIN",
  });

  return NextResponse.json({ ok: true, alreadyAdmin: false });
}
