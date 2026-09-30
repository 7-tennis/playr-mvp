import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { StatusAlert } from "@/components/status-alert";
import {
  competitionOperationsError,
  competitionOperationsMessage,
  eventDateTimeInput,
  loadCompetitionOperations,
  type CompetitionOperations,
  type CompetitionOperationsMatch
} from "@/lib/competition-operations";
import { formatDate, formatLabel, formatTime } from "@/lib/courtside-format";
import { loadOrganisationEvent } from "@/lib/organisation-events";
import { TeamRPageFrame, getProtectedTeamRPage } from "../../../teamr-shared";
import {
  assignCompetitionMatchStaff,
  autoDistributeCompetitionMatches,
  deactivateCompetitionCourt,
  moveCompetitionMatchQueue,
  removeCompetitionMatchStaff,
  saveCompetitionCourt,
  scheduleCompetitionMatch,
  unscheduleCompetitionMatch
} from "./actions";

export const dynamic = "force-dynamic";

const fieldClass = "mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-court-navy";

function MatchCard({ data, eventId, match, mutable }: {
  data: CompetitionOperations;
  eventId: string;
  match: CompetitionOperationsMatch;
  mutable: boolean;
}) {
  const availableStaff = data.staff_candidates.filter((candidate) => !match.staff.some((staff) => staff.event_staff_assignment_id === candidate.assignment_id));
  return <article className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-black uppercase tracking-wide text-slate-500">#{match.sequence} · {match.round_label} {match.round_match_number}</p><p className="mt-1 text-sm font-bold text-court-navy">{match.slot_a_label} <span className="text-slate-400">vs</span> {match.slot_b_label}</p></div>{match.scheduled_at ? <span className="ui-chip ui-chip-brand">{formatTime(match.scheduled_at)} SAST</span> : match.event_court_id ? <span className="ui-chip ui-chip-warning">Queued</span> : <span className="ui-chip ui-chip-muted">Unscheduled</span>}</div>
    {data.can_manage && mutable ? <form action={scheduleCompetitionMatch} className="mt-3 grid gap-2 sm:grid-cols-[1fr_6rem_11rem_auto] sm:items-end"><input name="eventId" type="hidden" value={eventId} /><input name="matchId" type="hidden" value={match.id} /><label className="text-xs font-bold text-court-navy">Court<select className={fieldClass} defaultValue={match.event_court_id ?? ""} name="eventCourtId" required><option value="">Choose court</option>{data.courts.map((court) => <option key={court.id} value={court.id}>{court.label}</option>)}</select></label><label className="text-xs font-bold text-court-navy">Queue<input className={fieldClass} defaultValue={match.queue_position ?? ""} min={1} name="queuePosition" type="number" /></label><label className="text-xs font-bold text-court-navy">Start (optional)<input className={fieldClass} defaultValue={eventDateTimeInput(match.scheduled_at)} max={eventDateTimeInput(data.event.ends_at)} min={eventDateTimeInput(data.event.starts_at)} name="scheduledAt" type="datetime-local" /></label><SubmitButton pendingText="Saving…">Save</SubmitButton></form> : null}
    {match.event_court_id && data.can_manage && mutable ? <div className="mt-2 flex flex-wrap gap-2"><form action={moveCompetitionMatchQueue}><input name="eventId" type="hidden" value={eventId} /><input name="matchId" type="hidden" value={match.id} /><input name="direction" type="hidden" value="up" /><SubmitButton className="btn-secondary px-3 py-1.5 text-xs" pendingText="Moving…">Move Up</SubmitButton></form><form action={moveCompetitionMatchQueue}><input name="eventId" type="hidden" value={eventId} /><input name="matchId" type="hidden" value={match.id} /><input name="direction" type="hidden" value="down" /><SubmitButton className="btn-secondary px-3 py-1.5 text-xs" pendingText="Moving…">Move Down</SubmitButton></form><form action={unscheduleCompetitionMatch}><input name="eventId" type="hidden" value={eventId} /><input name="matchId" type="hidden" value={match.id} /><SubmitButton className="btn-secondary px-3 py-1.5 text-xs" pendingText="Removing…">Unschedule</SubmitButton></form></div> : null}
    <div className="mt-3 border-t border-slate-100 pt-3"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Operational staff</p><div className="mt-2 flex flex-wrap gap-2">{match.staff.map((staff) => <span className="ui-chip ui-chip-muted" key={staff.id}>{staff.staff_name} · {formatLabel(staff.event_role)}{staff.is_me ? " · You" : ""}{data.can_manage && mutable ? <form action={removeCompetitionMatchStaff} className="inline"><input name="eventId" type="hidden" value={eventId} /><input name="assignmentId" type="hidden" value={staff.id} /><button aria-label={`Remove ${staff.staff_name}`} className="ml-1 font-black text-red-700" type="submit">×</button></form> : null}</span>)}{match.staff.length === 0 ? <span className="text-xs font-semibold text-slate-500">No match staff assigned.</span> : null}</div>{data.can_manage && mutable && availableStaff.length > 0 ? <form action={assignCompetitionMatchStaff} className="mt-2 flex flex-col gap-2 sm:flex-row"><input name="eventId" type="hidden" value={eventId} /><input name="matchId" type="hidden" value={match.id} /><select aria-label="Assign operational staff" className={`${fieldClass} mt-0`} name="eventStaffAssignmentId" required><option value="">Choose Coach or Official</option>{availableStaff.map((staff) => <option key={staff.assignment_id} value={staff.assignment_id}>{staff.staff_name} · {formatLabel(staff.event_role)}</option>)}</select><SubmitButton className="btn-secondary" pendingText="Assigning…">Assign</SubmitButton></form> : null}</div>
  </article>;
}

export default async function CompetitionOperationsPage({ params, searchParams }: { params: { eventId: string }; searchParams?: { error?: string; message?: string } }) {
  const { content, context, venue } = await getProtectedTeamRPage();
  if (content) return content;
  if (!context) return null;
  const [eventResult, operationsResult] = await Promise.all([
    loadOrganisationEvent(context, params.eventId),
    loadCompetitionOperations(context.supabase, params.eventId)
  ]);
  if (!eventResult.data) return <TeamRPageFrame context={context} title="Event unavailable" venue={venue}><section className="empty-state">{eventResult.error}</section></TeamRPageFrame>;
  if (!operationsResult.data) return <TeamRPageFrame context={context} title="Competition Operations" venue={venue}><StatusAlert message={operationsResult.error} tone="error" /><Link className="btn-secondary mt-4" href={`/dashboard/teamr/competitions/${params.eventId}/structure`}>Back to Structure</Link></TeamRPageFrame>;

  const event = eventResult.data;
  const data = operationsResult.data;
  const mutable = event.status === "published" && !event.archived_at && new Date(data.event.ends_at).getTime() >= Date.now();
  const unscheduled = data.matches.filter((match) => !match.event_court_id);
  const myAssignments = data.matches.filter((match) => match.staff.some((staff) => staff.is_me));

  return <TeamRPageFrame context={context} subtitle={`${event.title} · ${event.host?.name ?? "Organisation"}`} title="Competition Operations" venue={venue}>
    <StatusAlert className="mb-4" message={competitionOperationsMessage(searchParams?.message)} tone="success" /><StatusAlert className="mb-4" message={competitionOperationsError(searchParams?.error)} tone="error" />
    <div className="mb-4 flex flex-wrap gap-3"><Link className="text-sm font-black text-court-teal" href={`/dashboard/teamr/competitions/${event.id}`}>← Event</Link><Link className="text-sm font-black text-court-teal" href={`/dashboard/teamr/competitions/${event.id}/structure`}>Competition Structure</Link></div>

    <section className="surface-card p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="section-kicker">Event-day plan</p><h2 className="section-title mt-1">Courts & Match Schedule</h2><p className="mt-2 text-sm text-slate-600">{formatDate(data.event.starts_at)} · {formatTime(data.event.starts_at)}–{formatTime(data.event.ends_at)} SAST · {formatLabel(data.competition_status)} structure</p></div><div className="flex flex-wrap gap-2"><span className="ui-chip ui-chip-muted">{data.summary.total_matches} matches</span><span className="ui-chip ui-chip-brand">{data.summary.scheduled_matches} queued</span><span className="ui-chip ui-chip-success">{data.summary.timed_matches} timed</span><span className="ui-chip ui-chip-muted">{data.summary.active_courts} courts</span></div></div><p className="mt-3 text-xs font-semibold leading-5 text-slate-500">Queue order is operational. Exact start times are optional and validated against courts, known players, assigned staff and knockout progression.</p></section>

    {data.can_manage && mutable ? <section className="surface-card mt-4 p-4 sm:p-5"><p className="section-kicker">Court setup</p><h2 className="section-title mt-1">Add Event Court</h2><form action={saveCompetitionCourt} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_7rem_1fr_auto] lg:items-end"><input name="eventId" type="hidden" value={event.id} /><label className="text-sm font-bold text-court-navy">Label<input className={fieldClass} maxLength={80} name="label" placeholder="Court 1" required /></label><label className="text-sm font-bold text-court-navy">ClubR court (optional)<select className={fieldClass} name="linkedCourtId"><option value="">Neutral event court</option>{data.available_linked_courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}</select></label><label className="text-sm font-bold text-court-navy">Order<input className={fieldClass} defaultValue={data.courts.length + 1} min={1} name="courtOrder" type="number" /></label><label className="text-sm font-bold text-court-navy">Notes<input className={fieldClass} maxLength={500} name="notes" placeholder="Optional" /></label><SubmitButton pendingText="Adding…">Add Court</SubmitButton></form><p className="mt-3 text-xs font-semibold text-slate-500">Linking a ClubR court reuses its identity only. It does not create or alter a ClubR booking.</p></section> : null}

    {data.can_manage && mutable && data.courts.length > 0 && unscheduled.length > 0 ? <section className="surface-card mt-4 p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="section-kicker">Optional helper</p><h2 className="section-title mt-1">Auto-distribute Unscheduled Matches</h2><p className="mt-2 text-sm text-slate-600">Assigns structural match sequence round-robin across active courts. It does not invent start times.</p></div><form action={autoDistributeCompetitionMatches}><input name="eventId" type="hidden" value={event.id} /><SubmitButton pendingText="Distributing…">Auto-distribute</SubmitButton></form></div></section> : null}

    {myAssignments.length > 0 ? <section className="surface-card mt-4 border-court-teal/30 p-4 sm:p-5"><p className="section-kicker">My work</p><h2 className="section-title mt-1">My Assignments</h2><div className="mt-4 grid gap-3 lg:grid-cols-2">{myAssignments.map((match) => <MatchCard data={data} eventId={event.id} key={`mine-${match.id}`} match={match} mutable={mutable} />)}</div></section> : null}

    {data.courts.map((court) => { const matches = data.matches.filter((match) => match.event_court_id === court.id); return <details className="ui-collapsible surface-card mt-4 p-4 sm:p-5" key={court.id}><summary className="flex cursor-pointer items-center justify-between gap-3"><span><span className="section-kicker">Court {court.court_order}</span><span className="mt-1 block text-lg font-black text-court-navy">{court.label}</span><span className="mt-1 block text-xs font-semibold text-slate-500">{court.linked_court_name ? `Linked to ${court.linked_court_name}` : "Neutral event court"}{court.notes ? ` · ${court.notes}` : ""}</span></span><span className="ui-chip ui-chip-muted">{matches.length} matches</span></summary>{data.can_manage && mutable ? <details className="mt-4 rounded border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-black text-court-navy">Edit court</summary><form action={saveCompetitionCourt} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_7rem_1fr_auto]"><input name="eventId" type="hidden" value={event.id} /><input name="courtId" type="hidden" value={court.id} /><label className="text-xs font-bold">Label<input className={fieldClass} defaultValue={court.label} maxLength={80} name="label" required /></label><label className="text-xs font-bold">ClubR court<select className={fieldClass} defaultValue={court.linked_court_id ?? ""} name="linkedCourtId"><option value="">Neutral event court</option>{data.available_linked_courts.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label><label className="text-xs font-bold">Order<input className={fieldClass} defaultValue={court.court_order} min={1} name="courtOrder" type="number" /></label><label className="text-xs font-bold">Notes<input className={fieldClass} defaultValue={court.notes ?? ""} maxLength={500} name="notes" /></label><SubmitButton pendingText="Saving…">Save Court</SubmitButton></form><form action={deactivateCompetitionCourt} className="mt-3"><input name="eventId" type="hidden" value={event.id} /><input name="courtId" type="hidden" value={court.id} /><SubmitButton className="btn-secondary" pendingText="Deactivating…">Deactivate Court</SubmitButton></form></details> : null}<div className="mt-4 grid gap-3">{matches.map((match) => <MatchCard data={data} eventId={event.id} key={match.id} match={match} mutable={mutable} />)}{matches.length === 0 ? <div className="ui-empty-card">No matches assigned to this court.</div> : null}</div></details>; })}

    <details className="ui-collapsible surface-card mt-4 p-4 sm:p-5" open><summary className="flex cursor-pointer items-center justify-between gap-3"><span><span className="section-kicker">Planning queue</span><span className="mt-1 block text-lg font-black text-court-navy">Unscheduled</span></span><span className="ui-chip ui-chip-warning">{unscheduled.length}</span></summary><div className="mt-4 grid gap-3">{unscheduled.map((match) => <MatchCard data={data} eventId={event.id} key={match.id} match={match} mutable={mutable} />)}{unscheduled.length === 0 ? <div className="ui-empty-card">Every structural match is assigned to a court.</div> : null}</div></details>

    {!data.can_manage ? <p className="mt-4 rounded border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-600">Coach and Official access is read-only. Match assignment does not grant event-management authority.</p> : null}
  </TeamRPageFrame>;
}
