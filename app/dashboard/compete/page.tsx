import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { ChallengeIcon, EventIcon, InviteIcon, MatchIcon, TimeIcon } from "@/components/playr-icons";
import { EmptyState, SectionError, SectionHeader } from "@/components/playr-ui";
import { StatusAlert } from "@/components/status-alert";
import { ActionCard, countLabel, errorMessage, inviteMessage, loadPlayData, resultMessage, UpcomingMatchCard } from "@/app/dashboard/play/play-shared";
import { formatDateTime } from "@/lib/courtside-format";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { CourtSideEvent } from "@/types/courtside";

export const dynamic = "force-dynamic";

type CompetePageProps = {
  searchParams?: { error?: string; invite?: string; player?: string; result?: string };
};

export default async function CompetePage({ searchParams }: CompetePageProps) {
  const playData = await loadPlayData(searchParams);

  if (playData.kind === "no-config") {
    return <PageShell eyebrow="Competitive play" subtitle="Join events, challenge players and manage matches." title="Compete"><div className="empty-state">Add Supabase environment variables to use competitive features.</div></PageShell>;
  }

  if (playData.kind === "no-profile") {
    return (
      <PageShell eyebrow="Competitive play" subtitle="Join events, challenge players and manage matches." title="Compete">
        <EmptyState actions={<Link className="btn-primary" href="/dashboard/settings">Create player profile</Link>} description="You need an adult player profile before sending invites or entering events." icon={<MatchIcon className="text-court-teal" size={28} />} title="Create your player profile first" />
      </PageShell>
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data: eventData, error: eventError } = await supabase
    .from("events")
    .select("id,title,start_datetime,location,event_type,category")
    .eq("status", "published")
    .gte("start_datetime", new Date().toISOString())
    .order("start_datetime", { ascending: true })
    .limit(3);
  const events = (eventData ?? []) as Pick<CourtSideEvent, "id" | "title" | "start_datetime" | "location" | "event_type" | "category">[];
  const { data } = playData;
  const challengeCount = data.closeSuggestions.length + data.strongerSuggestions.length;

  return (
    <PageShell eyebrow="Competitive play" subtitle="Join events, challenge players and manage matches." title="Compete">
      <StatusAlert className="mb-5" message={inviteMessage(searchParams?.invite)} tone="success" />
      <StatusAlert className="mb-5" message={resultMessage(searchParams?.result)} tone="success" />
      <StatusAlert className="mb-5" message={errorMessage(searchParams?.error)} tone="error" />

      <section aria-labelledby="competitive-actions" className="mb-8">
        <SectionHeader className="mb-4" description="Choose one clear next step." title="Competitive actions" />
        <h2 className="sr-only" id="competitive-actions">Competitive actions</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <ActionCard action="Challenge a Player" description="Find a balanced match or a stronger test." href="/dashboard/play/challenges" icon={<ChallengeIcon size={22} />} meta={countLabel(challengeCount, "suggestion")} title="Match Challenges" tone="green" />
          <ActionCard action="Invite to a Match" description="Invite another player with an existing booking or plan the court later." href="/dashboard/play/invite" icon={<InviteIcon size={22} />} meta={countLabel(data.bookings.length, "booking")} title="New Match Invite" tone="teal" />
          <ActionCard action="Browse Events" description="Find formal events and competitions for your linked players." href="/dashboard/events" icon={<EventIcon size={22} />} meta={countLabel(events.length, "upcoming")} title="Events & Competitions" tone="navy" />
        </div>
      </section>

      <section className="mb-8" aria-labelledby="upcoming-matches">
        <SectionHeader action={<Link className="btn-secondary" href="/dashboard/play/matches">Open match queue</Link>} className="mb-4" description={`${data.receivedInvites.length} received · ${data.sentInvites.length} sent · ${data.acceptedInvitesWithoutResult.length} result-ready`} title="Upcoming Matches" />
        <h2 className="sr-only" id="upcoming-matches">Upcoming Matches</h2>
        {data.inviteError || data.matchError ? <SectionError description="Competitive activity could not be loaded right now." /> : data.upcomingMatchInvites.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">{data.upcomingMatchInvites.slice(0, 4).map((invite) => <UpcomingMatchCard invite={invite} key={invite.id} ownProfileIds={data.ownProfileIds} />)}</div>
        ) : (
          <EmptyState description="Challenges and accepted match invitations will appear here." icon={<MatchIcon className="text-court-teal" size={26} />} title="No upcoming matches" />
        )}
      </section>

      <section aria-labelledby="events-competitions">
        <SectionHeader action={<Link className="btn-secondary" href="/dashboard/events">View all events</Link>} className="mb-4" description="Formal events stay distinct from casual match challenges." title="Events & Competitions" />
        <h2 className="sr-only" id="events-competitions">Events and competitions</h2>
        {eventError ? <SectionError description="Events and competitions could not be loaded right now." /> : events.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {events.map((event) => (
              <Link className="group rounded-playr-lg border border-playr-border-subtle bg-white p-5 shadow-playr-subtle transition hover:-translate-y-0.5 hover:border-court-teal hover:shadow-playr-card focus-ring" href={`/dashboard/events/${event.id}`} key={event.id}>
                <span className="grid h-11 w-11 place-items-center rounded-playr-md bg-court-mist text-court-teal"><EventIcon size={21} /></span>
                <h3 className="mt-4 text-lg font-black text-court-navy">{event.title}</h3>
                <p className="mt-2 flex items-center gap-2 text-sm font-bold text-slate-600"><TimeIcon size={15} /> {formatDateTime(event.start_datetime)}</p>
                <p className="mt-1 text-sm text-slate-600">{event.location ?? "Venue to be confirmed"}</p>
              </Link>
            ))}
          </div>
        ) : <EmptyState description="Published events will appear here when entries open." icon={<EventIcon className="text-court-teal" size={26} />} title="No upcoming events" />}
      </section>
    </PageShell>
  );
}
