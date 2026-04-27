import { z } from "zod";

export const ContributionStatus = z.enum([
  "PROPOSED",
  "AGREEMENT_PENDING",
  "COMMITTED",
  "EXECUTED",
  "SIGNED_OFF",
  "DISPUTED",
  "REJECTED",
]);
export type ContributionStatus = z.infer<typeof ContributionStatus>;

export const CommitPath = z.enum(["AGREEMENT_FIRST", "PLEDGE_FIRST"]);
export type CommitPath = z.infer<typeof CommitPath>;

export const OfferedSchema = z.object({
  kind: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  valuationINR: z.number().nonnegative(),
  pctOfNeed: z.number().min(0).max(100),
  notes: z.string().default(""),
});

export const ContributionSchema = z.object({
  contributorOrgId: z.string(),
  // Required: every pledge must reference a resource doc owned by the
  // contributor org. Enforced server-side in pledge.ts.
  resourceId: z.string().min(1),
  needIndex: z.number().int().nonnegative(),
  offered: OfferedSchema,
  status: ContributionStatus,
  commitPath: CommitPath,
  agreementId: z.string().optional(),
  requestId: z.string().min(8),
  createdAt: z.number().int(),
  committedAt: z.number().int().optional(),
  signedOffAt: z.number().int().optional(),
  rejectedAt: z.number().int().optional(),
  rejectReason: z.string().max(500).optional(),
});
export type Contribution = z.infer<typeof ContributionSchema>;

/**
 * Client input for /pledge. The contributor names a resource and a quantity;
 * the server derives `kind`, `unit`, `valuationINR`, and `pctOfNeed` from
 * the referenced `resources/{resourceId}` doc. This kills the inflate-the-
 * progress-bar attack (V3, V14 in the audit).
 */
export const PledgeInputSchema = z.object({
  ticketId: z.string(),
  resourceId: z.string().min(1),
  needIndex: z.number().int().nonnegative(),
  quantity: z.number().positive(),
  notes: z.string().max(1000).default(""),
  requestId: z.string().min(8),
});
export type PledgeInput = z.infer<typeof PledgeInputSchema>;

/** Host APPROVE/REJECT input for a PROPOSED contribution. */
export const RespondToPledgeInputSchema = z.object({
  ticketId: z.string().min(1),
  contributionId: z.string().min(1),
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().max(500).default(""),
  requestId: z.string().min(8),
});
export type RespondToPledgeInput = z.infer<typeof RespondToPledgeInputSchema>;
