import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { z } from "zod";

const InputSchema = z.object({
  orgId: z.string().min(1),
  requestId: z.string().min(8),
});

/**
 * Platform Admin → sets org.status=ACTIVE and issues custom claims
 * (role, orgId) on the admin user of that org. Rules depend on these claims.
 */
export const approveOrg = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "sign in");
  if (request.auth.token.role !== "PLATFORM_ADMIN") {
    throw new HttpsError("permission-denied", "platform admin only");
  }
  const parsed = InputSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", parsed.error.message);
  }

  const { orgId } = parsed.data;
  const db = admin.firestore();
  const orgRef = db.collection("organizations").doc(orgId);
  const orgSnap = await orgRef.get();
  if (!orgSnap.exists) throw new HttpsError("not-found", "org not found");

  await orgRef.update({ status: "ACTIVE", approvedAt: Date.now() });

  // Set custom claims on every member of this org. Auth claims are the source
  // of truth for role — read existing claims and preserve PLATFORM_ADMIN if
  // present, so a platform admin who is also an ORG_ADMIN of their own org
  // (e.g. Dhrupad in DRY_RUN) keeps both powers after approving themselves.
  const users = await db.collection("users").where("orgId", "==", orgId).get();
  await Promise.all(
    users.docs.map(async (u) => {
      const authUser = await admin.auth().getUser(u.id);
      const existingRole = (authUser.customClaims?.role as string | undefined) ?? null;
      const role = existingRole === "PLATFORM_ADMIN" ? "PLATFORM_ADMIN" : "ORG_ADMIN";
      await admin.auth().setCustomUserClaims(u.id, { role, orgId });
    }),
  );

  return { ok: true, orgId, affectedUsers: users.size };
});
