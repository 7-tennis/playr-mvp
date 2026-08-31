import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { ChallengeIcon, EventIcon, MatchIcon, ParticipationIcon, RatingIcon, StatusIcon, TimeIcon } from "@/components/playr-icons";
import { EmptyState, SectionError, SectionHeader } from "@/components/playr-ui";
import { StatusAlert } from "@/components/status-alert";
import {
  ActionCard,
  ResultCard,
  countLabel,
  errorMessage,
  inviteMessage,
  loadPlayData,
  resultMessage,
  UpcomingMatchCard
} from "@/app/dashboard/play/play-shared";
import { formatDateTime, formatLabel } from "@/lib/courtside-format";
import { eventAudienceLabel, eventMatchesProfile, eventVisual, isRatingRelevantEvent } from "@/lib/event-visuals";
import { eventStaffRoleLabel, loadMyEventStaffAssignments, loadProfileEventRelevance, partitionProfileEvents, type ProfileEventRelevance } from "@/lib/event-relevance";
import { rankingCategoryForProfile, rankingCategoryLabel } from "@/lib/ranking-categories";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { CourtSideEvent } from "@/types/courtside";

export const dynamic = "force-dynamic";

type CompetePageProps = {
  searchParams?: { error?: string; invite?: string; player?: string; result?: string };
};

type EventEntrySummary = {
  entry_status: string;
  event_id: string;
  payment_status: string;
};

function competeHref(playerId: string) {
  return `/dashboard/compete?player=${encodeURIComponent(playerId)}`;
}

function RelevantEventCard({ event, playerId }: { event: ProfileEventRelevance; playerId: string }) {
  return <article className="surface-card p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="section-kicker">{formatLabel(event.host_type)} · {formatLabel(event.visibility)}{event.junior_stage ? ` · ${formatLabel(event.junior_stage)}` : ""}</p><h3 className="mt-1 font-black text-court-navy">{event.title}</h3><p className="mt-1 text-sm font-semibold text-slate-600">{event.host_name} · {formatDateTime(event.starts_at)}</p><p className="mt-2 text-sm text-slate-600">{event.location ?? "Location to be confirmed"}</p></div><span className={`ui-chip ${event.is_assigned ? "ui-chip-success" : event.visibility === "open" ? "ui-chip-brand" : "ui-chip-muted"}`}>{event.is_assigned ? "Selected" : event.visibility === "open" ? "Open" : "Eligible"}</span></div><p className="mt-3 text-sm font-bold text-court-teal">{event.relevance_reason}</p><Link className="btn-secondary mt-4" href={`/dashboard/compete/events/${event.event_id}?player=${encodeURIComponent(playerId)}`}>View event</Link></article>;
}

export default async function CompetePage({ searchParams }: CompetePageProps) {
  const playData = await loadPlayData(searchParams);

  if (playData.kind === "no-config") {
    return <PageShell eyebrow="Competitive play" subtitle="Events, challenges and match activity in one place." title="Compete"><div className="empty-state">Add Supabase environment variables to use competitive features.</div></PageShell>;
  }

  if (playData.kind === "no-profile") {
    return (
      <PageShell eyebrow="Competitive play" subtitle="Events, challenges and match activity in one place." title="Compete">
        <EmptyState actions={<Link className="btn-primary" href="/dashboard/settings">Create player profile</Link>} description="You need an adult player profile before sending invites or entering events." icon={<MatchIcon className="text-court-teal" size={28} />} title="Create your player profile first" />
      </PageShell>
    );
  }

  const { data } = playData;
  const selectedPlayer = data.selectedProfile;
  const selectedPlayerIds = [selectedPlayer.id];
  const selectedCategory = rankingCategoryForProfile(selectedPlayer);
  const supabase = await createServerSupabaseClient();
  const [{ data: eventData, error: eventError }, { data: entryData }, relevanceResult, staffEventsResult] = await Promise.all([
    supabase.from("events").select("*").is("venue_id", null).eq("status", "published").gte("start_datetime", new Date().toISOString()).order("start_datetime", { ascending: true }),
    supabase.from("event_entries").select("event_id,entry_status,payment_status").eq("profile_id", selectedPlayer.id).neq("entry_status", "cancelled"),
    loadProfileEventRelevance(supabase, selectedPlayer.id),
    loadMyEventStaffAssignments(supabase)
  ]);
  const eligibleEvents = ((eventData ?? []) as CourtSideEvent[]).filter((event) => eventMatchesProfile(event, selectedPlayer));
  const entriesByEvent = new Map(((entryData ?? []) as EventEntrySummary[]).map((entry) => [entry.event_id, entry]));
  const selectedInvites = data.invites.filter((invite) => selectedPlayerIds.includes(invite.inviter_profile_id) || selectedPlayerIds.includes(invite.opponent_profile_id));
  const upcomingInvites = selectedInvites.filter((invite) => ["pending", "accepted"].includes(invite.status)).slice(0, 4);
  const actionInvites = selectedInvites.filter((invite) => invite.status === "pending" && invite.opponent_profile_id === selectedPlayer.id);
  const selectedMatches = data.matches.filter((match) => match.inviter_profile_id === selectedPlayer.id || match.opponent_profile_id === selectedPlayer.id);
  const actionMatches = selectedMatches.filter((match) => match.verification_status === "pending_confirmation" && match.submitted_by_user_id !== data.userId);
  const recentResults = selectedMatches.filter((match) => ["verified", "disputed", "rejected"].includes(match.verification_status)).slice(0, 3);
  const challengeCount = data.closeSuggestions.length + data.strongerSuggestions.length;
  const actionCount = actionInvites.length + actionMatches.length;
  const relevant = partitionProfileEvents(relevanceResult.data);

  return (
    <PageShell eyebrow="Competitive play" subtitle={`${selectedPlayer.first_name}'s events, challenges and match activity.`} title="Compete">
      <StatusAlert className="mb-5" message={inviteMessage(searchParams?.invite)} tone="success" />
      <StatusAlert className="mb-5" message={resultMessage(searchParams?.result)} tone="success" />
      <StatusAlert className="mb-5" message={errorMessage(searchParams?.error)} tone="error" />

      <section className="surface-card mb-5 p-4 sm:p-5" aria-label="Selected player">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="section-kicker">Player scope</p><h2 className="section-title mt-1">{selectedPlayer.first_name} {selectedPlayer.last_name}</h2><p className="mt-1 text-sm font-semibold text-slate-600">{rankingCategoryLabel(selectedCategory)} category · every count and card below is scoped to this player.</p></div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {data.ownProfiles.map((profile) => <Link className={`shrink-0 rounded px-3 py-2 text-sm font-black ${profile.id === selectedPlayer.id ? "bg-court-navy text-white" : "bg-slate-100 text-court-navy"}`} href={competeHref(profile.id)} key={profile.id}>{profile.first_name}</Link>)}
          </div>
        </div>
      </section>

      <section aria-labelledby="compete-next" className="mb-8">
        <SectionHeader className="mb-4" description="Events lead the competitive journey; direct challenges remain one step away." title="Choose your next move" />
        <h2 className="sr-only" id="compete-next">Choose your next move</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <ActionCard action="Browse events" description="Find published competitions and events that match this player's stage or classification." href={`/dashboard/events?profileId=${selectedPlayer.id}`} icon={<EventIcon size={22} />} meta={countLabel(eligibleEvents.length, "eligible event")} title="Events & Competitions" tone="navy" />
          <ActionCard action="Find opponents" description="Choose a balanced match or a stronger test for this player." href={`/dashboard/play/challenges?player=${selectedPlayer.id}`} icon={<ChallengeIcon size={22} />} meta={countLabel(challengeCount, "suggestion")} title="Challenge Players" tone="green" />
        </div>
      </section>

      <section className="mb-8" aria-labelledby="selected-events">
        <SectionHeader className="mb-4" description="Specific organiser selections for this player. Selected does not yet mean entered or confirmed." title="Selected" />
        <h2 className="sr-only" id="selected-events">Selected</h2>
        {relevanceResult.error ? <SectionError description={relevanceResult.error} /> : relevant.selected.length > 0 ? <div className="grid gap-3 lg:grid-cols-2">{relevant.selected.map((event) => <RelevantEventCard event={event} key={event.event_id} playerId={selectedPlayer.id} />)}</div> : <EmptyState compact description="Events selected by a School, District or Club organiser will appear here." icon={<EventIcon className="text-court-teal" size={24} />} title="No event selections" />}
      </section>

      <section className="mb-8" aria-labelledby="for-you-events">
        <SectionHeader className="mb-4" description={`Closed School, inherited District and Club events automatically relevant to ${selectedPlayer.first_name}.`} title="For You" />
        <h2 className="sr-only" id="for-you-events">For You</h2>
        {relevant.connected.length > 0 ? <div className="grid gap-3 lg:grid-cols-2">{relevant.connected.map((event) => <RelevantEventCard event={event} key={event.event_id} playerId={selectedPlayer.id} />)}</div> : <EmptyState compact description="No connected organisation events currently match this player's stage." icon={<EventIcon className="text-court-teal" size={24} />} title="No connected events" />}
      </section>

      <section className="mb-8" aria-labelledby="open-events">
        <SectionHeader className="mb-4" description="Published Open events from any supported host that match this player's stage." title="Open Events" />
        <h2 className="sr-only" id="open-events">Open Events</h2>
        {relevant.open.length > 0 ? <div className="grid gap-3 lg:grid-cols-2">{relevant.open.map((event) => <RelevantEventCard event={event} key={event.event_id} playerId={selectedPlayer.id} />)}</div> : <EmptyState compact description="No Open organisation events currently match this player." icon={<EventIcon className="text-court-teal" size={24} />} title="No Open events" />}
      </section>

      {staffEventsResult.data.length > 0 ? <section className="mb-8" aria-labelledby="staff-events"><SectionHeader className="mb-4" description="Event-scoped operational assignments for your signed-in account." title="Staff Assignments" /><h2 className="sr-only" id="staff-events">Staff Assignments</h2><div className="grid gap-3 lg:grid-cols-2">{staffEventsResult.data.map((event) => <article className="surface-card p-4" key={event.assignment_id}><div className="flex items-start justify-between gap-3"><div><h3 className="font-black text-court-navy">{event.title}</h3><p className="mt-1 text-sm font-semibold text-slate-600">{event.host_name} · {formatDateTime(event.starts_at)}</p></div><span className="ui-chip ui-chip-brand">{eventStaffRoleLabel(event.event_role)}</span></div><p className="mt-2 text-sm text-slate-600">{event.location ?? "Location to be confirmed"}</p><Link className="btn-secondary mt-4" href={`/dashboard/compete/events/${event.event_id}?player=${encodeURIComponent(selectedPlayer.id)}`}>View assignment</Link></article>)}</div></section> : null}

      {actionCount > 0 ? (
        <section className="mb-8" aria-labelledby="compete-actions">
          <SectionHeader className="mb-4" description={`${actionCount} item${actionCount === 1 ? "" : "s"} need a response.`} title="Action Required" />
          <h2 className="sr-only" id="compete-actions">Action Required</h2>
          <div className="grid gap-3 lg:grid-cols-2">{actionInvites.map((invite) => <UpcomingMatchCard invite={invite} key={invite.id} ownProfileIds={selectedPlayerIds} />)}{actionMatches.map((match) => <ResultCard currentUserId={data.userId} key={match.id} match={match} />)}</div>
        </section>
      ) : null}

      <section className="mb-8" aria-labelledby="featured-events">
        <SectionHeader action={<Link className="btn-secondary" href={`/dashboard/events?profileId=${selectedPlayer.id}`}>View all events</Link>} className="mb-4" description={`Published events matched to ${selectedPlayer.first_name}'s profile. Eligibility is not inferred beyond the event data available.`} title="Featured Events" />
        <h2 className="sr-only" id="featured-events">Featured Events</h2>
        {eventError ? <SectionError description="Events and competitions could not be loaded right now." /> : eligibleEvents.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {eligibleEvents.slice(0, 3).map((event) => {
              const visual = eventVisual(event);
              const entry = entriesByEvent.get(event.id);
              return (
                <article className={`overflow-hidden rounded-playr-lg border bg-white shadow-playr-subtle ${visual.border}`} key={event.id}>
                  <div className={`bg-gradient-to-br ${visual.gradient} p-5 text-white`}><div className="flex items-start justify-between gap-3"><span className="rounded bg-white/15 px-2.5 py-1 text-xs font-black uppercase tracking-wide">{formatLabel(event.event_type)}</span><EventIcon size={25} /></div><h3 className="mt-8 text-xl font-black leading-tight">{event.title}</h3></div>
                  <div className="p-5"><div className="flex flex-wrap gap-2"><span className={`ui-chip ${visual.badge}`}>{eventAudienceLabel(event)}</span>{isRatingRelevantEvent(event) ? <span className="ui-chip ui-chip-navy"><RatingIcon size={13} /> Rating relevant</span> : <span className="ui-chip ui-chip-muted"><ParticipationIcon size={13} /> Participation</span>}{entry ? <span className="ui-chip ui-chip-success"><StatusIcon size={13} /> {formatLabel(entry.entry_status)}</span> : null}</div><p className="mt-4 flex items-center gap-2 text-sm font-bold text-court-navy"><TimeIcon size={15} /> {formatDateTime(event.start_datetime)}</p><p className="mt-1 text-sm text-slate-600">{event.location ?? "Venue to be confirmed"}</p><Link className="btn-primary mt-5 w-full justify-center" href={`/dashboard/events/${event.id}`}>{entry ? "View entry" : "View event"}</Link></div>
                </article>
              );
            })}
          </div>
        ) : <EmptyState description="No published events currently match this player's profile. Browse all events to review what is available." icon={<EventIcon className="text-court-teal" size={26} />} title="No matching events yet" />}
      </section>

      <section className="mb-8" aria-labelledby="upcoming-matches">
        <SectionHeader action={<Link className="btn-secondary" href={`/dashboard/play/matches?player=${selectedPlayer.id}`}>Open match queue</Link>} className="mb-4" description={`${upcomingInvites.length} pending or accepted for ${selectedPlayer.first_name}.`} title="Upcoming Matches" />
        <h2 className="sr-only" id="upcoming-matches">Upcoming Matches</h2>
        {data.inviteError || data.matchError ? <SectionError description="Competitive activity could not be loaded right now." /> : upcomingInvites.length > 0 ? <div className="grid gap-3 lg:grid-cols-2">{upcomingInvites.map((invite) => <UpcomingMatchCard invite={invite} key={invite.id} ownProfileIds={selectedPlayerIds} />)}</div> : <EmptyState description="Challenges and accepted match invitations for this player will appear here." icon={<MatchIcon className="text-court-teal" size={26} />} title="No upcoming matches" />}
      </section>

      <section aria-labelledby="recent-results">
        <SectionHeader action={<Link className="btn-secondary" href={`/dashboard/play/matches?player=${selectedPlayer.id}`}>View match history</Link>} className="mb-4" description={`Verified and resolved results for ${selectedPlayer.first_name}.`} title="Recent Results" />
        <h2 className="sr-only" id="recent-results">Recent Results</h2>
        {recentResults.length > 0 ? <div className="grid gap-3 lg:grid-cols-2">{recentResults.map((match) => <ResultCard currentUserId={data.userId} key={match.id} match={match} />)}</div> : <EmptyState description="Completed results will appear here after the match workflow is resolved." icon={<MatchIcon className="text-court-teal" size={26} />} title="No recent results" />}
      </section>
    </PageShell>
  );
}
