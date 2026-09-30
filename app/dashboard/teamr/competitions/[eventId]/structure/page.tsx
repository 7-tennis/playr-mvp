import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { StatusAlert } from "@/components/status-alert";
import { competitionFormatLabel, competitionMatchCount, loadCompetitionStructure } from "@/lib/competition-structure";
import { formatLabel } from "@/lib/courtside-format";
import { loadOrganisationEvent } from "@/lib/organisation-events";
import { TeamRPageFrame, getProtectedTeamRPage } from "../../../teamr-shared";
import { configureCompetition, generateCompetition, lockCompetition, moveGroupParticipant } from "./actions";

export const dynamic = "force-dynamic";

const fieldClass = "mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-court-navy";

function messageFor(value?: string) {
  return ({ configured: "Competition configuration saved. Generate deliberately when ready.", generated: "Competition structure generated.", locked: "Competition structure locked.", participant_moved: "Player moved and group matches rebuilt." } as Record<string, string>)[value ?? ""] ?? null;
}

function errorFor(value?: string) {
  const messages: Record<string, string> = {
    competition_access: "Your event role does not allow competition changes.",
    competition_event_not_mutable: "Competition changes require a future, published, non-archived event.",
    competition_format_invalid: "Choose a supported competition format.",
    competition_participants_invalid: "Select at least two confirmed participants; unconfirmed players cannot be included.",
    competition_participants_changed: "One or more selected players are no longer confirmed. Review and save the configuration.",
    competition_groups_invalid: "Choose a valid group count with at least one player in every group.",
    competition_knockout_invalid: "Knockout supports 2–64 confirmed players.",
    competition_progression_invalid: "Group qualifiers must produce a valid power-of-two knockout draw.",
    competition_locked: "This competition is locked and cannot be regenerated or rearranged.",
    competition_stale: "Confirmed participants changed. Regenerate before locking.",
    competition_not_configured: "Configure the competition before generating it.",
    competition_not_adjustable: "Only an unlocked generated group structure can be adjusted.",
    competition_group_mismatch: "That group move is not valid for this event.",
    competition_group_would_be_empty: "A move cannot leave an empty group.",
    competition_operations_exist: "Remove all court schedules and match-level staff assignments before regenerating structure."
  };
  return value ? messages[value] ?? "The competition operation could not be completed." : null;
}

export default async function CompetitionStructurePage({ params, searchParams }: { params: { eventId: string }; searchParams?: { error?: string; message?: string } }) {
  const { content, context, venue } = await getProtectedTeamRPage();
  if (content) return content;
  if (!context) return null;
  const [eventResult, structureResult] = await Promise.all([
    loadOrganisationEvent(context, params.eventId),
    loadCompetitionStructure(context.supabase, params.eventId)
  ]);
  if (!eventResult.data) return <TeamRPageFrame context={context} title="Event unavailable" venue={venue}><section className="empty-state">{eventResult.error}</section></TeamRPageFrame>;
  if (!structureResult.data) return <TeamRPageFrame context={context} title="Competition Structure" venue={venue}><StatusAlert message={structureResult.error} tone="error" /></TeamRPageFrame>;

  const event = eventResult.data;
  const structure = structureResult.data;
  const competition = structure.competition;
  const groupStage = structure.stages.find((stage) => stage.stage_type === "group");
  const matchCount = competitionMatchCount(structure);
  const mutable = event.status === "published" && !event.archived_at && new Date(event.starts_at ?? event.start_datetime).getTime() >= Date.now();

  return <TeamRPageFrame context={context} subtitle={`${event.title} · ${event.host?.name ?? "Organisation"}`} title="Competition Structure" venue={venue}>
    <StatusAlert className="mb-4" message={messageFor(searchParams?.message)} tone="success" />
    <StatusAlert className="mb-4" message={errorFor(searchParams?.error)} tone="error" />
    <div className="mb-4 flex flex-wrap gap-3"><Link className="text-sm font-black text-court-teal" href={`/dashboard/teamr/competitions/${event.id}`}>← Back to event</Link>{competition && ["generated", "locked"].includes(competition.status) ? <Link className="text-sm font-black text-court-teal" href={`/dashboard/teamr/competitions/${event.id}/operations`}>Courts & Schedule</Link> : null}</div>

    <section className="surface-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="section-kicker">Competition operations</p><h2 className="section-title mt-1">{competition ? competitionFormatLabel(competition.format) : "Not configured"}</h2></div>{competition ? <span className={`ui-chip ${competition.status === "locked" ? "ui-chip-success" : competition.status === "generated" ? "ui-chip-brand" : "ui-chip-muted"}`}>{formatLabel(competition.status)}</span> : null}</div>
      {competition ? <div className="mt-4 flex flex-wrap gap-2"><span className="ui-chip ui-chip-muted">{competition.participant_count || competition.selected_assignment_ids.length} players</span>{competition.group_count ? <span className="ui-chip ui-chip-muted">{competition.group_count} groups</span> : null}<span className="ui-chip ui-chip-muted">{matchCount} matches</span><span className="ui-chip ui-chip-muted">Version {competition.structure_version}</span></div> : <p className="mt-3 text-sm text-slate-600">Choose confirmed participants and a format. No matches exist until Generate Competition succeeds.</p>}
      {competition?.is_stale ? <StatusAlert className="mt-4" message="Competition structure is out of date. Confirmed participants or the saved selection changed; review and regenerate deliberately." tone="warning" /> : null}
    </section>

    {structure.can_manage && mutable && competition?.status !== "locked" ? <section className="surface-card mt-4 p-4 sm:p-5"><p className="section-kicker">Configuration</p><h2 className="section-title mt-1">Set Up Competition</h2><form action={configureCompetition} className="mt-4 grid gap-4"><input name="eventId" type="hidden" value={event.id} /><div className="grid gap-3 sm:grid-cols-3"><label className="text-sm font-bold text-court-navy">Format<select className={fieldClass} defaultValue={competition?.format ?? "round_robin"} name="format"><option value="round_robin">Round Robin</option><option value="knockout">Knockout</option><option value="round_robin_knockout">Round Robin → Knockout</option></select></label><label className="text-sm font-bold text-court-navy">Groups<input className={fieldClass} defaultValue={competition?.group_count ?? 4} max={26} min={1} name="groupCount" type="number" /></label><label className="text-sm font-bold text-court-navy">Advance per group<select className={fieldClass} defaultValue={competition?.advancing_per_group ?? 2} name="advancingPerGroup"><option value="1">Top 1</option><option value="2">Top 2</option></select></label></div><div><h3 className="font-black text-court-navy">Confirmed participants</h3><p className="mt-1 text-xs font-semibold text-slate-500">Only confirmed event participants are eligible. Selection is validated again inside the generation transaction.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{structure.confirmed_participants.map((participant) => <label className="flex items-center gap-3 rounded border border-slate-200 p-3 text-sm" key={participant.assignment_id}><input defaultChecked={competition ? competition.selected_assignment_ids.includes(participant.assignment_id) : true} name="participantAssignmentId" type="checkbox" value={participant.assignment_id} /><span><strong className="text-court-navy">{participant.player_name}</strong><span className="block text-xs font-semibold text-slate-500">{participant.junior_stage ? formatLabel(participant.junior_stage) : participant.is_junior ? "Stage not confirmed" : "Adult"}</span></span></label>)}</div></div><div><SubmitButton pendingText="Saving…">Save Configuration</SubmitButton></div></form></section> : null}

    {structure.can_manage && mutable && competition?.status !== "locked" ? <section className="surface-card mt-4 p-4 sm:p-5"><p className="section-kicker">Explicit generation</p><h2 className="section-title mt-1">{competition?.status === "generated" ? "Regenerate Structure" : "Generate Structure"}</h2><p className="mt-2 text-sm leading-6 text-slate-600">Generation atomically replaces only unlocked structural rows. Event participation remains unchanged; a failure rolls the transaction back.</p>{competition ? <form action={generateCompetition} className="mt-4"><input name="eventId" type="hidden" value={event.id} /><SubmitButton pendingText="Generating…">{competition.status === "generated" ? "Regenerate Competition" : "Generate Competition"}</SubmitButton></form> : <p className="mt-3 text-xs font-semibold text-slate-500">Save a valid configuration first.</p>}</section> : null}

    {structure.stages.map((stage) => <section className="surface-card mt-4 p-4 sm:p-5" key={stage.id}><div><p className="section-kicker">Stage {stage.stage_order}</p><h2 className="section-title mt-1">{stage.label}</h2></div>{stage.stage_type === "group" ? <div className="mt-4 grid gap-4 lg:grid-cols-2">{stage.groups.map((group) => { const matches = stage.matches.filter((match) => match.group_id === group.id); return <article className="rounded border border-slate-200 p-4" key={group.id}><div className="flex items-center justify-between gap-2"><h3 className="font-black text-court-navy">{group.label}</h3><span className="ui-chip ui-chip-muted">{matches.length} matches</span></div><ol className="mt-3 grid gap-2">{group.members.map((member) => <li className="rounded bg-slate-50 p-2 text-sm" key={member.id}><div className="flex items-center justify-between gap-3"><span><strong className="text-court-navy">{member.position}. {member.player_name}</strong></span>{structure.can_manage && competition?.status === "generated" ? <form action={moveGroupParticipant} className="flex items-center gap-2"><input name="eventId" type="hidden" value={event.id} /><input name="memberId" type="hidden" value={member.id} /><select aria-label={`Move ${member.player_name}`} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs" defaultValue={group.id} name="targetGroupId">{groupStage?.groups.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select><SubmitButton className="btn-secondary px-2 py-1 text-xs" pendingText="Moving…">Move</SubmitButton></form> : null}</div></li>)}</ol><div className="mt-4 border-t border-slate-200 pt-3"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Matches</p><div className="mt-2 grid gap-1">{matches.map((match) => <p className="text-sm text-slate-700" key={match.id}>{match.slot_a_label} <span className="font-black text-slate-400">vs</span> {match.slot_b_label}</p>)}</div></div></article>; })}</div> : <div className="mt-4 grid gap-5">{Array.from(new Set(stage.matches.map((match) => match.round_number))).map((round) => { const matches = stage.matches.filter((match) => match.round_number === round); return <div key={round}><h3 className="font-black text-court-navy">{matches[0]?.round_label}</h3><div className="mt-2 grid gap-2 sm:grid-cols-2">{matches.map((match) => <article className="rounded border border-slate-200 p-3" key={match.id}><p className="text-xs font-black uppercase tracking-wide text-slate-500">Match {match.round_match_number}</p><p className="mt-1 text-sm font-bold text-court-navy">{match.slot_a_label}</p><p className="text-xs font-black text-slate-400">vs</p><p className="text-sm font-bold text-court-navy">{match.slot_b_label}</p></article>)}</div></div>; })}</div>}</section>)}

    {structure.can_manage && mutable && competition?.status === "generated" ? <section className="surface-card mt-4 border-emerald-200 p-4 sm:p-5"><p className="section-kicker">Stable structure</p><h2 className="section-title mt-1">Lock Competition</h2><p className="mt-2 text-sm leading-6 text-slate-600">Locking freezes participant placement and generated match IDs. Phase 2C.1 deliberately provides no unlock action.</p>{competition.is_stale ? <p className="mt-3 text-xs font-bold text-amber-700">Regenerate the stale structure before locking.</p> : <form action={lockCompetition} className="mt-4"><input name="eventId" type="hidden" value={event.id} /><SubmitButton pendingText="Locking…">Lock Competition</SubmitButton></form>}</section> : null}
  </TeamRPageFrame>;
}
