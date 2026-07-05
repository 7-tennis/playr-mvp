import Link from "next/link";
import { redirect } from "next/navigation";
import { saveOwnProfile } from "@/app/dashboard/profile/actions";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { SubmitButton } from "@/components/submit-button";
import { formatDate, formatJuniorRating, formatLabel } from "@/lib/courtside-format";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { JuniorAchievement, JuniorRatingHistory, MatchVerificationStatus, PlayerLevel, Profile, Rating, RatingChange, Sport } from "@/types/courtside";

export const dynamic = "force-dynamic";

const sports: Sport[] = ["tennis", "pickleball", "futsal", "multi_sport"];
const playerLevels: PlayerLevel[] = ["beginner", "social", "intermediate", "club_competitive", "advanced", "unknown"];

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

type RatingRow = Rating & {
  profiles: Pick<Profile, "first_name" | "last_name" | "is_junior"> | null;
};

type RatingChangeRow = RatingChange & {
  profiles: Pick<Profile, "first_name" | "last_name" | "is_junior"> | null;
};

type JuniorProgressProfile = Pick<
  Profile,
  | "id"
  | "first_name"
  | "last_name"
  | "date_of_birth"
  | "primary_sport"
  | "player_level"
  | "junior_stage"
  | "junior_rating"
  | "junior_rating_confidence"
  | "participation_score"
  | "matches_played"
  | "wins"
  | "losses"
  | "events_played"
  | "close_matches"
  | "stage_readiness_score"
  | "rating_locked"
  | "rating_notes"
  | "member_status"
> & {
  junior_achievements: Pick<JuniorAchievement, "id" | "badge_name" | "category" | "earned_at">[] | null;
  junior_rating_history: Pick<JuniorRatingHistory, "id" | "previous_rating" | "new_rating" | "change_amount" | "reason" | "created_at">[] | null;
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

function playerName(firstName: string, lastName: string, isJunior: boolean) {
  return `${firstName} ${lastName}${isJunior ? " (junior)" : ""}`;
}

export default async function ProfilePage({ searchParams }: { searchParams?: { error?: string } }) {
  if (!hasSupabaseConfig()) {
    return (
      <PageShell eyebrow="Player Profile" title="Supabase is not configured.">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <p className="text-slate-700">Add Supabase environment variables to create or edit a player profile.</p>
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

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_junior", false)
    .maybeSingle();

  const profile = data as Profile | null;
  const { data: juniorData } = profile
    ? await supabase
        .from("profiles")
        .select("id,first_name,last_name,date_of_birth,primary_sport,player_level,junior_stage,junior_rating,junior_rating_confidence,participation_score,matches_played,wins,losses,events_played,close_matches,stage_readiness_score,rating_locked,rating_notes,member_status,junior_achievements(id,badge_name,category,earned_at),junior_rating_history(id,previous_rating,new_rating,change_amount,reason,created_at)")
        .eq("parent_profile_id", profile.id)
        .eq("is_junior", true)
        .order("first_name", { ascending: true })
    : { data: [] };

  const juniors = (juniorData ?? []) as unknown as JuniorProgressProfile[];
  const userMetadata = user.user_metadata as { phone?: string | null; marketing_consent?: boolean | null };
  const defaultPhone = profile?.phone ?? userMetadata.phone ?? "";
  const defaultMarketingConsent = profile?.marketing_consent ?? Boolean(userMetadata.marketing_consent);
  const rating = provisionalRating(profile?.player_level);
  const { data: matchHistoryData } = profile ? await supabase.rpc("matches_for_user") : { data: [] };
  const verifiedMatches = ((matchHistoryData ?? []) as MatchHistoryRow[])
    .filter((match) => match.verification_status === "verified" || match.verification_status === "admin_verified")
    .slice(0, 6);
  const profileIds = profile ? [profile.id, ...juniors.map((junior) => junior.id)] : [];
  const [{ data: ratingData, error: ratingError }, { data: ratingChangeData, error: ratingChangeError }] =
    profileIds.length > 0
      ? await Promise.all([
          supabase
            .from("ratings")
            .select("*,profiles:profile_id(first_name,last_name,is_junior)")
            .in("profile_id", profileIds)
            .order("verified_match_count", { ascending: false }),
          supabase
            .from("rating_changes")
            .select("*,profiles:profile_id(first_name,last_name,is_junior)")
            .in("profile_id", profileIds)
            .order("created_at", { ascending: false })
            .limit(8)
        ])
      : [{ data: [], error: null }, { data: [], error: null }];

  if (ratingError) {
    console.error("CourtSide profile ratings load failed", { userId: user.id, error: ratingError });
  }
  if (ratingChangeError) {
    console.error("CourtSide profile rating changes load failed", { userId: user.id, error: ratingChangeError });
  }

  const ratingRows = ratingError ? [] : ((ratingData ?? []) as unknown as RatingRow[]);
  const ratingChanges = ratingChangeError ? [] : ((ratingChangeData ?? []) as unknown as RatingChangeRow[]);
  const adultRating = profile ? ratingRows.find((row) => row.profile_id === profile.id) : null;
  const ratingValue = adultRating ? adultRating.rating_value.toFixed(1) : rating.value;
  const ratingStatus = adultRating?.provisional ?? true;
  const ratingConfidence = adultRating ? formatLabel(adultRating.confidence) : "Low";
  const ratingMatchCount = adultRating?.verified_match_count ?? 0;
  const ratingChangeByMatchId = new Map(ratingChanges.map((change) => [change.match_id, change]));

  return (
    <PageShell eyebrow="Profile" subtitle="Manage your account, players and PlayR settings." title="Profile">
      <StatusAlert
        className="mb-4 max-w-3xl"
        message={
          searchParams?.error === "missing_name"
            ? "First name and last name are required."
            : searchParams?.error === "parent_profile_required"
              ? "Create your adult profile before adding junior profiles."
            : searchParams?.error === "save_failed"
              ? "Profile could not be saved. Please check your details and try again."
              : null
        }
        tone="error"
      />
      {!profile ? (
        <div className="mb-5 max-w-3xl rounded-lg border border-court-teal/30 bg-court-mist p-4 text-sm leading-6 text-court-navy shadow-sm">
          Complete your Player Profile before entering events. You can add junior players after your own profile is saved.
        </div>
      ) : null}
      <section className="mb-5 grid max-w-3xl gap-4 md:grid-cols-[0.8fr_1.2fr]" id="progress">
        <div className="rounded-lg bg-court-navy p-5 text-white">
          <p className="text-sm font-black uppercase tracking-wide text-court-lime">PlayR Rating</p>
          <p className="mt-3 text-5xl font-black">{ratingValue}</p>
          <p className="mt-1 text-sm font-bold text-blue-50">{ratingStatus ? "Provisional" : "Verified"} / {ratingConfidence} confidence</p>
          <p className="mt-3 text-sm leading-6 text-blue-50">
            {ratingMatchCount} verified match{ratingMatchCount === 1 ? "" : "es"}. {adultRating ? "Calculated from verified match results only." : `Starting estimate: ${rating.band}.`}
          </p>
        </div>
        <div className="surface-card p-5">
          <p className="section-kicker">Progress</p>
          <h2 className="section-title mt-2">Rating summary</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Ratings move only after verified or admin-verified match results. Casual matches and disputed results do not change ratings. New ratings stay provisional until 8 verified matches.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded bg-court-mist p-3">
              <p className="text-lg font-black text-court-navy">{ratingValue}</p>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Current rating</p>
            </div>
            <div className="rounded bg-slate-50 p-3">
              <p className="text-lg font-black text-court-navy">{ratingConfidence}</p>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Confidence</p>
            </div>
            <div className="rounded bg-slate-50 p-3">
              <p className="text-lg font-black text-court-navy">{ratingMatchCount}</p>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Verified matches</p>
            </div>
          </div>
          {ratingRows.filter((row) => row.profile_id !== profile?.id).length > 0 ? (
            <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-black text-court-navy">Linked junior ratings</p>
              <div className="mt-3 grid gap-2">
                {ratingRows
                  .filter((row) => row.profile_id !== profile?.id)
                  .map((row) => (
                    <div className="flex items-center justify-between gap-3 text-sm" key={row.profile_id}>
                      <span className="font-bold text-slate-700">
                        {row.profiles ? playerName(row.profiles.first_name, row.profiles.last_name, row.profiles.is_junior) : "Linked junior"}
                      </span>
                    <span className="font-black text-court-navy">
                        {row.profiles?.is_junior ? "Junior pathway" : `${row.rating_value.toFixed(1)} / ${formatLabel(row.confidence)}`}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}
          {ratingChanges.length > 0 ? (
            <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-black text-court-navy">Recent rating changes</p>
              <div className="mt-3 grid gap-2">
                {ratingChanges.slice(0, 4).map((change) => (
                  <div className="flex flex-col gap-1 rounded bg-white p-3 text-sm sm:flex-row sm:items-center sm:justify-between" key={change.id}>
                    <span className="font-bold text-slate-700">
                      {change.profiles ? playerName(change.profiles.first_name, change.profiles.last_name, change.profiles.is_junior) : "Player"}: {change.rating_before.toFixed(1)} to {change.rating_after.toFixed(1)}
                    </span>
                    <span className={change.rating_delta >= 0 ? "font-black text-emerald-700" : "font-black text-rose-700"}>
                      {change.rating_delta > 0 ? "+" : ""}{change.rating_delta.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="ui-empty-card mt-4">
              No rating changes yet. Send a verified match invite, submit the result, and ask the other side to confirm it to create the first movement.
            </div>
          )}
        </div>
      </section>
      <section className="surface-card mb-5 max-w-3xl p-5">
        <p className="section-kicker">Verified match history</p>
        <h2 className="section-title mt-2">Recent verified matches</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          These are matches where the result was confirmed by the other side or by an admin. Rating movement appears when the match was eligible for ratings.
        </p>
          {verifiedMatches.length > 0 ? (
            <div className="mt-4 grid gap-3">
              {verifiedMatches.map((match) => {
                const winnerName =
                  match.winner_profile_id === match.inviter_profile_id
                    ? playerName(match.inviter_first_name, match.inviter_last_name, match.inviter_is_junior)
                    : playerName(match.opponent_first_name, match.opponent_last_name, match.opponent_is_junior);
                const ratingChange = ratingChangeByMatchId.get(match.id);

                return (
                  <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm" key={match.id}>
                    <p className="font-black text-court-navy">
                      {playerName(match.inviter_first_name, match.inviter_last_name, match.inviter_is_junior)} vs{" "}
                      {playerName(match.opponent_first_name, match.opponent_last_name, match.opponent_is_junior)}
                    </p>
                    <p className="mt-1 text-slate-600">
                      Winner: {winnerName} / {match.score_text}
                    </p>
                    {ratingChange ? (
                      <p className="mt-1 text-slate-600">
                        Rating: {ratingChange.rating_before.toFixed(1)} to {ratingChange.rating_after.toFixed(1)} ({ratingChange.rating_delta > 0 ? "+" : ""}{ratingChange.rating_delta.toFixed(2)})
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-500">
                      {match.booking_start_time ? formatDate(match.booking_start_time) : formatDate(match.confirmed_at ?? match.submitted_at)}
                      {match.booking_court_name ? ` / ${match.booking_court_name}` : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="ui-empty-card mt-4">
              No verified match history yet. Accepted match invite results will appear here once both sides confirm.
            </div>
          )}
      </section>
      <form action={saveOwnProfile} className="surface-card grid w-full max-w-3xl gap-4 p-5 sm:p-6 md:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">
          First name <span className="font-normal text-slate-500">(required)</span>
          <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={profile?.first_name ?? ""} name="first_name" required type="text" />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Last name <span className="font-normal text-slate-500">(required)</span>
          <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={profile?.last_name ?? ""} name="last_name" required type="text" />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Email address <span className="font-normal text-slate-500">(from your login)</span>
          <input className="mt-2 w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 text-slate-600" defaultValue={user.email ?? profile?.email ?? ""} name="email" readOnly type="email" />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Cellphone number <span className="font-normal text-slate-500">(optional)</span>
          <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={defaultPhone} name="phone" type="tel" />
          <span className="mt-2 block text-xs font-normal leading-5 text-slate-600">
            We use your cellphone number for important account, booking, lesson, and club-related communication.
          </span>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Date of birth <span className="font-normal text-slate-500">(optional)</span>
          <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={profile?.date_of_birth ?? ""} name="date_of_birth" type="date" />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Primary sport
          <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={profile?.primary_sport ?? "tennis"} name="primary_sport">
            {sports.map((sport) => (
              <option key={sport} value={sport}>
                {formatLabel(sport)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700 md:col-span-2">
          Player level
          <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={profile?.player_level ?? "unknown"} name="player_level">
            {playerLevels.map((level) => (
              <option key={level} value={level}>
                {formatLabel(level)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700 md:col-span-2">
          <span className="flex gap-3 text-sm leading-6 text-slate-700">
            <input className="mt-1 h-4 w-4 rounded border-slate-300" defaultChecked={defaultMarketingConsent} name="marketing_consent" type="checkbox" />
            <span>I agree to receive optional PlayR marketing updates. This is separate from important account and club communication.</span>
          </span>
        </label>
        <label className="text-sm font-semibold text-slate-700 md:col-span-2">
          Notes <span className="font-normal text-slate-500">(optional)</span>
          <textarea
            className="mt-2 min-h-24 w-full rounded border border-slate-300 px-3 py-2 focus-ring"
            defaultValue={profile?.notes ?? ""}
            name="notes"
            placeholder="Optional profile notes, medical/payment context, or parent/guardian notes if relevant."
          />
        </label>
        <SubmitButton className="rounded bg-court-blue px-4 py-3 font-bold text-white md:col-span-2" pendingText="Saving profile...">
          Save profile
        </SubmitButton>
      </form>
      <section className="surface-card mt-6 max-w-3xl p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="section-kicker">Family & Junior Players</p>
            <h2 className="section-title mt-2">Manage linked junior players</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Junior profiles are managed by the parent/guardian account and used for bookings, events, junior progress, and important club communication.
            </p>
          </div>
          <Link className="inline-flex shrink-0 justify-center rounded bg-court-teal px-4 py-3 text-sm font-bold text-white transition hover:bg-teal-500" href="/dashboard/juniors">
            Add junior player
          </Link>
        </div>

        {!profile ? (
          <div className="mt-5 rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            Save your adult profile first. Then you can add junior profiles linked to your account.
          </div>
        ) : juniors.length > 0 ? (
          <div className="mt-5 grid gap-4">
            {juniors.map((junior) => (
              <div className="soft-card p-4" key={junior.id}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-black text-court-navy">
                      {junior.first_name} {junior.last_name}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatLabel(junior.primary_sport)} / {junior.junior_stage ? formatLabel(junior.junior_stage) : "Stage not set"} / {formatLabel(junior.player_level)}
                    </p>
                    {junior.rating_notes ? <p className="mt-2 text-sm leading-6 text-slate-600">{junior.rating_notes}</p> : null}
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-2xl font-black text-court-navy">{formatJuniorRating(junior.junior_stage, junior.junior_rating)}</p>
                    <p className="text-xs font-black uppercase tracking-wide text-court-teal">
                      {formatLabel(junior.junior_rating_confidence)} confidence{junior.rating_locked ? " / Locked" : ""}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded bg-white p-3">
                    <p className="text-xl font-black text-court-navy">{junior.participation_score}</p>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Participation</p>
                  </div>
                  <div className="rounded bg-white p-3">
                    <p className="text-xl font-black text-court-navy">{junior.matches_played}</p>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Matches</p>
                  </div>
                  <div className="rounded bg-white p-3">
                    <p className="text-xl font-black text-court-navy">{junior.wins}-{junior.losses}</p>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Wins-losses</p>
                  </div>
                  <div className="rounded bg-white p-3">
                    <p className="text-xl font-black text-court-navy">{junior.events_played}</p>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Events</p>
                  </div>
                  <div className="rounded bg-white p-3">
                    <p className="text-xl font-black text-court-navy">{junior.close_matches}</p>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Close matches</p>
                  </div>
                  <div className="rounded bg-white p-3">
                    <p className="text-xl font-black text-court-navy">{junior.stage_readiness_score}%</p>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Stage readiness</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded bg-white p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Badges</p>
                    {junior.junior_achievements?.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {junior.junior_achievements.slice(0, 6).map((badge) => (
                          <span className="rounded-full bg-court-mist px-3 py-1 text-xs font-bold text-court-navy" key={badge.id}>
                            {badge.badge_name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-600">Badges appear after events, verified matches, wins, and coach-approved achievements.</p>
                    )}
                  </div>
                  <div className="rounded bg-white p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Recent rating history</p>
                    {junior.junior_rating_history?.length ? (
                      <div className="mt-2 space-y-2">
                        {junior.junior_rating_history.slice(0, 3).map((history) => (
                          <p className="text-sm text-slate-700" key={history.id}>
                            {formatLabel(history.reason)}: {history.previous_rating?.toFixed(1) ?? "-"} to {history.new_rating?.toFixed(1) ?? "-"} ({history.change_amount > 0 ? "+" : ""}{history.change_amount.toFixed(2)})
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-600">Rating history starts after a verified junior result or ClubR adjustment.</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="ui-empty-card mt-5">
            No junior players linked yet. Add a junior player to book courts, enter events, and track progress for your child.
          </div>
        )}
      </section>
    </PageShell>
  );
}
