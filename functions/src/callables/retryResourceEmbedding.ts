import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { RetryResourceEmbeddingSchema } from "../lib/schemas";
import { embedResourceDoc, resolveGeminiKey } from "../lib/embedResource";
import { backfillMatchesForResource } from "../lib/backfillResourceMatches";

/**
 * Retry the embedding for a resource the caller owns. Resets status to
 * "pending" and re-runs the same embedder used by the create trigger.
 */
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

export const retryResourceEmbedding = onCall(
  { cors: true, invoker: "public", secrets: [GEMINI_API_KEY] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }
    const { token } = request.auth;
    const orgId = (token.orgId as string | undefined) ?? null;
    if (!orgId) {
      throw new HttpsError("failed-precondition", "Your org isn't approved yet.");
    }

    const parsed = RetryResourceEmbeddingSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", parsed.error.message);
    }

    const db = admin.firestore();
    const ref = db.collection("resources").doc(parsed.data.resourceId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Resource not found.");
    }
    const data = snap.data()!;
    if (data.orgId !== orgId) {
      throw new HttpsError("permission-denied", "You don't own this resource.");
    }

    await ref.update({ embeddingStatus: "pending", embeddingVersion: null });

    const apiKey = resolveGeminiKey(GEMINI_API_KEY.value());
    const status = await embedResourceDoc(ref, data, apiKey, {
      resourceId: ref.id,
    });

    if (status === "ok" || status === "skipped") {
      const fresh = await ref.get();
      if (fresh.exists) {
        await backfillMatchesForResource(ref.id, fresh.data()!);
      }
    }

    return { resourceId: ref.id, embeddingStatus: status };
  },
);
