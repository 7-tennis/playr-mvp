import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { formatDateTime, formatJuniorRating, formatLabel } from "@/lib/courtside-format";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { Court, CourtBooking, MatchInviteStatus, MatchInviteType, MatchVerificationStatus, PlayerLevel, Profile, Rating, RatingChange } from "@/types/courtside";

export const dynamic = "force-dynamic";

type BookingRow = Pick<CourtBooking, "id" | "start_time" | "end_time" | "booking_type" | "status"> & {
  courts: Pick<Court, "name"> | null;
  profiles: Pick<Profile, "first_name" | "last_name" | "is_junior"> | null;
};

type DashboardMatchInvite = {
  id: string;
  invited_by_user_id: string;
  inviter_profile_id: string;
  opponent_profile_id: string;
  match_type: MatchInviteType;
  status: MatchInviteStatus;
  created_at: string;
};

type DashboardMatch = {
  id: string;
  match_invite_id: string;
  submitted_by_user_id: string;
  verification_status: MatchVerificationStatus;
  submitted_at: string;
};

function provisionalRating(level: PlayerLevel | null | undefined) {
  switch (level) {
    case "advanced":
      return { value: "8.0", band: "Advanced" };
    case "club_competitive":
      return { value: "6.5", band: "Club Competitive" };
    case "intermediate":
      return { value: "5.0", band: "Intermediate" };
    case "social":
      return { value: "3.5", band: "Social" };
    case "beginner":
      return { value: "2.0", band: "Beginner" };
    default:
      return { value: "3.5", band: "Social" };
  }
}

function profileCompletion(profile: Profile | null) {
  if (!profile) {
    return { percent: 0, label: "Player Profile needed", text: "Create your Player Profile to unlock court bookings and player progress." };
  }

  const fields = [profile.first_name, profile.last_name, profile.email, profile.phone, profile.date_of_birth, profile.primary_sport, profile.player_level !== "unknown" ? profile.player_level : ""];
  const complete = fields.filter(Boolean).length;
  const percent = Math.round((complete / fields.length) * 100);

  return {
    percent,
    label: percent >= 85 ? "Ready to play" : "Almost ready",
    text: percent >= 85 ? "Your player basics are in place." : "Add a few more details to make club admin easier."
  };
}

export default async function DashboardPage({ searchParams }: { searchParams?: { profile?: string } }) {
  if (!hasSupabaseConfig()) {
    return (
      <PageShell eyebrow="My PlayR" title="Supabase is not configured.">
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
  const { count: juniorCount } = profile
    ? await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("parent_profile_id", profile.id)
        .eq("is_junior", true)
    : { count: 0 };

  const profileIds = profile ? [profile.id] : [];
  let juniorProgressRows: Pick<Profile, "id" | "first_name" | "last_name" | "junior_stage" | "junior_rating" | "junior_rating_confidence" | "participation_score" | "stage_readiness_score">[] = [];
  if (profile) {
    const { data: juniorIds } = await supabase
      .from("profiles")
      .select("id,first_name,last_name,junior_stage,junior_rating,junior_rating_confidence,participation_score,stage_readiness_score")
      .eq("parent_profile_id", profile.id)
      .eq("is_junior", true)
      .order("participation_score", { ascending: false });
    juniorProgressRows = (juniorIds ?? []) as Pick<Profile, "id" | "first_name" | "last_name" | "junior_stage" | "junior_rating" | "junior_rating_confidence" | "participation_score" | "stage_readiness_score">[];
    profileIds.push(...juniorProgressRows.map((junior) => junior.id));
  }

  const { count: currentEntryCount } =
    profileIds.length > 0
      ? await supabase.from("event_entries").select("id", { count: "exact", head: true }).in("profile_id", profileIds).neq("entry_status", "cancelled")
      : { count: 0 };
  const [{ data: inviteData, error: inviteError }, { data: matchData, error: matchError }] =
    profileIds.length > 0 ? await Promise.all([supabase.rpc("match_invites_for_user"), supabase.rpc("matches_for_user")]) : [{ data: [], error: null }, { data: [], error: null }];

  const [{ data: ratingData, error: ratingError }, { data: ratingChangeData, error: ratingChangeError }] =
    profileIds.length > 0
      ? await Promise.all([
          supabase.from("ratings").select("*").in("profile_id", profileIds),
          supabase.from("rating_changes").select("*").in("profile_id", profileIds).order("created_at", { ascending: false }).limit(1)
        ])
      : [{ data: [], error: null }, { data: [], error: null }];

  const { data: bookingData, error: bookingError } =
    profileIds.length > 0
      ? await supabase
          .from("court_bookings")
          .select("id,start_time,end_time,booking_type,status,courts:court_id(name),profiles:player_profile_id(first_name,last_name,is_junior)")
          .in("player_profile_id", profileIds)
          .eq("status", "confirmed")
          .gte("start_time", new Date().toISOString())
          .order("start_time", { ascending: true })
          .limit(3)
      : { data: [], error: null };

  if (bookingError) {
    console.error("CourtSide dashboard bookings load failed", { userId: user.id, error: bookingError });
  }
  if (inviteError) {
    console.error("CourtSide dashboard match invites load failed", { userId: user.id, error: inviteError });
  }
  if (matchError) {
    console.error("CourtSide dashboard matches load failed", { userId: user.id, error: matchError });
  }
  if (ratingError) {
    console.error("CourtSide dashboard ratings load failed", { userId: user.id, error: ratingError });
  }
  if (ratingChangeError) {
    console.error("CourtSide dashboard rating changes load failed", { userId: user.id, error: ratingChangeError });
  }

  const upcomingBookings = bookingError ? [] : ((bookingData ?? []) as unknown as BookingRow[]);
  const invites = inviteError ? [] : ((inviteData ?? []) as DashboardMatchInvite[]);
  const matches = matchError ? [] : ((matchData ?? []) as DashboardMatch[]);
  const ratings = ratingError ? [] : ((ratingData ?? []) as Rating[]);
  const latestRatingChange = ratingChangeError ? null : (((ratingChangeData ?? []) as RatingChange[])[0] ?? null);
  const pendingReceivedInvites = invites.filter((invite) => invite.status === "pending" && profileIds.includes(invite.opponent_profile_id)).length;
  const pendingSentInvites = invites.filter((invite) => invite.status === "pending" && profileIds.includes(invite.inviter_profile_id)).length;
  const resultsWaitingForConfirmation = matches.filter((match) => match.verification_status === "pending_confirmation" && match.submitted_by_user_id !== user.id).length;
  const disputedResults = matches.filter((match) => match.verification_status === "disputed").length;
  const verifiedMatchCount = matches.filter((match) => match.verification_status === "verified" || match.verification_status === "admin_verified").length;
  const actionNeededCount = pendingReceivedInvites + resultsWaitingForConfirmation + disputedResults;
  const nextBooking = upcomingBookings[0] ?? null;
  const completion = profileCompletion(profile);
  const startingRating = provisionalRating(profile?.player_level);
  const adultRating = profile ? ratings.find((rating) => rating.profile_id === profile.id) : null;
  const ratingValue = adultRating ? adultRating.rating_value.toFixed(1) : startingRating.value;
  const ratingBand = adultRating ? `${formatLabel(adultRating.confidence)} confidence` : `${startingRating.band} start`;
  const ratingProvisional = adultRating?.provisional ?? true;
  const ratingMatchCount = adultRating?.verified_match_count ?? 0;
  const latestMovement = latestRatingChange ? `${latestRatingChange.rating_delta > 0 ? "+" : ""}${latestRatingChange.rating_delta.toFixed(2)}` : null;

  return (
    <PageShell eyebrow="Book. Play. Compete. Progress." title="My PlayR">
      <StatusAlert className="mb-5" message={searchParams?.profile === "saved" ? "Profile saved." : null} tone="success" />
      {!profile ? (
        <StatusAlert
          className="mb-5"
          message="Start by completing your player profile. Once it is saved, you can book courts, add juniors, and enter events."
          tone="info"
        />
      ) : null}

      <section className="mb-6 overflow-hidden rounded-lg bg-court-navy text-white shadow-court">
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-court-lime">Welcome back</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">
              {profile ? `${profile.first_name}, what are we playing today?` : "Set up your player profile to get started."}
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-blue-50">
              Book courts, invite opponents, enter events, and build a verified player record from confirmed results.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link className="inline-flex w-full justify-center rounded bg-court-teal px-4 py-3 font-bold text-white sm:w-auto" href="/dashboard/book-court">
                Book a Court
              </Link>
              <Link className="inline-flex w-full justify-center rounded border border-white/30 px-4 py-3 font-bold text-white sm:w-auto" href="/dashboard/profile#progress">
                View progress
              </Link>
            </div>
          </div>
          <div className="rounded-lg bg-white/10 p-5">
            <p className="text-sm font-bold uppercase tracking-wide text-blue-100">PlayR Rating</p>
            <p className="mt-2 text-5xl font-black">{ratingValue}</p>
            <p className="mt-1 text-sm font-bold text-court-lime">{ratingProvisional ? "Provisional" : "Verified"} / {ratingBand}</p>
            <p className="mt-3 text-sm leading-6 text-blue-50">
              {ratingMatchCount} verified match{ratingMatchCount === 1 ? "" : "es"}
              {latestMovement ? ` / latest movement ${latestMovement}` : " / no movement yet"}
            </p>
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Link className="action-card border-court-teal/40" href="/dashboard/book-court">
          <p className="section-kicker">Book</p>
          <h2 className="mt-3 text-2xl font-black text-court-navy">Book a Court</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Reserve a 60-minute slot for yourself or a linked junior.</p>
          <p className="mt-5 font-bold text-court-blue">See availability</p>
        </Link>
        <Link className="action-card" href="/dashboard/play">
          <p className="text-sm font-black uppercase tracking-wide text-slate-500">Play</p>
          <h2 className="mt-3 text-2xl font-black text-court-navy">Find Match</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Invite an opponent, attach a court time, and confirm verified results after the match.</p>
          <p className="mt-5 font-bold text-court-blue">{pendingReceivedInvites ? `${pendingReceivedInvites} invite${pendingReceivedInvites === 1 ? "" : "s"} to answer` : "Send invite"}</p>
        </Link>
        <Link className="action-card" href="/dashboard/events">
          <p className="section-kicker">Compete</p>
          <h2 className="mt-3 text-2xl font-black text-court-navy">Join Event</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Enter club events and track payment status from your dashboard.</p>
          <p className="mt-5 font-bold text-court-blue">{currentEntryCount ? `${currentEntryCount} current entries` : "Browse events"}</p>
        </Link>
        <Link className="action-card" href="/dashboard/profile#progress">
          <p className="section-kicker">Progress</p>
          <h2 className="mt-3 text-2xl font-black text-court-navy">My Progress</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Review your rating, confidence, recent movement, and verified match history.</p>
          <p className="mt-5 font-bold text-court-blue">View profile</p>
        </Link>
      </section>

      <section className="mb-6 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="surface-card p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-court-teal">Next booking</p>
              <h2 className="mt-2 text-2xl font-black text-court-navy">
                {nextBooking ? `${nextBooking.courts?.name ?? "Court"} at ${formatDateTime(nextBooking.start_time)}` : "No upcoming court booked"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {nextBooking
                  ? nextBooking.profiles
                    ? `Booked for ${nextBooking.profiles.first_name} ${nextBooking.profiles.last_name}${nextBooking.profiles.is_junior ? " (junior)" : ""}.`
                    : "Booking profile unavailable."
                  : profile
                    ? "Pick a slot in the next 7 days and get on court."
                    : "Create your profile first, then book your first session."}
              </p>
            </div>
            <Link className="btn-primary shrink-0" href="/dashboard/book-court">
              Book a Court
            </Link>
          </div>
          {upcomingBookings.length > 1 ? (
            <div className="mt-5 divide-y divide-slate-200 rounded border border-slate-200">
              {upcomingBookings.slice(1).map((booking) => (
                <div className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:items-center sm:justify-between" key={booking.id}>
                  <span className="font-bold text-court-navy">{booking.courts?.name ?? "Court"}</span>
                  <span className="text-slate-600">{formatDateTime(booking.start_time)}</span>
                </div>
              ))}
            </div>
          ) : null}
          <Link className="mt-5 inline-flex font-bold text-court-blue" href="/dashboard/my-bookings">
            View all bookings
          </Link>
        </div>

        <div className="surface-card p-5">
          <p className="section-kicker">Progress snapshot</p>
          <div className="mt-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-4xl font-black text-court-navy">{completion.percent}%</p>
              <p className="mt-1 font-bold text-court-ink">{completion.label}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-court-navy">{ratingValue}</p>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{ratingProvisional ? "Provisional" : "Verified"} rating</p>
            </div>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-court-teal" style={{ width: `${completion.percent}%` }} />
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {completion.text} Ratings only move after verified match results; confidence improves as more results are confirmed.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded bg-court-mist p-3">
              <p className="font-black text-court-navy">{juniorCount ?? 0}</p>
              <p className="text-slate-600">Linked juniors</p>
            </div>
            <div className="rounded bg-court-mist p-3">
              <p className="font-black text-court-navy">{ratingMatchCount}</p>
              <p className="text-slate-600">Rated matches</p>
            </div>
          </div>
          <p className="mt-4 rounded bg-slate-50 p-3 text-sm text-slate-600">
            {latestMovement ? `Latest rating movement: ${latestMovement}` : "No rating movement yet. Verified match results will create the first change."}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link className="btn-primary" href="/dashboard/profile#progress">
              View progress
            </Link>
            <Link className="btn-secondary" href="/dashboard/profile">
              {profile ? "Edit profile" : "Complete profile"}
            </Link>
          </div>
        </div>
      </section>

      <section className="surface-card mb-6 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-court-teal">Match invites / action needed</p>
            <h2 className="mt-2 text-2xl font-black text-court-navy">{actionNeededCount ? `${actionNeededCount} item${actionNeededCount === 1 ? "" : "s"} need attention` : "You are all caught up"}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Answer incoming invites and confirm submitted results. Confirming a verified match can update PlayR Ratings for both players.
            </p>
          </div>
          <Link className="inline-flex shrink-0 justify-center rounded bg-court-teal px-4 py-3 text-sm font-bold text-white transition hover:bg-teal-500" href="/dashboard/play">
            Send Match Invite
          </Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded bg-court-mist p-4">
            <p className="text-2xl font-black text-court-navy">{pendingReceivedInvites}</p>
            <p className="mt-1 text-sm text-slate-600">Pending invites received</p>
          </div>
          <div className="rounded bg-slate-50 p-4">
            <p className="text-2xl font-black text-court-navy">{pendingSentInvites}</p>
            <p className="mt-1 text-sm text-slate-600">Sent invites waiting</p>
          </div>
          <div className="rounded bg-slate-50 p-4">
            <p className="text-2xl font-black text-court-navy">{resultsWaitingForConfirmation}</p>
            <p className="mt-1 text-sm text-slate-600">Results to confirm</p>
          </div>
          <div className="rounded bg-slate-50 p-4">
            <p className="text-2xl font-black text-court-navy">{disputedResults}</p>
            <p className="mt-1 text-sm text-slate-600">Disputed results</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link className="btn-secondary" href="/dashboard/play">
            View Play
          </Link>
          <Link className="btn-secondary" href="/dashboard/profile#progress">
            View Progress
          </Link>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        <div className="surface-card p-5">
          <p className="section-kicker">Achievements</p>
          <h2 className="mt-2 text-xl font-black text-court-navy">{juniorProgressRows.length ? "Junior pathway active" : "Badges start with participation"}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {juniorProgressRows.length
              ? "Linked juniors earn progress through events, verified matches, wins, close matches, and ClubR-approved achievements."
              : "Your first booking, first event entry, match wins, and club milestones will appear here as PlayR progress tracking grows."}
          </p>
          {juniorProgressRows.length ? (
            <div className="mt-4 space-y-3">
              {juniorProgressRows.slice(0, 3).map((junior) => (
                <div className="rounded border border-slate-200 bg-slate-50 p-3" key={junior.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-court-navy">{junior.first_name} {junior.last_name}</p>
                      <p className="text-sm text-slate-600">{formatJuniorRating(junior.junior_stage, junior.junior_rating)} / {formatLabel(junior.junior_rating_confidence)} confidence</p>
                    </div>
                    <p className="text-right text-sm font-black text-court-teal">{junior.participation_score} pts</p>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-court-teal" style={{ width: `${junior.stage_readiness_score}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{junior.stage_readiness_score}% stage readiness</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="surface-card p-5">
          <p className="section-kicker">Match history</p>
          <h2 className="mt-2 text-xl font-black text-court-navy">{verifiedMatchCount ? `${verifiedMatchCount} verified match${verifiedMatchCount === 1 ? "" : "es"}` : "No verified matches yet"}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {verifiedMatchCount
              ? "Verified match history is now available in your profile progress area."
              : "Match invite results will appear here once both sides confirm them. Event results still live on your results page."}
          </p>
          <Link className="mt-4 inline-flex font-bold text-court-blue" href="/dashboard/profile#progress">
            View progress
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
