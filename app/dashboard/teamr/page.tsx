import Link from "next/link";
import { EntriesIcon, EventIcon, MatchIcon, StageIcon } from "@/components/playr-icons";
import { formatDate, formatTime } from "@/lib/courtside-format";
import { loadOrganisationEvents } from "@/lib/organisation-events";
import { loadTeamRPlayerRequests, loadTeamRPlayers, loadTeamRTeams } from "@/lib/teamr";
import { TeamRPageFrame, TeamRStatCard, getProtectedTeamRPage } from "./teamr-shared";

export const dynamic = "force-dynamic";

export default async function TeamRPage() {
  const { content, context, venue } = await getProtectedTeamRPage();
  if (content) return content;
  if (!context) return null;

  const [playersResult, requestsResult, teamsResult, eventsResult] = await Promise.all([loadTeamRPlayers(context), loadTeamRPlayerRequests(context), loadTeamRTeams(context), loadOrganisationEvents(context)]);
  const players = playersResult.data;
  const stageCounts = {
    red_ball: players.filter((player) => player.juniorStage === "red_ball").length,
    orange_ball: players.filter((player) => player.juniorStage === "orange_ball").length,
    green_ball: players.filter((player) => player.juniorStage === "green_ball").length,
    yellow_ball: players.filter((player) => player.juniorStage === "yellow_ball").length
  };
  const now = Date.now();
  const upcomingEvents = eventsResult.data.filter((event) => event.status === "published" && !event.archived_at && new Date(event.starts_at ?? event.start_datetime).getTime() >= now);
  const nextEvent = upcomingEvents[0] ?? null;
  const draftEventCount = eventsResult.data.filter((event) => event.status === "draft" && !event.archived_at).length;

  return (
    <TeamRPageFrame context={context} subtitle="A clear, read-only view of your organisation’s tennis programme." title="MyTeamR" venue={venue}>
      {context.role === "platform_admin" && !context.venueId ? (
        <section className="ui-empty-card mb-5">Platform administration remains global. Organisation-scoped player data is intentionally not aggregated in this view; use the existing SupeR organisation tools to review organisation access.</section>
      ) : null}
      {playersResult.error ? <section className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800" role="alert">{playersResult.error} No counts were assumed.</section> : null}

      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TeamRStatCard helper="active links" icon={<EntriesIcon size={19} />} label="Players" value={playersResult.error ? "--" : players.length} />
        <TeamRStatCard helper="active teams" icon={<MatchIcon size={19} />} label="Teams" value={teamsResult.error ? "--" : teamsResult.data.length} />
        <TeamRStatCard helper="awaiting review" icon={<EntriesIcon size={19} />} label="Requests" value={requestsResult.error ? "--" : requestsResult.data.length} />
        <TeamRStatCard helper="published ahead" icon={<EventIcon size={19} />} label="Upcoming Events" value={eventsResult.error ? "--" : upcomingEvents.length} />
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
          <p className="section-kicker">School operations</p>
          <h2 className="section-title mt-1">Quick actions</h2>
          <div className="mt-4 grid gap-2 text-sm leading-6 text-slate-600">
            <Link className="rounded-lg border border-slate-200 bg-slate-50 p-3 font-black text-court-navy" href="/dashboard/teamr/players?view=pending">Review {requestsResult.data.length} pending player request{requestsResult.data.length === 1 ? "" : "s"}</Link>
            <Link className="rounded-lg border border-slate-200 bg-slate-50 p-3 font-black text-court-navy" href="/dashboard/teamr/teams">Create and manage team rosters</Link>
            <Link className="rounded-lg border border-slate-200 bg-slate-50 p-3 font-black text-court-navy" href="/dashboard/teamr/competitions">{nextEvent ? `Next: ${nextEvent.title} · ${formatDate(nextEvent.starts_at ?? nextEvent.start_datetime)} ${formatTime(nextEvent.starts_at ?? nextEvent.start_datetime)}` : "Create and manage organisation events"}<span className="block text-xs font-semibold text-slate-500">{draftEventCount} draft event{draftEventCount === 1 ? "" : "s"}</span></Link>
          </div>
        </article>
      </section>
    </TeamRPageFrame>
  );
}
