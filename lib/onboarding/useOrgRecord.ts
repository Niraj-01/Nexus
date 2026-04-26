"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { OrgStatus, OrgType } from "@/lib/schemas";
import { isOrgComplete } from "./requirements";

export type OrgRecordState =
  | { loading: true }
  | { loading: false; exists: false }
  | {
      loading: false;
      exists: true;
      name: string | null;
      type: OrgType | null;
      status: OrgStatus | null;
      docsUploaded: Record<string, boolean>;
      isComplete: boolean;
    };

/**
 * Live subscription to organizations/{uid} — returns the org record plus
 * a derived `isComplete` flag. Used by /onboard layout, the type-picker
 * gate, and the dashboard to decide whether to expose "edit" affordances.
 *
 * In our self-onboard scheme orgId == userUid, so passing the user's uid
 * is correct.
 */
export function useOrgRecord(uid: string | null | undefined): OrgRecordState {
  const [state, setState] = useState<OrgRecordState>({ loading: true });

  useEffect(() => {
    if (!uid) {
      setState({ loading: false, exists: false });
      return;
    }
    const unsub = onSnapshot(
      doc(db, "organizations", uid),
      (snap) => {
        if (!snap.exists()) {
          setState({ loading: false, exists: false });
          return;
        }
        const data = snap.data() as Record<string, unknown>;
        const rawType = data.type;
        const type: OrgType | null =
          rawType === "NGO" || rawType === "ORG" ? rawType : null;
        const rawStatus = data.status;
        const status =
          typeof rawStatus === "string" ? (rawStatus as OrgStatus) : null;
        const name = typeof data.name === "string" ? data.name : null;
        const docsUploaded =
          (data.docsUploaded as Record<string, boolean> | undefined) ?? {};
        setState({
          loading: false,
          exists: true,
          name,
          type,
          status,
          docsUploaded,
          isComplete: isOrgComplete({ type, docsUploaded }),
        });
      },
      () => setState({ loading: false, exists: false }),
    );
    return unsub;
  }, [uid]);

  return state;
}
