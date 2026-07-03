import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { formatJuniorRating, formatLabel } from "@/lib/courtside-format";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type {
  Court,
  CourtBooking,
  CourtSideEvent,
  EntryStatus,
  JuniorStage,
  MatchInviteStatus,
  MatchInviteType,
  Profile,
  Rating
} from "@/types/courtside";

export const dynamic = "force-dynamic";

type BookingRow = Pick<CourtBooking, "id" | "player_profile_id" | "start_time"> & {
  courts: Pick<Court, "name"> | null;
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
  events: Pick<CourtSideEvent, "title" | "start_datetime"> | null;
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

function formatJuniorStageLabel(stage: JuniorStage | string | null | undefined) {
  switch (stage) {
    case "red_ball":
    case "red":
      return "Red Ball";
    case "orange_ball":
    case "orange":
      return "Orange Ball";
    case "green_ball":
    case "green":
      return "Green Ball";
    case "yellow_ball":
    case "yellow":
      return "Yellow Ball";
    case "not_sure":
      return "Ball stage pending";
    default:
      return "Junior Player";
  }
}

function activityLabel(count: number, singular: string, plural: string, empty: string) {
  if (count === 0) {
    return empty;
  }

  return count === 1 ? singular : plural;
}

function ActivityMetric({
  count,
  label,
  singular,
  plural,
  empty,
  dark = false
}: {
  count: number;
  label: string;
  singular: string;
  plural: string;
  empty: string;
  dark?: boolean;
}) {
  return (
    <div className={dark ? "border-t border-white/15 pt-3" : "border-t border-slate-200 pt-3"}>
      <div className="flex items-baseline justify-between gap-3">
        <p className={dark ? "text-xs font-black uppercase tracking-wide text-blue-100" : "text-xs font-black uppercase tracking-wide text-slate-500"}>{label}</p>
        <p className={dark ? "text-2xl font-black text-white" : "text-2xl font-black text-court-navy"}>{count}</p>
      </div>
      <p className={dark ? "mt-1 text-sm text-blue-50" : "mt-1 text-sm text-slate-600"}>{activityLabel(count, singular, plural, empty)}</p>
    </div>
  );
}

function MemberCard({
  profile,
  rating,
  activity,
  juniorCount
}: {
  profile: Profile | null;
  rating: Rating | null;
  activity: ActivityCounts;
  juniorCount: number;
}) {
  const name = profile ? playerName(profile) : "Set up your profile";
  const memberType = juniorCount > 0 ? "Parent / Member Profile" : "Member / Player";
  const ratingText = rating ? rating.rating_value.toFixed(1) : "No active rating yet";

  return (
    <article className="overflow-hidden rounded-lg border border-court-navy/15 bg-white shadow-court">
      <div className="h-2 bg-court-teal" />
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-court-teal">Main member</p>
            <h3 className="mt-2 text-2xl font-black text-court-navy">{name}</h3>
            <p className="mt-1 text-sm font-bold text-slate-600">{memberType}</p>
          </div>
          <div className="rounded bg-court-mist px-4 py-3 sm:text-right">
            <p className="text-xs font-black uppercase tracking-wide text-court-teal">Rating</p>
            <p className="mt-1 text-lg font-black text-court-navy">{ratingText}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <ActivityMetric count={activity.invites} empty="No pending invites" label="Match Invites" plural="Pending invites" singular="Pending invite" />
          <ActivityMetric count={activity.events} empty="No upcoming events" label="Upcoming Events" plural="Upcoming events" singular="Upcoming event" />
          <ActivityMetric count={activity.bookings} empty="No court bookings" label="Upcoming Bookings" plural="Court bookings" singular="Court booking" />
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link className="btn-primary" href="/dashboard/profile">
            View Profile
          </Link>
          {!profile ? (
            <Link className="btn-secondary" href="/dashboard/profile">
              Complete Profile
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function JuniorCard({ junior, activity }: { junior: JuniorCardProfile; activity: ActivityCounts }) {
  return (
    <article className="overflow-hidden rounded-lg bg-court-navy text-white shadow-court">
      <div className="h-2 bg-court-lime" />
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-court-lime">Linked junior</p>
            <h3 className="mt-2 text-2xl font-black">{playerName(junior)}</h3>
            <p className="mt-1 text-sm font-bold text-blue-50">{formatJuniorStageLabel(junior.junior_stage)}</p>
          </div>
          <div className="rounded bg-white/10 px-4 py-3 sm:text-right">
            <p className="text-xs font-black uppercase tracking-wide text-blue-100">Rating</p>
            <p className="mt-1 text-lg font-black">{formatJuniorRating(junior.junior_stage, junior.junior_rating)}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="border-t border-white/15 pt-3">
            <p className="text-xs font-black uppercase tracking-wide text-blue-100">Confidence</p>
            <p className="mt-1 text-lg font-black">{formatLabel(junior.junior_rating_confidence)}</p>
          </div>
          <div className="border-t border-white/15 pt-3">
            <p className="text-xs font-black uppercase tracking-wide text-blue-100">Participation</p>
            <p className="mt-1 text-lg font-black">{junior.participation_score} pts</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <ActivityMetric count={activity.invites} dark empty="No pending invites" label="Match Invites" plural="Pending invites" singular="Pending invite" />
          <ActivityMetric count={activity.events} dark empty="No upcoming events" label="Upcoming Events" plural="Upcoming events" singular="Upcoming event" />
          <ActivityMetric count={activity.bookings} dark empty="No court bookings" label="Upcoming Bookings" plural="Court bookings" singular="Court booking" />
        </div>

        <Link className="mt-5 inline-flex justify-center rounded bg-court-teal px-4 py-3 text-sm font-bold text-white transition hover:bg-teal-500" href={`/dashboard/juniors#junior-${junior.id}`}>
          Open Player Card
        </Link>
      </div>
    </article>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams?: { profile?: string } }) {
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
            .select("id,profile_id,entry_status,events:event_id(title,start_datetime)")
            .in("profile_id", profileIds)
            .neq("entry_status", "cancelled"),
          supabase
            .from("court_bookings")
            .select("id,player_profile_id,start_time,courts:court_id(name)")
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

  const ratings = ratingError ? [] : ((ratingData ?? []) as Rating[]);
  const adultRating = profile ? ratings.find((rating) => rating.profile_id === profile.id) ?? null : null;
  const memberActivity = profile ? activityByProfileId.get(profile.id) ?? emptyActivity() : emptyActivity();
  const totalPendingInvites = Array.from(activityByProfileId.values()).reduce((total, activity) => total + activity.invites, 0);
  const totalUpcomingEvents = Array.from(activityByProfileId.values()).reduce((total, activity) => total + activity.events, 0);
  const totalUpcomingBookings = Array.from(activityByProfileId.values()).reduce((total, activity) => total + activity.bookings, 0);

  return (
    <PageShell eyebrow="MyPlayR" title="MyPlayR">
      <StatusAlert className="mb-5" message={searchParams?.profile === "saved" ? "Profile saved." : null} tone="success" />
      {!profile ? (
        <StatusAlert
          className="mb-5"
          message="Start by completing your member profile. Once it is saved, you can link juniors, book courts, enter events, and manage match invites."
          tone="info"
        />
      ) : null}

      <p className="mb-6 max-w-2xl text-sm leading-6 text-slate-600">Your players, progress and upcoming tennis activity.</p>

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
          <MemberCard activity={memberActivity} juniorCount={juniorRows.length} profile={profile} rating={adultRating} />

          {juniorRows.map((junior) => (
            <JuniorCard activity={activityByProfileId.get(junior.id) ?? emptyActivity()} junior={junior} key={junior.id} />
          ))}

          {profile && juniorRows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5">
              <p className="text-sm font-black uppercase tracking-wide text-court-teal">Linked juniors</p>
              <h3 className="mt-2 text-xl font-black text-court-navy">No junior players linked yet</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">Add a junior player to show their ball stage, rating, participation score, invites, events, and bookings here.</p>
              <Link className="btn-primary mt-5" href="/dashboard/juniors">
                Add Junior Player
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Link className="rounded-lg border border-slate-200 bg-white p-4 font-bold text-court-navy transition hover:border-court-teal hover:bg-court-mist" href="/dashboard/book-court">
          Book a Court
        </Link>
        <Link className="rounded-lg border border-slate-200 bg-white p-4 font-bold text-court-navy transition hover:border-court-teal hover:bg-court-mist" href="/dashboard/play">
          Send Match Invite
        </Link>
        <Link className="rounded-lg border border-slate-200 bg-white p-4 font-bold text-court-navy transition hover:border-court-teal hover:bg-court-mist" href="/dashboard/events">
          Browse Events
        </Link>
      </section>
    </PageShell>
  );
}
