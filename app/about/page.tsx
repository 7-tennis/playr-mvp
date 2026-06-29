import { PageShell } from "@/components/page-shell";

export default function AboutPage() {
  return (
    <PageShell eyebrow="About" title="PlayR connects the tennis participation loop.">
      <div className="max-w-3xl space-y-4 text-slate-700">
        <p>
          PlayR is a connected tennis platform for player ratings, club events, court bookings, and coach feedback.
        </p>
        <p>
          This MVP keeps PlayR, ClubR, and future CoachR workflows in one role-based app. ClubR powers club/admin operations today, while CoachR feedback can be added once the core player and club loop is proven.
        </p>
      </div>
    </PageShell>
  );
}
