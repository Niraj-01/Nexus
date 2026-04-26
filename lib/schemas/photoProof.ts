import { z } from "zod";

/**
 * Photo proof attached to a ticket during EXECUTION phase. Storage object
 * lives at `tickets/{ticketId}/photoProofs/{filename}`; this Firestore doc
 * carries the metadata. `uploaderOrgId` is checked at the rules layer to
 * match the caller's `request.auth.token.orgId` so a host can't forge it.
 */
export const PhotoProofSchema = z.object({
  uploaderOrgId: z.string(),
  storagePath: z.string(),
  caption: z.string().max(500).default(""),
  contentType: z.string(),
  size: z.number().int().positive(),
  createdAt: z.number().int(),
});
export type PhotoProof = z.infer<typeof PhotoProofSchema>;

/** Server fills nothing here — host writes uploaderOrgId/createdAt directly,
 * gated by firestore.rules photoProofs create branch. */
export const PhotoProofClientWriteSchema = PhotoProofSchema;
export type PhotoProofClientWrite = z.infer<typeof PhotoProofClientWriteSchema>;
