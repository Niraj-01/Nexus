import { z } from "zod";

/**
 * Public-readable badge minted by `onTicketClosed` for the host and every
 * SIGNED_OFF contributor. `scorePct = proportionalSharePct * reliabilityMultiplier`
 * — proportional share comes from valuation, reliability is read from the
 * org doc at close time via `functions/src/lib/matching.ts:reliabilityScore`.
 *
 * Doc id is deterministic (`{ticketId}__{orgId}`) so badge minting is
 * idempotent on retry.
 */
export const BadgeRole = z.enum(["HOST", "CONTRIBUTOR"]);
export type BadgeRole = z.infer<typeof BadgeRole>;

export const BadgeSchema = z.object({
  ticketId: z.string(),
  orgId: z.string(),
  role: BadgeRole,
  ticketTitle: z.string(),
  ticketCategory: z.string(),
  contributedValuationINR: z.number().nonnegative(),
  totalTicketValuationINR: z.number().nonnegative(),
  proportionalSharePct: z.number().min(0).max(100),
  reliabilityMultiplier: z.number().min(0).max(1),
  scorePct: z.number().min(0).max(100),
  closedAt: z.number().int(),
  publicSlug: z.string(),
});
export type Badge = z.infer<typeof BadgeSchema>;
