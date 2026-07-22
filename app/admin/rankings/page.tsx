import Link from "next/link";
import { AdminNav } from "@/components/admin-nav";
import { PageShell } from "@/components/page-shell";
import { PrivateIcon, StatusIcon } from "@/components/playr-icons";
import { SubmitButton } from "@/components/submit-button";
import { formatDateTime, formatLabel } from "@/lib/courtside-format";
import { getAdminContext } from "@/lib/admin-auth";
import { updateRankingPublication } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = { category?: string; classification?: string; message?: string; record?: string; search?: string; status?: string };
type RankingRow = {
  id: string; player_id: string; public_display_name: string; ranking_category: string; development_stage: string | null;
  player_classification: string; publication_status: string; public_region: string | null; safeguarding_hidden: boolean;
  created_at: string; updated_at: string;
};
type ProfileRow = { id: string; participation_score: number; junior_rating: number | null; events_played: number; matches_played: number; member_status: string };
type RatingRow = { profile_id: string; rating_value: number; verified_match_count: number };
type LinkRow = { player_profile_id: string; venue: { name: string; organisation_type: string } | null };
type AuditRow = { action: string; previous_status: string | null; new_status: string | null; previous_hidden: boolean | null; new_hidden: boolean | null; actor_display_name: string; internal_reason: string | null; changed_at: string };

const messages: Record<string, string> = {
  confirmation_required: "Confirm the action before submitting.", reason_required: "Add a short private reason for this action.",
  update_failed: "We could not update the publication status. No changes were saved.", updated: "The ranking publication was updated."
};

function actionForm(id: string, action: string, label: string, needsReason = false) {
  return (
    <form action={updateRankingPublication} className="rounded-playr-md border border-playr-border-subtle bg-slate-50 p-3">
      <input name="rankingProfileId" type="hidden" value={id} /><input name="action" type="hidden" value={action} />
      {needsReason ? <label className="text-xs font-black text-court-navy">Private reason<textarea className="mt-1 min-h-20 w-full rounded border border-slate-300 bg-white p-2 text-sm font-medium" maxLength={500} name="reason" required /></label> : null}
      <label className="mt-2 flex min-h-11 items-center gap-2 text-xs font-bold text-slate-700"><input name="confirmed" required type="checkbox" /> Confirm {label.toLowerCase()}</label>
      <SubmitButton className="btn-secondary mt-2 min-h-11 w-full justify-center" pendingText="Updating…">{label}</SubmitButton>
    </form>
  );
}

export default async function RankingAdministrationPage({ searchParams }: { searchParams?: SearchParams }) {
  const { adminRole, supabase } = await getAdminContext();
  if (adminRole !== "platform_admin") {
    return <PageShell eyebrow="SupeR UseR" title="Access restricted"><AdminNav /><section className="empty-state"><PrivateIcon size={24} /><h2 className="section-title mt-3">Only platform administrators can operate public rankings.</h2></section></PageShell>;
  }

  const status = ["pending", "approved", "rejected", "suspended", "hidden", "all"].includes(searchParams?.status ?? "") ? searchParams?.status ?? "pending" : "pending";
  let query = supabase.from("player_ranking_profiles").select("id,player_id,public_display_name,ranking_category,development_stage,player_classification,publication_status,public_region,safeguarding_hidden,created_at,updated_at").order("updated_at", { ascending: false }).limit(100);
  if (status === "hidden") query = query.eq("safeguarding_hidden", true);
  else if (status !== "all") query = query.eq("publication_status", status).eq("safeguarding_hidden", false);
  if (["red", "orange", "green", "open"].includes(searchParams?.category ?? "")) query = query.eq("ranking_category", searchParams?.category);
  if (["junior", "adult"].includes(searchParams?.classification ?? "")) query = query.eq("player_classification", searchParams?.classification);
  if (searchParams?.search?.trim()) query = query.ilike("public_display_name", `%${searchParams.search.trim().slice(0, 100)}%`);

  const rankingResult = await query;
  const rankings = (rankingResult.data ?? []) as RankingRow[];
  const playerIds = rankings.map((row) => row.player_id);
  const selected = rankings.find((row) => row.id === searchParams?.record) ?? null;
  const [profilesResult, ratingsResult, linksResult, auditResult] = await Promise.all([
    playerIds.length ? supabase.from("profiles").select("id,participation_score,junior_rating,events_played,matches_played,member_status").in("id", playerIds) : Promise.resolve({ data: [] }),
    playerIds.length ? supabase.from("ratings").select("profile_id,rating_value,verified_match_count").in("profile_id", playerIds) : Promise.resolve({ data: [] }),
    playerIds.length ? supabase.from("organisation_player_links").select("player_profile_id,venue:venue_id(name,organisation_type)").in("player_profile_id", playerIds).eq("status", "active") : Promise.resolve({ data: [] }),
    selected ? supabase.rpc("get_admin_player_ranking_audit", { p_limit: 30, p_ranking_profile_id: selected.id }) : Promise.resolve({ data: [] })
  ]);
  const profiles = new Map(((profilesResult.data ?? []) as ProfileRow[]).map((row) => [row.id, row]));
  const ratings = new Map(((ratingsResult.data ?? []) as RatingRow[]).map((row) => [row.profile_id, row]));
  const organisations = new Map<string, string[]>();
  ((linksResult.data ?? []) as unknown as LinkRow[]).forEach((row) => organisations.set(row.player_profile_id, [...(organisations.get(row.player_profile_id) ?? []), row.venue ? `${row.venue.name} (${formatLabel(row.venue.organisation_type)})` : "Organisation unavailable"]));
  const audit = (auditResult.data ?? []) as AuditRow[];

  return (
    <PageShell eyebrow="SupeR UseR" subtitle="Approve junior publication and remove unsafe records without exposing private player data." title="Ranking Administration">
      <AdminNav />
      {searchParams?.message && messages[searchParams.message] ? <p className="mb-4 rounded-playr-md border border-court-teal/30 bg-court-mist p-3 text-sm font-bold text-court-navy" role="status">{messages[searchParams.message]}</p> : null}
      <nav aria-label="Publication status" className="mb-4 flex gap-2 overflow-x-auto">{["pending", "approved", "hidden", "rejected", "suspended", "all"].map((item) => <Link aria-current={status === item ? "page" : undefined} className={status === item ? "ui-chip ui-chip-brand min-h-11" : "ui-chip ui-chip-muted min-h-11"} href={`/admin/rankings?status=${item}`} key={item}>{formatLabel(item)}</Link>)}</nav>
      <form className="mb-6 grid gap-3 rounded-playr-lg border border-playr-border-subtle bg-white p-4 shadow-playr-subtle sm:grid-cols-4">
        <input name="status" type="hidden" value={status} />
        <label className="text-sm font-black text-court-navy sm:col-span-2">Search<input className="mt-1 min-h-11 w-full rounded border border-slate-300 px-3 font-medium" defaultValue={searchParams?.search} maxLength={100} name="search" placeholder="Public display name" /></label>
        <label className="text-sm font-black text-court-navy">Category<select className="mt-1 min-h-11 w-full rounded border border-slate-300 px-3" defaultValue={searchParams?.category ?? ""} name="category"><option value="">All</option>{["red", "orange", "green", "open"].map((item) => <option key={item} value={item}>{formatLabel(item)}</option>)}</select></label>
        <label className="text-sm font-black text-court-navy">Player group<select className="mt-1 min-h-11 w-full rounded border border-slate-300 px-3" defaultValue={searchParams?.classification ?? ""} name="classification"><option value="">All</option><option value="junior">Junior</option><option value="adult">Adult</option></select></label>
        <button className="btn-primary min-h-11 sm:col-span-4" type="submit">Apply filters</button>
      </form>
      {rankingResult.error ? <section className="empty-state"><h2 className="section-title">Ranking administration is temporarily unavailable.</h2><p className="mt-2 text-sm text-slate-600">Please try again shortly.</p></section> : rankings.length ? <div className="space-y-3">{rankings.map((row) => { const profile = profiles.get(row.player_id); const rating = ratings.get(row.player_id); return <article className="surface-card grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto]" key={row.id}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate font-black text-court-navy">{row.public_display_name}</h2><span className={row.safeguarding_hidden ? "ui-chip ui-chip-error" : row.publication_status === "approved" ? "ui-chip ui-chip-success" : "ui-chip ui-chip-warning"}>{row.safeguarding_hidden ? "Hidden" : formatLabel(row.publication_status)}</span></div><p className="mt-2 text-sm font-semibold text-slate-600">{formatLabel(row.player_classification)} · {formatLabel(row.development_stage ?? "open")} stage · {formatLabel(row.ranking_category)} ranking</p><p className="mt-1 text-sm text-slate-600">{organisations.get(row.player_id)?.join(", ") ?? "No verified active organisation"} · {row.public_region ?? "Region unavailable"}</p><p className="mt-1 text-xs font-semibold text-slate-500">{row.ranking_category === "red" || row.ranking_category === "orange" ? `${profile?.participation_score ?? 0} participation points` : `${rating?.rating_value ?? profile?.junior_rating ?? "No"} rating`} · {profile?.events_played ?? 0} events · Updated {formatDateTime(row.updated_at)}</p></div><Link className="btn-secondary min-h-11 justify-center" href={`/admin/rankings?status=${status}&record=${row.id}`}>Review and audit</Link></article>; })}</div> : <section className="empty-state"><StatusIcon size={24} /><h2 className="section-title mt-3">No ranking records match these filters.</h2></section>}
      {selected ? <section aria-labelledby="ranking-review" className="mt-8 surface-card p-5"><h2 className="section-title" id="ranking-review">Review {selected.public_display_name}</h2><p className="mt-2 text-sm text-slate-600">Actions are authorised in the database and recorded in immutable audit history. Reasons remain private.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{actionForm(selected.id, "approve", "Approve publication")}{actionForm(selected.id, "reject", "Return for correction", true)}{actionForm(selected.id, "hide", "Hide immediately", true)}{actionForm(selected.id, "suspend", "Suspend publication", true)}{actionForm(selected.id, "restore", "Restore publication")}</div><h3 className="mt-8 font-black text-court-navy">Audit history</h3><ol className="mt-3 space-y-2">{audit.length ? audit.map((entry, index) => <li className="rounded-playr-md border border-playr-border-subtle p-3 text-sm" key={`${entry.changed_at}-${index}`}><p className="font-black text-court-navy">{formatLabel(entry.action)} · {formatLabel(entry.previous_status ?? "none")} → {formatLabel(entry.new_status ?? "none")}</p><p className="mt-1 text-slate-600">{entry.actor_display_name} · {formatDateTime(entry.changed_at)}</p>{entry.internal_reason ? <p className="mt-1 font-semibold text-slate-700">Private reason: {entry.internal_reason}</p> : null}</li>) : <li className="ui-empty-card">No audit history is available for this record.</li>}</ol></section> : null}
    </PageShell>
  );
}
