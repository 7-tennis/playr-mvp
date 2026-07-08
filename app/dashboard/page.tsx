import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { PageShell } from "@/components/page-shell";
import { ArrowRightIcon, BookingIcon, ClubIcon, EventIcon, InviteIcon, RatingIcon, SchoolIcon } from "@/components/playr-icons";
import { StatusAlert } from "@/components/status-alert";
import { formatJuniorRating, formatLabel } from "@/lib/courtside-format";
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
    <PageShell eyebrow="MyPlayR" subtitle="Your players, progress and upcoming tennis activity." title="MyPlayR">
      <StatusAlert className="mb-5" message={searchParams?.profile === "saved" ? "Profile saved." : null} tone="success" />
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

      <section className="grid gap-3 sm:grid-cols-3">
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
      </section>
    </PageShell>
  );
}
