import Link from "next/link";
import { EntriesIcon, EventIcon, MatchIcon, ParticipationIcon, StageIcon } from "@/components/playr-icons";
import { loadTeamRPlayers } from "@/lib/teamr";
import { TeamRPageFrame, TeamRStatCard, getProtectedTeamRPage } from "./teamr-shared";

export const dynamic = "force-dynamic";

export default async function TeamRPage() {
  const { content, context, venue } = await getProtectedTeamRPage();
  if (content) return content;
  if (!context) return null;

  const playersResult = await loadTeamRPlayers(context);
  const players = playersResult.data;
  const stageCounts = {
    red_ball: players.filter((player) => player.juniorStage === "red_ball").length,
    orange_ball: players.filter((player) => player.juniorStage === "orange_ball").length,
    green_ball: players.filter((player) => player.juniorStage === "green_ball").length,
    yellow_ball: players.filter((player) => player.juniorStage === "yellow_ball").length
  };
  const participation = players.reduce((total, player) => total + player.participationScore, 0);

  return (
    <TeamRPageFrame context={context} subtitle="A clear, read-only view of your organisation’s tennis programme." title="MyTeamR" venue={venue}>
      {context.role === "platform_admin" && !context.venueId ? (
        <section className="ui-empty-card mb-5">Platform administration remains global. Organisation-scoped player data is intentionally not aggregated in this view; use the existing SupeR organisation tools to review organisation access.</section>
      ) : null}
      {playersResult.error ? <section className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800" role="alert">{playersResult.error} No counts were assumed.</section> : null}

      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TeamRStatCard helper="active links" icon={<EntriesIcon size={19} />} label="Players" value={playersResult.error ? "--" : players.length} />
        <TeamRStatCard helper="not configured yet" icon={<MatchIcon size={19} />} label="Teams" value="—" />
        <TeamRStatCard helper="foundation ready" icon={<EventIcon size={19} />} label="Competitions" value="—" />
        <TeamRStatCard helper="canonical points" icon={<ParticipationIcon size={19} />} label="Participation" value={playersResult.error ? "--" : participation} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <article className="surface-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div><p className="section-kicker">Player pathway</p><h2 className="section-title mt-1">Junior development stages</h2></div>
            <Link className="btn-secondary px-3 py-2" href="/dashboard/teamr/players">View Players</Link>
          </div>
          {players.some((player) => player.isJunior && player.juniorStage && player.juniorStage !== "not_sure") ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Red", stageCounts.red_ball, "bg-red-50 text-red-700"],
                ["Orange", stageCounts.orange_ball, "bg-orange-50 text-orange-700"],
                ["Green", stageCounts.green_ball, "bg-emerald-50 text-emerald-700"],
                ["Yellow", stageCounts.yellow_ball, "bg-amber-50 text-amber-700"]
              ].map(([label, value, tone]) => <div className={`rounded-lg p-3 ${tone}`} key={label}><StageIcon size={18} /><p className="mt-3 text-2xl font-black">{value}</p><p className="text-xs font-black uppercase tracking-wide">{label}</p></div>)}
            </div>
          ) : (
            <div className="ui-empty-card mt-4">Junior development stages have not been recorded for this organisation’s linked players yet.</div>
          )}
        </article>

        <article className="surface-card p-4 sm:p-5">
          <p className="section-kicker">Foundation</p>
          <h2 className="section-title mt-1">Ready for the next phase</h2>
          <div className="mt-4 grid gap-2 text-sm leading-6 text-slate-600">
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-3">Team and roster workflows will build on this organisation context.</p>
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-3">Competition operations will be added without creating a second player or ratings source.</p>
          </div>
        </article>
      </section>
    </TeamRPageFrame>
  );
}
