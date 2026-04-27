"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TicketDetail } from "./_components/TicketDetail";

export default function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: ticketId } = use(params);

  return (
    <div className="td-shell">
      <Link href="/tickets" className="td-back" style={{ textDecoration: "none" }}>
        <ArrowLeft size={15} /> Back to tickets
      </Link>
      <TicketDetail ticketId={ticketId} />
    </div>
  );
}
