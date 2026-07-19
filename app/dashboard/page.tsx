import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { PageShell } from "@/components/page-shell";
import { CancelledSessionCard, SessionRequestCard } from "@/components/session-request-cards";
import { ArrowRightIcon, BookingIcon, ClubIcon, EntriesIcon, EventIcon, InviteIcon, MembershipIcon, RatingIcon, SchoolIcon } from "@/components/playr-icons";
import { StatusAlert } from "@/components/status-alert";
import { formatJuniorRating, formatLabel } from "@/lib/courtside-format";
import { isPendingSessionRequest, loadPlayerSessionRequests, loadPrivatePlayerSessionActivity } from "@/lib/coach-session-requests";
import { playrAccentForJuniorStage, playrAccents, playrJuniorStageLabel } from "@/lib/playr-ui";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type {
  Court,
  CourtBooking,
  CourtSideEvent,
  EntryStatus,
  MatchInviteStatus,
  MatchInviteType,
  OrganisationLinkStatus,
  Profile,
  Rating,
  Venue
} from "@/types/courtside";

type AcademyLinkRow = {
  id: string;
  venue_id: string;
  player_profile_id: string;
  status: OrganisationLinkStatus;
  connection_context: Record<string, unknown>;
  proposal_status: string;
  venue: Pick<Venue, "id" | "name" | "status" | "organisation_type"> | null;
};

type AcademyAssignmentRow = {
  organisation_player_link_id: string | null;
  player_profile_id: string;
  coach: Pick<Profile, "id" | "first_name" | "last_name"> | null;
};

type AcademyLessonRow = {
  id: string;
  venue_id: string;
  player_id: string;
  start_time: string;
  custom_location: string | null;
  court: Pick<Court, "name"> | null;
  external_venue: { name: string } | null;
};

type DashboardAcademySessionRow = {
  player_profile_id: string;
  session_id: string;
  academy_id: string;
  academy_name: string;
  session_name: string;
  session_type: "private" | "semi_private" | "squad";
  coach_name: string;
  next_start_time: string | null;
  location_name: string | null;
};

export const dynamic = "force-dynamic";

type BookingRow = Pick<CourtBooking, "id" | "player_profile_id" | "start_time"> & {
  courts: (Pick<Court, "name"> & { venues: Pick<Venue, "name"> | null }) | null;
};

type DashboardMatchInvite = {
  id: string;
  inviter_profile_id: string;
  opponent_profile_id: string;
  match_type: MatchInviteType;
  status: MatchInviteStatus;
  created_at: string;
};

type DashboardEventEntry = {
  id: string;
  profile_id: string;
  entry_status: EntryStatus;
  events: Pick<CourtSideEvent, "title" | "start_datetime" | "location"> | null;
};

type JuniorCardProfile = Pick<
  Profile,
  | "id"
  | "first_name"
  | "last_name"
  | "junior_stage"
  | "junior_rating"
  | "junior_rating_confidence"
  | "participation_score"
>;

type ActivityCounts = {
  invites: number;
  events: number;
  bookings: number;
};

function playerName(profile: Pick<Profile, "first_name" | "last_name">) {
  return `${profile.first_name} ${profile.last_name}`;
}

function emptyActivity(): ActivityCounts {
  return { invites: 0, events: 0, bookings: 0 };
}

function playerInitials(profile: Pick<Profile, "first_name" | "last_name"> | null) {
  if (!profile) {
    return "PR";
  }

  return `${profile.first_name.charAt(0)}${profile.last_name.charAt(0)}`.toUpperCase();
}

function InfoRow({ icon, value, muted = false }: { icon: ReactNode; value: string; muted?: boolean }) {
  return (
    <p className={`flex min-w-0 items-center gap-2 text-sm ${muted ? "text-slate-500" : "text-slate-700"}`}>
      {icon}
      <span className="truncate">{value}</span>
    </p>
  );
}

function CounterPill({ icon, count, label }: { icon: ReactNode; count: number; label: string }) {
  return (
    <div className="ui-counter">
      {icon}
      <span>{count}</span>
      <span className="hidden truncate sm:inline">{label}</span>
    </div>
  );
}

function academyProposal(context: Record<string, unknown>) {
  const value = context.proposal;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function proposalText(proposal: Record<string, unknown> | null) {
  if (!proposal) return null;
  const value = (key: string) => typeof proposal[key] === "string" || typeof proposal[key] === "number" ? String(proposal[key]) : "";
  return [value("day"), value("startTime"), value("durationMinutes") ? `${value("durationMinutes")} min` : ""].filter(Boolean).join(" · ") || null;
}

function AcademyConnectionCard({ assignment, lesson, link, player, sessions }: { assignment: AcademyAssignmentRow | null; lesson: AcademyLessonRow | null; link: AcademyLinkRow; player: Pick<Profile, "id" | "first_name" | "last_name">; sessions: DashboardAcademySessionRow[] }) {
  const proposal = academyProposal(link.connection_context);
  const schedule = proposalText(proposal);
  const connectionLabel = link.status === "active" ? "Connection active" : link.status === "suspended" ? "Connection paused" : "Invitation pending";
  const organisationInactive = link.venue?.status === "inactive";
  const nextSession = sessions.find((session) => session.next_start_time) ?? sessions[0];

  return (
    <Link className="group block rounded-lg focus-ring" href={`/dashboard/players/${player.id}#academies`}>
      <article className="overflow-hidden rounded-lg border border-court-teal/35 bg-white shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-court">
        <div className="h-1.5 bg-court-navy" />
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div><p className="section-kicker">Academy</p><h3 className="mt-1 text-lg font-black text-court-navy">{link.venue?.name ?? "Academy"}</h3><p className="mt-1 text-sm font-semibold text-slate-600">{playerName(player)}</p></div>
            <span className={`ui-chip ${organisationInactive || link.status === "suspended" ? "ui-chip-warning" : link.status === "active" ? "ui-chip-success" : "ui-chip-muted"}`}>{organisationInactive ? "Organisation inactive" : connectionLabel}</span>
          </div>
          <div className="mt-4 grid gap-2 text-sm font-semibold text-slate-700 sm:grid-cols-2">
            <p className="flex items-center gap-2"><EntriesIcon size={15} /> Coach: {assignment?.coach ? playerName(assignment.coach) : "To be assigned"}</p>
            {nextSession?.next_start_time ? <p className="flex items-center gap-2"><EventIcon size={15} /> Next: {new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date(nextSession.next_start_time))}</p> : lesson ? <p className="flex items-center gap-2"><EventIcon size={15} /> Next: {new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date(lesson.start_time))}</p> : schedule ? <p className="flex items-center gap-2"><EventIcon size={15} /> Proposed: {schedule}</p> : <p className="flex items-center gap-2 text-slate-500"><EventIcon size={15} /> No session scheduled yet</p>}
            {nextSession ? <p className="flex items-center gap-2 sm:col-span-2"><ClubIcon size={15} /> {nextSession.location_name ?? "Venue to be confirmed"} · {sessions.length} active session{sessions.length === 1 ? "" : "s"}</p> : lesson ? <p className="flex items-center gap-2 sm:col-span-2"><ClubIcon size={15} /> {lesson.external_venue?.name ?? lesson.court?.name ?? lesson.custom_location ?? "Venue to be confirmed"}</p> : proposal && typeof proposal.venue === "string" ? <p className="flex items-center gap-2 sm:col-span-2"><ClubIcon size={15} /> {proposal.venue}</p> : null}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-sm font-black text-court-navy"><span>Open Academy Context</span><ArrowRightIcon size={16} /></div>
        </div>
      </article>
    </Link>
  );
}

function MemberCard({
  profile,
  rating,
  activity,
  juniorCount,
  clubName
}: {
  profile: Profile | null;
  rating: Rating | null;
  activity: ActivityCounts;
  juniorCount: number;
  clubName: string | null;
}) {
  const name = profile ? playerName(profile) : "Set up your profile";
  const memberType = juniorCount > 0 ? "Parent / Member" : "Member";
  const ratingText = rating ? rating.rating_value.toFixed(1) : "No active rating yet";
  const accent = playrAccents.member;
  const href = profile ? `/dashboard/players/${profile.id}` : "/dashboard/profile";

  return (
    <Link aria-label={`Open ${name} profile`} className="group block rounded-lg focus-ring" href={href}>
      <article className={`overflow-hidden rounded-lg border bg-white shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-court group-hover:ring-4 ${accent.border} ${accent.ring}`}>
        <div className={`h-1.5 ${accent.strip}`} />
        <div className="p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg text-sm font-black ${accent.avatar}`}>{playerInitials(profile)}</div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-xl font-black text-court-navy">{name}</h3>
              <span className={`mt-1 inline-flex rounded px-2 py-1 text-xs font-black uppercase tracking-wide ${accent.badge}`}>{memberType}</span>
            </div>
          </div>

          <div className={`mt-4 space-y-2 rounded ${accent.tint} p-3`}>
            <InfoRow icon={<RatingIcon rating={rating?.rating_value ?? null} size={16} stage="member" />} value={ratingText} />
            <InfoRow icon={<SchoolIcon size={16} />} muted value="No school linked" />
            <InfoRow icon={<ClubIcon size={16} />} muted={!clubName} value={clubName ?? "No club linked"} />
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <CounterPill count={activity.invites} icon={<InviteIcon size={15} />} label={activity.invites === 1 ? "Invite" : "Invites"} />
            <CounterPill count={activity.events} icon={<EventIcon size={15} />} label={activity.events === 1 ? "Event" : "Events"} />
            <CounterPill count={activity.bookings} icon={<BookingIcon size={15} />} label={activity.bookings === 1 ? "Booking" : "Bookings"} />
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-sm font-black text-court-navy">
            <span>Open Card</span>
            <ArrowRightIcon size={16} />
          </div>
        </div>
      </article>
    </Link>
  );
}

function JuniorCard({ junior, activity, clubName }: { junior: JuniorCardProfile; activity: ActivityCounts; clubName: string | null }) {
  const name = playerName(junior);
  const accent = playrAccentForJuniorStage(junior.junior_stage);
  const stageLabel = playrJuniorStageLabel(junior.junior_stage);

  return (
    <Link aria-label={`Open ${name} player detail`} className="group block rounded-lg focus-ring" href={`/dashboard/players/${junior.id}`}>
      <article className={`overflow-hidden rounded-lg border bg-white shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-court group-hover:ring-4 ${accent.border} ${accent.ring}`}>
        <div className={`h-1.5 ${accent.strip}`} />
        <div className="p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg text-sm font-black ${accent.avatar}`}>{playerInitials(junior)}</div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-xl font-black text-court-navy">{name}</h3>
              <span className={`mt-1 inline-flex rounded px-2 py-1 text-xs font-black uppercase tracking-wide ${accent.badge}`}>{stageLabel}</span>
            </div>
          </div>

          <div className={`mt-4 space-y-2 rounded ${accent.tint} p-3`}>
            <InfoRow
              icon={<RatingIcon rating={junior.junior_rating} size={16} stage={junior.junior_stage} />}
              value={`${formatJuniorRating(junior.junior_stage, junior.junior_rating)} / ${formatLabel(junior.junior_rating_confidence)}`}
            />
            <InfoRow icon={<SchoolIcon size={16} />} muted value="No school linked" />
            <InfoRow icon={<ClubIcon size={16} />} muted={!clubName} value={clubName ?? "No club linked"} />
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <CounterPill count={activity.invites} icon={<InviteIcon size={15} />} label={activity.invites === 1 ? "Invite" : "Invites"} />
            <CounterPill count={activity.events} icon={<EventIcon size={15} />} label={activity.events === 1 ? "Event" : "Events"} />
            <CounterPill count={activity.bookings} icon={<BookingIcon size={15} />} label={activity.bookings === 1 ? "Booking" : "Bookings"} />
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-sm font-black text-court-navy">
            <span>Open Card</span>
            <ArrowRightIcon size={16} />
          </div>
        </div>
      </article>
    </Link>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams?: { profile?: string; request?: string; request_error?: string } }) {
  if (!hasSupabaseConfig()) {
    return (
      <PageShell eyebrow="MyPlayR" title="Supabase is not configured.">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <p className="text-slate-700">Add Supabase environment variables to use account and profile features.</p>
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

  const { data: profileData } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_junior", false)
    .maybeSingle();

  const profile = profileData as Profile | null;
  let juniorRows: JuniorCardProfile[] = [];
  const profileIds = profile ? [profile.id] : [];

  if (profile) {
    const { data: juniorData, error: juniorError } = await supabase
      .from("profiles")
      .select("id,first_name,last_name,junior_stage,junior_rating,junior_rating_confidence,participation_score")
      .eq("parent_profile_id", profile.id)
      .eq("is_junior", true)
      .order("participation_score", { ascending: false });

    if (juniorError) {
      console.error("CourtSide dashboard juniors load failed", { userId: user.id, error: juniorError });
    }

    juniorRows = (juniorData ?? []) as JuniorCardProfile[];
    profileIds.push(...juniorRows.map((junior) => junior.id));
  }

  const now = new Date().toISOString();
  const [{ data: inviteData, error: inviteError }, { data: ratingData, error: ratingError }, { data: entryData, error: entryError }, { data: bookingData, error: bookingError }] =
    profileIds.length > 0
      ? await Promise.all([
          supabase.rpc("match_invites_for_user"),
          supabase.from("ratings").select("*").in("profile_id", profileIds),
          supabase
            .from("event_entries")
            .select("id,profile_id,entry_status,events:event_id(title,start_datetime,location)")
            .in("profile_id", profileIds)
            .neq("entry_status", "cancelled"),
          supabase
            .from("court_bookings")
            .select("id,player_profile_id,start_time,courts:court_id(name,venues:venue_id(name))")
            .in("player_profile_id", profileIds)
            .eq("status", "confirmed")
            .gte("start_time", now)
            .order("start_time", { ascending: true })
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null }
        ];

  if (inviteError) {
    console.error("CourtSide dashboard match invites load failed", { userId: user.id, error: inviteError });
  }
  if (ratingError) {
    console.error("CourtSide dashboard ratings load failed", { userId: user.id, error: ratingError });
  }
  if (entryError) {
    console.error("CourtSide dashboard event entries load failed", { userId: user.id, error: entryError });
  }
  if (bookingError) {
    console.error("CourtSide dashboard bookings load failed", { userId: user.id, error: bookingError });
  }

  const [academyLinksResult, academyAssignmentsResult, academyLessonsResult] = profileIds.length > 0
    ? await Promise.all([
        supabase
          .from("organisation_player_links")
          .select("id,venue_id,player_profile_id,status,connection_context,proposal_status,venue:venue_id(id,name,status,organisation_type)")
          .in("player_profile_id", profileIds)
          .in("status", ["pending", "active", "suspended"])
          .order("created_at", { ascending: false }),
        supabase
          .from("coach_player_assignments")
          .select("organisation_player_link_id,player_profile_id,coach:coach_profile_id(id,first_name,last_name)")
          .in("player_profile_id", profileIds)
          .eq("status", "active"),
        supabase
          .from("coach_lessons")
          .select("id,venue_id,player_id,start_time,custom_location,court:court_id(name),external_venue:external_venue_id(name)")
          .in("player_id", profileIds)
          .eq("status", "scheduled")
          .gte("start_time", now)
          .order("start_time", { ascending: true })
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const academyLinks = (academyLinksResult.data ?? []) as unknown as AcademyLinkRow[];
  const academyAssignments = (academyAssignmentsResult.data ?? []) as unknown as AcademyAssignmentRow[];
  const academyLessons = (academyLessonsResult.data ?? []) as unknown as AcademyLessonRow[];
  const privateSessionResults = profileIds.length > 0
    ? await Promise.all(profileIds.map(async (profileId) => {
        const { data, error } = await supabase.rpc("coachr_private_player_sessions", { p_player_profile_id: profileId });
        if (error && error.code !== "PGRST202") {
          console.error("CourtSide dashboard academy sessions load failed", { code: error.code, profileId, userId: user.id });
        }
        return error ? [] : ((data ?? []) as Omit<DashboardAcademySessionRow, "player_profile_id">[]).map((session) => ({ ...session, player_profile_id: profileId }));
      }))
    : [];
  const privateAcademySessions = privateSessionResults.flat();
  const [sessionRequests, privateSessionActivityResults] = profileIds.length > 0
    ? await Promise.all([
        loadPlayerSessionRequests(supabase, profileIds),
        Promise.all(profileIds.map(async (profileId) => (await loadPrivatePlayerSessionActivity(supabase, profileId)).map((activity) => ({ ...activity, playerProfileId: profileId }))))
      ])
    : [[], []];
  const privateSessionActivity = privateSessionActivityResults.flat();
  const pendingSessionRequests = sessionRequests.filter((request) => isPendingSessionRequest(request.status));
  const recentSessionRequests = sessionRequests.filter((request) => !isPendingSessionRequest(request.status)).slice(0, 6);
  const requestByOccurrence = new Map(sessionRequests.map((request) => [request.occurrence_id, request]));
  const cancelledSessions = privateSessionActivity
    .filter((activity) => activity.occurrence_status === "cancelled" || activity.occurrence_status === "rain" || activity.occurrence_status === "sick")
    .slice(0, 4);
  const academyAssignmentByLink = new Map(academyAssignments.filter((assignment) => assignment.organisation_player_link_id).map((assignment) => [assignment.organisation_player_link_id as string, assignment]));
  const academyLessonByPlayer = new Map<string, AcademyLessonRow>();
  academyLessons.forEach((lesson) => {
    const key = `${lesson.player_id}:${lesson.venue_id}`;
    if (!academyLessonByPlayer.has(key)) academyLessonByPlayer.set(key, lesson);
  });

  const activityByProfileId = new Map<string, ActivityCounts>();
  profileIds.forEach((profileId) => {
    activityByProfileId.set(profileId, emptyActivity());
  });

  const addActivity = (profileId: string | null | undefined, key: keyof ActivityCounts) => {
    if (!profileId || !activityByProfileId.has(profileId)) {
      return;
    }

    const current = activityByProfileId.get(profileId) ?? emptyActivity();
    activityByProfileId.set(profileId, { ...current, [key]: current[key] + 1 });
  };

  const invites = inviteError ? [] : ((inviteData ?? []) as DashboardMatchInvite[]);
  invites
    .filter((invite) => invite.status === "pending")
    .forEach((invite) => {
      addActivity(invite.inviter_profile_id, "invites");
      addActivity(invite.opponent_profile_id, "invites");
    });

  const upcomingEntries = entryError
    ? []
    : ((entryData ?? []) as unknown as DashboardEventEntry[]).filter((entry) => entry.entry_status !== "cancelled" && entry.events?.start_datetime && entry.events.start_datetime >= now);
  upcomingEntries.forEach((entry) => addActivity(entry.profile_id, "events"));

  const upcomingBookings = bookingError ? [] : ((bookingData ?? []) as unknown as BookingRow[]);
  upcomingBookings.forEach((booking) => addActivity(booking.player_profile_id, "bookings"));

  const clubByProfileId = new Map<string, string>();
  upcomingBookings.forEach((booking) => {
    if (booking.player_profile_id && booking.courts?.venues?.name && !clubByProfileId.has(booking.player_profile_id)) {
      clubByProfileId.set(booking.player_profile_id, booking.courts.venues.name);
    }
  });
  upcomingEntries.forEach((entry) => {
    if (entry.events?.location && !clubByProfileId.has(entry.profile_id)) {
      clubByProfileId.set(entry.profile_id, entry.events.location);
    }
  });

  const ratings = ratingError ? [] : ((ratingData ?? []) as Rating[]);
  const adultRating = profile ? ratings.find((rating) => rating.profile_id === profile.id) ?? null : null;
  const memberActivity = profile ? activityByProfileId.get(profile.id) ?? emptyActivity() : emptyActivity();
  const totalPendingInvites = Array.from(activityByProfileId.values()).reduce((total, activity) => total + activity.invites, 0);
  const totalUpcomingEvents = Array.from(activityByProfileId.values()).reduce((total, activity) => total + activity.events, 0);
  const totalUpcomingBookings = Array.from(activityByProfileId.values()).reduce((total, activity) => total + activity.bookings, 0);
  const playerById = new Map<string, Pick<Profile, "id" | "first_name" | "last_name">>();
  if (profile) playerById.set(profile.id, profile);
  juniorRows.forEach((junior) => playerById.set(junior.id, junior));

  return (
    <PageShell eyebrow="MyPlayR" subtitle="Your players, progress and upcoming tennis activity." title="MyPlayR">
      <StatusAlert className="mb-5" message={searchParams?.profile === "saved" ? "Profile saved." : null} tone="success" />
      <StatusAlert className="mb-5" message={searchParams?.request === "approved" ? "Lesson confirmed. The new court and time are booked." : searchParams?.request === "declined" ? "Request declined. No unapproved booking changes were made." : searchParams?.request === "makeup_requested" ? "Lesson time requested. The court will be booked after coach approval." : null} tone="success" />
      <StatusAlert className="mb-5" message={searchParams?.request_error === "time_unavailable" ? "This time is no longer available. The original session has not changed." : searchParams?.request_error ? "The lesson request could not be completed. No schedule or booking changes were made." : null} tone="error" />
      {!profile ? (
        <StatusAlert
          className="mb-5"
          message="Start by completing your member profile. Once it is saved, you can link juniors, book courts, enter events, and manage match invites."
          tone="info"
        />
      ) : null}

      <section className="mb-6 rounded-lg bg-court-navy px-5 py-4 text-white shadow-court">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-court-lime">Match Invites</p>
            <p className="mt-1 text-2xl font-black">{totalPendingInvites}</p>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-court-lime">Upcoming Events</p>
            <p className="mt-1 text-2xl font-black">{totalUpcomingEvents}</p>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-court-lime">Upcoming Bookings</p>
            <p className="mt-1 text-2xl font-black">{totalUpcomingBookings}</p>
          </div>
        </div>
      </section>

      <section className="mb-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-kicker">Family hub</p>
            <h2 className="mt-2 text-2xl font-black text-court-navy">My PlayR Cards</h2>
          </div>
          <Link className="btn-secondary" href="/dashboard/juniors">
            Manage Juniors
          </Link>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <MemberCard activity={memberActivity} clubName={profile ? clubByProfileId.get(profile.id) ?? null : null} juniorCount={juniorRows.length} profile={profile} rating={adultRating} />

          {juniorRows.map((junior) => (
            <JuniorCard activity={activityByProfileId.get(junior.id) ?? emptyActivity()} clubName={clubByProfileId.get(junior.id) ?? null} junior={junior} key={junior.id} />
          ))}

          {profile && juniorRows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5">
              <p className="text-sm font-black uppercase tracking-wide text-court-teal">Linked juniors</p>
              <h3 className="mt-2 text-xl font-black text-court-navy">No junior players linked yet</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">Add a junior player to show their ball stage, rating, school, club, invites, events, and bookings here.</p>
              <Link className="btn-primary mt-5" href="/dashboard/juniors">
                Add Junior Player
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      {(pendingSessionRequests.length > 0 || cancelledSessions.length > 0 || recentSessionRequests.length > 0) ? (
        <section className="mb-6" id="lesson-requests">
          <div className="mb-4"><p className="section-kicker">CoachR</p><h2 className="mt-2 text-2xl font-black text-court-navy">Lesson Changes</h2><p className="mt-1 text-sm text-slate-600">Requests and cancelled private lessons across your PlayR cards.</p></div>
          <div className="grid gap-3 lg:grid-cols-2">
            {pendingSessionRequests.map((request) => <SessionRequestCard key={request.id} request={request} returnTo="/dashboard#lesson-requests" viewer="player" />)}
            {cancelledSessions.map((activity) => <CancelledSessionCard activity={activity} existingRequest={requestByOccurrence.get(activity.occurrence_id) ?? null} key={`${activity.playerProfileId}:${activity.occurrence_id}`} playerProfileId={activity.playerProfileId} returnTo="/dashboard#lesson-requests" />)}
          </div>
          {recentSessionRequests.length > 0 ? <details className="ui-collapsible mt-3 rounded-lg border border-slate-200 bg-white p-3"><summary className="flex cursor-pointer items-center justify-between text-sm font-black text-court-navy"><span>Request History</span><ArrowRightIcon className="ui-collapsible-chevron rotate-90" size={16} /></summary><div className="mt-3 grid gap-3 lg:grid-cols-2">{recentSessionRequests.map((request) => <SessionRequestCard compact key={request.id} request={request} returnTo="/dashboard#lesson-requests" viewer="player" />)}</div></details> : null}
        </section>
      ) : null}

      {academyLinks.length > 0 ? (
        <section className="mb-6" id="academies">
          <div className="mb-4"><p className="section-kicker">Connected organisations</p><h2 className="mt-2 text-2xl font-black text-court-navy">My Academies</h2></div>
          <div className="grid gap-4 lg:grid-cols-2">
            {academyLinks.map((link) => {
              const linkedPlayer = playerById.get(link.player_profile_id);
              if (!linkedPlayer) return null;
              return <AcademyConnectionCard assignment={academyAssignmentByLink.get(link.id) ?? null} key={link.id} lesson={academyLessonByPlayer.get(`${link.player_profile_id}:${link.venue_id}`) ?? null} link={link} player={linkedPlayer} sessions={privateAcademySessions.filter((session) => session.player_profile_id === link.player_profile_id && session.academy_id === link.venue_id)} />;
            })}
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link className="action-card flex items-center gap-3 font-bold text-court-navy" href="/dashboard/book-court">
          <BookingIcon size={18} />
          <span>Book Court</span>
        </Link>
        <Link className="action-card flex items-center gap-3 font-bold text-court-navy" href="/dashboard/play">
          <InviteIcon size={18} />
          <span>Send Invite</span>
        </Link>
        <Link className="action-card flex items-center gap-3 font-bold text-court-navy" href="/dashboard/events">
          <EventIcon size={18} />
          <span>Browse Events</span>
        </Link>
        <Link className="action-card flex items-center gap-3 font-bold text-court-navy" href="/dashboard/memberships">
          <MembershipIcon size={18} />
          <span>Memberships</span>
        </Link>
      </section>
    </PageShell>
  );
}
