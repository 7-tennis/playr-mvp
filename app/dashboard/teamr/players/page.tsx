import Link from "next/link";
import { EntriesIcon, ParticipationIcon, RatingIcon, StageIcon } from "@/components/playr-icons";
import { formatLabel } from "@/lib/courtside-format";
import { loadTeamRPlayers } from "@/lib/teamr";
import { TeamRPageFrame, getProtectedTeamRPage } from "../teamr-shared";

export const dynamic = "force-dynamic";

export default async function TeamRPlayersPage({ searchParams }: { searchParams?: { q?: string; stage?: string } }) {
  const { content, context, venue } = await getProtectedTeamRPage();
  if (content) return content;
  if (!context) return null;

  const result = await loadTeamRPlayers(context);
  const query = searchParams?.q?.trim().toLowerCase() ?? "";
  const stage = searchParams?.stage ?? "all";
  const players = result.data.filter((player) => {
    const matchesQuery = !query || player.name.toLowerCase().includes(query);
    const matchesStage = stage === "all" || (stage === "adult" ? !player.isJunior : player.juniorStage === stage);
    return matchesQuery && matchesStage;
  });

  return (
    <TeamRPageFrame context={context} subtitle="Search and review players already linked through PlayR’s organisation model." title="Players" venue={venue}>
      <form className="surface-card mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_14rem_auto] sm:items-end" method="get">
        <label className="text-sm font-bold text-court-navy">Search<input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 font-semibold focus-ring" defaultValue={searchParams?.q ?? ""} name="q" placeholder="Player name" /></label>
        <label className="text-sm font-bold text-court-navy">Stage<select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 font-semibold focus-ring" defaultValue={stage} name="stage"><option value="all">All players</option><option value="red_ball">Red Ball</option><option value="orange_ball">Orange Ball</option><option value="green_ball">Green Ball</option><option value="yellow_ball">Yellow Ball</option><option value="not_sure">Stage not confirmed</option><option value="adult">Adult players</option></select></label>
        <div className="flex gap-2"><button className="btn-primary px-4 py-2" type="submit">Filter</button>{query || stage !== "all" ? <Link className="btn-secondary px-4 py-2" href="/dashboard/teamr/players">Reset</Link> : null}</div>
      </form>

      {result.error ? <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800" role="alert">{result.error} No player records were assumed.</section> : null}
      {!result.error && result.data.length === 0 ? (
        <section className="empty-state"><EntriesIcon className="mx-auto text-court-teal" size={28} /><h2 className="section-title mt-3">No linked players yet</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">Players will appear here when a canonical organisation player link is active. TeamR does not create a duplicate player record.</p></section>
      ) : null}
      {!result.error && result.data.length > 0 && players.length === 0 ? <div className="ui-empty-card">No players match the current search and stage filters.</div> : null}
      {players.length > 0 ? (
        <section aria-label="TeamR players" className="grid gap-3 lg:grid-cols-2">
          {players.map((player) => (
            <article className="surface-card p-4" key={player.id}>
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-black text-court-navy">{player.name}</h2><p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">Active organisation player</p></div><span className="ui-chip ui-chip-brand">{player.isJunior ? formatLabel(player.juniorStage ?? "not_sure") : "Adult"}</span></div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <div className="rounded-lg bg-slate-50 p-3"><StageIcon className="text-court-teal" size={16} /><p className="mt-2 text-xs font-bold text-slate-500">Stage</p><p className="font-black text-court-navy">{player.isJunior ? formatLabel(player.juniorStage ?? "not_sure") : "Open"}</p></div>
                <div className="rounded-lg bg-slate-50 p-3"><RatingIcon className="text-court-teal" rating={player.rating ?? 0} size={16} /><p className="mt-2 text-xs font-bold text-slate-500">Rating</p><p className="font-black text-court-navy">{player.rating == null ? "Not rated" : player.rating.toFixed(2)}</p></div>
                <div className="col-span-2 rounded-lg bg-slate-50 p-3 sm:col-span-1"><ParticipationIcon className="text-court-teal" size={16} /><p className="mt-2 text-xs font-bold text-slate-500">Participation</p><p className="font-black text-court-navy">{player.participationScore} pts</p></div>
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </TeamRPageFrame>
  );
}
