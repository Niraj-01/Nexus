"use client";

/**
 * Decides where a signed-in user should land.
 *
 * Always returns the fallback (default `/dashboard`). The dashboard
 * itself shows a "Finish onboarding" CTA when the user hasn't completed
 * their org profile, so we don't need to force-redirect anyone to
 * `/onboard` from sign-in. Returning users with completed onboarding
 * land directly on the dashboard.
 */
export async function routeAfterLogin(_uid: string, fallback: string = "/dashboard"): Promise<string> {
  return fallback;
}
