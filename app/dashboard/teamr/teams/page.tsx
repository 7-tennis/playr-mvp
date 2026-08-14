import Link from "next/link";
import { MatchIcon, StageIcon } from "@/components/playr-icons";
import { StatusAlert } from "@/components/status-alert";
import { SubmitButton } from "@/components/submit-button";
import { formatLabel } from "@/lib/courtside-format";
import { loadTeamRTeams, teamRJuniorStages } from "@/lib/teamr";
import { TeamRPageFrame, getProtectedTeamRPage } from "../teamr-shared";
import { createTeamRTeam } from "../actions";

export const dynamic = "force-dynamic";

export default async function TeamRTeamsPage({ searchParams }: { searchParams?: { error?: string; message?: string; view?: string } }) {
  const { content, context, venue } = await getProtectedTeamRPage();
  if (content) return content;
  if (!context) return null;
  const includeArchived = searchParams?.view === "archived";
  const result = await loadTeamRTeams(context, includeArchived);
  const teams = includeArchived ? result.data.filter((team) => team.status === "archived") : result.data;

  return <TeamRPageFrame context={context} subtitle="Create school or district teams and manage their approved PlayR player rosters." title="Teams" venue={venue}>
    <StatusAlert className="mb-4" message={searchParams?.message === "archived" ? "Team archived." : null} tone="success" />
    <StatusAlert className="mb-4" message={searchParams?.error === "duplicate" ? "An active team with that name already exists." : searchParams?.error ? "The team could not be saved." : null} tone="error" />
    <section className="mb-5 grid gap-4 lg:grid-cols-[0.75fr_1.25fr]">
      <form action={createTeamRTeam} className="surface-card grid gap-4 p-4">
        <div><p className="section-kicker">New team</p><h2 className="section-title mt-1">Create a Team</h2></div>
        <label className="text-sm font-bold text-court-navy">Team name<input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 font-semibold focus-ring" maxLength={100} name="name" placeholder="Boys U13 A" required /></label>
        <label className="text-sm font-bold text-court-navy">Stage/category <span className="font-normal text-slate-500">(optional)</span><select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 font-semibold focus-ring" name="juniorStage"><option value="">Mixed or age-based</option>{teamRJuniorStages.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}</select></label>
        <SubmitButton className="btn-primary" pendingText="Creating team...">Create Team</SubmitButton>
      </form>
      <div>
        <div className="mb-3 flex items-center justify-between"><h2 className="section-title">{includeArchived ? "Archived Teams" : "Active Teams"}</h2><Link className="btn-secondary px-3 py-2" href={includeArchived ? "/dashboard/teamr/teams" : "/dashboard/teamr/teams?view=archived"}>{includeArchived ? "View Active" : "View Archived"}</Link></div>
        {result.error ? <div className="ui-empty-card">{result.error}</div> : null}
        {!result.error && teams.length === 0 ? <section className="empty-state"><MatchIcon className="mx-auto text-court-teal" size={30} /><h2 className="section-title mt-3">{includeArchived ? "No archived teams" : "Create your first team"}</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">Teams use approved organisation-linked PlayR profiles. No player copies are created.</p></section> : null}
        <div className="grid gap-3 sm:grid-cols-2">{teams.map((team) => <Link className="surface-card p-4 transition hover:border-court-teal" href={`/dashboard/teamr/teams/${team.id}`} key={team.id}><div className="flex items-start justify-between gap-3"><div><h3 className="font-black text-court-navy">{team.name}</h3><p className="mt-1 text-sm text-slate-600">{team.rosterSize} player{team.rosterSize === 1 ? "" : "s"}</p></div><span className="ui-chip ui-chip-brand"><StageIcon size={14} />{team.juniorStage ? formatLabel(team.juniorStage) : "Mixed"}</span></div></Link>)}</div>
      </div>
    </section>
  </TeamRPageFrame>;
}
