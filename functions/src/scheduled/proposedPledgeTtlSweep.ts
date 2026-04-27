import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";

const TTL_MS = 36 * 60 * 60 * 1000; // 36 hours
const BATCH_SIZE = 200;

/**
 * Every 30 min: auto-reject contributions still in PROPOSED status more
 * than 36h after creation. PROPOSED never reserves inventory, so the only
 * cleanup is the status flip + reject metadata.
 *
 * Why this exists: PROPOSED contributions count toward the per-need cap
 * (see pledge.ts). If a host never responds, headroom is locked
 * indefinitely. The TTL releases it.
 *
 * Required composite index (collection group): `contributions` on
 * (status ASC, createdAt ASC).
 */
export const proposedPledgeTtlSweep = onSchedule("every 30 minutes", async () => {
  const db = admin.firestore();
  const cutoff = Date.now() - TTL_MS;

  const stale = await db
    .collectionGroup("contributions")
    .where("status", "==", "PROPOSED")
    .where("createdAt", "<=", cutoff)
    .limit(BATCH_SIZE)
    .get();

  if (stale.empty) {
    logger.info("proposedPledgeTtlSweep: no stale PROPOSED contributions");
    return;
  }

  const now = Date.now();
  const batch = db.batch();
  for (const doc of stale.docs) {
    batch.update(doc.ref, {
      status: "REJECTED",
      rejectedAt: now,
      rejectReason: "auto-rejected: 36h TTL expired without host response",
    });
  }
  await batch.commit();
  logger.info("proposedPledgeTtlSweep: rejected stale PROPOSED contributions", {
    count: stale.size,
  });
});
