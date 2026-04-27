import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { ResourceClientUpdateSchema } from "../lib/schemas";
import { embedResourceDoc, resolveGeminiKey } from "../lib/embedResource";

/**
 * Update an existing resource owned by the caller's org. Re-runs the embedding
 * because title/category/region/conditions all feed into the vector. Status
 * and embedding lifecycle fields are server-owned and ignored if sent.
 */
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

const EDITABLE_FIELDS = [
  "category",
  "title",
  "quantity",
  "unit",
  "valuationINR",
  "terms",
  "geo",
  "emergencyContract",
] as const;

export const updateResource = onCall(
  { cors: true, invoker: "public", secrets: [GEMINI_API_KEY] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }
    const { uid, token } = request.auth;
    const orgId = (token.orgId as string | undefined) ?? null;
    if (!orgId) {
      throw new HttpsError("failed-precondition", "Your org isn't approved yet.");
    }

    const parsed = ResourceClientUpdateSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", parsed.error.message);
    }
    const input = parsed.data as Record<string, unknown> & { resourceId: string };

    const db = admin.firestore();
    const ref = db.collection("resources").doc(input.resourceId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Resource not found.");
    }
    if (snap.data()!.orgId !== orgId) {
      throw new HttpsError("permission-denied", "You don't own this resource.");
    }

    const patch: Record<string, unknown> = {
      embeddingStatus: "pending",
      embeddingVersion: null,
    };
    for (const k of EDITABLE_FIELDS) {
      if (k in input) patch[k] = input[k];
    }
    await ref.update(patch);

    await db.collection("auditLog").add({
      actor: uid,
      action: "resource.updated",
      resourceId: ref.id,
      orgId,
      createdAt: Date.now(),
    });

    const fresh = await ref.get();
    const apiKey = resolveGeminiKey(GEMINI_API_KEY.value());
    const status = await embedResourceDoc(ref, fresh.data()!, apiKey, {
      resourceId: ref.id,
    });

    return { resourceId: ref.id, embeddingStatus: status };
  },
);
