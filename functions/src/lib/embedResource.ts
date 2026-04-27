import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { GoogleGenAI } from "@google/genai";

export const EMBED_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIM = 768;

export function buildResourceEmbeddingInput(data: admin.firestore.DocumentData): string {
  const category = String(data.category ?? "");
  const title = String(data.title ?? "");
  const conditions = String(data.terms?.conditions ?? "");
  const region = String(data.geo?.adminRegion ?? "");
  return `Capability: ${category}. ${title}. Terms: ${conditions}. Service region: ${region}.`;
}

/**
 * Resolve a Gemini API key. Production deploys use the GEMINI_API_KEY secret;
 * local emulator dev can fall back to process.env.GEMINI_API_KEY (loaded from
 * functions/.env or shell). Returns null if no key is configured.
 */
export function resolveGeminiKey(secretValue: string | undefined): string | null {
  if (secretValue && secretValue.length > 0) return secretValue;
  const envKey = process.env.GEMINI_API_KEY;
  if (envKey && envKey.length > 0) return envKey;
  return null;
}

async function embedOnce(ai: GoogleGenAI, text: string): Promise<number[]> {
  const resp = await ai.models.embedContent({
    model: EMBED_MODEL,
    contents: text,
    config: { outputDimensionality: EMBEDDING_DIM },
  });
  const values = resp.embeddings?.[0]?.values;
  if (!values || values.length !== EMBEDDING_DIM) {
    throw new Error(
      `embedContent returned ${values?.length ?? 0} dims, expected ${EMBEDDING_DIM}`,
    );
  }
  return values;
}

/**
 * Generate a 768-d embedding for a resource doc and write it back. If no API
 * key is available, mark embeddingStatus="ok" with version="skipped" — search
 * just won't surface it but the UI doesn't show an alarming "failed" state.
 * On real API failure, marks "failed" so the user can retry.
 */
export async function embedResourceDoc(
  ref: admin.firestore.DocumentReference,
  data: admin.firestore.DocumentData,
  apiKey: string | null,
  ctx: { resourceId: string },
): Promise<"ok" | "skipped" | "failed"> {
  if (!apiKey) {
    logger.warn("GEMINI_API_KEY missing — skipping embedding", ctx);
    await ref.update({
      embeddingVersion: "skipped",
      embeddingStatus: "ok",
    });
    return "skipped";
  }

  const ai = new GoogleGenAI({ apiKey });
  const input = buildResourceEmbeddingInput(data);

  let vector: number[] | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      vector = await embedOnce(ai, input);
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`embed attempt ${attempt} failed`, { ...ctx, err: msg });
    }
  }

  if (!vector) {
    await ref.update({ embeddingStatus: "failed" });
    logger.error("resource embedding failed permanently", ctx);
    return "failed";
  }

  await ref.update({
    embedding: FieldValue.vector(vector),
    embeddingVersion: EMBED_MODEL,
    embeddingStatus: "ok",
  });
  logger.info("resource embedded", { ...ctx, model: EMBED_MODEL });
  return "ok";
}
