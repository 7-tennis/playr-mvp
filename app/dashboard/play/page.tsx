import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { BookingIcon, ChallengeIcon, EventIcon, InviteIcon, ParticipationIcon } from "@/components/playr-icons";
import { StatusAlert } from "@/components/status-alert";
import { ActionCard, countLabel, errorMessage, inviteMessage, loadPlayData, resultMessage } from "@/app/dashboard/play/play-shared";

export const dynamic = "force-dynamic";

type DashboardPlayPageProps = {
  searchParams?: {
    invite?: string;
    result?: string;
    error?: string;
  };
};

export default async function DashboardPlayPage({ searchParams }: DashboardPlayPageProps) {
  const playData = await loadPlayData(searchParams);

  if (playData.kind === "no-config") {
    return (
      <PageShell eyebrow="Play" title="Supabase is not configured.">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <p className="text-slate-700">Add Supabase environment variables to use player features.</p>
        </div>
      </PageShell>
    );
  }

  if (playData.kind === "no-profile") {
    return (
      <PageShell eyebrow="Play" title="Create your Player Profile first.">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <p className="text-slate-700">You need an adult player profile before sending match invites for yourself or a linked junior.</p>
          <Link className="mt-5 inline-flex rounded bg-court-blue px-4 py-3 font-bold text-white" href="/dashboard/profile">
            Create my profile
          </Link>
        </div>
      </PageShell>
    );
  }

  const { bookings, closeSuggestions, strongerSuggestions, upcomingMatchInvites, receivedInvites, sentInvites, acceptedInvitesWithoutResult } = playData.data;
  const challengeCount = closeSuggestions.length + strongerSuggestions.length;

  return (
    <PageShell eyebrow="Play" subtitle="Start a match, find a challenge, and keep your match queue tidy." title="Play">
      <StatusAlert className="mb-5" message={inviteMessage(searchParams?.invite)} tone="success" />
      <StatusAlert className="mb-5" message={resultMessage(searchParams?.result)} tone="success" />
      <StatusAlert className="mb-5" message={errorMessage(searchParams?.error)} tone="error" />

      <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ActionCard
          action="Send Invite"
          description="Use an existing booking and invite someone to play."
          href="/dashboard/play/invite"
          icon={<InviteIcon size={22} />}
          meta={countLabel(bookings.length, "booking")}
          title="New Invite"
          tone="teal"
        />
        <ActionCard
          action="Start Match Request"
          description="Challenge first. Agree on court and time after they accept."
          href="/dashboard/play/plan-match"
          icon={<BookingIcon size={22} />}
          meta="Booking optional"
          title="Match Invite + Court Booking"
          tone="blue"
        />
        <ActionCard
          action="View Challenges"
          description="Find balanced matches and stronger tests."
          href="/dashboard/play/challenges"
          icon={<ParticipationIcon size={22} />}
          meta={countLabel(challengeCount, "suggestion")}
          title="Challenge Players"
          tone="green"
        />
        <ActionCard
          action="View Matches"
          description="See pending, accepted and result-ready matches."
          href="/dashboard/play/matches"
          icon={<EventIcon size={22} />}
          meta={countLabel(upcomingMatchInvites.length, "match", "matches")}
          title="Upcoming Matches"
          tone="navy"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="surface-card p-5">
          <p className="section-kicker">Match queue</p>
          <h2 className="section-title mt-2">What needs attention</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Received</p>
              <p className="mt-1 text-2xl font-black text-court-navy">{receivedInvites.length}</p>
            </div>
            <div className="rounded bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Sent</p>
              <p className="mt-1 text-2xl font-black text-court-navy">{sentInvites.length}</p>
            </div>
            <div className="rounded bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Results</p>
              <p className="mt-1 text-2xl font-black text-court-navy">{acceptedInvitesWithoutResult.length}</p>
            </div>
          </div>
          <Link className="btn-secondary mt-4" href="/dashboard/play/matches">
            Open Match Queue
          </Link>
        </div>

        <div className="rounded-lg border border-court-teal/25 bg-court-mist p-5">
          <div className="flex items-start gap-3">
            <ChallengeIcon className="mt-1 text-court-teal" size={20} />
            <div>
              <p className="font-black text-court-navy">Focused flows</p>
              <p className="mt-1 text-sm leading-6 text-court-ink">
                Invite, planning, challenges and matches now open as separate tasks. No more jumping to the bottom of the Play page.
              </p>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
