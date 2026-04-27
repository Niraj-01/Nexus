/**
 * NEXUS Cloud Functions (2nd gen)
 *
 * Region: asia-south1 (matches Firestore + App Hosting).
 * All triggers + callables export from here. Handlers live in subfiles.
 *
 * Deploy: `npm run deploy` from this directory.
 * Plan ref: hey-claude-me-and-deep-lecun.md §A.1 "Backend logic" + "Files to create" §8.
 */
import { setGlobalOptions } from "firebase-functions/v2";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

setGlobalOptions({ region: "asia-south1", maxInstances: 10 });

// Triggers — stubs to be filled per plan §Files to create #8.
// Kept as individual exports so they deploy/retry independently.
export { onAgreementFullySigned } from "./triggers/onAgreementFullySigned";
export { onTicketCreated } from "./triggers/onTicketCreated";
export { onRapidTicketCreated } from "./triggers/onRapidTicketCreated";
export { onPhotoProofUploaded } from "./triggers/onPhotoProofUploaded";
export { onSignoffRecorded } from "./triggers/onSignoffRecorded";
export { onTicketClosed } from "./triggers/onTicketClosed";
export { onResourceCreated } from "./triggers/onResourceCreated";
export { onResourceUpdated } from "./triggers/onResourceUpdated";
export { onResourceDeleted } from "./triggers/onResourceDeleted";
export { appendAuditLog } from "./triggers/appendAuditLog";

// Scheduled jobs
export { reliabilityDecaySweep } from "./scheduled/reliabilityDecaySweep";
export { stuckStageSweep } from "./scheduled/stuckStageSweep";
export { emergencyExpirySweep } from "./scheduled/emergencyExpirySweep";
export { proposedPledgeTtlSweep } from "./scheduled/proposedPledgeTtlSweep";

// Callables
export { approveOrg } from "./callables/approveOrg";
export { raiseTicket } from "./callables/raiseTicket";
export { createResource } from "./callables/createResource";
export { updateResource } from "./callables/updateResource";
export { retryResourceEmbedding } from "./callables/retryResourceEmbedding";
export { pledge } from "./callables/pledge";
export { respondToPledge } from "./callables/respondToPledge";
export { signAgreement } from "./callables/signAgreement";
export { advancePhase } from "./callables/advancePhase";
export { recordSignoff } from "./callables/recordSignoff";
export { createPosthocAgreement } from "./callables/createPosthocAgreement";
export { onboardingChat } from "./callables/onboardingChat";
