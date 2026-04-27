import { z } from "zod";
import { EmbeddingStatus, GeoSchema, ResourceCategory } from "./common";

export const ResourceStatus = z.enum(["AVAILABLE", "RESERVED", "DEPLETED"]);
export type ResourceStatus = z.infer<typeof ResourceStatus>;

export const EmergencyContractSchema = z.object({
  enabled: z.boolean().default(false),
  emergencyCategories: z.array(z.string()).default([]),
  maxQuantityPerTicket: z.number().int().positive().default(0),
  autoNotify: z.boolean().default(false),
});

export const ResourceSchema = z.object({
  orgId: z.string(),
  category: ResourceCategory,
  title: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  valuationINR: z.number().nonnegative(),
  terms: z.object({
    availableFrom: z.number().int(),
    availableUntil: z.number().int(),
    conditions: z.string().default(""),
  }),
  geo: GeoSchema.extend({
    serviceRadiusKm: z.number().nonnegative().default(0),
  }),
  emergencyContract: EmergencyContractSchema,
  status: ResourceStatus.default("AVAILABLE"),
  // Sum of `offered.quantity` across all COMMITTED/EXECUTED/SIGNED_OFF
  // contributions referencing this resource. Server-written by inventory
  // helpers in `functions/src/lib/inventory.ts`.
  reservedQuantity: z.number().nonnegative().default(0),
  // Server-written lifecycle — never set by client. Embedding (768d) lives here
  // on success; absent during pending/failed states.
  embeddingVersion: z.string().nullable().optional(),
  embeddingStatus: EmbeddingStatus.optional(),
});
export type Resource = z.infer<typeof ResourceSchema>;

/**
 * Explicit safe subset for client writes — omits all server-written lifecycle
 * fields, adds a client-generated requestId for idempotency. Callable + rules
 * both enforce this shape.
 */
export const ResourceClientWriteSchema = ResourceSchema.omit({
  orgId: true,            // set from request.auth, not the body
  status: true,           // server sets AVAILABLE on create, later driven by contributions
  reservedQuantity: true, // server-written; reservation bookkeeping
  embeddingVersion: true,
  embeddingStatus: true,
}).extend({
  requestId: z.string().min(8),
});
/** After zod defaults resolve — shape sent to the callable. */
export type ResourceClientWrite = z.infer<typeof ResourceClientWriteSchema>;
/** Pre-defaults shape — used by the react-hook-form form type. */
export type ResourceClientWriteInput = z.input<typeof ResourceClientWriteSchema>;

/**
 * Update payload — same editable fields as create plus the resourceId.
 * Server enforces ownership and refuses to touch status/embedding fields.
 */
export const ResourceClientUpdateSchema = ResourceClientWriteSchema.extend({
  resourceId: z.string().min(1),
});
export type ResourceClientUpdate = z.infer<typeof ResourceClientUpdateSchema>;
export type ResourceClientUpdateInput = z.input<typeof ResourceClientUpdateSchema>;
