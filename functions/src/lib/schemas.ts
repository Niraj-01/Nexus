/**
 * Input validation schemas — stub implementations using zod.
 * TODO: Replace with proper Zod schemas matching the full data models.
 */
import { z } from "zod";

// Stub for raising a ticket
export const RaiseTicketInputSchema = z.object({
  title: z.string().min(1),
  category: z.string(),
  description: z.string().optional(),
  location: z.string().optional(),
  urgency: z.string().optional(),
  deadline: z.string().optional(),
  needs: z.array(z.any()).optional(),
}).passthrough();

// Stub for pledging resources
export const PledgeInputSchema = z.object({
  ticketId: z.string().min(1),
  resource: z.string(),
  quantity: z.number().positive(),
  unit: z.string(),
}).passthrough();

// Stub for resource client writes
export const ResourceClientWriteSchema = z.object({
  name: z.string().min(1),
  category: z.string(),
  quantity: z.number().nonnegative(),
  unit: z.string(),
  location: z.any().optional(),
}).passthrough();

// Update payload — same shape as create plus resourceId. Body fields are
// validated leniently (server only writes editable fields explicitly below).
export const ResourceClientUpdateSchema = ResourceClientWriteSchema.extend({
  resourceId: z.string().min(1),
}).passthrough();

// Retry-embedding payload.
export const RetryResourceEmbeddingSchema = z.object({
  resourceId: z.string().min(1),
}).passthrough();

export type RaiseTicketInput = z.infer<typeof RaiseTicketInputSchema>;
export type PledgeInput = z.infer<typeof PledgeInputSchema>;
export type ResourceClientWrite = z.infer<typeof ResourceClientWriteSchema>;
export type ResourceClientUpdate = z.infer<typeof ResourceClientUpdateSchema>;
export type RetryResourceEmbedding = z.infer<typeof RetryResourceEmbeddingSchema>;
