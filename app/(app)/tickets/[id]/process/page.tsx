import { redirect } from "next/navigation";

export default async function TicketProcessRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/tickets/${id}`);
}
