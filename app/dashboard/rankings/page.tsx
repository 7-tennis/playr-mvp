import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { ClubIcon, DistrictIcon, LeaderboardIcon, ParticipationIcon, RatingIcon, StageIcon } from "@/components/playr-icons";
import { EmptyState, SectionError } from "@/components/playr-ui";
import { formatDateTime, formatLabel } from "@/lib/courtside-format";
import { loadPublicRankings } from "@/lib/public-rankings";
import { playrRankingCategories, rankingCategoryDescription, rankingCategoryLabel, rankingMetricForCategory, type PlayRRankingCategory } from "@/lib/ranking-categories";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

type RankingsSearchParams = {
  category?: string;
  classification?: string;
  metric?: string;
  organisation?: string;
  page?: string;
  q?: string;
  region?: string;
};

function safeCategory(value?: string): PlayRRankingCategory {
  return playrRankingCategories.some((item) => item.id === value) ? value as PlayRRankingCategory : "open";
}

function queryHref(values: RankingsSearchParams) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return query ? `/dashboard/rankings?${query}` : "/dashboard/rankings";
}

export default async function RankingsPage({ searchParams }: { searchParams?: RankingsSearchParams }) {
  if (!hasSupabaseConfig()) {
    return <PageShell eyebrow="PlayR leaderboards" subtitle="Explore PlayR ratings and participation leaderboards." title="Rankings"><div className="empty-state">Add Supabase environment variables to use rankings.</div></PageShell>;
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(queryHref(searchParams ?? {}))}`);

  const category = safeCategory(searchParams?.category);
  const metric = rankingMetricForCategory(category, searchParams?.metric);
  const classification = category === "open" && ["junior", "adult"].includes(searchParams?.classification ?? "") ? searchParams?.classification as "junior" | "adult" : undefined;
  const page = Math.max(Number.parseInt(searchParams?.page ?? "1", 10) || 1, 1);
  const rankingData = await loadPublicRankings(supabase, {
    category,
    classification,
    limit: PAGE_SIZE,
    metric,
    offset: (page - 1) * PAGE_SIZE,
    organisationId: searchParams?.organisation,
    region: searchParams?.region,
    search: searchParams?.q?.trim()
  });
  const total = rankingData.rows[0]?.total_count ?? 0;
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const latestUpdate = rankingData.rows.reduce<string | null>((latest, row) => !latest || row.updated_at > latest ? row.updated_at : latest, null);
  const selectedOrganisation = rankingData.organisations.find((item) => item.organisation_id === searchParams?.organisation);

  return (
    <PageShell eyebrow="PlayR leaderboards" subtitle="Explore PlayR ratings and participation leaderboards." title="Rankings">
      <nav aria-label="Ranking category" className="grid grid-cols-4 gap-1 rounded-playr-lg border border-playr-border-subtle bg-white p-1 shadow-playr-subtle">
        {playrRankingCategories.map((item) => {
          const active = item.id === category;
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`min-h-11 rounded-playr-md px-1 py-3 text-center text-xs font-black transition focus-ring sm:text-sm ${active ? "bg-court-navy text-white shadow-playr-card" : "text-slate-600 hover:bg-slate-50 hover:text-court-navy"}`}
              href={queryHref({ category: item.id, metric: rankingMetricForCategory(item.id) })}
              key={item.id}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 flex flex-col gap-3 rounded-playr-lg border border-court-teal/25 bg-court-mist p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="font-black text-court-navy">{rankingCategoryLabel(category)} rankings</p><p className="mt-1 text-sm leading-6 text-slate-700">{rankingCategoryDescription(category)}</p></div>
        {latestUpdate ? <p className="shrink-0 text-xs font-bold text-slate-600">Updated {formatDateTime(latestUpdate)}</p> : null}
      </div>

      <form aria-label="Ranking filters" className="mt-4 grid gap-3 rounded-playr-lg border border-playr-border-subtle bg-white p-4 shadow-playr-subtle sm:grid-cols-2 lg:grid-cols-4" method="get">
        <input name="category" type="hidden" value={category} />
        <label className="text-sm font-black text-court-navy">Metric
          <select className="mt-1.5 min-h-11 w-full rounded-playr-md border border-slate-300 px-3 focus-ring" defaultValue={metric} disabled={category === "red" || category === "orange"} name="metric">
            {category === "green" || category === "open" ? <option value="rating">Rating</option> : null}
            <option value="participation">Participation</option>
          </select>
          {category === "red" || category === "orange" ? <input name="metric" type="hidden" value="participation" /> : null}
        </label>
        {category === "open" ? (
          <label className="text-sm font-black text-court-navy">Player group
            <select className="mt-1.5 min-h-11 w-full rounded-playr-md border border-slate-300 px-3 focus-ring" defaultValue={classification ?? ""} name="classification">
              <option value="">All Open players</option><option value="junior">Junior</option><option value="adult">Adult</option>
            </select>
          </label>
        ) : null}
        <label className="text-sm font-black text-court-navy">Organisation
          <select className="mt-1.5 min-h-11 w-full rounded-playr-md border border-slate-300 px-3 focus-ring" defaultValue={selectedOrganisation?.organisation_id ?? ""} name="organisation">
            <option value="">All organisations</option>
            {rankingData.organisations.map((item) => <option key={item.organisation_id} value={item.organisation_id}>{item.organisation_name} · {formatLabel(item.organisation_type)}</option>)}
          </select>
        </label>
        <label className="text-sm font-black text-court-navy">Region
          <select className="mt-1.5 min-h-11 w-full rounded-playr-md border border-slate-300 px-3 focus-ring" defaultValue={searchParams?.region ?? ""} name="region">
            <option value="">All regions</option>{rankingData.regions.map((region) => <option key={region} value={region}>{region}</option>)}
          </select>
        </label>
        <label className="text-sm font-black text-court-navy sm:col-span-2 lg:col-span-3">Search public rankings
          <input className="mt-1.5 min-h-11 w-full rounded-playr-md border border-slate-300 px-3 focus-ring" defaultValue={searchParams?.q ?? ""} name="q" placeholder="Public player or verified organisation" type="search" />
        </label>
        <button className="btn-primary self-end" type="submit">Apply filters</button>
      </form>
      {rankingData.filtersError ? <p className="mt-2 text-sm font-semibold text-amber-800">Some organisation or region filters are temporarily unavailable.</p> : null}

      <section aria-labelledby="ranking-list" className="mt-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><p className="section-kicker">{rankingCategoryLabel(category)}</p><h2 className="section-title mt-1" id="ranking-list">{metric === "rating" ? "Rating" : "Participation"} leaderboard</h2></div>
          <span className="ui-chip ui-chip-brand">{total} published</span>
        </div>
        {rankingData.error ? <SectionError description="Rankings could not be loaded right now." /> : rankingData.rows.length > 0 ? (
          <ol className="grid gap-3">
            {rankingData.rows.map((row) => (
              <li className={`grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-playr-lg border bg-white p-4 shadow-playr-card ${row.is_managed ? "border-court-teal ring-2 ring-court-teal/15" : "border-playr-border-subtle"}`} key={row.ranking_profile_id}>
                <span aria-label={`Rank ${row.ranking_position}`} className="grid h-10 w-10 place-items-center rounded-playr-md bg-court-navy font-black text-white">{row.ranking_position}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="break-words font-black text-court-navy">{row.public_display_name}</h3>{row.is_managed ? <span className="ui-chip ui-chip-brand">Your player</span> : null}</div>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-500"><StageIcon size={14} /> {row.development_stage === "yellow" ? "Yellow Junior · Open" : row.player_classification === "adult" ? "Adult · Open" : `${rankingCategoryLabel(category)} · Junior`}</p>
                  {row.organisation_summary ? <p className="mt-1 flex items-start gap-1.5 break-words text-xs font-semibold text-slate-600"><ClubIcon className="mt-0.5 shrink-0" size={13} /> {row.organisation_summary}</p> : null}
                  {row.public_region ? <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500"><DistrictIcon size={13} /> {row.public_region}</p> : null}
                </div>
                <div className="text-right">
                  <p className="inline-flex items-center gap-1.5 text-lg font-black text-court-navy">{metric === "rating" ? <RatingIcon rating={row.metric_value} size={18} stage={category === "open" ? "open" : category} /> : <ParticipationIcon size={18} />}{metric === "rating" ? Number(row.metric_value).toFixed(1) : row.metric_value}</p>
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{metric === "rating" ? "Rating" : "Points"}</p>
                  <p className="mt-1 text-[10px] font-semibold text-slate-500">{metric === "rating" ? `${row.matches_played} matches` : `${row.events_played} events`}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState description={metric === "participation" ? `Players will appear after verified ${rankingCategoryLabel(category)} participation activity is published.` : "Try changing the organisation, region or player-group filters."} icon={<LeaderboardIcon className="text-court-teal" size={28} />} title={metric === "participation" ? `No ${rankingCategoryLabel(category)} participation rankings yet` : `No ${rankingCategoryLabel(category)} rating results found`} />
        )}
      </section>

      {totalPages > 1 ? (
        <nav aria-label="Ranking pages" className="mt-6 flex items-center justify-between gap-3">
          {page > 1 ? <Link className="btn-secondary" href={queryHref({ ...searchParams, category, metric, page: String(page - 1) })}>Previous</Link> : <span />}
          <span className="text-sm font-bold text-slate-600">Page {Math.min(page, totalPages)} of {totalPages}</span>
          {page < totalPages ? <Link className="btn-secondary" href={queryHref({ ...searchParams, category, metric, page: String(page + 1) })}>Next</Link> : <span />}
        </nav>
      ) : null}
    </PageShell>
  );
}
