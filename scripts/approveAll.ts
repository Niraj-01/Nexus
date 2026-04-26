/**
 * Approve every PENDING_REVIEW org in one command. Replaces the manual
 * Firestore Console + per-user `firebase auth:set-claims` flow from
 * DRY_RUN §A.2.
 *
 * What it does:
 *   1. Lists every `organizations/{uid}` doc with status == "PENDING_REVIEW".
 *   2. For each doc:
 *        - Sets status = "ACTIVE", approvedAt = now.
 *        - Looks up the owning user (orgId == userUid in the self-onboard scheme).
 *        - Sets that user's custom claims to { role, orgId }.
 *          - role = "PLATFORM_ADMIN" if their email is in PLATFORM_ADMIN_EMAILS,
 *            otherwise "ORG_ADMIN".
 *   3. Idempotent: re-running is a no-op for already-ACTIVE orgs.
 *
 * Usage (against the live `buffet-493105` project):
 *   cd nexus
 *   firebase login          (one-time)
 *   npm run approve         (runs this script)
 *
 * Or against the emulator:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *   npx tsx scripts/approveAll.ts
 *
 * After running, every approved user must sign out and sign back in once
 * so their browser ID token picks up the new claims. There is no way to
 * skip that step from the server side — Auth tokens are reissued on
 * sign-in, not on demand.
 */
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const PLATFORM_ADMIN_EMAILS = ["dhrupadrajpurohit@gmail.com"];
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "buffet-493105";

if (!getApps().length) {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  initializeApp({
    credential: sa ? cert(JSON.parse(sa)) : applicationDefault(),
    projectId,
  });
}
const db = getFirestore();
const auth = getAuth();

function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return PLATFORM_ADMIN_EMAILS.includes(email.toLowerCase());
}

async function main() {
  const target = process.env.FIRESTORE_EMULATOR_HOST ? "EMULATOR" : `LIVE (${projectId})`;
  console.log(`\n→ Approving all PENDING_REVIEW orgs against ${target}\n`);

  const pending = await db
    .collection("organizations")
    .where("status", "==", "PENDING_REVIEW")
    .get();

  if (pending.empty) {
    console.log("  (no pending orgs — nothing to do)");
    await ensurePlatformAdmins();
    return;
  }

  console.log(`  Found ${pending.size} pending org${pending.size === 1 ? "" : "s"}:\n`);

  let ok = 0;
  let failed = 0;

  for (const doc of pending.docs) {
    const orgId = doc.id;
    const orgData = doc.data();
    const orgName = String(orgData.name ?? "(unnamed)");

    try {
      await doc.ref.update({ status: "ACTIVE", approvedAt: Date.now() });

      // In the self-onboard scheme, the org doc id IS the owning user's uid.
      const user = await auth.getUser(orgId);
      const role = isPlatformAdminEmail(user.email) ? "PLATFORM_ADMIN" : "ORG_ADMIN";
      await auth.setCustomUserClaims(orgId, { role, orgId });

      console.log(`  ✓ ${orgName.padEnd(30)} ${user.email ?? "(no email)"}  →  {role:${role}, orgId}`);
      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${orgName.padEnd(30)} ${orgId}  →  ${msg}`);
      failed++;
    }
  }

  console.log(`\n  ${ok} approved, ${failed} failed.\n`);

  await ensurePlatformAdmins();

  console.log("\n→ Done. Each approved user must sign out and sign back in to refresh their token.\n");

  if (failed > 0) process.exit(1);
}

/**
 * Make sure hardcoded PLATFORM_ADMIN emails always have the role claim,
 * even if their org isn't pending right now (e.g. they already have an
 * approved org and just need the admin bit added).
 */
async function ensurePlatformAdmins() {
  for (const email of PLATFORM_ADMIN_EMAILS) {
    try {
      const user = await auth.getUserByEmail(email);
      const existing = (user.customClaims ?? {}) as Record<string, unknown>;
      if (existing.role === "PLATFORM_ADMIN") continue;

      await auth.setCustomUserClaims(user.uid, { ...existing, role: "PLATFORM_ADMIN" });
      console.log(`  ✓ ${email.padEnd(40)}  →  upgraded role to PLATFORM_ADMIN`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  · ${email.padEnd(40)}  →  skipped (${msg})`);
    }
  }
}

main().catch((err) => {
  console.error("\n✗ approveAll failed:", err);
  process.exit(1);
});
