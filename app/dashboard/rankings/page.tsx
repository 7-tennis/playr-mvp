import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { LeaderboardIcon, ParticipationIcon, PrivateIcon, RatingIcon, StageIcon } from "@/components/playr-icons";
import { EmptyState, SectionError } from "@/components/playr-ui";
import { formatJuniorStage } from "@/lib/courtside-format";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { JuniorStage, Profile, Rating } from "@/types/courtside";

export const dynamic = "force-dynamic";

type RankingStage = "red_ball" | "orange_ball" | "green_ball" | "yellow_ball" | "adult";
type RankingMetric = "rating" | "participation";
type RankingProfile = Pick<Profile, "id" | "first_name" | "last_name" | "is_junior" | "junior_stage" | "junior_rating" | "participation_score" | "events_played">;

const stages: Array<{ id: RankingStage; label: string }> = [
  { id: "red_ball", label: "Red" },
  { id: "orange_ball", label: "Orange" },
  { id: "green_ball", label: "Green" },
  { id: "yellow_ball", label: "Yellow" },
  { id: "adult", label: "Adult" }
];

function stageHref(stage: RankingStage, metric: RankingMetric, player?: string) {
  const params = new URLSearchParams({ stage });
  if (metric === "participation" || !["red_ball", "orange_ball"].includes(stage)) params.set("metric", metric);
  if (player) params.set("player", player);
  return `/dashboard/rankings?${params.toString()}`;
}

function profileStage(profile: RankingProfile): RankingStage {
  return profile.is_junior ? (profile.junior_stage === "not_sure" || !profile.junior_stage ? "red_ball" : profile.junior_stage as RankingStage) : "adult";
}

function stageName(stage: RankingStage) {
  return stage === "adult" ? "Adult / Open" : formatJuniorStage(stage as JuniorStage);
}

export default async function RankingsPage({ searchParams }: { searchParams?: { metric?: string; player?: string; stage?: string } }) {
  if (!hasSupabaseConfig()) {
    return <PageShell eyebrow="PlayR leaderboards" subtitle="Explore PlayR ratings and participation leaderboards." title="Rankings"><div className="empty-state">Add Supabase environment variables to use rankings.</div></PageShell>;
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: adultData, error: adultError } = await supabase
    .from("profiles")
    .select("id,first_name,last_name,is_junior,junior_stage,junior_rating,participation_score,events_played")
    .eq("user_id", user.id)
    .eq("is_junior", false)
    .maybeSingle();
  const adult = adultData as RankingProfile | null;
  const { data: juniorData, error: juniorError } = adult
    ? await supabase
        .from("profiles")
        .select("id,first_name,last_name,is_junior,junior_stage,junior_rating,participation_score,events_played")
        .eq("parent_profile_id", adult.id)
        .eq("is_junior", true)
        .order("first_name")
    : { data: [], error: null };
  const profiles = [...(adult ? [adult] : []), ...((juniorData ?? []) as RankingProfile[])];
  const profileIds = profiles.map((profile) => profile.id);
  const { data: ratingData, error: ratingError } = profileIds.length > 0
    ? await supabase.from("ratings").select("profile_id,rating_value,verified_match_count,provisional").in("profile_id", profileIds)
    : { data: [], error: null };
  const ratings = new Map(((ratingData ?? []) as Pick<Rating, "profile_id" | "rating_value" | "verified_match_count" | "provisional">[]).map((rating) => [rating.profile_id, rating]));
  const requestedStage = stages.some((stage) => stage.id === searchParams?.stage) ? searchParams?.stage as RankingStage : profileStage(profiles.find((profile) => profile.id === searchParams?.player) ?? profiles[0] ?? ({ is_junior: false } as RankingProfile));
  const participationOnly = requestedStage === "red_ball" || requestedStage === "orange_ball";
  const metric: RankingMetric = participationOnly || searchParams?.metric === "participation" ? "participation" : "rating";
  const stageProfiles = profiles.filter((profile) => profileStage(profile) === requestedStage);
  const selectedPlayer = stageProfiles.find((profile) => profile.id === searchParams?.player) ?? stageProfiles[0] ?? null;
  const rows = stageProfiles
    .map((profile) => ({
      profile,
      score: metric === "participation" ? profile.participation_score : profile.is_junior ? profile.junior_rating : ratings.get(profile.id)?.rating_value ?? null,
      verifiedMatches: profile.is_junior ? null : ratings.get(profile.id)?.verified_match_count ?? 0
    }))
    .filter((row): row is typeof row & { score: number } => typeof row.score === "number")
    .sort((left, right) => right.score - left.score || left.profile.first_name.localeCompare(right.profile.first_name));
  const failed = adultError || juniorError || ratingError;

  return (
    <PageShell eyebrow="PlayR leaderboards" subtitle="Explore PlayR ratings and participation leaderboards." title="Rankings">
      <section className="rounded-playr-lg border border-court-teal/25 bg-court-mist p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <PrivateIcon className="mt-0.5 shrink-0 text-court-teal" size={20} />
          <div>
            <h2 className="font-black text-court-navy">Privacy-safe account view</h2>
            <p className="mt-1 text-sm leading-6 text-slate-700">Only your adult profile and authorised linked juniors are included. Community rows remain hidden until PlayR has an explicit ranking-visibility consent model.</p>
          </div>
        </div>
      </section>

      <nav aria-label="Ranking stage" className="mt-6 grid grid-cols-5 gap-1 rounded-playr-lg border border-playr-border-subtle bg-white p-1 shadow-playr-subtle">
        {stages.map((stage) => {
          const active = stage.id === requestedStage;
          return <Link aria-current={active ? "page" : undefined} className={`min-h-11 rounded-playr-md px-1 py-3 text-center text-xs font-black transition focus-ring sm:text-sm ${active ? "bg-court-navy text-white shadow-playr-card" : "text-slate-600 hover:bg-slate-50 hover:text-court-navy"}`} href={stageHref(stage.id, stage.id === "red_ball" || stage.id === "orange_ball" ? "participation" : metric, selectedPlayer?.id)} key={stage.id}>{stage.label}</Link>;
        })}
      </nav>

      <form className="mt-4 grid gap-3 rounded-playr-lg border border-playr-border-subtle bg-white p-4 shadow-playr-subtle sm:grid-cols-2" method="get">
        <input name="stage" type="hidden" value={requestedStage} />
        <label className="text-sm font-black text-court-navy">Player
          <select className="mt-1.5 min-h-11 w-full rounded-playr-md border border-slate-300 px-3 focus-ring" defaultValue={selectedPlayer?.id ?? ""} name="player">
            {stageProfiles.length === 0 ? <option value="">No player in this stage</option> : stageProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.first_name} {profile.last_name}</option>)}
          </select>
        </label>
        <label className="text-sm font-black text-court-navy">Ranking metric
          <select className="mt-1.5 min-h-11 w-full rounded-playr-md border border-slate-300 px-3 focus-ring" defaultValue={metric} disabled={participationOnly} name="metric">
            {!participationOnly ? <option value="rating">Rating</option> : null}
            <option value="participation">Participation</option>
          </select>
          {participationOnly ? <input name="metric" type="hidden" value="participation" /> : null}
        </label>
        <button className="btn-primary sm:col-span-2 sm:justify-self-start" type="submit">Apply ranking filters</button>
      </form>

      <section aria-labelledby="ranking-list" className="mt-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><p className="section-kicker">{stageName(requestedStage)}</p><h2 className="section-title mt-1" id="ranking-list">{metric === "rating" ? "Rating" : "Participation"} ranking</h2></div>
          <span className="ui-chip ui-chip-brand">{rows.length} visible</span>
        </div>
        {failed ? <SectionError description="Rankings could not be loaded right now." /> : rows.length > 0 ? (
          <ol className="grid gap-3">
            {rows.map((row, index) => {
              const current = row.profile.id === selectedPlayer?.id;
              return (
                <li className={`grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-playr-lg border bg-white p-4 shadow-playr-subtle ${current ? "border-court-teal ring-2 ring-court-teal/15" : "border-playr-border-subtle"}`} key={row.profile.id}>
                  <span aria-label={`Rank ${index + 1}`} className="grid h-10 w-10 place-items-center rounded-playr-md bg-court-navy font-black text-white">{index + 1}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="break-words font-black text-court-navy">{row.profile.first_name} {row.profile.last_name}</h3>{current ? <span className="ui-chip ui-chip-brand">Selected player</span> : null}</div>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-500"><StageIcon size={14} /> {stageName(requestedStage)}{metric === "participation" ? ` · ${row.profile.events_played} events` : row.verifiedMatches !== null ? ` · ${row.verifiedMatches} verified matches` : ""}</p>
                  </div>
                  <div className="text-right">
                    <p className="inline-flex items-center gap-1.5 text-lg font-black text-court-navy">{metric === "rating" ? <RatingIcon rating={row.score} size={18} stage={row.profile.is_junior ? row.profile.junior_stage : "adult"} /> : <ParticipationIcon size={18} />}{metric === "rating" ? row.score.toFixed(1) : row.score}</p>
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{metric === "rating" ? "Rating" : "Points"}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <EmptyState description={`No authorised ${stageName(requestedStage)} player has a supported ${metric} record yet.`} icon={<LeaderboardIcon className="text-court-teal" size={28} />} title="No ranking available" />
        )}
      </section>
    </PageShell>
  );
}
