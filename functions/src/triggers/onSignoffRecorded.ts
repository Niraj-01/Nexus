import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";

/**
 * Fires when a contributor's signoff lands. Decides whether the ticket can
 * close:
 *
 *   1. Bail unless ticket is PENDING_SIGNOFF.
 *   2. Read all contributions whose status is in {EXECUTED, SIGNED_OFF,
 *      DISPUTED} — these are the contributors who reached execution and so
 *      owe a signoff.
 *   3. Read all signoffs.
 *   4. Any DISPUTED contribution OR DISPUTED signoff → no-op. Ticket stays
 *      in PENDING_SIGNOFF; demo cut has no admin queue (List.md §2.7).
 *   5. If signoff coverage matches the contributor set AND every decision
 *      is APPROVED → flip ticket to CLOSED. That fires `onTicketClosed`
 *      which mints the badges.
 *
 * Transactional so the close commits atomically with the read snapshot.
 */
export const onSignoffRecorded = onDocumentCreated(
  "tickets/{ticketId}/signoffs/{signoffId}",
  async (event) => {
    const { ticketId } = event.params;
    const db = admin.firestore();
    const ticketRef = db.collection("tickets").doc(ticketId);
    const contributionsRef = ticketRef.collection("contributions");
    const signoffsRef = ticketRef.collection("signoffs");

    await db.runTransaction(async (tx) => {
      const ticketSnap = await tx.get(ticketRef);
      if (!ticketSnap.exists) return;
      const ticket = ticketSnap.data()!;
      if (ticket.phase !== "PENDING_SIGNOFF") return;

      const contribSnap = await tx.get(contributionsRef);
      const expectedContributors = new Set<string>();
      let anyDisputedContrib = false;
      for (const doc of contribSnap.docs) {
        const d = doc.data();
        const status = String(d.status ?? "");
        if (status === "EXECUTED" || status === "SIGNED_OFF" || status === "DISPUTED") {
          expectedContributors.add(String(d.contributorOrgId ?? ""));
        }
        if (status === "DISPUTED") anyDisputedContrib = true;
      }

      if (anyDisputedContrib) {
        logger.info("ticket has DISPUTED contribution — staying PENDING_SIGNOFF", { ticketId });
        return;
      }
      if (expectedContributors.size === 0) {
        logger.info("no contributors to verify — staying PENDING_SIGNOFF", { ticketId });
        return;
      }

      const signoffSnap = await tx.get(signoffsRef);
      const signedBy = new Set<string>();
      let anyDisputedSignoff = false;
      for (const doc of signoffSnap.docs) {
        const d = doc.data();
        signedBy.add(String(d.contributorOrgId ?? ""));
        if (String(d.decision ?? "") === "DISPUTED") anyDisputedSignoff = true;
      }

      if (anyDisputedSignoff) {
        logger.info("DISPUTED signoff present — staying PENDING_SIGNOFF", { ticketId });
        return;
      }

      for (const orgId of expectedContributors) {
        if (!signedBy.has(orgId)) {
          logger.info("waiting on more signoffs", {
            ticketId,
            need: expectedContributors.size,
            have: signedBy.size,
          });
          return;
        }
      }

      const now = Date.now();
      tx.update(ticketRef, {
        phase: "CLOSED",
        closedAt: now,
        phaseChangedAt: now,
        lastUpdatedAt: now,
      });
      logger.info("ticket auto-closed after full signoff coverage", { ticketId });
    });
  },
);
