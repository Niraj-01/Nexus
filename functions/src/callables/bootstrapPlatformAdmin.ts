import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { isPlatformAdminEmail } from "../config/admins";

/**
 * Self-bootstrap path for platform admins. Replaces the old manual
 * `firebase auth:set-claims` flow from DRY_RUN §A.2.
 *
 * Caller must be authenticated. The callable trusts `request.auth.token.email`
 * (Firebase verifies it server-side from the ID token) and only sets the
 * PLATFORM_ADMIN claim when the email is in the hardcoded allowlist.
 *
 * Idempotent: if the claim is already set, returns { alreadyAdmin: true }
 * without touching Auth or Firestore.
 */
export const bootstrapPlatformAdmin = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "sign in");

  const uid = request.auth.uid;
  const email = (request.auth.token.email as string | undefined) ?? null;

  if (!isPlatformAdminEmail(email)) {
    throw new HttpsError("permission-denied", "not on admin allowlist");
  }

  if (request.auth.token.role === "PLATFORM_ADMIN") {
    return { ok: true, alreadyAdmin: true };
  }

  await admin.auth().setCustomUserClaims(uid, { role: "PLATFORM_ADMIN" });
  await admin
    .firestore()
    .collection("users")
    .doc(uid)
    .set({ role: "PLATFORM_ADMIN" }, { merge: true });

  return { ok: true, alreadyAdmin: false };
});
