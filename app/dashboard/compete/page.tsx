import Link from "next/link";
import type { ReactNode } from "react";
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
import { formatDate, formatDateTime, formatLabel, formatTime } from "@/lib/courtside-format";
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

function eventContextLabel(type: string) {
  if (["school", "school_district"].includes(type)) return "School";
  if (type === "district") return "District";
  if (["club", "club_academy"].includes(type)) return "Club";
  return "Organisation";
}

function RelevantEventCard({ event, playerId }: { event: ProfileEventRelevance; playerId: string }) {
  const state = event.is_assigned ? "Selected" : "Eligible";
  return <Link aria-label={`View ${event.title}`} className={`group flex min-h-44 snap-start flex-col rounded-playr-lg border bg-white p-4 shadow-playr-subtle transition hover:-translate-y-0.5 hover:border-court-teal hover:shadow-playr-card ${event.is_assigned ? "border-court-teal ring-1 ring-court-teal/20" : "border-playr-border-subtle"}`} href={`/dashboard/compete/events/${event.event_id}?player=${encodeURIComponent(playerId)}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-black uppercase tracking-wide text-court-teal">{eventContextLabel(event.host_type)} · {event.host_name}</p><h3 className="mt-1 line-clamp-2 text-base font-black leading-tight text-court-navy group-hover:text-court-blue">{event.title}</h3></div><span className={`ui-chip shrink-0 ${event.is_assigned ? "ui-chip-success" : "ui-chip-muted"}`}>{state}</span></div><p className="mt-3 text-sm font-bold text-court-navy">{formatDate(event.starts_at)} · {formatTime(event.starts_at)}</p><div className="mt-auto flex flex-wrap gap-1.5 pt-4"><span className="ui-chip ui-chip-muted">{event.junior_stage ? formatLabel(event.junior_stage) : "Mixed / General"}</span><span className={`ui-chip ${event.visibility === "open" ? "ui-chip-brand" : "ui-chip-muted"}`}>{formatLabel(event.visibility)}</span></div></Link>;
}

function EventSection({ children, count, empty, id, title }: { children: ReactNode; count: number; empty?: string; id: string; title: string }) {
  if (count === 0 && !empty) return null;
  return <section aria-labelledby={id} className="mb-6"><div className="mb-3 flex items-center gap-2"><h2 className="text-xl font-black text-court-navy" id={id}>{title}</h2>{count > 0 ? <span className="ui-chip ui-chip-muted">{count}</span> : null}</div>{count > 0 ? <div className="grid auto-cols-[minmax(17rem,82vw)] grid-flow-col gap-3 overflow-x-auto pb-2 [scrollbar-width:thin] md:grid-flow-row md:grid-cols-2 md:overflow-visible md:pb-0 xl:grid-cols-3">{children}</div> : <p className="rounded-playr-md border border-dashed border-playr-border-strong bg-playr-surface-muted px-4 py-3 text-sm font-semibold text-playr-text-secondary">{empty}</p>}</section>;
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

      <section className="mb-5 rounded-playr-lg border border-playr-border-subtle bg-white p-3 shadow-playr-subtle sm:p-4" aria-label="Playing as">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="section-kicker">Playing as</p><h2 className="mt-0.5 text-lg font-black text-court-navy">{selectedPlayer.first_name} {selectedPlayer.last_name} <span className="font-bold text-slate-500">· {rankingCategoryLabel(selectedCategory)}{selectedPlayer.is_junior ? " Ball" : ""}</span></h2></div>
          <nav aria-label="Choose player" className="flex max-w-full gap-2 overflow-x-auto pb-0.5">
            {data.ownProfiles.map((profile) => <Link aria-current={profile.id === selectedPlayer.id ? "page" : undefined} className={`min-h-10 shrink-0 rounded-playr-md px-3 py-2 text-sm font-black ${profile.id === selectedPlayer.id ? "bg-court-navy text-white" : "bg-slate-100 text-court-navy hover:bg-court-mist"}`} href={competeHref(profile.id)} key={profile.id}>{profile.first_name}</Link>)}
          </nav>
        </div>
      </section>

      {relevanceResult.error ? <SectionError className="mb-5" description={relevanceResult.error} /> : <>
        <EventSection count={relevant.selected.length} id="selected-events" title="Selected">{relevant.selected.map((event) => <RelevantEventCard event={event} key={event.event_id} playerId={selectedPlayer.id} />)}</EventSection>
        <EventSection count={relevant.connected.length} empty="No upcoming events from your connected organisations." id="for-you-events" title="For You">{relevant.connected.map((event) => <RelevantEventCard event={event} key={event.event_id} playerId={selectedPlayer.id} />)}</EventSection>
        <EventSection count={relevant.open.length} empty="No eligible open events right now." id="open-events" title="Open Events">{relevant.open.map((event) => <RelevantEventCard event={event} key={event.event_id} playerId={selectedPlayer.id} />)}</EventSection>
      </>}

      <section aria-label="Matches & Challenges" className="mb-8 border-t border-playr-border-subtle pt-6">
        <SectionHeader className="mb-3" title="Matches & Challenges" />
        <div className="grid gap-3 md:grid-cols-2">
          <ActionCard action="Find opponents" description="Choose a balanced match or a stronger test." href={`/dashboard/play/challenges?player=${selectedPlayer.id}`} icon={<ChallengeIcon size={22} />} meta={countLabel(challengeCount, "suggestion")} title="Challenge Players" tone="green" />
          <ActionCard action="Browse events" description="Explore the existing public event catalogue." href={`/dashboard/events?profileId=${selectedPlayer.id}`} icon={<EventIcon size={22} />} meta={countLabel(eligibleEvents.length, "event")} title="More Events" tone="navy" />
        </div>
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
