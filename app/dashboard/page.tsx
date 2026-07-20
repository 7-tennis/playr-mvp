import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { ParticipationIcon, RatingIcon, StageIcon } from "@/components/playr-icons";
import { PlayerProfileCard } from "@/components/player-profile-card";
import { PlayRLinkButton, SectionError, SectionHeader } from "@/components/playr-ui";
import { StatusAlert } from "@/components/status-alert";
import { formatJuniorRating } from "@/lib/courtside-format";
import { loadPlayerSessionRequests } from "@/lib/coach-session-requests";
import { buildPlayerActivitySummaries, type PlayerActivitySummary } from "@/lib/player-activity-summary";
import { juniorParticipationLeads, playerStageVisual } from "@/lib/player-stage-visuals";
import { loadPlayerOrganisations, type PlayerOrganisation } from "@/lib/player-organisations";
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
  booking_start_time: string | null;
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
  | "stage_readiness_score"
>;

function playerName(profile: Pick<Profile, "first_name" | "last_name">) {
  return `${profile.first_name} ${profile.last_name}`;
}

function playerInitials(profile: Pick<Profile, "first_name" | "last_name"> | null) {
  if (!profile) {
    return "PR";
  }

  return `${profile.first_name.charAt(0)}${profile.last_name.charAt(0)}`.toUpperCase();
}

function MemberCard({
  activity,
  profile,
  rating,
  organisations
}: {
  activity?: PlayerActivitySummary | null;
  profile: Profile | null;
  rating: Rating | null;
  organisations: PlayerOrganisation[];
}) {
  const name = profile ? playerName(profile) : "Set up your profile";
  const ratingText = rating ? rating.rating_value.toFixed(1) : "No active rating yet";
  const href = profile ? `/dashboard/players/${profile.id}` : "/dashboard/profile";

  return (
    <PlayerProfileCard
      activity={activity}
      href={href}
      initials={playerInitials(profile)}
      name={name}
      organisations={organisations}
      primaryMetric={{ icon: <RatingIcon rating={rating?.rating_value ?? null} size={15} stage="member" />, label: "Rating", value: ratingText }}
      secondaryMetric={profile ? { icon: <ParticipationIcon size={15} />, label: "Participation", value: `${profile.participation_score ?? 0} pts` } : null}
      stage={playerStageVisual(false, null)}
    />
  );
}

function JuniorCard({ activity, junior, organisations }: { activity?: PlayerActivitySummary | null; junior: JuniorCardProfile; organisations: PlayerOrganisation[] }) {
  const name = playerName(junior);
  const stage = playerStageVisual(true, junior.junior_stage);
  const participationFirst = juniorParticipationLeads(junior.junior_stage);
  const ratingMetric = { icon: <RatingIcon rating={junior.junior_rating} size={15} stage={junior.junior_stage} />, label: "Rating", value: formatJuniorRating(junior.junior_stage, junior.junior_rating) };
  const participationMetric = { icon: <ParticipationIcon size={15} />, label: "Participation", value: `${junior.participation_score} pts` };

  return (
    <PlayerProfileCard
      activity={activity}
      href={`/dashboard/players/${junior.id}`}
      initials={playerInitials(junior)}
      name={name}
      organisations={organisations}
      primaryMetric={participationFirst ? participationMetric : ratingMetric}
      secondaryMetric={participationFirst ? { icon: <StageIcon size={15} />, label: "Stage readiness", value: `${junior.stage_readiness_score}%` } : participationMetric}
      stage={stage}
    />
  );
}

export default async function DashboardPage({ searchParams }: { searchParams?: { profile?: string; request?: string; request_error?: string } }) {
  if (!hasSupabaseConfig()) {
    return (
      <PageShell eyebrow="Player profiles" title="Supabase is not configured.">
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
      .select("id,first_name,last_name,junior_stage,junior_rating,junior_rating_confidence,participation_score,stage_readiness_score")
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
  const [{ data: inviteData, error: inviteError }, { data: ratingData, error: ratingError }, { data: entryData, error: entryError }, { data: bookingData, error: bookingError }, organisationResult, sessionRequests] =
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
            .order("start_time", { ascending: true }),
          loadPlayerOrganisations(supabase, profileIds),
          loadPlayerSessionRequests(supabase, profileIds)
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: false },
          []
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

  const organisationsByProfileId = new Map<string, PlayerOrganisation[]>();
  profileIds.forEach((profileId) => organisationsByProfileId.set(profileId, []));
  organisationResult.data.forEach((organisation) => {
    const current = organisationsByProfileId.get(organisation.playerProfileId) ?? [];
    organisationsByProfileId.set(organisation.playerProfileId, [...current, organisation]);
  });

  const invites = inviteError ? [] : ((inviteData ?? []) as DashboardMatchInvite[]);
  const upcomingEntries = entryError
    ? []
    : ((entryData ?? []) as unknown as DashboardEventEntry[]).filter((entry) => entry.entry_status !== "cancelled" && entry.events?.start_datetime && entry.events.start_datetime >= now);
  const upcomingBookings = bookingError ? [] : ((bookingData ?? []) as unknown as BookingRow[]);
  const activitySummaries = buildPlayerActivitySummaries(profileIds, {
    bookings: upcomingBookings.flatMap((booking) => booking.player_profile_id ? [{ player_profile_id: booking.player_profile_id, start_time: booking.start_time }] : []),
    events: upcomingEntries.flatMap((entry) => entry.events ? [{ profile_id: entry.profile_id, start_time: entry.events.start_datetime }] : []),
    invites,
    lessonRequests: sessionRequests.map((request) => ({ player_profile_id: request.player_profile_id, status: request.status }))
  }, new Date(now));

  const ratings = ratingError ? [] : ((ratingData ?? []) as Rating[]);
  const adultRating = profile ? ratings.find((rating) => rating.profile_id === profile.id) ?? null : null;
  return (
    <PageShell eyebrow="Player profiles" subtitle="View your profile and linked junior players." title="Your Players">
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

      <section className="mb-6">
        <SectionHeader
          action={<PlayRLinkButton href="/dashboard/juniors" variant="outline">Manage Juniors</PlayRLinkButton>}
          className="mb-4"
          description="Adult and linked junior profiles."
          title="Player cards"
        />

        {organisationResult.error ? <SectionError className="mb-4" description="Organisation summaries could not be loaded right now. Your player cards are still available." /> : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <MemberCard activity={profile ? activitySummaries.get(profile.id) ?? null : null} organisations={profile ? organisationsByProfileId.get(profile.id) ?? [] : []} profile={profile} rating={adultRating} />

          {juniorRows.map((junior) => (
            <JuniorCard activity={activitySummaries.get(junior.id) ?? null} junior={junior} key={junior.id} organisations={organisationsByProfileId.get(junior.id) ?? []} />
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

    </PageShell>
  );
}
