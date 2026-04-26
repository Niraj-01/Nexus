"use client";

import { httpsCallable, type HttpsCallableResult } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import type {
  AdvancePhaseInput,
  PledgeInput,
  RaiseTicketInput,
  RecordSignoffInput,
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

export const callPledge = make<
  PledgeInput,
  { contributionId: string; progressPct: number }
>("pledge");

export const callAdvancePhase = make<
  AdvancePhaseInput,
  { phase: TicketPhase }
>("advancePhase");

export const callRecordSignoff = make<
  RecordSignoffInput,
  { signoffId: string }
>("recordSignoff");

export const callApproveOrg = make<
  { orgId: string; requestId: string },
  { ok: true; orgId: string; affectedUsers: number }
>("approveOrg");
