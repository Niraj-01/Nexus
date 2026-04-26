"use client";

import { doc, getDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { OnboardingData } from "@/lib/schemas";
import type { DocsByType } from "./types";

export class OnboardingDataIncompleteError extends Error {
  constructor(public missing: string[]) {
    super(`Onboarding data incomplete: missing ${missing.join(", ")}`);
  }
}

/**
 * Save (create or update) the user's organization profile.
 *
 * Behavior:
 *   - If organizations/{uid} doesn't exist: creates it with status="PENDING_REVIEW"
 *     (rules: matches the self-create branch — orgId==uid, status set, no reliability/badges).
 *   - If it does exist: merges the new payload over the old (rules: matches the
 *     self-update branch which mirrors self-create's constraints). status, createdAt,
 *     reliability, and badges are intentionally not in the update payload, so they're
 *     preserved.
 *   - govtDocs/docsUploaded are only written when the caller passed at least one
 *     uploaded doc this session, so re-submitting an edit with no new docs preserves
 *     the existing docs.
 *
 * Always merge-writes users/{uid}.orgId = uid. Never touches role, since
 * ensureUserDoc seeded it and platform admins must keep PLATFORM_ADMIN.
 */
export async function finalizeOrg(
  uid: string,
  data: OnboardingData,
  docs: DocsByType,
): Promise<string> {
  const orgRef = doc(db, "organizations", uid);
  const existingSnap = await getDoc(orgRef);
  const isEdit = existingSnap.exists();
  const existing = isEdit ? (existingSnap.data() as Record<string, unknown>) : null;

  const missing: string[] = [];
  if (!data.type) missing.push("type");
  if (!data.legalName) missing.push("legalName");
  if (!data.email) missing.push("email");
  if (!data.geo?.adminRegion) missing.push("geo.adminRegion");
  if (typeof data.geo?.lat !== "number") missing.push("geo.lat");
  if (typeof data.geo?.lng !== "number") missing.push("geo.lng");

  const uploadedDocTypes = Object.keys(docs) as Array<keyof DocsByType>;
  // For brand-new orgs we require at least one doc; edits may save text-only changes.
  if (!isEdit && uploadedDocTypes.length === 0) {
    missing.push("at least one document photo");
  }

  if (missing.length) throw new OnboardingDataIncompleteError(missing);

  // Type immutability: once an org is created with a type, that type is
  // locked. Any client path that tries to change it (URL tampering, chat
  // misfire, manual session edit) gets rejected here.
  const existingType = existing?.type;
  if (isEdit && existingType && existingType !== data.type) {
    throw new Error(
      `Org type is locked to ${String(existingType)} and cannot be changed to ${String(data.type)}.`,
    );
  }

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

  const docBooleans = uploadedDocTypes.reduce<Record<string, boolean>>((acc, t) => {
    const key = String(t).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (docs[t]) acc[key] = true;
    return acc;
  }, {});

  const orgPayload: Record<string, unknown> = {
    name: data.legalName,
    type: data.type,
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
    updatedAt: Date.now(),
  };

  if (!isEdit) {
    // Self-create branch in firestore.rules requires status: PENDING_REVIEW.
    orgPayload.status = "PENDING_REVIEW";
    orgPayload.createdAt = Date.now();
  }

  // Only update doc fields if the user uploaded new docs this session;
  // otherwise let merge:true preserve the existing govtDocs/docsUploaded.
  if (uploadedDocTypes.length > 0) {
    orgPayload.govtDocs = govtDocs;
    orgPayload.docsUploaded = docBooleans;
  }

  const batch = writeBatch(db);
  batch.set(orgRef, orgPayload, { merge: true });
  batch.set(
    doc(db, "users", uid),
    { orgId: uid, updatedAt: Date.now() },
    { merge: true },
  );

  await batch.commit();
  return uid;
}
