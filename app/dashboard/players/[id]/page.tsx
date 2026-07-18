import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { CollapsibleCard } from "@/components/collapsible-card";
import { PageShell } from "@/components/page-shell";
import { CancelledSessionCard, SessionRequestCard } from "@/components/session-request-cards";
import { StatusAlert } from "@/components/status-alert";
import {
  BadgeIcon,
  BookingIcon,
  ChallengeIcon,
  ChevronDownIcon,
  ClubIcon,
  ConfidenceIcon,
  DistrictIcon,
  EventIcon,
  InviteIcon,
  MembershipIcon,
  MatchIcon,
  ParticipationIcon,
  PrivateIcon,
  RatingIcon,
  ResultIcon,
  SchoolIcon,
  StageIcon,
  StatusIcon
} from "@/components/playr-icons";
import { formatDate, formatDateTime, formatJuniorRating, formatLabel } from "@/lib/courtside-format";
import { isPendingSessionRequest, loadPlayerSessionRequests, loadPrivatePlayerSessionActivity } from "@/lib/coach-session-requests";
import { playrAccentForJuniorStage, playrAccents, playrJuniorStageLabel } from "@/lib/playr-ui";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type {
  Court,
  CourtBooking,
  CourtSideEvent,
  EntryStatus,
  JuniorAchievement,
  JuniorRatingHistory,
  MemberStatus,
  MatchInviteStatus,
  MatchInviteType,
  MatchVerificationStatus,
  OrganisationLinkStatus,
  Profile,
  Rating,
  RatingChange,
  Venue
} from "@/types/courtside";

type AcademyDetailLink = {
  id: string;
  status: OrganisationLinkStatus;
  connection_context: Record<string, unknown>;
  proposal_status: string;
  venue: Pick<Venue, "id" | "name" | "status"> | null;
};

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
    case "missing_migration": return "The latest CoachR scheduling migration has not been applied yet.";
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

function accentFor(profile: Profile) {
  if (!profile.is_junior) {
    return playrAccents.member;
  }

  return playrAccentForJuniorStage(profile.junior_stage);
}

function plural(value: number, singular: string, pluralValue: string) {
  return value === 1 ? singular : pluralValue;
}

function InfoLine({ icon, value, muted = false }: { icon: ReactNode; value: string; muted?: boolean }) {
  return (
    <p className={`flex min-w-0 items-center gap-2 text-sm ${muted ? "text-slate-500" : "text-slate-700"}`}>
      {icon}
      <span className="truncate">{value}</span>
    </p>
  );
}

function StatChip({ icon, value, label }: { icon: ReactNode; value: string | number; label: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm">
      <p className="flex items-center gap-2 text-lg font-black text-court-navy">
        {icon}
        <span>{value}</span>
      </p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

function SectionCard({ children, id, title }: { children: ReactNode; id?: string; title: string }) {
  return (
    <section className="surface-card p-4 sm:p-5" id={id}>
      <h2 className="text-lg font-black text-court-navy">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
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

function memberStatusLabel(status: MemberStatus | null | undefined) {
  switch (status) {
    case "member":
      return "Active member";
    case "pending":
      return "Membership pending";
    case "inactive":
      return "Inactive membership";
    case "non_member":
      return "Non-member";
    default:
      return "Membership details to be confirmed";
  }
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
    { data: academyLinkData },
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
    supabase
      .from("organisation_player_links")
      .select("id,status,connection_context,proposal_status,venue:venue_id(id,name,status)")
      .eq("player_profile_id", player.id)
      .in("status", ["pending", "active", "suspended"])
      .order("created_at", { ascending: false }),
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

  const accent = accentFor(player);
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
  const academyLinks = (academyLinkData ?? []) as unknown as AcademyDetailLink[];
  const academyAssignments = (academyAssignmentData ?? []) as unknown as AcademyDetailAssignment[];
  const academyAssignmentByLink = new Map(academyAssignments.filter((assignment) => assignment.organisation_player_link_id).map((assignment) => [assignment.organisation_player_link_id as string, assignment]));
  const academyLessons = (academyLessonData ?? []) as unknown as AcademyDetailLesson[];
  const privateAcademySessions = privateAcademySessionError ? [] : (privateAcademySessionData ?? []) as PrivateAcademySessionRow[];
  const academyLessonByVenue = new Map<string, AcademyDetailLesson>();
  academyLessons.forEach((lesson) => {
    if (!academyLessonByVenue.has(lesson.venue_id)) academyLessonByVenue.set(lesson.venue_id, lesson);
  });

  const clubName = bookings[0]?.courts?.venues?.name ?? upcomingEntries.find((entry) => entry.events?.location)?.events?.location ?? null;
  const playerType = player.is_junior ? playrJuniorStageLabel(player.junior_stage) : parentProfile.id === player.id && parentProfile.parent_profile_id === null ? "Parent / Member" : "Member";
  const ratingText = player.is_junior ? formatJuniorRating(player.junior_stage, player.junior_rating) : rating ? rating.rating_value.toFixed(1) : "No active rating yet";
  const confidenceText = player.is_junior ? formatLabel(player.junior_rating_confidence) : rating ? formatLabel(rating.confidence) : "No rating yet";
  const participationText = player.is_junior ? `${player.participation_score} pts` : `${player.participation_score ?? 0} pts`;
  const profileHref = `/dashboard/profile?member=${player.id}#member-details`;
  const requestReturnTo = `/dashboard/players/${player.id}#lesson-requests`;
  const pendingSessionRequests = sessionRequests.filter((request) => isPendingSessionRequest(request.status));
  const recentSessionRequests = sessionRequests.filter((request) => !isPendingSessionRequest(request.status)).slice(0, 8);
  const requestByOccurrence = new Map(sessionRequests.map((request) => [request.occurrence_id, request]));
  const cancelledSessions = privateSessionActivity.filter((activity) => activity.occurrence_status === "cancelled" || activity.occurrence_status === "rain" || activity.occurrence_status === "sick");

  return (
    <PageShell eyebrow="Player Detail" subtitle="Player profile, progress and upcoming tennis activity." title={playerName(player)}>
      <StatusAlert className="mb-5" message={requestMessage(searchParams?.request)} tone="success" />
      <StatusAlert className="mb-5" message={requestErrorMessage(searchParams?.request_error)} tone="error" />
      <div className="mb-5">
        <Link className="font-bold text-court-blue" href="/dashboard">
          Back to MyPlayR
        </Link>
      </div>

      <nav className="mb-5 flex gap-2 overflow-x-auto rounded-lg border border-slate-200 bg-white p-2 text-sm font-black shadow-sm" aria-label="Player detail sections">
        <a className="whitespace-nowrap rounded bg-court-navy px-3 py-2 text-white" href="#overview">
          Overview
        </a>
        <a className="whitespace-nowrap rounded px-3 py-2 text-court-navy hover:bg-court-mist" href="#progress">
          Progress
        </a>
        <a className="whitespace-nowrap rounded px-3 py-2 text-court-navy hover:bg-court-mist" href="#lesson-requests">
          Lessons
        </a>
        <a className="whitespace-nowrap rounded px-3 py-2 text-court-navy hover:bg-court-mist" href="#membership">
          Membership
        </a>
        <a className="whitespace-nowrap rounded px-3 py-2 text-court-navy hover:bg-court-mist" href="#academies">
          Academies
        </a>
        <a className="whitespace-nowrap rounded px-3 py-2 text-court-navy hover:bg-court-mist" href="#private-details">
          Private Details
        </a>
      </nav>

      <section className={`overflow-hidden rounded-lg border bg-white shadow-court ${accent.border}`} id="overview">
        <div className={`h-2 ${accent.strip}`} />
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className={`grid h-20 w-20 shrink-0 place-items-center rounded-lg text-2xl font-black ${accent.avatar}`}>{playerInitials(player)}</div>
            <div className="min-w-0">
              <h2 className="text-3xl font-black text-court-navy">{playerName(player)}</h2>
              <span className={`mt-2 inline-flex rounded px-2.5 py-1 text-xs font-black uppercase tracking-wide ${accent.badge}`}>{playerType}</span>
              <div className="mt-4 grid gap-2">
                <InfoLine
                  icon={<RatingIcon rating={player.is_junior ? player.junior_rating : rating?.rating_value ?? null} size={16} stage={player.is_junior ? player.junior_stage : "member"} />}
                  value={ratingText}
                />
                <InfoLine icon={<SchoolIcon size={16} />} muted value="No school linked" />
                <InfoLine icon={<ClubIcon size={16} />} muted={!clubName} value={clubName ?? "No club linked"} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
            <StatChip icon={<ParticipationIcon size={18} />} label="Participation" value={participationText} />
            <StatChip icon={<ConfidenceIcon size={18} />} label="Confidence" value={confidenceText} />
            <StatChip icon={<InviteIcon size={18} />} label={plural(invites.length, "Invite", "Invites")} value={invites.length} />
            <StatChip icon={<EventIcon size={18} />} label={plural(upcomingEntries.length, "Event", "Events")} value={upcomingEntries.length} />
            <StatChip icon={<BookingIcon size={18} />} label={plural(bookings.length, "Booking", "Bookings")} value={bookings.length} />
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Leaderboard">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {rankText(<SchoolIcon size={14} />, "School Rank")}
            {rankText(<ClubIcon size={14} />, "Club Rank")}
            {rankText(<DistrictIcon size={14} />, "District Rank")}
          </div>
        </SectionCard>

        <SectionCard title="Upcoming Activity">
          <div className="grid gap-3">
            {bookings.slice(0, 3).map((booking) => (
              <ActivityItem
                icon={<BookingIcon size={16} />}
                key={booking.id}
                meta={`${formatDateTime(booking.start_time)}${booking.courts?.venues?.name ? ` / ${booking.courts.venues.name}` : ""}`}
                title={booking.courts?.name ?? "Court booking"}
              />
            ))}
            {upcomingEntries.slice(0, 3).map((entry) =>
              entry.events ? (
                <ActivityItem
                  icon={<EventIcon size={16} />}
                  key={entry.id}
                  meta={`${formatDateTime(entry.events.start_datetime)}${entry.events.location ? ` / ${entry.events.location}` : ""}`}
                  title={entry.events.title}
                />
              ) : null
            )}
            {invites.slice(0, 3).map((invite) => {
              const isIncoming = invite.opponent_profile_id === player.id;
              const otherName = isIncoming ? `${invite.inviter_first_name} ${invite.inviter_last_name}` : `${invite.opponent_first_name} ${invite.opponent_last_name}`;
              return (
                <ActivityItem
                  icon={<InviteIcon size={16} />}
                  key={invite.id}
                  meta={`${formatLabel(invite.match_type)} match${invite.booking_start_time ? ` / ${formatDateTime(invite.booking_start_time)}` : ""}${invite.booking_court_name ? ` / ${invite.booking_court_name}` : ""}`}
                  title={isIncoming ? `Invite from ${otherName}` : `Invite sent to ${otherName}`}
                />
              );
            })}
            {!bookings.length && !upcomingEntries.length && !invites.length ? <EmptyState text="No upcoming activity yet." /> : null}
          </div>
        </SectionCard>
      </div>

      {(pendingSessionRequests.length > 0 || cancelledSessions.length > 0 || recentSessionRequests.length > 0) ? (
        <section className="surface-card mt-5 p-4 sm:p-5" id="lesson-requests">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="section-kicker">CoachR</p><h2 className="mt-1 text-lg font-black text-court-navy">Lesson Requests</h2><p className="mt-1 text-sm text-slate-600">Approve proposed moves or request another time after a cancellation.</p></div><BookingIcon className="text-court-teal" size={20} /></div>
          {pendingSessionRequests.length > 0 ? <div className="mt-4 grid gap-3">{pendingSessionRequests.map((request) => <SessionRequestCard key={request.id} request={request} returnTo={requestReturnTo} viewer="player" />)}</div> : null}
          {cancelledSessions.length > 0 ? <div className="mt-4 grid gap-3"><p className="text-sm font-black uppercase tracking-wide text-slate-500">Cancelled Lessons</p>{cancelledSessions.slice(0, 6).map((activity) => <CancelledSessionCard activity={activity} existingRequest={requestByOccurrence.get(activity.occurrence_id) ?? null} key={activity.occurrence_id} playerProfileId={player.id} returnTo={requestReturnTo} />)}</div> : null}
          {recentSessionRequests.length > 0 ? <details className="ui-collapsible mt-4 rounded-lg border border-slate-200 p-3"><summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-black text-court-navy"><span>Request History</span><span className="ui-collapsible-chevron"><ChevronDownIcon size={16} /></span></summary><div className="mt-3 grid gap-3">{recentSessionRequests.map((request) => <SessionRequestCard compact key={request.id} request={request} returnTo={requestReturnTo} viewer="player" />)}</div></details> : null}
        </section>
      ) : null}

      <section className="surface-card mt-5 p-4 sm:p-5" id="academies">
        <div className="flex items-start justify-between gap-3"><div><p className="section-kicker">Connected organisations</p><h2 className="mt-1 text-lg font-black text-court-navy">Academies</h2></div><ClubIcon className="text-court-teal" size={20} /></div>
        {academyLinks.length > 0 ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {academyLinks.map((link) => {
              const assignment = academyAssignmentByLink.get(link.id);
              const lesson = link.venue?.id ? academyLessonByVenue.get(link.venue.id) : null;
              const linkedSessions = link.venue?.id ? privateAcademySessions.filter((session) => session.academy_id === link.venue?.id) : [];
              const proposalValue = link.connection_context.proposal;
              const proposal = proposalValue && typeof proposalValue === "object" && !Array.isArray(proposalValue) ? proposalValue as Record<string, unknown> : null;
              const schedule = proposal ? [proposal.day, proposal.startTime].filter((value) => typeof value === "string" && value).join(" · ") : "";
              return (
                <article className="rounded-lg border border-court-teal/25 bg-court-mist p-4" key={link.id}>
                  <div className="flex items-start justify-between gap-2"><h3 className="font-black text-court-navy">{link.venue?.name ?? "Academy"}</h3><span className={`ui-chip ${link.status === "active" && link.venue?.status !== "inactive" ? "ui-chip-success" : "ui-chip-warning"}`}>{link.venue?.status === "inactive" ? "Organisation inactive" : link.status === "active" ? "Connection active" : link.status === "suspended" ? "Connection paused" : "Invitation pending"}</span></div>
                  <p className="mt-3 text-sm font-semibold text-slate-700">Coach: {assignment?.coach ? playerName(assignment.coach) : "To be assigned"}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">Lesson: {lesson ? formatDateTime(lesson.start_time) : schedule || (link.proposal_status === "proposed" ? "Proposal details to be confirmed" : "No lesson scheduled yet")}</p>
                  {lesson ? <p className="mt-1 text-sm text-slate-600">Venue: {lesson.external_venue?.name ?? lesson.court?.name ?? lesson.custom_location ?? "To be confirmed"}</p> : proposal && typeof proposal.venue === "string" ? <p className="mt-1 text-sm text-slate-600">Venue: {proposal.venue}</p> : null}
                  {linkedSessions.length > 0 ? (
                    <details className="ui-collapsible mt-4 border-t border-court-teal/20 pt-3">
                      <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-black text-court-navy"><span>My Academy Sessions · {linkedSessions.length}</span><span className="ui-collapsible-chevron"><ChevronDownIcon size={16} /></span></summary>
                      <div className="mt-3 divide-y divide-court-teal/15">
                        {linkedSessions.map((session) => (
                          <div className="py-3 first:pt-0 last:pb-0" key={session.session_id}>
                            <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-black text-court-navy">{session.session_name}</p><span className="ui-chip ui-chip-brand">{formatLabel(session.session_type)}</span></div>
                            <p className="mt-1 text-sm font-semibold text-slate-700">{session.next_start_time ? formatDateTime(session.next_start_time) : "No upcoming occurrence"}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">{session.coach_name} · {session.location_name ?? "Venue to be confirmed"}</p>
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : <EmptyState text="No academy connections yet." />}
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <CollapsibleCard
          badge={
            <span className="ui-chip ui-chip-brand">
              <MembershipIcon size={14} /> Private
            </span>
          }
          eyebrow="Membership"
          id="membership"
          summary={`${memberStatusLabel(player.member_status)} · ${clubName ?? "No club linked"} · Renewal to be confirmed`}
          title="Membership Details"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailRow label="Membership Status" value={memberStatusLabel(player.member_status)} />
            <DetailRow label="Membership Type" value="Membership details to be confirmed" />
            <DetailRow label="Renewal Date" value="Renewal date to be confirmed" />
            <DetailRow label="Club" value={clubName ?? "No club linked yet"} />
            <DetailRow label="Pricing" value="Pricing to be confirmed" />
            <DetailRow label="Benefits" value="Benefits depend on your club setup" />
          </div>
          <div className="mt-4 flex flex-col gap-3 rounded-lg border border-court-teal/25 bg-court-mist p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-bold leading-6 text-court-navy">Membership and billing rules are managed in the private Profile hub.</p>
            <Link className="btn-secondary shrink-0" href={profileHref}>
              Open Profile
            </Link>
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          badge={
            <span className="ui-chip ui-chip-brand">
              <PrivateIcon size={14} /> Private
            </span>
          }
          eyebrow="Private"
          id="private-details"
          summary={`${familyRole(player, parentProfile)} · Contact and account details`}
          title="Private Details"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailRow label="Family Role" value={familyRole(player, parentProfile)} />
            <DetailRow label="Email" value={player.is_junior ? player.email ?? "No junior email linked" : player.email ?? user.email ?? "No email linked"} />
            <DetailRow label="Phone" value={player.phone ?? "Phone number not set"} />
            <DetailRow label="Date of Birth" value={player.date_of_birth ? formatDate(player.date_of_birth) : "Date of birth not set"} />
            <DetailRow label="Primary Sport" value={formatLabel(player.primary_sport)} />
            <DetailRow label="Player Level" value={formatLabel(player.player_level)} />
            <DetailRow label="Consent Settings" value="Consent settings coming soon" />
            <DetailRow label="Profile Privacy" value="Private dashboard only" />
          </div>
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            These private details are shown only inside the signed-in dashboard for the account holder or linked parent/guardian.
          </div>
        </CollapsibleCard>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <SectionCard id="progress" title="Progress">
          <div className="grid gap-3 sm:grid-cols-2">
            {player.is_junior ? (
              <>
                <StatChip icon={<ParticipationIcon size={18} />} label="Participation" value={participationText} />
                <StatChip icon={<StageIcon size={18} />} label="Stage readiness" value={`${player.stage_readiness_score}%`} />
                <StatChip icon={<MatchIcon size={18} />} label="Matches" value={player.matches_played} />
                <StatChip icon={<ResultIcon size={18} />} label="Record" value={`${player.wins}-${player.losses}`} />
                <StatChip icon={<EventIcon size={18} />} label="Events played" value={player.events_played} />
                <StatChip icon={<ChallengeIcon size={18} />} label="Close matches" value={player.close_matches} />
              </>
            ) : (
              <>
                <StatChip icon={<RatingIcon rating={rating?.rating_value ?? null} size={18} stage="member" />} label="Rating" value={ratingText} />
                <StatChip icon={<ConfidenceIcon size={18} />} label="Confidence" value={confidenceText} />
                <StatChip icon={<MatchIcon size={18} />} label="Rated matches" value={rating?.verified_match_count ?? 0} />
                <StatChip icon={<StatusIcon size={18} />} label="Status" value={rating?.provisional === false ? "Verified" : "Provisional"} />
              </>
            )}
          </div>

          <div className="mt-4">
            <p className="text-sm font-black uppercase tracking-wide text-slate-500">Recent history</p>
            <div className="mt-3 grid gap-2">
              {player.is_junior && juniorHistory.length
                ? juniorHistory.map((history) => (
                    <div className="rounded bg-slate-50 p-3 text-sm" key={history.id}>
                      <p className="font-black text-court-navy">{formatLabel(history.reason)}</p>
                      <p className="mt-1 text-slate-600">
                        {history.previous_rating?.toFixed(1) ?? "-"} to {history.new_rating?.toFixed(1) ?? "-"} ({history.change_amount > 0 ? "+" : ""}
                        {history.change_amount.toFixed(2)}) / {formatDate(history.created_at)}
                      </p>
                    </div>
                  ))
                : null}
              {!player.is_junior && ratingChanges.length
                ? ratingChanges.map((change) => (
                    <div className="rounded bg-slate-50 p-3 text-sm" key={change.id}>
                      <p className="font-black text-court-navy">
                        {change.rating_before.toFixed(1)} to {change.rating_after.toFixed(1)}
                      </p>
                      <p className="mt-1 text-slate-600">
                        {change.rating_delta > 0 ? "+" : ""}
                        {change.rating_delta.toFixed(2)} / {formatDate(change.created_at)}
                      </p>
                    </div>
                  ))
                : null}
              {!juniorHistory.length && !ratingChanges.length ? <EmptyState text="No recent rating history yet." /> : null}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Badges & Achievements">
          {achievements.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {achievements.map((badge) => (
                <div className={`rounded-lg border p-3 ${accent.border} ${accent.tint}`} key={badge.id}>
                  <p className="flex items-center gap-2 font-black text-court-navy">
                    <BadgeIcon size={16} />
                    <span>{badge.badge_name}</span>
                  </p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                    {formatLabel(badge.category)} / {formatDate(badge.earned_at)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState text="No badges yet — play events and matches to start earning badges." />
          )}
        </SectionCard>
      </div>

      {verifiedMatches.length ? (
        <section className="surface-card mt-5 p-4 sm:p-5">
          <h2 className="text-lg font-black text-court-navy">Recent Matches</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {verifiedMatches.slice(0, 4).map((match) => (
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm" key={match.id}>
                <p className="font-black text-court-navy">vs {matchPlayerName(match, player.id)}</p>
                <p className="mt-1 text-slate-600">
                  {match.score_text} / {match.winner_profile_id === player.id ? "Win" : "Result"}
                </p>
                <p className="mt-1 text-xs text-slate-500">{formatDate(match.confirmed_at ?? match.submitted_at)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </PageShell>
  );
}
