"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where, limit } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { TicketCard } from "@/components/TicketCard";

export function PublicActiveTickets() {
  const [activeTickets, setActiveTickets] = useState<any[] | null>(null);

  useEffect(() => {
    // We only want active tickets (not closed or pending signoff)
    // The ACTIVE_PHASES in mock were PLANNING, MATCHING, EXECUTION
    // Real ticket phases: RAISED, OPEN_FOR_CONTRIBUTIONS, EXECUTION, PENDING_SIGNOFF, CLOSED
    const q = query(
      collection(db, "tickets"),
      where("phase", "in", ["RAISED", "OPEN_FOR_CONTRIBUTIONS", "EXECUTION"]),
      orderBy("createdAt", "desc"),
      limit(12)
    );
    
    const unsub = onSnapshot(
      q,
      (snap) => {
        const out = snap.docs.map((d) => {
          const x = d.data();
          const geo = (x.geo as { adminRegion?: string }) ?? {};
          return {
            id: d.id,
            title: String(x.title ?? "Untitled"),
            category: String(x.category ?? "—"),
            location: String(geo.adminRegion ?? "—"),
            deadline: Number(x.deadline ?? 0),
            urgency: x.urgency === "EMERGENCY" ? "Emergency" : "Normal",
            phase: x.phase ?? "OPEN_FOR_CONTRIBUTIONS",
            completion_percentage: Number(x.progressPct ?? 0),
            mode: x.rapid ? "RAPID" : "STANDARD",
          };
        });
        setActiveTickets(out);
      },
      (error) => {
        console.error("Error fetching active tickets:", error);
        setActiveTickets([]);
      }
    );
    
    return unsub;
  }, []);

  if (activeTickets === null) {
    return <p className="muted-text">Loading active tickets…</p>;
  }

  if (activeTickets.length === 0) {
    return <p className="muted-text">No active tickets at the moment. Check back later.</p>;
  }

  return (
    <div className="tkt-grid">
      {activeTickets.map((ticket) => (
        <TicketCard
          key={ticket.id}
          ticket={ticket}
          hrefBase="/explore/tickets"
        />
      ))}
    </div>
  );
}
