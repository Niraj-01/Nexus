import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disabled: React Strict Mode double-invokes effects in dev, which causes
  // Firestore's onSnapshot listeners to subscribe/unsubscribe/resubscribe
  // faster than the SDK can handle, triggering internal assertion errors
  // (ID: ca9 / b815). This is a known Firestore SDK limitation.
  reactStrictMode: false,
};

export default nextConfig;
