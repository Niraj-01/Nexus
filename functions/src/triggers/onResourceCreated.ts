import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { embedResourceDoc, resolveGeminiKey } from "../lib/embedResource";
import { backfillMatchesForResource } from "../lib/backfillResourceMatches";

/**
 * On resource create:
 *  1. Generate a 768-d embedding (or synthetic dev fallback) and write it back.
 *  2. Backfill match docs against currently-open tickets so the resource's
 *     org sees recommendations even when the resource is listed AFTER the
 *     tickets exist.
 */
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

export const onResourceCreated = onDocumentCreated(
  { document: "resources/{resourceId}", secrets: [GEMINI_API_KEY] },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const { resourceId } = event.params;

    const apiKey = resolveGeminiKey(GEMINI_API_KEY.value());
    const status = await embedResourceDoc(snap.ref, snap.data(), apiKey, { resourceId });

    if (status === "ok" || status === "skipped") {
      const fresh = await snap.ref.get();
      if (fresh.exists) {
        await backfillMatchesForResource(resourceId, fresh.data()!);
      }
    }
  },
);
