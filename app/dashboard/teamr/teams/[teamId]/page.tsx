import Link from "next/link";
import { MatchIcon, ParticipationIcon, RatingIcon, StageIcon } from "@/components/playr-icons";
import { StatusAlert } from "@/components/status-alert";
import { SubmitButton } from "@/components/submit-button";
import { formatLabel } from "@/lib/courtside-format";
import { loadTeamRTeam, teamRJuniorStages } from "@/lib/teamr";
import { addTeamRRosterMember, archiveTeamRTeam, removeTeamRRosterMember, updateTeamRTeam } from "../../actions";
import { TeamRPageFrame, getProtectedTeamRPage } from "../../teamr-shared";

export const dynamic = "force-dynamic";

function messageText(message?: string) {
  if (message === "created") return "Team created. Add approved players to its roster.";
  if (message === "updated") return "Team details updated.";
  if (message === "player_added") return "Player added to the roster.";
  if (message === "player_removed") return "Player removed from the roster.";
  return null;
}

function errorText(error?: string) {
  if (error === "duplicate") return "That player is already on this team.";
  if (error === "roster_access") return "Only approved players from this organisation can be rostered.";
  if (error) return "The requested team change could not be completed.";
  return null;
}

export default async function TeamRTeamDetailPage({
  params,
  searchParams
}: {
  params: { teamId: string };
  searchParams?: { error?: string; message?: string; q?: string; stage?: string };
}) {
  const { content, context, venue } = await getProtectedTeamRPage();
  if (content) return content;
  if (!context) return null;

  const result = await loadTeamRTeam(context, params.teamId);
  if (!result.data) return <TeamRPageFrame context={context} subtitle="This team is unavailable in the active organisation context." title="Team Not Found" venue={venue}><section className="empty-state"><MatchIcon className="mx-auto text-court-teal" size={28} /><p className="mt-3 text-sm text-slate-600">The team may belong to another organisation or no longer exist.</p><Link className="btn-secondary mt-4" href="/dashboard/teamr/teams">Back to Teams</Link></section></TeamRPageFrame>;

  const { team, roster } = result.data;
  const query = searchParams?.q?.trim().toLowerCase() ?? "";
  const selectedStage = searchParams?.stage ?? team.juniorStage ?? "all";
  const availablePlayers = result.data.availablePlayers.filter((player) => {
    const matchesQuery = !query || player.name.toLowerCase().includes(query);
    const matchesStage = selectedStage === "all" || player.juniorStage === selectedStage;
    return matchesQuery && matchesStage;
  });
  const active = team.status === "active";

  return <TeamRPageFrame context={context} subtitle={`${venue?.name ?? "Organisation"} · ${team.rosterSize} roster member${team.rosterSize === 1 ? "" : "s"}`} title={team.name} venue={venue}>
    <StatusAlert className="mb-4" message={messageText(searchParams?.message)} tone="success" />
    <StatusAlert className="mb-4" message={errorText(searchParams?.error)} tone="error" />
    {!active ? <StatusAlert className="mb-4" message="This team is archived. Its roster is retained for audit context but can no longer be changed." tone="warning" /> : null}

    <section className="mb-5 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <form action={updateTeamRTeam} className="surface-card grid gap-4 p-4">
        <input name="teamId" type="hidden" value={team.id} />
        <div><p className="section-kicker">Team details</p><h2 className="section-title mt-1">Settings</h2></div>
        <label className="text-sm font-bold text-court-navy">Team name<input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 font-semibold focus-ring" defaultValue={team.name} disabled={!active} maxLength={100} name="name" required /></label>
        <label className="text-sm font-bold text-court-navy">Stage/category<select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 font-semibold focus-ring" defaultValue={team.juniorStage ?? ""} disabled={!active} name="juniorStage"><option value="">Mixed or age-based</option>{teamRJuniorStages.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}</select></label>
        {active ? <SubmitButton className="btn-primary" pendingText="Saving...">Save Team</SubmitButton> : null}
      </form>
      <article className="surface-card p-4">
        <div className="flex items-center justify-between"><div><p className="section-kicker">Current roster</p><h2 className="section-title mt-1">{roster.length} Players</h2></div><span className="ui-chip ui-chip-brand"><StageIcon size={14} />{team.juniorStage ? formatLabel(team.juniorStage) : "Mixed"}</span></div>
        {roster.length === 0 ? <div className="ui-empty-card mt-4">No approved players have been added yet.</div> : <div className="mt-4 grid gap-3">{roster.map((player) => <div className="rounded-lg border border-slate-200 p-3" key={player.rosterMembershipId}><div className="flex items-start justify-between gap-3"><div><p className="font-black text-court-navy">{player.name}</p><p className="mt-1 text-xs font-semibold text-slate-500">{player.isJunior ? formatLabel(player.juniorStage ?? "not_sure") : "Adult"}</p></div>{active ? <form action={removeTeamRRosterMember}><input name="teamId" type="hidden" value={team.id} /><input name="rosterMembershipId" type="hidden" value={player.rosterMembershipId} /><SubmitButton className="btn-secondary px-3 py-2" pendingText="Removing...">Remove</SubmitButton></form> : null}</div><div className="mt-3 flex gap-3 text-xs font-bold text-slate-600"><span><RatingIcon rating={player.rating} size={14} /> {player.rating == null ? "Not rated" : player.rating.toFixed(2)}</span><span><ParticipationIcon size={14} /> {player.participationScore} pts</span></div></div>)}</div>}
      </article>
    </section>

    {active ? <section className="surface-card mb-5 p-4">
      <div><p className="section-kicker">Roster assignment</p><h2 className="section-title mt-1">Add Approved Players</h2><p className="mt-1 text-sm text-slate-600">Pending requests and players linked to other organisations are never eligible.</p></div>
      <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_14rem_auto]" method="get"><label className="text-sm font-bold text-court-navy">Search<input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 font-semibold focus-ring" defaultValue={searchParams?.q ?? ""} name="q" placeholder="Player name" /></label><label className="text-sm font-bold text-court-navy">Stage<select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 font-semibold focus-ring" defaultValue={selectedStage} name="stage"><option value="all">All stages</option>{teamRJuniorStages.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}</select></label><div className="flex items-end"><button className="btn-secondary w-full" type="submit">Filter</button></div></form>
      {availablePlayers.length === 0 ? <div className="ui-empty-card mt-4">No available approved players match this filter.</div> : <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{availablePlayers.map((player) => <form action={addTeamRRosterMember} className="rounded-lg border border-slate-200 p-3" key={player.linkId}><input name="teamId" type="hidden" value={team.id} /><input name="playerLinkId" type="hidden" value={player.linkId} /><p className="font-black text-court-navy">{player.name}</p><p className="mt-1 text-xs font-semibold text-slate-500">{player.isJunior ? formatLabel(player.juniorStage ?? "not_sure") : "Adult"}</p><SubmitButton className="btn-primary mt-3 w-full" pendingText="Adding...">Add to Roster</SubmitButton></form>)}</div>}
    </section> : null}

    {active ? <form action={archiveTeamRTeam} className="rounded-lg border border-amber-200 bg-amber-50 p-4"><input name="teamId" type="hidden" value={team.id} /><p className="font-black text-amber-950">Archive team</p><p className="mt-1 text-sm text-amber-900">Archiving keeps the team and roster history but prevents further roster changes.</p><SubmitButton className="btn-secondary mt-3" pendingText="Archiving...">Archive Team</SubmitButton></form> : null}
  </TeamRPageFrame>;
}
