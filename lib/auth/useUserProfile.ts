"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

type State =
  | { loading: true }
  | { loading: false; orgId: string | null; role: string | null };

/**
 * Live subscription to users/{uid} — returns the orgId/role from Firestore.
 *
 * Use this in place of `claims.orgId` when you need to know whether a user
 * has *finished onboarding*, regardless of whether their org has been
 * approved yet. claims.orgId is set only after PLATFORM_ADMIN approval, so
 * relying on the claim alone leaves "I onboarded but I'm waiting for
 * approval" users stuck on the "Finish onboarding" screen.
 */
export function useUserProfile(uid: string | null | undefined): State {
  const [state, setState] = useState<State>({ loading: true });

  useEffect(() => {
    if (!uid) {
      setState({ loading: false, orgId: null, role: null });
      return;
    }
    const unsub = onSnapshot(
      doc(db, "users", uid),
      (snap) => {
        const data = snap.data() as { orgId?: string | null; role?: string | null } | undefined;
        setState({
          loading: false,
          orgId: data?.orgId ?? null,
          role: data?.role ?? null,
        });
      },
      () => setState({ loading: false, orgId: null, role: null }),
    );
    return unsub;
  }, [uid]);

  return state;
}
