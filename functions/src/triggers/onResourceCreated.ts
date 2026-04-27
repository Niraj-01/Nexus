import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { embedResourceDoc, resolveGeminiKey } from "../lib/embedResource";

/**
 * On resource create, generate a 768-d embedding with text-embedding-004 and
 * write it back to the resource doc using Firestore's native vector type.
 * Embedding logic lives in lib/embedResource so the update + retry callables
 * can reuse it.
 */
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

export const onResourceCreated = onDocumentCreated(
  { document: "resources/{resourceId}", secrets: [GEMINI_API_KEY] },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const { resourceId } = event.params;

    const apiKey = resolveGeminiKey(GEMINI_API_KEY.value());
    await embedResourceDoc(snap.ref, snap.data(), apiKey, { resourceId });
  },
);
