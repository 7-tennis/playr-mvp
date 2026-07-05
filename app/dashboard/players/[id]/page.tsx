import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { PageShell } from "@/components/page-shell";
import { formatDate, formatDateTime, formatJuniorRating, formatLabel } from "@/lib/courtside-format";
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
  MatchInviteStatus,
  MatchInviteType,
  MatchVerificationStatus,
  Profile,
  Rating,
  RatingChange,
  Venue
} from "@/types/courtside";

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
};

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

function InfoLine({ icon, value, muted = false }: { icon: string; value: string; muted?: boolean }) {
  return (
    <p className={`flex min-w-0 items-center gap-2 text-sm ${muted ? "text-slate-500" : "text-slate-700"}`}>
      <span aria-hidden="true" className="shrink-0 text-base">
        {icon}
      </span>
      <span className="truncate">{value}</span>
    </p>
  );
}

function StatChip({ icon, value, label }: { icon: string; value: string | number; label: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm">
      <p className="flex items-center gap-2 text-lg font-black text-court-navy">
        <span aria-hidden="true">{icon}</span>
        <span>{value}</span>
      </p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

function SectionCard({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="surface-card p-4 sm:p-5">
      <h2 className="text-lg font-black text-court-navy">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="ui-empty-card">{text}</p>;
}

function ActivityItem({ icon, title, meta }: { icon: string; title: string; meta: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="flex items-center gap-2 font-black text-court-navy">
        <span aria-hidden="true">{icon}</span>
        <span>{title}</span>
      </p>
      <p className="mt-1 text-sm text-slate-600">{meta}</p>
    </div>
  );
}

function rankText(label: string) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-black text-court-navy">Not ranked yet</p>
    </div>
  );
}

function matchPlayerName(match: MatchHistoryRow, profileId: string) {
  if (match.inviter_profile_id === profileId) {
    return `${match.opponent_first_name} ${match.opponent_last_name}`;
  }

  return `${match.inviter_first_name} ${match.inviter_last_name}`;
}

export default async function PlayerDetailPage({ params }: PlayerDetailPageProps) {
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
    { data: juniorHistoryData, error: juniorHistoryError }
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
      : Promise.resolve({ data: [], error: null })
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

  const clubName = bookings[0]?.courts?.venues?.name ?? upcomingEntries.find((entry) => entry.events?.location)?.events?.location ?? null;
  const playerType = player.is_junior ? playrJuniorStageLabel(player.junior_stage) : parentProfile.id === player.id && parentProfile.parent_profile_id === null ? "Parent / Member" : "Member";
  const ratingText = player.is_junior ? formatJuniorRating(player.junior_stage, player.junior_rating) : rating ? rating.rating_value.toFixed(1) : "No active rating yet";
  const confidenceText = player.is_junior ? formatLabel(player.junior_rating_confidence) : rating ? formatLabel(rating.confidence) : "No rating yet";
  const participationText = player.is_junior ? `${player.participation_score} pts` : `${player.participation_score ?? 0} pts`;

  return (
    <PageShell eyebrow="Player Detail" subtitle="Player profile, progress and upcoming tennis activity." title={playerName(player)}>
      <div className="mb-5">
        <Link className="font-bold text-court-blue" href="/dashboard">
          Back to MyPlayR
        </Link>
      </div>

      <section className={`overflow-hidden rounded-lg border bg-white shadow-court ${accent.border}`}>
        <div className={`h-2 ${accent.strip}`} />
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className={`grid h-20 w-20 shrink-0 place-items-center rounded-lg text-2xl font-black ${accent.avatar}`}>{playerInitials(player)}</div>
            <div className="min-w-0">
              <h2 className="text-3xl font-black text-court-navy">{playerName(player)}</h2>
              <span className={`mt-2 inline-flex rounded px-2.5 py-1 text-xs font-black uppercase tracking-wide ${accent.badge}`}>{playerType}</span>
              <div className="mt-4 grid gap-2">
                <InfoLine icon="⭐" value={ratingText} />
                <InfoLine icon="🏫" muted value="No school linked" />
                <InfoLine icon="🎾" muted={!clubName} value={clubName ?? "No club linked"} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
            <StatChip icon="⚡" label="Participation" value={participationText} />
            <StatChip icon="🛡️" label="Confidence" value={confidenceText} />
            <StatChip icon="📩" label={plural(invites.length, "Invite", "Invites")} value={invites.length} />
            <StatChip icon="📅" label={plural(upcomingEntries.length, "Event", "Events")} value={upcomingEntries.length} />
            <StatChip icon="🏟️" label={plural(bookings.length, "Booking", "Bookings")} value={bookings.length} />
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Leaderboard">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {rankText("🏫 School Rank")}
            {rankText("🎾 Club Rank")}
            {rankText("🏆 District Rank")}
          </div>
        </SectionCard>

        <SectionCard title="Upcoming Activity">
          <div className="grid gap-3">
            {bookings.slice(0, 3).map((booking) => (
              <ActivityItem
                icon="🏟️"
                key={booking.id}
                meta={`${formatDateTime(booking.start_time)}${booking.courts?.venues?.name ? ` / ${booking.courts.venues.name}` : ""}`}
                title={booking.courts?.name ?? "Court booking"}
              />
            ))}
            {upcomingEntries.slice(0, 3).map((entry) =>
              entry.events ? (
                <ActivityItem
                  icon="📅"
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
                  icon="📩"
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

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <SectionCard title="Progress">
          <div className="grid gap-3 sm:grid-cols-2">
            {player.is_junior ? (
              <>
                <StatChip icon="⚡" label="Participation" value={participationText} />
                <StatChip icon="🧭" label="Stage readiness" value={`${player.stage_readiness_score}%`} />
                <StatChip icon="🎾" label="Matches" value={player.matches_played} />
                <StatChip icon="🏅" label="Record" value={`${player.wins}-${player.losses}`} />
                <StatChip icon="📅" label="Events played" value={player.events_played} />
                <StatChip icon="🤝" label="Close matches" value={player.close_matches} />
              </>
            ) : (
              <>
                <StatChip icon="⭐" label="Rating" value={ratingText} />
                <StatChip icon="🛡️" label="Confidence" value={confidenceText} />
                <StatChip icon="🎾" label="Rated matches" value={rating?.verified_match_count ?? 0} />
                <StatChip icon="📈" label="Status" value={rating?.provisional === false ? "Verified" : "Provisional"} />
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
                  <p className="font-black text-court-navy">🏅 {badge.badge_name}</p>
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
