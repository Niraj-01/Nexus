import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { ResourceClientWriteSchema } from "../lib/schemas";
import { withIdempotency } from "../lib/idempotency";

/**
 * Server-side resource listing for an ACTIVE org. Phase 1.4.
 *
 * Client writes to resources/{id} are denied by firestore.rules — this is the
 * only path to create a resource. Gate: org.status === "ACTIVE".
 *
 * The embedding is NOT written here. The onResourceCreated trigger picks up
 * the new doc, calls Vertex text-embedding-004, and updates
 * embedding / embeddingVersion / embeddingStatus.
 */
export const createResource = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const { uid, token } = request.auth;
  const orgId = (token.orgId as string | undefined) ?? null;
  if (!orgId) {
    throw new HttpsError(
      "failed-precondition",
      "Your org isn't approved yet. Wait for admin review.",
    );
  }

  const parsed = ResourceClientWriteSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", parsed.error.message);
  }
  const input = parsed.data;

  return withIdempotency(uid, input.requestId, async () => {
    const db = admin.firestore();

    const orgSnap = await db.collection("organizations").doc(orgId).get();
    if (!orgSnap.exists) {
      throw new HttpsError("failed-precondition", "Organization not found.");
    }
    if (orgSnap.data()!.status !== "ACTIVE") {
      throw new HttpsError(
        "failed-precondition",
        "Only ACTIVE organizations can list resources.",
      );
    }

    const now = Date.now();
    const { requestId: _ignoredRequestId, ...body } = input;

    const ref = db.collection("resources").doc();
    await ref.set({
      ...body,
      orgId,
      status: "AVAILABLE",
      embeddingVersion: null,
      embeddingStatus: "pending",
      createdAt: now,
    });

    await db.collection("auditLog").add({
      actor: uid,
      action: "resource.created",
      resourceId: ref.id,
      orgId,
      createdAt: now,
    });

    return { resourceId: ref.id };
  });
});
