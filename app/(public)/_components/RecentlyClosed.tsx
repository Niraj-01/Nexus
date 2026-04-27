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
    <section
      className="container"
      style={{ padding: "48px 24px", maxWidth: 1080 }}
    >
      <header className="stack-sm" style={{ marginBottom: 24 }}>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          Recently delivered
        </h2>
        <p className="muted-text" style={{ fontSize: 14 }}>
          Closed tickets across the network, with full attribution.
        </p>
      </header>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
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
  return (
    <Link
      href={`/ticket/${card.id}`}
      className="card stack-sm"
      style={{
        textDecoration: "none",
        color: "inherit",
        display: "block",
        padding: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          aspectRatio: "16 / 9",
          background: "var(--color-surface-2)",
          position: "relative",
        }}
      >
        {card.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.thumbUrl}
            alt={card.title}
            loading="lazy"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--color-muted)",
              fontSize: 12,
            }}
          >
            No photo
          </div>
        )}
        <span
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            padding: "2px 6px",
            borderRadius: 4,
            background: "var(--color-success)",
            color: "white",
          }}
        >
          Closed
        </span>
      </div>
      <div className="stack-sm" style={{ padding: 14 }}>
        <h3 style={{ fontWeight: 600, fontSize: 16, margin: 0, lineHeight: 1.3 }}>
          {card.title}
        </h3>
        <span className="muted-text" style={{ fontSize: 12 }}>
          {card.hostName} · {card.hostType}
          {card.region ? ` · ${card.region}` : ""}
        </span>
        <div
          className="row"
          style={{
            justifyContent: "space-between",
            alignItems: "baseline",
            paddingTop: 6,
            borderTop: "1px solid var(--color-border)",
          }}
        >
          <span className="num" style={{ fontWeight: 700, fontSize: 16 }}>
            ₹
            {new Intl.NumberFormat("en-IN").format(
              Math.round(card.totalDelivered),
            )}
          </span>
          <span className="muted-text" style={{ fontSize: 12 }}>
            {card.contributorCount}{" "}
            {card.contributorCount === 1 ? "contributor" : "contributors"} ·{" "}
            {closed}
          </span>
        </div>
      </div>
    </Link>
  );
}
