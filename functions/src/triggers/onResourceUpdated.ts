import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";

/**
 * Resource update trigger. Per the user's directive: a recommendation
 * (match doc) stays visible while the resource still semantically matches
 * the ticket. Inventory state (RESERVED, DEPLETED) does NOT remove a
 * recommendation — that's a per-pledge concern checked at pledge time.
 *
 * The only resource update that invalidates a match is a CATEGORY change
 * to something the ticket no longer needs. When that happens we walk every
 * match referencing this resource and check whether the new category still
 * appears in the ticket's `needs[].resourceCategory`. If not, the match is
 * deleted.
 *
 * No-op cases (skipped fast): unchanged category, no matches reference
 * this resource, embedding-only updates.
 */
export const onResourceUpdated = onDocumentUpdated(
  "resources/{resourceId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const beforeCat = String(before.category ?? "");
    const afterCat = String(after.category ?? "");
    if (beforeCat === afterCat) return; // No semantic change.

    const { resourceId } = event.params;
    const db = admin.firestore();

    const matches = await db
      .collection("matches")
      .where("topResourceId", "==", resourceId)
      .get();

    if (matches.empty) {
      logger.info("onResourceUpdated: category changed but no matches reference this resource", {
        resourceId,
        beforeCat,
        afterCat,
      });
      return;
    }

    let deletedCount = 0;
    const batch = db.batch();
    for (const matchDoc of matches.docs) {
      const ticketId = String(matchDoc.data().ticketId ?? "");
      if (!ticketId) {
        // Malformed match — drop it.
        batch.delete(matchDoc.ref);
        deletedCount++;
        continue;
      }
      const ticketSnap = await db.collection("tickets").doc(ticketId).get();
      if (!ticketSnap.exists) {
        // Ticket gone → match is dead anyway.
        batch.delete(matchDoc.ref);
        deletedCount++;
        continue;
      }
      const needs = ticketSnap.data()?.needs;
      const needCategories: string[] = Array.isArray(needs)
        ? needs.map((n: { resourceCategory?: unknown }) => String(n?.resourceCategory ?? ""))
        : [];
      if (!needCategories.includes(afterCat)) {
        batch.delete(matchDoc.ref);
        deletedCount++;
      }
      // Else: new category still matches one of the ticket's needs — keep.
    }

    if (deletedCount > 0) {
      await batch.commit();
    }
    logger.info("onResourceUpdated: pruned stale matches after category change", {
      resourceId,
      beforeCat,
      afterCat,
      scanned: matches.size,
      deleted: deletedCount,
    });
  },
);
