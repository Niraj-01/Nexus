import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

/**
 * Hardcoded platform admin email. Only this address is allowed to call
 * the /api/admin/* routes. Mirrors the allowlist in scripts/approveAll.ts.
 */
export const ADMIN_EMAIL = "dhrupadrajpurohit@gmail.com";

if (!getApps().length) {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  initializeApp({
    credential: sa ? cert(JSON.parse(sa)) : applicationDefault(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "buffet-493105",
  });
}

type Allowed = { ok: true; uid: string; email: string };
type Denied = { ok: false; status: number; message: string };

/**
 * Verify the caller is the hardcoded platform admin.
 *
 * Reads the Firebase ID token from `Authorization: Bearer ...`,
 * verifies it with the Admin SDK, and checks the email matches
 * ADMIN_EMAIL. Returns { ok: true, uid, email } if so, otherwise
 * a structured denial with HTTP status + reason.
 */
export async function verifyAdminRequest(req: Request): Promise<Allowed | Denied> {
  const header = req.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return { ok: false, status: 401, message: "Missing Bearer token" };
  }

  const idToken = header.slice("Bearer ".length).trim();
  if (!idToken) return { ok: false, status: 401, message: "Empty token" };

  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(idToken);
  } catch {
    return { ok: false, status: 401, message: "Invalid token" };
  }

  const email = (decoded.email ?? "").toLowerCase();
  if (email !== ADMIN_EMAIL) {
    return { ok: false, status: 403, message: "Not authorized" };
  }

  return { ok: true, uid: decoded.uid, email };
}
