import { onCall } from "firebase-functions/v2/https";
import { notImplemented } from "../lib/notImplemented";

/** HOST or CONTRIBUTOR marks the agreement signed; FULLY_SIGNED → trigger fires. Plan §1a. */
export const signAgreement = onCall({ cors: true }, async () => {
  notImplemented("signAgreement");
});
