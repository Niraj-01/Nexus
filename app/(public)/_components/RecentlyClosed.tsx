import Link from "next/link";
import { adminDb, adminStorage } from "@/lib/firebase/admin";

interface ClosedTicketCard {
  id: string;
  title: string;
  hostName: string;
  hostType: "NGO" | "ORG";
  region: string;
  closedAt: number;
  contributorCount: number;
  totalDelivered: number;
  thumbUrl: string | null;
}

async function loadClosedTickets(limit: number): Promise<ClosedTicketCard[]> {
  let snap;
  try {
    snap = await adminDb
      .collection("tickets")
      .where("phase", "==", "CLOSED")
      .orderBy("closedAt", "desc")
      .limit(limit)
      .get();
  } catch {
    return [];
  }

  const cards = await Promise.all(
    snap.docs.map(async (d): Promise<ClosedTicketCard | null> => {
      const t = d.data();
      try {
        const [badgesSnap, proofsSnap] = await Promise.all([
          adminDb.collection("badges").where("ticketId", "==", d.id).get(),
          adminDb
            .collection("tickets")
            .doc(d.id)
            .collection("photoProofs")
            .limit(1)
            .get(),
        ]);
        const totalDelivered = badgesSnap.docs.reduce(
          (a, b) => a + Number(b.data().contributedValuationINR ?? 0),
          0,
        );

        let thumbUrl: string | null = null;
        const firstProof = proofsSnap.docs[0]?.data();
        if (firstProof?.storagePath) {
          try {
            const [url] = await adminStorage
              .bucket()
              .file(String(firstProof.storagePath))
              .getSignedUrl({
                action: "read",
                expires: Date.now() + 60 * 60 * 1000,
              });
            thumbUrl = url;
          } catch {
            thumbUrl = null;
          }
        }

        return {
          id: d.id,
          title: String(t.title ?? "(untitled)"),
          hostName: String(t.host?.name ?? "—"),
          hostType: (t.host?.type as "NGO" | "ORG") ?? "ORG",
          region: String(t.geo?.adminRegion ?? ""),
          closedAt: Number(t.closedAt ?? 0),
          contributorCount: Number(t.contributorCount ?? 0),
          totalDelivered,
          thumbUrl,
        };
      } catch {
        return null;
      }
    }),
  );

  return cards.filter((c): c is ClosedTicketCard => c !== null);
}

export async function RecentlyClosed() {
  const cards = await loadClosedTickets(6);
  if (cards.length === 0) return null;

  return (
    <section className="rc-section">
      <header className="rc-head">
        <h2 className="rc-title">Recently delivered</h2>
        <p className="rc-sub">
          Closed tickets across the network, with full attribution. Click any
          card for the public dossier.
        </p>
      </header>
      <div className="rc-grid">
        {cards.map((c) => (
          <ClosedCard key={c.id} card={c} />
        ))}
      </div>
    </section>
  );
}

function ClosedCard({ card }: { card: ClosedTicketCard }) {
  const closed = card.closedAt
    ? new Date(card.closedAt).toLocaleDateString()
    : "—";
  const fmt = (v: number) =>
    new Intl.NumberFormat("en-IN").format(Math.round(v));
  return (
    <Link href={`/ticket/${card.id}`} className="rc-card">
      <div className="rc-thumb">
        {card.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.thumbUrl} alt={card.title} loading="lazy" />
        ) : (
          <div className="rc-thumb-empty">No photo</div>
        )}
        <span className="rc-thumb-stamp">Closed</span>
      </div>
      <div className="rc-body">
        <h3 className="rc-card-title">{card.title}</h3>
        <span className="rc-card-meta">
          {card.hostName} · {card.hostType}
          {card.region ? ` · ${card.region}` : ""}
        </span>
        <div className="rc-card-foot">
          <span className="rc-card-amount">₹{fmt(card.totalDelivered)}</span>
          <span className="rc-card-contrib">
            {card.contributorCount}{" "}
            {card.contributorCount === 1 ? "contributor" : "contributors"} · {closed}
          </span>
        </div>
      </div>
    </Link>
  );
}
