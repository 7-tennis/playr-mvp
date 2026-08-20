import Link from "next/link";
import { StatusAlert } from "@/components/status-alert";
import { formatDate, formatLabel, formatTime } from "@/lib/courtside-format";
import { canManageOrganisationEvents, eventVisibilityDescription, loadOrganisationEvent, organisationEventState } from "@/lib/organisation-events";
import { TeamRPageFrame, getProtectedTeamRPage } from "../../teamr-shared";
import { transitionOrganisationEvent } from "../actions";

export const dynamic = "force-dynamic";

function Action({ eventId, label, value, tone = "btn-secondary" }: { eventId: string; label: string; value: string; tone?: string }) {
  return <form action={transitionOrganisationEvent}><input name="eventId" type="hidden" value={eventId} /><input name="eventAction" type="hidden" value={value} /><button className={tone} type="submit">{label}</button></form>;
}

export default async function TeamREventDetailPage({ params, searchParams }: { params: { eventId: string }; searchParams?: { error?: string; message?: string } }) {
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
  const message = searchParams?.message ? `Event ${searchParams.message === "created" ? "created" : searchParams.message === "updated" ? "updated" : searchParams.message}.` : null;
  return <TeamRPageFrame context={context} subtitle={`${event.host?.name ?? "Organisation"} event`} title={event.title} venue={venue}>
    <StatusAlert className="mb-4" message={message} tone="success" /><StatusAlert className="mb-4" message={searchParams?.error ? "That event action is not available from its current state." : null} tone="error" />
    <section className="surface-card p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="section-kicker">{event.host?.name}</p><h2 className="section-title mt-1">Event details</h2></div><div className="flex gap-2"><span className="ui-chip ui-chip-brand capitalize">{event.visibility}</span><span className="ui-chip capitalize">{state}</span></div></div><dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="font-black text-court-navy">Date and time</dt><dd className="mt-1 text-slate-600">{formatDate(startsAt)} · {formatTime(startsAt)}–{formatTime(endsAt)} SAST</dd></div><div><dt className="font-black text-court-navy">Location</dt><dd className="mt-1 text-slate-600">{event.location ?? "To be confirmed"}</dd></div><div><dt className="font-black text-court-navy">Stage/category</dt><dd className="mt-1 text-slate-600">{event.junior_stage ? formatLabel(event.junior_stage) : "Mixed / General"}</dd></div><div><dt className="font-black text-court-navy">Capacity</dt><dd className="mt-1 text-slate-600">{event.capacity ? `${event.capacity} players` : "Not set"}</dd></div><div className="sm:col-span-2"><dt className="font-black text-court-navy capitalize">{event.visibility} event</dt><dd className="mt-1 text-slate-600">{eventVisibilityDescription(event.visibility)}</dd></div>{event.description ? <div className="sm:col-span-2"><dt className="font-black text-court-navy">Description</dt><dd className="mt-1 whitespace-pre-wrap leading-6 text-slate-600">{event.description}</dd></div> : null}</dl></section>
    <section className="ui-empty-card mt-4">Players and staff will be assigned in the next phase.</section>
    {canManage && state !== "archived" ? <section className="mt-4 flex flex-wrap gap-2">{["draft", "published"].includes(event.status) ? <Link className="btn-primary" href={`/dashboard/teamr/competitions/${event.id}/edit`}>Edit</Link> : null}{event.status === "draft" ? <Action eventId={event.id} label="Publish" value="publish" /> : null}{event.status === "published" ? <><Action eventId={event.id} label="Unpublish" value="unpublish" /><Action eventId={event.id} label="Mark Completed" value="complete" /></> : null}{["draft", "published"].includes(event.status) ? <Action eventId={event.id} label="Cancel" value="cancel" /> : null}<Action eventId={event.id} label="Archive" value="archive" /></section> : null}
  </TeamRPageFrame>;
}
