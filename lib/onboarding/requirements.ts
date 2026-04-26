import type { OrgType } from "@/lib/schemas";
import type { DocType } from "@/app/(app)/onboard/_lib/types";

/**
 * Single source of truth for which government documents each org type
 * must upload to be considered "complete". Used by:
 *   - DocPicker grid (which docs to render)
 *   - OnboardingFormPage validation
 *   - useOrgRecord / dashboard / onboard layout (gating)
 */
export const REQUIRED_DOCS_BY_TYPE: Record<OrgType, DocType[]> = {
  NGO: ["PAN", "REG_CERT", "80G", "12A"],
  ORG: ["PAN", "REG_CERT", "GST", "CIN"],
};

/** Required doc list for a given type. Falls back to PAN + REG_CERT when type is unknown. */
export function requiredDocs(type: OrgType | undefined | null): DocType[] {
  if (type === "NGO") return REQUIRED_DOCS_BY_TYPE.NGO;
  if (type === "ORG") return REQUIRED_DOCS_BY_TYPE.ORG;
  return ["PAN", "REG_CERT"];
}

/**
 * Mirror the key normalization in finalize.ts: lowercase, alphanumeric only.
 * Keep this in sync with the docBooleans builder there.
 */
export function docsUploadedKey(docType: DocType): string {
  return String(docType).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * An org is "complete" iff its type is set AND every required document
 * type for that org is marked true in `docsUploaded`.
 */
export function isOrgComplete(org: {
  type?: OrgType | string | null;
  docsUploaded?: Record<string, boolean> | null;
}): boolean {
  const type = (org.type === "NGO" || org.type === "ORG") ? org.type : null;
  if (!type) return false;
  const uploaded = org.docsUploaded ?? {};
  return requiredDocs(type).every((d) => uploaded[docsUploadedKey(d)] === true);
}
