import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPlayData } from "@/app/dashboard/play/play-shared";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { SubmitButton } from "@/components/submit-button";
import { formatDateTime, formatLabel } from "@/lib/courtside-format";
import { eventStaffRoleLabel, loadMyEventStaffAssignments, loadProfileEventRelevance } from "@/lib/event-relevance";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { CourtSideEvent, Venue } from "@/types/courtside";
import { requestOrganisationEventEntry, respondOrganisationEventInvitation } from "./actions";

export const dynamic = "force-dynamic";

type EventRow = CourtSideEvent & { host: Pick<Venue, "id" | "name" | "organisation_type"> | null };

function messageFor(value?: string) {
  if (value === "entry_requested") return "Entry requested. The organiser will review it.";
  if (value === "confirmed") return "You're confirmed for this event.";
  if (value === "declined") return "Invitation declined.";
  return null;
}

function errorFor(value?: string) {
  if (value === "event_full") return "This event is currently full.";
  if (value === "not_eligible") return "This player is no longer eligible for the event.";
  if (value === "unavailable") return "Participation changes are no longer available for this event.";
  if (value === "already_requested") return "This event already has a participation response for this player.";
  if (value === "access") return "You cannot manage participation for this player.";
  return value ? "That participation action could not be completed." : null;
}

export default async function CompeteEventDetailPage({ params, searchParams }: { params: { eventId: string }; searchParams?: { error?: string; message?: string; player?: string } }) {
  const playData = await loadPlayData({ player: searchParams?.player });
  if (playData.kind !== "ready") notFound();
  const profile = playData.data.selectedProfile;
  const supabase = await createServerSupabaseClient();
  const [eventResult, relevanceResult, staffResult] = await Promise.all([
    supabase.from("events").select("*,host:venue_id(id,name,organisation_type)").eq("id", params.eventId).maybeSingle(),
    loadProfileEventRelevance(supabase, profile.id),
    loadMyEventStaffAssignments(supabase)
  ]);
  const event = eventResult.data as unknown as EventRow | null;
  const relevance = relevanceResult.data.find((item) => item.event_id === params.eventId) ?? null;
  const staffAssignment = staffResult.data.find((item) => item.event_id === params.eventId) ?? null;
  if (!event || (!relevance && !staffAssignment)) notFound();
  const startsAt = event.starts_at ?? event.start_datetime;
  const endsAt = event.ends_at ?? event.end_datetime;

  return <PageShell eyebrow="Compete" subtitle={`${profile.first_name}'s event context`} title={event.title}>
    <Link className="btn-secondary mb-5" href={`/dashboard/compete?player=${encodeURIComponent(profile.id)}`}>Back to Compete</Link>
    <StatusAlert className="mb-4" message={messageFor(searchParams?.message)} tone="success" />
    <StatusAlert className="mb-4" message={errorFor(searchParams?.error)} tone="error" />
    <section className="surface-card p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="section-kicker">{event.host?.name ?? "Organisation event"}</p><h2 className="section-title mt-1">Event details</h2></div><div className="flex flex-wrap gap-2"><span className="ui-chip ui-chip-brand">{formatLabel(event.host?.organisation_type ?? "organisation")}</span><span className="ui-chip">{formatLabel(event.visibility)}</span>{relevance ? <span className={`ui-chip ${relevance.participation_status === "confirmed" ? "ui-chip-success" : relevance.participation_status === "invited" ? "ui-chip-warning" : relevance.participation_status ? "ui-chip-brand" : "ui-chip-muted"}`}>{relevance.participation_status === "invited" ? "Response required" : relevance.participation_status === "entry_requested" ? "Entry requested" : relevance.participation_status === "confirmed" ? "Confirmed" : "Eligible"}</span> : null}{staffAssignment ? <span className="ui-chip ui-chip-brand">{eventStaffRoleLabel(staffAssignment.event_role)}</span> : null}</div></div>
      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="font-black text-court-navy">Date and time</dt><dd className="mt-1 text-slate-600">{formatDateTime(startsAt)} – {formatDateTime(endsAt)}</dd></div><div><dt className="font-black text-court-navy">Location</dt><dd className="mt-1 text-slate-600">{event.location ?? "To be confirmed"}</dd></div><div><dt className="font-black text-court-navy">Stage/category</dt><dd className="mt-1 text-slate-600">{event.junior_stage ? formatLabel(event.junior_stage) : "Mixed / General"}</dd></div><div><dt className="font-black text-court-navy">Participation</dt><dd className="mt-1 text-slate-600">{relevance ? `${relevance.confirmed_count}${event.capacity ? ` / ${event.capacity}` : ""} confirmed` : `Capacity ${event.capacity ?? "not set"}`}</dd></div>{event.description ? <div className="sm:col-span-2"><dt className="font-black text-court-navy">Description</dt><dd className="mt-1 whitespace-pre-wrap leading-6 text-slate-600">{event.description}</dd></div> : null}</dl>
      {relevance ? <p className="mt-5 rounded border border-court-teal/30 bg-court-mist p-3 text-sm font-bold text-court-navy">{relevance.relevance_reason}</p> : null}
      {relevance?.participation_status === "invited" && relevance.participation_id ? <div className="mt-4 rounded-playr-md border border-court-teal/30 bg-court-mist p-4"><p className="font-black text-court-navy">You have been invited to this event.</p><div className="mt-3 flex flex-wrap gap-2"><form action={respondOrganisationEventInvitation}><input name="eventId" type="hidden" value={event.id} /><input name="playerId" type="hidden" value={profile.id} /><input name="assignmentId" type="hidden" value={relevance.participation_id} /><input name="decision" type="hidden" value="accept" /><SubmitButton pendingText="Accepting…">Accept</SubmitButton></form><form action={respondOrganisationEventInvitation}><input name="eventId" type="hidden" value={event.id} /><input name="playerId" type="hidden" value={profile.id} /><input name="assignmentId" type="hidden" value={relevance.participation_id} /><input name="decision" type="hidden" value="decline" /><SubmitButton className="btn-secondary" pendingText="Declining…">Decline</SubmitButton></form></div></div> : null}
      {relevance?.participation_status === "entry_requested" ? <div className="mt-4 rounded-playr-md border border-court-blue/20 bg-blue-50 p-4"><p className="font-black text-court-navy">Entry requested</p><p className="mt-1 text-sm font-semibold text-slate-600">The organiser needs to approve this request before participation is confirmed.</p></div> : null}
      {relevance?.participation_status === "confirmed" ? <div className="mt-4 rounded-playr-md border border-court-teal/30 bg-court-mist p-4"><p className="font-black text-court-navy">Confirmed</p><p className="mt-1 text-sm font-semibold text-slate-600">You&apos;re entered for this event.</p></div> : null}
      {!relevance?.participation_status && relevance?.visibility === "open" ? <form action={requestOrganisationEventEntry} className="mt-4"><input name="eventId" type="hidden" value={event.id} /><input name="playerId" type="hidden" value={profile.id} /><SubmitButton pendingText="Requesting…">Request Entry</SubmitButton><p className="mt-2 text-xs font-semibold text-slate-500">The organiser must approve the request before participation is confirmed.</p></form> : null}
      {staffAssignment ? <p className="mt-3 text-sm font-semibold text-slate-600">You can view this event as assigned {eventStaffRoleLabel(staffAssignment.event_role)}. Score entry and broader operations are not available yet.</p> : null}
    </section>
  </PageShell>;
}
