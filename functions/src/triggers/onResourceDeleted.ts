import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";

/**
 * When a resource is hard-deleted, every match that references it as
 * `topResourceId` becomes meaningless — the org can't pledge from a doc
 * that no longer exists. Bulk-delete those matches.
 *
 * This is the only resource lifecycle event that auto-prunes matches
 * (apart from category changes — see onResourceUpdated). Inventory
 * exhaustion (status='RESERVED'/'DEPLETED') deliberately does NOT prune,
 * per the user's recommendation rule.
 */
export const onResourceDeleted = onDocumentDeleted(
  "resources/{resourceId}",
  async (event) => {
    const { resourceId } = event.params;
    const db = admin.firestore();

    const matches = await db
      .collection("matches")
      .where("topResourceId", "==", resourceId)
      .get();

    if (matches.empty) {
      logger.info("onResourceDeleted: no matches referencing deleted resource", { resourceId });
      return;
    }

    const batch = db.batch();
    for (const doc of matches.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    logger.info("onResourceDeleted: pruned matches after resource deletion", {
      resourceId,
      deleted: matches.size,
    });
  },
);
