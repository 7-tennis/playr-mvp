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
  Rating,
  Venue
} from "@/types/courtside";

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

function playerInitials(profile: Pick<Profile, "first_name" | "last_name"> | null) {
  if (!profile) {
    return "PR";
  }

  return `${profile.first_name.charAt(0)}${profile.last_name.charAt(0)}`.toUpperCase();
}

type CardAccent = {
  border: string;
  strip: string;
  tint: string;
  badge: string;
  avatar: string;
  ring: string;
};

const cardAccents: Record<"member" | "red" | "orange" | "green" | "yellow", CardAccent> = {
  member: {
    border: "border-court-teal/55",
    strip: "bg-court-teal",
    tint: "bg-court-mist",
    badge: "bg-court-mist text-court-teal",
    avatar: "bg-court-teal text-white",
    ring: "group-hover:ring-court-teal/25"
  },
  red: {
    border: "border-red-300",
    strip: "bg-red-500",
    tint: "bg-red-50",
    badge: "bg-red-50 text-red-700",
    avatar: "bg-red-500 text-white",
    ring: "group-hover:ring-red-200"
  },
  orange: {
    border: "border-orange-300",
    strip: "bg-orange-500",
    tint: "bg-orange-50",
    badge: "bg-orange-50 text-orange-700",
    avatar: "bg-orange-500 text-white",
    ring: "group-hover:ring-orange-200"
  },
  green: {
    border: "border-emerald-300",
    strip: "bg-emerald-500",
    tint: "bg-emerald-50",
    badge: "bg-emerald-50 text-emerald-700",
    avatar: "bg-emerald-500 text-white",
    ring: "group-hover:ring-emerald-200"
  },
  yellow: {
    border: "border-amber-300",
    strip: "bg-amber-400",
    tint: "bg-amber-50",
    badge: "bg-amber-50 text-amber-700",
    avatar: "bg-amber-400 text-court-navy",
    ring: "group-hover:ring-amber-200"
  }
};

function accentForStage(stage: JuniorStage | null | undefined) {
  switch (stage) {
    case "red_ball":
      return cardAccents.red;
    case "orange_ball":
      return cardAccents.orange;
    case "green_ball":
      return cardAccents.green;
    case "yellow_ball":
    case "not_sure":
      return cardAccents.yellow;
    default:
      return cardAccents.yellow;
  }
}

function InfoRow({ icon, value, muted = false }: { icon: string; value: string; muted?: boolean }) {
  return (
    <p className={`flex min-w-0 items-center gap-2 text-sm ${muted ? "text-slate-500" : "text-slate-700"}`}>
      <span aria-hidden="true" className="shrink-0 text-base">
        {icon}
      </span>
      <span className="truncate">{value}</span>
    </p>
  );
}

function CounterPill({ icon, count, label }: { icon: string; count: number; label: string }) {
  return (
    <div className="flex min-w-0 items-center justify-center gap-1.5 rounded bg-white/75 px-2.5 py-2 text-sm font-black text-court-navy ring-1 ring-slate-200">
      <span aria-hidden="true">{icon}</span>
      <span>{count}</span>
      <span className="hidden truncate sm:inline">{label}</span>
    </div>
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
  const accent = cardAccents.member;
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
            <InfoRow icon="⭐" value={ratingText} />
            <InfoRow icon="🏫" muted value="No school linked" />
            <InfoRow icon="🎾" muted={!clubName} value={clubName ?? "No club linked"} />
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <CounterPill count={activity.invites} icon="📩" label={activity.invites === 1 ? "Invite" : "Invites"} />
            <CounterPill count={activity.events} icon="📅" label={activity.events === 1 ? "Event" : "Events"} />
            <CounterPill count={activity.bookings} icon="🏟️" label={activity.bookings === 1 ? "Booking" : "Bookings"} />
          </div>
        </div>
      </article>
    </Link>
  );
}

function JuniorCard({ junior, activity, clubName }: { junior: JuniorCardProfile; activity: ActivityCounts; clubName: string | null }) {
  const name = playerName(junior);
  const accent = accentForStage(junior.junior_stage);
  const stageLabel = formatJuniorStageLabel(junior.junior_stage);

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
            <InfoRow icon="⭐" value={`${formatJuniorRating(junior.junior_stage, junior.junior_rating)} / ${formatLabel(junior.junior_rating_confidence)}`} />
            <InfoRow icon="🏫" muted value="No school linked" />
            <InfoRow icon="🎾" muted={!clubName} value={clubName ?? "No club linked"} />
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <CounterPill count={activity.invites} icon="📩" label={activity.invites === 1 ? "Invite" : "Invites"} />
            <CounterPill count={activity.events} icon="📅" label={activity.events === 1 ? "Event" : "Events"} />
            <CounterPill count={activity.bookings} icon="🏟️" label={activity.bookings === 1 ? "Booking" : "Bookings"} />
          </div>
        </div>
      </article>
    </Link>
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
