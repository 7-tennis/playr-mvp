import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { CollapsibleCard } from "@/components/collapsible-card";
import { PageShell } from "@/components/page-shell";
import { CancelledSessionCard, SessionRequestCard } from "@/components/session-request-cards";
import { OrganisationCard, OrganisationEmptyState, PlayerOrganisationSummary } from "@/components/player-organisations";
import { MetricCard, PlayRBadge, PlayRCard, SectionError, SectionHeader } from "@/components/playr-ui";
import { StatusAlert } from "@/components/status-alert";
import {
  BadgeIcon,
  BookingIcon,
  ClubIcon,
  DistrictIcon,
  EventIcon,
  InviteIcon,
  MatchIcon,
  ParticipationIcon,
  PrivateIcon,
  RatingIcon,
  SchoolIcon,
  StageIcon,
  StatusIcon
} from "@/components/playr-icons";
import { formatDate, formatDateTime, formatJuniorRating, formatLabel } from "@/lib/courtside-format";
import { isPendingSessionRequest, loadPlayerSessionRequests, loadPrivatePlayerSessionActivity } from "@/lib/coach-session-requests";
import { juniorParticipationLeads, playerStageVisual } from "@/lib/player-stage-visuals";
import { loadPlayerClubMemberships, loadPlayerOrganisations } from "@/lib/player-organisations";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type {
  Court,
  CourtBooking,
  CourtSideEvent,
  EntryStatus,
  JuniorAchievement,
  JuniorRatingHistory,
  MatchInviteStatus,
  MatchInviteType,
  MatchVerificationStatus,
  Profile,
  Rating,
  RatingChange,
  Venue
} from "@/types/courtside";

type AcademyDetailAssignment = {
  organisation_player_link_id: string | null;
  coach: Pick<Profile, "id" | "first_name" | "last_name"> | null;
};

type AcademyDetailLesson = {
  id: string;
  venue_id: string;
  start_time: string;
  custom_location: string | null;
  court: Pick<Court, "name"> | null;
  external_venue: { name: string } | null;
};

type PrivateAcademySessionRow = {
  session_id: string;
  academy_id: string;
  academy_name: string;
  session_name: string;
  session_type: "private" | "semi_private" | "squad";
  coach_name: string;
  next_start_time: string | null;
  location_name: string | null;
  participant_status: "active" | "pending" | "paused" | "removed";
};

export const dynamic = "force-dynamic";

type DetailBooking = Pick<CourtBooking, "id" | "start_time" | "end_time" | "player_profile_id"> & {
  courts: (Pick<Court, "name"> & { venues: Pick<Venue, "name"> | null }) | null;
};

type DetailEventEntry = {
  id: string;
  profile_id: string;
  entry_status: EntryStatus;
  events: Pick<CourtSideEvent, "id" | "title" | "slug" | "start_datetime" | "location"> | null;
};

type DetailInvite = {
  id: string;
  inviter_profile_id: string;
  inviter_first_name: string;
  inviter_last_name: string;
  opponent_profile_id: string;
  opponent_first_name: string;
  opponent_last_name: string;
  match_type: MatchInviteType;
  status: MatchInviteStatus;
  created_at: string;
  booking_start_time: string | null;
  booking_court_name: string | null;
};

type MatchHistoryRow = {
  id: string;
  winner_profile_id: string;
  score_text: string;
  verification_status: MatchVerificationStatus;
  confirmed_at: string | null;
  submitted_at: string;
  inviter_profile_id: string;
  inviter_first_name: string;
  inviter_last_name: string;
  inviter_is_junior: boolean;
  opponent_profile_id: string;
  opponent_first_name: string;
  opponent_last_name: string;
  opponent_is_junior: boolean;
  booking_start_time: string | null;
  booking_court_name: string | null;
};

type PlayerDetailPageProps = {
  params: {
    id: string;
  };
  searchParams?: {
    request?: string;
    request_error?: string;
  };
};

function requestMessage(value?: string) {
  switch (value) {
    case "approved": return "Lesson confirmed. The new court and time are booked.";
    case "declined": return "Request declined. The original session remains unchanged.";
    case "makeup_requested": return "Lesson time requested. The court will be booked after coach approval.";
    default: return null;
  }
}

function requestErrorMessage(value?: string) {
  switch (value) {
    case "time_unavailable": return "This court is no longer available. The original session has not changed. Please choose another time.";
    case "coach_conflict": return "The coach is no longer available at this time. Please choose another option.";
    case "player_conflict": return "This player already has another session or booking at this time.";
    case "request_not_pending": return "This request has already been resolved.";
    case "confirmation_required": return "Review the request and confirm before continuing.";
    case "makeup_not_available": return "Another time can only be requested for a cancelled private lesson.";
    case "missing_migration": return "The latest lesson scheduling update has not been applied yet.";
    case "missing_fields": return "Choose an available lesson time before sending the request.";
    case "request_failed":
    case "approval_failed": return "The request could not be completed. No schedule or booking changes were made.";
    default: return null;
  }
}

function playerName(profile: Pick<Profile, "first_name" | "last_name">) {
  return `${profile.first_name} ${profile.last_name}`;
}

function playerInitials(profile: Pick<Profile, "first_name" | "last_name">) {
  return `${profile.first_name.charAt(0)}${profile.last_name.charAt(0)}`.toUpperCase();
}

function StatChip({ icon, value, label }: { icon: ReactNode; value: string | number; label: string }) {
  return <MetricCard icon={icon} label={label} value={value} />;
}

function EmptyState({ text }: { text: string }) {
  return <p className="ui-empty-card">{text}</p>;
}

function ActivityItem({ icon, title, meta }: { icon: ReactNode; title: string; meta: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="flex items-center gap-2 font-black text-court-navy">
        {icon}
        <span>{title}</span>
      </p>
      <p className="mt-1 text-sm text-slate-600">{meta}</p>
    </div>
  );
}

function rankText(icon: ReactNode, label: string) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
        {icon}
        <span>{label}</span>
      </p>
      <p className="mt-1 font-black text-court-navy">Not ranked yet</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words font-black text-court-navy">{value}</p>
    </div>
  );
}

function familyRole(player: Profile, parentProfile: Profile) {
  if (player.id === parentProfile.id) {
    return "Main Member / Account Holder";
  }

  if (player.is_junior && player.parent_profile_id === parentProfile.id) {
    return "Linked Junior";
  }

  return "Member";
}

function matchPlayerName(match: MatchHistoryRow, profileId: string) {
  if (match.inviter_profile_id === profileId) {
    return `${match.opponent_first_name} ${match.opponent_last_name}`;
  }

  return `${match.inviter_first_name} ${match.inviter_last_name}`;
}

export default async function PlayerDetailPage({ params, searchParams }: PlayerDetailPageProps) {
  if (!hasSupabaseConfig()) {
    return (
      <PageShell eyebrow="Player Detail" title="Supabase is not configured.">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <p className="text-slate-700">Add Supabase environment variables to use player detail features.</p>
        </div>
      </PageShell>
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: parentProfileData } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_junior", false)
    .maybeSingle();

  const parentProfile = parentProfileData as Profile | null;

  if (!parentProfile) {
    redirect("/dashboard/profile");
  }

  const { data: playerData } = await supabase.from("profiles").select("*").eq("id", params.id).maybeSingle();
  const player = playerData as Profile | null;

  if (!player) {
    notFound();
  }

  const canView = player.id === parentProfile.id || (player.is_junior && player.parent_profile_id === parentProfile.id);

  if (!canView) {
    notFound();
  }

  const now = new Date().toISOString();
  const [
    { data: ratingData, error: ratingError },
    { data: ratingChangeData, error: ratingChangeError },
    { data: bookingData, error: bookingError },
    { data: entryData, error: entryError },
    { data: inviteData, error: inviteError },
    { data: matchData, error: matchError },
    { data: achievementData, error: achievementError },
    { data: juniorHistoryData, error: juniorHistoryError },
    organisationResult,
    membershipResult,
    { data: academyAssignmentData },
    { data: academyLessonData },
    { data: privateAcademySessionData, error: privateAcademySessionError },
    sessionRequests,
    privateSessionActivity
  ] = await Promise.all([
    supabase.from("ratings").select("*").eq("profile_id", player.id).maybeSingle(),
    supabase.from("rating_changes").select("*").eq("profile_id", player.id).order("created_at", { ascending: false }).limit(5),
    supabase
      .from("court_bookings")
      .select("id,player_profile_id,start_time,end_time,courts:court_id(name,venues:venue_id(name))")
      .eq("player_profile_id", player.id)
      .eq("status", "confirmed")
      .gte("start_time", now)
      .order("start_time", { ascending: true })
      .limit(5),
    supabase
      .from("event_entries")
      .select("id,profile_id,entry_status,events:event_id(id,title,slug,start_datetime,location)")
      .eq("profile_id", player.id)
      .neq("entry_status", "cancelled"),
    supabase.rpc("match_invites_for_user"),
    supabase.rpc("matches_for_user"),
    player.is_junior
      ? supabase.from("junior_achievements").select("id,badge_name,category,earned_at").eq("player_id", player.id).order("earned_at", { ascending: false }).limit(6)
      : Promise.resolve({ data: [], error: null }),
    player.is_junior
      ? supabase
          .from("junior_rating_history")
          .select("id,previous_rating,new_rating,change_amount,reason,created_at")
          .eq("player_id", player.id)
          .order("created_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [], error: null }),
    loadPlayerOrganisations(supabase, [player.id]),
    loadPlayerClubMemberships(supabase, player.id),
    supabase
      .from("coach_player_assignments")
      .select("organisation_player_link_id,coach:coach_profile_id(id,first_name,last_name)")
      .eq("player_profile_id", player.id)
      .eq("status", "active"),
    supabase
      .from("coach_lessons")
      .select("id,venue_id,start_time,custom_location,court:court_id(name),external_venue:external_venue_id(name)")
      .eq("player_id", player.id)
      .eq("status", "scheduled")
      .gte("start_time", now)
      .order("start_time", { ascending: true }),
    supabase.rpc("coachr_private_player_sessions", { p_player_profile_id: player.id }),
    loadPlayerSessionRequests(supabase, [player.id]),
    loadPrivatePlayerSessionActivity(supabase, player.id)
  ]);

  if (ratingError) {
    console.error("CourtSide player detail rating load failed", { userId: user.id, playerId: player.id, error: ratingError });
  }
  if (ratingChangeError) {
    console.error("CourtSide player detail rating changes load failed", { userId: user.id, playerId: player.id, error: ratingChangeError });
  }
  if (bookingError) {
    console.error("CourtSide player detail bookings load failed", { userId: user.id, playerId: player.id, error: bookingError });
  }
  if (entryError) {
    console.error("CourtSide player detail event entries load failed", { userId: user.id, playerId: player.id, error: entryError });
  }
  if (inviteError) {
    console.error("CourtSide player detail invites load failed", { userId: user.id, playerId: player.id, error: inviteError });
  }
  if (matchError) {
    console.error("CourtSide player detail matches load failed", { userId: user.id, playerId: player.id, error: matchError });
  }
  if (achievementError) {
    console.error("CourtSide player detail achievements load failed", { userId: user.id, playerId: player.id, error: achievementError });
  }
  if (juniorHistoryError) {
    console.error("CourtSide player detail junior history load failed", { userId: user.id, playerId: player.id, error: juniorHistoryError });
  }
  if (privateAcademySessionError && privateAcademySessionError.code !== "PGRST202") {
    console.error("CourtSide private academy sessions load failed", { userId: user.id, playerId: player.id, code: privateAcademySessionError.code });
  }

  const stage = playerStageVisual(player.is_junior, player.junior_stage);
  const rating = ratingError ? null : ((ratingData ?? null) as Rating | null);
  const ratingChanges = ratingChangeError ? [] : ((ratingChangeData ?? []) as RatingChange[]);
  const bookings = bookingError ? [] : ((bookingData ?? []) as unknown as DetailBooking[]);
  const entries = entryError ? [] : ((entryData ?? []) as unknown as DetailEventEntry[]);
  const upcomingEntries = entries
    .filter((entry) => entry.entry_status !== "cancelled" && entry.events?.start_datetime && entry.events.start_datetime >= now)
    .sort((a, b) => new Date(a.events?.start_datetime ?? "").getTime() - new Date(b.events?.start_datetime ?? "").getTime());
  const invites = inviteError
    ? []
    : ((inviteData ?? []) as DetailInvite[]).filter((invite) => invite.status === "pending" && (invite.inviter_profile_id === player.id || invite.opponent_profile_id === player.id));
  const matches = matchError ? [] : ((matchData ?? []) as MatchHistoryRow[]);
  const verifiedMatches = matches.filter((match) => {
    const belongsToPlayer = match.inviter_profile_id === player.id || match.opponent_profile_id === player.id;
    return belongsToPlayer && (match.verification_status === "verified" || match.verification_status === "admin_verified");
  });
  const achievements = achievementError ? [] : ((achievementData ?? []) as Pick<JuniorAchievement, "id" | "badge_name" | "category" | "earned_at">[]);
  const juniorHistory = juniorHistoryError
    ? []
    : ((juniorHistoryData ?? []) as Pick<JuniorRatingHistory, "id" | "previous_rating" | "new_rating" | "change_amount" | "reason" | "created_at">[]);
  const organisations = organisationResult.data;
  const membershipByVenueId = new Map<string, (typeof membershipResult.data)[number]>();
  membershipResult.data.forEach((membership) => {
    if (!membershipByVenueId.has(membership.venueId)) membershipByVenueId.set(membership.venueId, membership);
  });
  const academyAssignments = (academyAssignmentData ?? []) as unknown as AcademyDetailAssignment[];
  const academyAssignmentByLink = new Map(academyAssignments.filter((assignment) => assignment.organisation_player_link_id).map((assignment) => [assignment.organisation_player_link_id as string, assignment]));
  const academyLessons = (academyLessonData ?? []) as unknown as AcademyDetailLesson[];
  const privateAcademySessions = privateAcademySessionError ? [] : (privateAcademySessionData ?? []) as PrivateAcademySessionRow[];
  const academyLessonByVenue = new Map<string, AcademyDetailLesson>();
  academyLessons.forEach((lesson) => {
    if (!academyLessonByVenue.has(lesson.venue_id)) academyLessonByVenue.set(lesson.venue_id, lesson);
  });

  const ratingText = player.is_junior ? formatJuniorRating(player.junior_stage, player.junior_rating) : rating ? rating.rating_value.toFixed(1) : "No active rating yet";
  const confidenceText = player.is_junior ? formatLabel(player.junior_rating_confidence) : rating ? formatLabel(rating.confidence) : "No rating yet";
  const participationText = player.is_junior ? `${player.participation_score} pts` : `${player.participation_score ?? 0} pts`;
  const requestReturnTo = `/dashboard/players/${player.id}#organisations`;
  const pendingSessionRequests = sessionRequests.filter((request) => isPendingSessionRequest(request.status));
  const recentSessionRequests = sessionRequests.filter((request) => !isPendingSessionRequest(request.status)).slice(0, 8);
  const requestByOccurrence = new Map(sessionRequests.map((request) => [request.occurrence_id, request]));
  const cancelledSessions = privateSessionActivity.filter((activity) => activity.occurrence_status === "cancelled" || activity.occurrence_status === "rain" || activity.occurrence_status === "sick");
  const participationFirst = player.is_junior && juniorParticipationLeads(player.junior_stage);
  const rankingScopes = [
    organisations.some((organisation) => organisation.venue?.organisation_type === "school" || organisation.venue?.organisation_type === "school_district")
      ? { icon: <SchoolIcon size={14} />, label: "School Rank" }
      : null,
    organisations.some((organisation) => organisation.venue?.organisation_type === "club" || organisation.venue?.organisation_type === "club_academy")
      ? { icon: <ClubIcon size={14} />, label: "Club Rank" }
      : null,
    organisations.some((organisation) => organisation.venue?.organisation_type === "district" || organisation.venue?.organisation_type === "school_district")
      ? { icon: <DistrictIcon size={14} />, label: "District Rank" }
      : null
  ].filter(Boolean) as { icon: ReactNode; label: string }[];
  const hasRecentActivity = juniorHistory.length > 0 || ratingChanges.length > 0 || verifiedMatches.length > 0 || achievements.length > 0;

  return (
    <PageShell eyebrow="MyPlayR" subtitle="Stage, participation, organisations and tennis activity." title={playerName(player)}>
      <StatusAlert className="mb-5" message={requestMessage(searchParams?.request)} tone="success" />
      <StatusAlert className="mb-5" message={requestErrorMessage(searchParams?.request_error)} tone="error" />
      <div className="mb-5">
        <Link className="inline-flex min-h-11 items-center font-bold text-court-blue focus-ring" href="/dashboard">
          ← Back to MyPlayR
        </Link>
      </div>

      <PlayRCard as="section" className={`overflow-hidden shadow-playr-card ${stage.border}`} id="overview" variant="default">
        <div className={`${stage.gradient} p-5 sm:p-7`}>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className={`grid h-24 w-24 shrink-0 place-items-center rounded-playr-lg border text-3xl font-black shadow-playr-card ${stage.avatar}`}>{playerInitials(player)}</div>
            <div className="min-w-0 flex-1">
              <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-black ${stage.badge}`}>{stage.label}</span>
              <h2 className={`mt-2 text-3xl font-black sm:text-4xl ${stage.foreground}`}>{playerName(player)}</h2>
              <p className={`mt-2 text-sm font-bold ${stage.mutedForeground}`}>{familyRole(player, parentProfile)}</p>
            </div>
          </div>
        </div>
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <PlayerOrganisationSummary organisations={organisations} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatChip icon={participationFirst ? <ParticipationIcon size={18} /> : <RatingIcon rating={player.is_junior ? player.junior_rating : rating?.rating_value ?? null} size={18} stage={player.is_junior ? player.junior_stage : "member"} />} label={participationFirst ? "Participation" : "Rating"} value={participationFirst ? participationText : ratingText} />
            <StatChip icon={participationFirst ? <StageIcon size={18} /> : <ParticipationIcon size={18} />} label={participationFirst ? "Stage readiness" : "Participation"} value={participationFirst ? `${player.stage_readiness_score}%` : participationText} />
            <StatChip icon={<MatchIcon size={18} />} label="Matches" value={player.is_junior ? player.matches_played : rating?.verified_match_count ?? 0} />
            <StatChip icon={<StatusIcon size={18} />} label="Rating confidence" value={confidenceText} />
          </div>
        </div>
      </PlayRCard>

      <PlayRCard as="section" className="mt-6 p-4 sm:p-6" id="participation">
        <SectionHeader description="Participation points and rankings for this player's connected tennis communities." icon={<ParticipationIcon className="text-court-teal" size={22} />} title="Participation & Rankings" />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatChip icon={<ParticipationIcon size={18} />} label="Participation" value={participationText} />
          {(rankingScopes.length ? rankingScopes : [{ icon: <RatingIcon rating={null} size={14} stage="member" />, label: "PlayR Rank" }]).map((scope) => (
            <div key={scope.label}>{rankText(scope.icon, scope.label)}</div>
          ))}
        </div>
      </PlayRCard>

      <span aria-hidden className="block scroll-mt-24" id="lesson-requests" />
      <PlayRCard as="section" className="mt-5 p-4 sm:p-6" id="organisations">
        <SectionHeader description="Each relationship is the gateway to this player's club, academy, school or district details." icon={<ClubIcon className="text-court-teal" size={22} />} title="Organisations" />
        {organisationResult.error ? (
          <SectionError className="mt-4" description="Organisation connections could not be loaded right now. The rest of this player profile is still available." />
        ) : organisations.length > 0 ? (
          <div className="mt-5 grid items-stretch gap-4 md:grid-cols-2">
            {organisations.map((organisation) => {
              const venueId = organisation.venue?.id;
              const assignment = academyAssignmentByLink.get(organisation.id);
              const lesson = venueId ? academyLessonByVenue.get(venueId) : null;
              const linkedSessions = venueId ? privateAcademySessions.filter((session) => session.academy_id === venueId) : [];
              const isAcademy = organisation.venue?.organisation_type === "academy" || organisation.venue?.organisation_type === "club_academy";
              const linkedSessionIds = new Set(linkedSessions.map((session) => session.session_id));
              const organisationPendingRequests = venueId ? pendingSessionRequests.filter((request) => request.venue_id === venueId) : [];
              const organisationRecentRequests = venueId ? recentSessionRequests.filter((request) => request.venue_id === venueId) : [];
              const organisationCancelledSessions = cancelledSessions.filter((activity) => linkedSessionIds.has(activity.session_id));
              const hasAcademyDetails = isAcademy && Boolean(assignment?.coach || lesson || linkedSessions.length || organisationPendingRequests.length || organisationRecentRequests.length || organisationCancelledSessions.length);
              return (
                <OrganisationCard
                  key={organisation.id}
                  organisation={organisation}
                  playerProfileId={player.id}
                  meta={{
                    membership: venueId ? membershipByVenueId.get(venueId) ?? null : null,
                    supportingDetails: isAcademy && (assignment?.coach || lesson || linkedSessions.length) ? (
                      <>
                        {assignment?.coach ? <p><span className="font-bold text-slate-800">Coach:</span> {playerName(assignment.coach)}</p> : null}
                        {lesson ? <p><span className="font-bold text-slate-800">Next lesson:</span> {formatDateTime(lesson.start_time)}</p> : null}
                        {linkedSessions.length ? <p><span className="font-bold text-slate-800">Active sessions:</span> {linkedSessions.length}</p> : null}
                      </>
                    ) : null,
                    detailsLabel: "View Academy Details",
                    details: hasAcademyDetails ? (
                      <div className="grid gap-4">
                        {lesson ? <div className="rounded-playr-md bg-sky-50 p-3 text-sm"><p className="font-black text-court-navy">Next lesson</p><p className="mt-1 text-slate-600">{formatDateTime(lesson.start_time)}{lesson.court?.name ? ` / ${lesson.court.name}` : lesson.external_venue?.name ? ` / ${lesson.external_venue.name}` : lesson.custom_location ? ` / ${lesson.custom_location}` : ""}</p></div> : null}
                        {organisationPendingRequests.length ? <div><p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Lesson changes</p><div className="grid gap-3">{organisationPendingRequests.map((request) => <SessionRequestCard key={request.id} request={request} returnTo={requestReturnTo} viewer="player" />)}</div></div> : null}
                        {organisationCancelledSessions.length ? <div><p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Cancelled lessons</p><div className="grid gap-3">{organisationCancelledSessions.slice(0, 6).map((activity) => <CancelledSessionCard activity={activity} existingRequest={requestByOccurrence.get(activity.occurrence_id) ?? null} key={activity.occurrence_id} playerProfileId={player.id} returnTo={requestReturnTo} />)}</div></div> : null}
                        {organisationRecentRequests.length ? <div><p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Request history</p><div className="grid gap-3">{organisationRecentRequests.map((request) => <SessionRequestCard compact key={request.id} request={request} returnTo={requestReturnTo} viewer="player" />)}</div></div> : null}
                      </div>
                    ) : null
                  }}
                />
              );
            })}
          </div>
        ) : <div className="mt-5"><OrganisationEmptyState /></div>}
      </PlayRCard>

      <PlayRCard as="section" className="mt-5 p-4 sm:p-6" id="upcoming-activity">
        <SectionHeader description="The next lessons, bookings, events and match invitations for this player." icon={<EventIcon className="text-court-teal" size={22} />} title="Upcoming Activity" />
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {academyLessons.slice(0, 3).map((lesson) => <ActivityItem icon={<BookingIcon size={16} />} key={lesson.id} meta={`${formatDateTime(lesson.start_time)}${lesson.court?.name ? ` / ${lesson.court.name}` : lesson.external_venue?.name ? ` / ${lesson.external_venue.name}` : ""}`} title="Academy lesson" />)}
          {bookings.slice(0, 3).map((booking) => <ActivityItem icon={<BookingIcon size={16} />} key={booking.id} meta={`${formatDateTime(booking.start_time)}${booking.courts?.venues?.name ? ` / ${booking.courts.venues.name}` : ""}`} title={booking.courts?.name ?? "Court booking"} />)}
          {upcomingEntries.slice(0, 3).map((entry) => entry.events ? <ActivityItem icon={<EventIcon size={16} />} key={entry.id} meta={`${formatDateTime(entry.events.start_datetime)}${entry.events.location ? ` / ${entry.events.location}` : ""}`} title={entry.events.title} /> : null)}
          {invites.slice(0, 3).map((invite) => {
            const isIncoming = invite.opponent_profile_id === player.id;
            const otherName = isIncoming ? `${invite.inviter_first_name} ${invite.inviter_last_name}` : `${invite.opponent_first_name} ${invite.opponent_last_name}`;
            return <ActivityItem icon={<InviteIcon size={16} />} key={invite.id} meta={`${formatLabel(invite.match_type)} match${invite.booking_start_time ? ` / ${formatDateTime(invite.booking_start_time)}` : ""}`} title={isIncoming ? `Invite from ${otherName}` : `Invite sent to ${otherName}`} />;
          })}
          {!academyLessons.length && !bookings.length && !upcomingEntries.length && !invites.length ? <EmptyState text="No upcoming activity yet." /> : null}
        </div>
      </PlayRCard>

      {hasRecentActivity ? (
        <PlayRCard as="section" className="mt-5 p-4 sm:p-6" id="recent-activity">
          <SectionHeader description="Recent verified progress, results and achievements." icon={<MatchIcon className="text-court-teal" size={22} />} title="Recent Activity" />
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            {(juniorHistory.length || ratingChanges.length) ? <div><h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Rating history</h3><div className="mt-3 grid gap-2">{player.is_junior ? juniorHistory.map((history) => <div className="rounded bg-slate-50 p-3 text-sm" key={history.id}><p className="font-black text-court-navy">{formatLabel(history.reason)}</p><p className="mt-1 text-slate-600">{history.previous_rating?.toFixed(1) ?? "-"} to {history.new_rating?.toFixed(1) ?? "-"} ({history.change_amount > 0 ? "+" : ""}{history.change_amount.toFixed(2)}) / {formatDate(history.created_at)}</p></div>) : ratingChanges.map((change) => <div className="rounded bg-slate-50 p-3 text-sm" key={change.id}><p className="font-black text-court-navy">{change.rating_before.toFixed(1)} to {change.rating_after.toFixed(1)}</p><p className="mt-1 text-slate-600">{change.rating_delta > 0 ? "+" : ""}{change.rating_delta.toFixed(2)} / {formatDate(change.created_at)}</p></div>)}</div></div> : null}
            {verifiedMatches.length ? <div><h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Verified matches</h3><div className="mt-3 grid gap-2">{verifiedMatches.slice(0, 4).map((match) => <div className="rounded bg-slate-50 p-3 text-sm" key={match.id}><p className="font-black text-court-navy">vs {matchPlayerName(match, player.id)}</p><p className="mt-1 text-slate-600">{match.score_text} / {match.winner_profile_id === player.id ? "Win" : "Result"}</p><p className="mt-1 text-xs text-slate-500">{formatDate(match.confirmed_at ?? match.submitted_at)}</p></div>)}</div></div> : null}
            {achievements.length ? <div className="lg:col-span-2"><h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Achievements</h3><div className="mt-3 flex flex-wrap gap-2">{achievements.map((badge) => <PlayRBadge className={stage.metricSurface} icon={<BadgeIcon size={14} />} key={badge.id}>{badge.badge_name} · {formatDate(badge.earned_at)}</PlayRBadge>)}</div></div> : null}
          </div>
        </PlayRCard>
      ) : null}

      <div className="mt-5">
        <CollapsibleCard badge={<span className="ui-chip ui-chip-brand"><PrivateIcon size={14} /> Private</span>} eyebrow="Private" id="private-details" summary={`${familyRole(player, parentProfile)} · Contact and account details`} title="Private Details">
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailRow label="Family Role" value={familyRole(player, parentProfile)} />
            <DetailRow label="Email" value={player.is_junior ? player.email ?? "No junior email linked" : player.email ?? user.email ?? "No email linked"} />
            <DetailRow label="Phone" value={player.phone ?? "Phone number not set"} />
            <DetailRow label="Date of Birth" value={player.date_of_birth ? formatDate(player.date_of_birth) : "Date of birth not set"} />
            <DetailRow label="Primary Sport" value={formatLabel(player.primary_sport)} />
            <DetailRow label="Player Level" value={formatLabel(player.player_level)} />
            <DetailRow label="Profile Privacy" value="Private dashboard only" />
          </div>
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">These details are visible only to the signed-in account holder or linked parent/guardian.</div>
        </CollapsibleCard>
      </div>
    </PageShell>
  );
}
