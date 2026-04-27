"use client";

import { httpsCallable, type HttpsCallableResult } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import type {
  AdvancePhaseInput,
  EmbeddingStatus,
  PledgeInput,
  RaiseTicketInput,
  RecordSignoffInput,
  ResourceClientUpdate,
  RespondToPledgeInput,
  ResourceClientWrite,
  TicketPhase,
} from "@/lib/schemas";

/** Typed wrapper around a callable. Region is pinned in client.ts. */
function make<Req, Res>(name: string) {
  const fn = httpsCallable<Req, Res>(functions, name);
  return async (data: Req): Promise<Res> => {
    const result: HttpsCallableResult<Res> = await fn(data);
    return result.data;
  };
}

export const callRaiseTicket = make<
  RaiseTicketInput,
  { ticketId: string; phase: "OPEN_FOR_CONTRIBUTIONS"; rapid: boolean }
>("raiseTicket");

export const callCreateResource = make<
  ResourceClientWrite,
  { resourceId: string }
>("createResource");

export const callUpdateResource = make<
  ResourceClientUpdate,
  { resourceId: string; embeddingStatus: EmbeddingStatus | "skipped" }
>("updateResource");

export const callRetryResourceEmbedding = make<
  { resourceId: string },
  { resourceId: string; embeddingStatus: EmbeddingStatus | "skipped" }
>("retryResourceEmbedding");

export const callPledge = make<
  PledgeInput,
  { contributionId: string; status: "PROPOSED" | "COMMITTED"; progressPct: number }
>("pledge");

export const callRespondToPledge = make<
  RespondToPledgeInput,
  { status: "COMMITTED" | "REJECTED"; progressPct?: number }
>("respondToPledge");

export const callAdvancePhase = make<
  AdvancePhaseInput,
  { phase: TicketPhase }
>("advancePhase");

export const callRecordSignoff = make<
  RecordSignoffInput,
  { signoffId: string }
>("recordSignoff");
