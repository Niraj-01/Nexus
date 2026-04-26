import { z } from "zod";
import { EmbeddingStatus, GeoSchema, ResourceCategory } from "./common";

export const TicketUrgency = z.enum(["NORMAL", "EMERGENCY"]);
export type TicketUrgency = z.infer<typeof TicketUrgency>;

export const TicketPhase = z.enum([
  "RAISED",
  "OPEN_FOR_CONTRIBUTIONS",
  "EXECUTION",
  "PENDING_SIGNOFF",
  "CLOSED",
]);
export type TicketPhase = z.infer<typeof TicketPhase>;

export const NeedSchema = z.object({
  resourceCategory: ResourceCategory,
  /** Free-text refinement inside category, e.g. "primary education" inside EDUCATION. Embedding input concatenates this when present. */
  subtype: z.string().max(80).optional(),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  valuationINR: z.number().nonnegative(),
  hostSelfPledge: z.object({
    quantity: z.number().nonnegative(),
    valuationINR: z.number().nonnegative(),
    pctOfNeed: z.number().min(0).max(100),
  }),
  // progressPct is server-written only
});
export type Need = z.infer<typeof NeedSchema>;

/**
 * Snapshot of the host org denormalized onto the ticket at raise time.
 * Set by `raiseTicket` callable. Lets ticket cards render host name + type
 * without a JOIN. Status is always ACTIVE at raise (only ACTIVE orgs can
 * raise) so we don't store it; reliability lives on the org doc and is
 * read separately when needed.
 */
export const TicketHostSnapshotSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["NGO", "ORG"]),
});
export type TicketHostSnapshot = z.infer<typeof TicketHostSnapshotSchema>;

/** Full server-side shape, including locked fields. */
export const TicketSchema = z.object({
  hostOrgId: z.string(),
  host: TicketHostSnapshotSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  urgency: TicketUrgency,
  rapid: z.boolean(),
  needs: z.array(NeedSchema.extend({ progressPct: z.number().min(0).max(100) })).min(1),
  geo: GeoSchema,
  deadline: z.number().int(),
  phase: TicketPhase,
  progressPct: z.number().min(0).max(100),
  advancedEarly: z.boolean().default(false),
  createdAt: z.number().int(),
  phaseChangedAt: z.number().int(),
  /** Bumped on commit, phase-change, proof, signoff. Drives dashboard sort. */
  lastUpdatedAt: z.number().int(),
  closedAt: z.number().int().nullable().default(null),
  /**
   * Set of orgIds participating as host or contributor. Initialized to
   * [hostOrgId] at raise; contributors union-added on commit (Flow A:
   * onAgreementFullySigned; Flow B: pledge). Single source for the dashboard
   * Active Tickets query (`array-contains` viewerOrgId). Cap 50 — full list
   * still queryable via the contributions subcollection.
   */
  participantOrgIds: z.array(z.string()).max(50),
  /** Distinct committed contributors (host excluded). Bumped in same txn as participantOrgIds. */
  contributorCount: z.number().int().nonnegative(),
  // Server-written embedding lifecycle (mirrors resource.ts); filled by onTicketCreated.
  embeddingVersion: z.string().nullable().optional(),
  embeddingStatus: EmbeddingStatus.optional(),
});
export type Ticket = z.infer<typeof TicketSchema>;

/** Client-writable create payload. Server fills phase/progress/needs[].progressPct/rapid/host/participantOrgIds/contributorCount/lastUpdatedAt/embedding. */
export const RaiseTicketInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(10),
  category: z.string().min(1),
  urgency: TicketUrgency,
  needs: z.array(NeedSchema).min(1),
  geo: GeoSchema,
  deadline: z.number().int(),
  requestId: z.string().min(8),
});
export type RaiseTicketInput = z.infer<typeof RaiseTicketInputSchema>;

/**
 * Host-only phase advance. Two legal targets per the lifecycle state machine:
 * OPEN_FOR_CONTRIBUTIONS → EXECUTION (no progress floor — host owns the
 * judgment), and EXECUTION → PENDING_SIGNOFF (requires ≥1 photo proof).
 */
export const AdvancePhaseInputSchema = z.object({
  ticketId: z.string().min(1),
  target: z.enum(["EXECUTION", "PENDING_SIGNOFF"]),
  requestId: z.string().min(8),
});
export type AdvancePhaseInput = z.infer<typeof AdvancePhaseInputSchema>;
