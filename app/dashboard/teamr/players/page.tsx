import Link from "next/link";
import { EntriesIcon, ParticipationIcon, RatingIcon, StageIcon } from "@/components/playr-icons";
import { formatLabel } from "@/lib/courtside-format";
import { StatusAlert } from "@/components/status-alert";
import { SubmitButton } from "@/components/submit-button";
import { canReviewTeamRPlayerRequests, loadTeamRPlayerRequests, loadTeamRPlayers } from "@/lib/teamr";
import { reviewTeamRPlayerRequest } from "../actions";
import { TeamRPageFrame, getProtectedTeamRPage } from "../teamr-shared";

export const dynamic = "force-dynamic";

export default async function TeamRPlayersPage({ searchParams }: { searchParams?: { error?: string; message?: string; q?: string; stage?: string; view?: string } }) {
  const { content, context, venue } = await getProtectedTeamRPage();
  if (content) return content;
  if (!context) return null;

  const [result, requestsResult] = await Promise.all([loadTeamRPlayers(context), loadTeamRPlayerRequests(context)]);
  const query = searchParams?.q?.trim().toLowerCase() ?? "";
  const stage = searchParams?.stage ?? "all";
  const view = searchParams?.view === "pending" ? "pending" : "active";
  const canReview = canReviewTeamRPlayerRequests(context);
  const players = result.data.filter((player) => {
    const matchesQuery = !query || player.name.toLowerCase().includes(query);
    const matchesStage = stage === "all" || (stage === "adult" ? !player.isJunior : player.juniorStage === stage);
    return matchesQuery && matchesStage;
  });

  return (
    <TeamRPageFrame context={context} subtitle="Approve school requests and manage canonical PlayR players without duplicating their identity." title="Players" venue={venue}>
      <StatusAlert className="mb-4" message={searchParams?.message === "approved" ? "Player request approved." : searchParams?.message === "rejected" ? "Player request rejected." : null} tone="success" />
      <StatusAlert className="mb-4" message={searchParams?.error ? "The player request could not be updated. Confirm that it is still pending and belongs to this organisation." : null} tone="error" />
      <nav aria-label="Player status" className="mb-4 flex gap-2 rounded-lg border border-slate-200 bg-white p-2">
        <Link className={view === "active" ? "btn-primary flex-1 justify-center" : "btn-secondary flex-1 justify-center"} href="/dashboard/teamr/players">Active Players ({result.data.length})</Link>
        <Link className={view === "pending" ? "btn-primary flex-1 justify-center" : "btn-secondary flex-1 justify-center"} href="/dashboard/teamr/players?view=pending">Pending Requests ({requestsResult.data.length})</Link>
      </nav>

      {view === "active" ? <>
      <form className="surface-card mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_14rem_auto] sm:items-end" method="get">
        <input name="view" type="hidden" value="active" />
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
      </> : <>
        {requestsResult.error ? <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800" role="alert">{requestsResult.error}</section> : null}
        {!requestsResult.error && requestsResult.data.length === 0 ? <div className="empty-state"><EntriesIcon className="mx-auto text-court-teal" size={28} /><h2 className="section-title mt-3">No pending requests</h2><p className="mt-2 text-sm text-slate-600">New school requests from authorised parents will appear here.</p></div> : null}
        {requestsResult.data.length > 0 ? <section className="grid gap-3" aria-label="Pending player requests">
          {requestsResult.data.map((request) => <article className="surface-card p-4" key={request.id}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="font-black text-court-navy">{request.name}</h2><p className="mt-1 text-sm text-slate-600">{formatLabel(request.juniorStage ?? "not_sure")} · Requested by {request.parentName ?? "authorised guardian"}</p><p className="mt-1 text-xs font-semibold text-slate-500">Pending since {new Date(request.requestedAt).toLocaleDateString("en-ZA")}</p></div>
              {canReview ? <div className="flex gap-2">
                <form action={reviewTeamRPlayerRequest}><input name="linkId" type="hidden" value={request.id} /><input name="decision" type="hidden" value="approve" /><SubmitButton className="btn-primary" pendingText="Approving...">Approve</SubmitButton></form>
                <form action={reviewTeamRPlayerRequest}><input name="linkId" type="hidden" value={request.id} /><input name="decision" type="hidden" value="reject" /><SubmitButton className="btn-secondary" pendingText="Rejecting...">Reject</SubmitButton></form>
              </div> : <span className="ui-chip ui-chip-muted">Review by coordinator or admin</span>}
            </div>
          </article>)}
        </section> : null}
      </>}
    </TeamRPageFrame>
  );
}
