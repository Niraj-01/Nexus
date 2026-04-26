import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { ADMIN_EMAIL, verifyAdminRequest } from "@/lib/admin/verifyAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const gate = await verifyAdminRequest(req);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: gate.status });
  }

  let body: { orgId?: string };
  try {
    body = (await req.json()) as { orgId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const orgId = (body.orgId ?? "").trim();
  if (!orgId) {
    return NextResponse.json({ error: "Missing orgId" }, { status: 400 });
  }

  const db = getFirestore();
  const auth = getAuth();

  const orgRef = db.collection("organizations").doc(orgId);
  const orgSnap = await orgRef.get();
  if (!orgSnap.exists) {
    return NextResponse.json({ error: "Org not found" }, { status: 404 });
  }

  await orgRef.update({ status: "ACTIVE", approvedAt: Date.now() });

  // In the self-onboard scheme, orgId == owner's uid.
  let owner;
  try {
    owner = await auth.getUser(orgId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.json(
      { error: `Org status set to ACTIVE, but owner lookup failed: ${msg}` },
      { status: 500 },
    );
  }

  const ownerEmail = (owner.email ?? "").toLowerCase();
  const role = ownerEmail === ADMIN_EMAIL ? "PLATFORM_ADMIN" : "ORG_ADMIN";

  try {
    await auth.setCustomUserClaims(orgId, { role, orgId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.json(
      { error: `Org status set to ACTIVE, but claim grant failed: ${msg}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, orgId, role });
}
