import { onCall } from "firebase-functions/v2/https";
import { notImplemented } from "../lib/notImplemented";

/** Flow B: generate optional post-hoc agreement during PENDING_SIGNOFF. Not a gate. Plan §1b. */
export const createPosthocAgreement = onCall({ cors: true }, async () => {
  notImplemented("createPosthocAgreement");
});
