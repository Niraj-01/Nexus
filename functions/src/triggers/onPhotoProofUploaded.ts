import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";

/**
 * A `tickets/{ticketId}/photoProofs/{proofId}` doc was created. Two effects:
 *   1. Bump `tickets/{id}.lastUpdatedAt` so the dashboard re-sorts.
 *   2. Mirror the proof into the `updates/` feed (List.md §2.5) for the
 *      eventual public ticket page. Deterministic id (proofId reused) keeps
 *      the write idempotent on retry.
 *
 * Reliability decay recovery is deferred per List.md §2.8 — the sweep that
 * would consume liveness signals isn't wired for the demo cut.
 */
export const onPhotoProofUploaded = onDocumentCreated(
  "tickets/{ticketId}/photoProofs/{proofId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const { ticketId, proofId } = event.params;
    const proof = snap.data();

    const db = admin.firestore();
    const now = Date.now();

    await db.collection("tickets").doc(ticketId).update({
      lastUpdatedAt: now,
    });

    await db
      .collection("tickets")
      .doc(ticketId)
      .collection("updates")
      .doc(proofId)
      .set({
        kind: "PHOTO_PROOF",
        caption: String(proof.caption ?? ""),
        authorOrgId: String(proof.uploaderOrgId ?? ""),
        storagePath: String(proof.storagePath ?? ""),
        createdAt: now,
      });

    logger.info("photo proof recorded", { ticketId, proofId });
  },
);
