"use client";

import { doc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { OnboardingData } from "@/lib/schemas";
import type { DocsByType } from "./types";

export class OnboardingDataIncompleteError extends Error {
  constructor(public missing: string[]) {
    super(`Onboarding data incomplete: missing ${missing.join(", ")}`);
  }
}

/**
 * Validates collected data and writes it to Firestore in a single batch:
 *   - organizations/{uid} with status="PENDING_REVIEW"
 *   - users/{uid}.orgId = uid (merge)
 *
 * firestore.rules self-create branch requires orgId == request.auth.uid,
 * status == "PENDING_REVIEW", and NO reliability / badges fields on the payload.
 *
 * govtDocs[] — built from uploaded Firebase Storage refs captured during onboarding.
 * Storage.rules parallel self-upload branch should allow orgs/{uid}/govtDocs/* writes
 * when orgId == request.auth.uid.
 */
export async function finalizeOrg(
  uid: string,
  data: OnboardingData,
  docs: DocsByType,
): Promise<string> {
  const missing: string[] = [];
  if (!data.type) missing.push("type");
  if (!data.legalName) missing.push("legalName");
  if (!data.email) missing.push("email");
  if (!data.geo?.adminRegion) missing.push("geo.adminRegion");
  if (typeof data.geo?.lat !== "number") missing.push("geo.lat");
  if (typeof data.geo?.lng !== "number") missing.push("geo.lng");

  const uploadedDocTypes = Object.keys(docs) as Array<keyof DocsByType>;
  if (uploadedDocTypes.length === 0) {
    missing.push("at least one document photo");
  }

  if (missing.length) throw new OnboardingDataIncompleteError(missing);

  // Build govtDocs[] from the uploaded Storage entries. Matches GovtDocSchema shape.
  const govtDocs = uploadedDocTypes.flatMap((t) => {
    const d = docs[t];
    if (!d) return [];
    return [{
      docType: d.docType,
      fileUrl: d.fileUrl,
      extractedFields: {},
      verifiedAt: null,
      verifiedBy: null,
    }];
  });

  // Keep the older boolean map too — still used by the form page, admin dashboard, etc.
  const docBooleans = uploadedDocTypes.reduce<Record<string, boolean>>((acc, t) => {
    const key = String(t).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (docs[t]) acc[key] = true;
    return acc;
  }, {});

  const batch = writeBatch(db);

  batch.set(doc(db, "organizations", uid), {
    name: data.legalName,
    type: data.type,
    govtDocs,
    status: "PENDING_REVIEW",
    geo: {
      lat: data.geo!.lat,
      lng: data.geo!.lng,
      adminRegion: data.geo!.adminRegion,
      operatingAreas: data.geo!.operatingAreas ?? [],
    },
    contact: {
      email: data.email!,
      phone: data.phone ?? "",
    },
    docsUploaded: docBooleans,
    createdAt: Date.now(),
    // INTENTIONALLY OMITTED: reliability, badges — rules forbid client writes
    // to these; server fills reliability on approveOrg.
  });

  // Only attach orgId — do NOT overwrite role. ensureUserDoc already set
  // role on first sign-in, and platform admins (bootstrapPlatformAdmin) may
  // have upgraded it to PLATFORM_ADMIN. Stomping role here would later cause
  // approveOrg to demote them back to ORG_ADMIN when they approve their own org.
  batch.set(
    doc(db, "users", uid),
    { orgId: uid, updatedAt: Date.now() },
    { merge: true },
  );

  await batch.commit();
  return uid;
}
