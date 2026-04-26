import { onCall } from "firebase-functions/v2/https";
import { notImplemented } from "../lib/notImplemented";

/**
 * Gemini-driven onboarding chat turn. Validates structured output against
 * OnboardingTurnOutputSchema (lib/schemas/onboarding.ts). One retry on parse
 * failure, then the client falls back to the classic form. Plan §Onboarding.
 */
export const onboardingChat = onCall({ cors: true }, async () => {
  notImplemented("onboardingChat");
});
