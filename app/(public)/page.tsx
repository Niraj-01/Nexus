import { HomeTopbar } from "./_components/HomeTopbar";
import { FeaturedStoryShow } from "./_components/FeaturedStoryShow";
import { RecentlyClosed } from "./_components/RecentlyClosed";
import { PublicActiveTickets } from "./_components/PublicActiveTickets";

export const revalidate = 30;

export default function HomePage() {
  return (
    <div className="landing-shell">
      <HomeTopbar />

      <main className="landing-main">
        {/* ── Impact Stories Carousel ── */}
        <section className="landing-stories-section">
          <FeaturedStoryShow />
        </section>

        {/* ── Active tickets — visible to all visitors ── */}
        <section className="public-tickets-section">
          <div className="public-tickets-head">
            <h2 className="public-tickets-title">Active tickets</h2>
            <p className="public-tickets-sub">
              Open requests from verified NGOs — see where your organisation can help.
            </p>
          </div>
          <PublicActiveTickets />
        </section>

        <RecentlyClosed />
      </main>
    </div>
  );
}
