import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { StatusAlert } from "@/components/status-alert";
import { formatDate, formatLabel, formatTime } from "@/lib/courtside-format";
import { allowedEventRolesForOrganisationRole, eventStaffRoleLabel, eventStaffRoles, loadEventOperations } from "@/lib/event-relevance";
import { canManageOrganisationEvents, eventVisibilityDescription, loadOrganisationEvent, organisationEventState } from "@/lib/organisation-events";
import { TeamRPageFrame, getProtectedTeamRPage } from "../../teamr-shared";
import { assignEventPlayer, assignEventStaff, removeEventPlayerAssignment, removeEventStaffAssignment, transitionOrganisationEvent, updateEventStaffRole } from "../actions";

export const dynamic = "force-dynamic";

const fieldClass = "mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-court-navy";

function Action({ eventId, label, value, tone = "btn-secondary" }: { eventId: string; label: string; value: string; tone?: string }) {
  return <form action={transitionOrganisationEvent}><input name="eventId" type="hidden" value={eventId} /><input name="eventAction" type="hidden" value={value} /><button className={tone} type="submit">{label}</button></form>;
}

function messageFor(value?: string) {
  const messages: Record<string, string> = {
    created: "Event created.", updated: "Event updated.", published: "Event published.", unpublished: "Event unpublished.",
    completed: "Event marked completed.", player_assigned: "Player selected for this event.", player_removed: "Player selection removed.",
    staff_assigned: "Event staff assigned.", staff_updated: "Event staff role updated.", staff_removed: "Event staff assignment removed."
  };
  return value ? messages[value] ?? null : null;
}

function errorFor(value?: string) {
  if (value === "not_eligible") return "That player or staff role is not eligible for this event.";
  if (value === "duplicate") return "That person is already assigned to this event.";
  if (value === "access") return "Your event role does not allow that action.";
  return value ? "That event action could not be completed." : null;
}

export default async function TeamREventDetailPage({ params, searchParams }: { params: { eventId: string }; searchParams?: { error?: string; message?: string; q?: string } }) {
  const { content, context, venue } = await getProtectedTeamRPage();
  if (content) return content;
  if (!context) return null;
  const result = await loadOrganisationEvent(context, params.eventId);
  if (!result.data) return <TeamRPageFrame context={context} title="Event unavailable" venue={venue}><section className="empty-state">{result.error}</section></TeamRPageFrame>;
  const event = result.data;
  const startsAt = event.starts_at ?? event.start_datetime;
  const endsAt = event.ends_at ?? event.end_datetime;
  const state = organisationEventState(event);
  const canManage = canManageOrganisationEvents({ activeOrganisationRole: context.activeOrganisationRole, organisationType: venue?.organisation_type, role: context.role });
  const operations = await loadEventOperations(context.supabase, event.id, searchParams?.q?.trim() ?? "");

  return <TeamRPageFrame context={context} subtitle={`${event.host?.name ?? "Organisation"} event`} title={event.title} venue={venue}>
    <StatusAlert className="mb-4" message={messageFor(searchParams?.message)} tone="success" /><StatusAlert className="mb-4" message={errorFor(searchParams?.error)} tone="error" />
    <section className="surface-card p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="section-kicker">{event.host?.name}</p><h2 className="section-title mt-1">Event details</h2></div><div className="flex gap-2"><span className="ui-chip ui-chip-brand capitalize">{event.visibility}</span><span className="ui-chip capitalize">{state}</span></div></div><dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="font-black text-court-navy">Date and time</dt><dd className="mt-1 text-slate-600">{formatDate(startsAt)} · {formatTime(startsAt)}–{formatTime(endsAt)} SAST</dd></div><div><dt className="font-black text-court-navy">Location</dt><dd className="mt-1 text-slate-600">{event.location ?? "To be confirmed"}</dd></div><div><dt className="font-black text-court-navy">Stage/category</dt><dd className="mt-1 text-slate-600">{event.junior_stage ? formatLabel(event.junior_stage) : "Mixed / General"}</dd></div><div><dt className="font-black text-court-navy">Capacity</dt><dd className="mt-1 text-slate-600">{event.capacity ? `${event.capacity} players` : "Not set"} · {operations.players.length} selected</dd></div><div className="sm:col-span-2"><dt className="font-black text-court-navy capitalize">{event.visibility} event</dt><dd className="mt-1 text-slate-600">{eventVisibilityDescription(event.visibility)}</dd></div>{event.description ? <div className="sm:col-span-2"><dt className="font-black text-court-navy">Description</dt><dd className="mt-1 whitespace-pre-wrap leading-6 text-slate-600">{event.description}</dd></div> : null}</dl></section>

    <section className="surface-card mt-4 p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="section-kicker">Selection</p><h2 className="section-title mt-1">Players <span className="text-sm text-slate-500">({operations.players.length})</span></h2></div>{event.capacity && operations.players.length > event.capacity ? <span className="ui-chip ui-chip-warning">Above informational capacity</span> : null}</div>
      <div className="mt-4 grid gap-2">{operations.players.map((player) => <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 p-3" key={player.assignment_id}><div><p className="font-black text-court-navy">{player.player_name}</p><p className="text-xs font-semibold text-slate-500">{player.junior_stage ? formatLabel(player.junior_stage) : player.is_junior ? "Stage not confirmed" : "Adult"} · Selected</p></div>{operations.canManagePlayers ? <form action={removeEventPlayerAssignment}><input name="eventId" type="hidden" value={event.id} /><input name="assignmentId" type="hidden" value={player.assignment_id} /><SubmitButton className="btn-secondary" pendingText="Removing…">Remove</SubmitButton></form> : null}</div>)}{operations.players.length === 0 ? <div className="ui-empty-card">No players have been selected. Eligibility alone does not occupy capacity.</div> : null}</div>
      {operations.canManagePlayers ? <div className="mt-5 border-t border-slate-200 pt-4"><h3 className="font-black text-court-navy">Add Player</h3>{event.visibility === "open" ? <form className="mt-3 flex gap-2" method="get"><input aria-label="Search eligible players" className={fieldClass} defaultValue={searchParams?.q ?? ""} minLength={2} name="q" placeholder="Search by player name" required /><button className="btn-secondary mt-1" type="submit">Search</button></form> : null}<form action={assignEventPlayer} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end"><input name="eventId" type="hidden" value={event.id} /><label className="min-w-0 flex-1 text-sm font-bold text-court-navy">Eligible player<select className={fieldClass} name="playerProfileId" required><option value="">Choose player</option>{operations.playerCandidates.map((player) => <option key={player.player_profile_id} value={player.player_profile_id}>{player.player_name} · {player.junior_stage ? formatLabel(player.junior_stage) : player.is_junior ? "Stage not confirmed" : "Adult"}</option>)}</select></label><SubmitButton pendingText="Assigning…">Assign Player</SubmitButton></form>{event.visibility === "open" && !searchParams?.q ? <p className="mt-2 text-xs font-semibold text-slate-500">Search by at least two characters. Open events never expose a bulk player directory.</p> : operations.playerCandidates.length === 0 ? <p className="mt-2 text-xs font-semibold text-slate-500">No additional eligible players match this event.</p> : null}</div> : null}
    </section>

    <section className="surface-card mt-4 p-4 sm:p-5"><p className="section-kicker">Operations</p><h2 className="section-title mt-1">Event Staff <span className="text-sm text-slate-500">({operations.staff.length})</span></h2><div className="mt-4 grid gap-2">{operations.staff.map((staff) => <div className="rounded border border-slate-200 p-3" key={staff.assignment_id}><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-black text-court-navy">{staff.staff_name}</p><p className="text-xs font-semibold text-slate-500">{eventStaffRoleLabel(staff.event_role)} · {formatLabel(staff.organisation_role)}</p></div>{operations.canManageStaff ? <form action={removeEventStaffAssignment}><input name="eventId" type="hidden" value={event.id} /><input name="assignmentId" type="hidden" value={staff.assignment_id} /><SubmitButton className="btn-secondary" pendingText="Removing…">Remove</SubmitButton></form> : null}</div>{operations.canManageStaff ? <form action={updateEventStaffRole} className="mt-2 flex gap-2"><input name="eventId" type="hidden" value={event.id} /><input name="assignmentId" type="hidden" value={staff.assignment_id} /><select aria-label={`Role for ${staff.staff_name}`} className={fieldClass} defaultValue={staff.event_role} name="eventRole">{allowedEventRolesForOrganisationRole(staff.organisation_role).map((role) => <option key={role} value={role}>{eventStaffRoleLabel(role)}</option>)}</select><SubmitButton className="btn-secondary mt-1" pendingText="Saving…">Change</SubmitButton></form> : null}</div>)}{operations.staff.length === 0 ? <div className="ui-empty-card">No event-scoped staff assigned yet.</div> : null}</div>
      {operations.canManageStaff && operations.staffCandidates.length > 0 ? <form action={assignEventStaff} className="mt-5 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><input name="eventId" type="hidden" value={event.id} /><label className="text-sm font-bold text-court-navy">Staff member<select className={fieldClass} name="membershipId" required><option value="">Choose staff</option>{operations.staffCandidates.map((staff) => <option key={staff.membership_id} value={staff.membership_id}>{staff.staff_name} · {formatLabel(staff.organisation_role)}</option>)}</select></label><label className="text-sm font-bold text-court-navy">Event role<select className={fieldClass} name="eventRole" required>{eventStaffRoles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label><SubmitButton pendingText="Assigning…">Assign Staff</SubmitButton></form> : null}
      <p className="mt-3 text-xs font-semibold text-slate-500">Event Manager manages players and staff. Coordinator manages players. Coach and Official are read-only; scoring remains deferred.</p>
    </section>

    {canManage && state !== "archived" ? <section className="mt-4 flex flex-wrap gap-2">{["draft", "published"].includes(event.status) ? <Link className="btn-primary" href={`/dashboard/teamr/competitions/${event.id}/edit`}>Edit</Link> : null}{event.status === "draft" ? <Action eventId={event.id} label="Publish" value="publish" /> : null}{event.status === "published" ? <><Action eventId={event.id} label="Unpublish" value="unpublish" /><Action eventId={event.id} label="Mark Completed" value="complete" /></> : null}{["draft", "published"].includes(event.status) ? <Action eventId={event.id} label="Cancel" value="cancel" /> : null}<Action eventId={event.id} label="Archive" value="archive" /></section> : null}
  </TeamRPageFrame>;
}
