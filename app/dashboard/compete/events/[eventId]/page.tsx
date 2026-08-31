import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPlayData } from "@/app/dashboard/play/play-shared";
import { PageShell } from "@/components/page-shell";
import { formatDateTime, formatLabel } from "@/lib/courtside-format";
import { eventStaffRoleLabel, loadMyEventStaffAssignments, loadProfileEventRelevance } from "@/lib/event-relevance";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { CourtSideEvent, Venue } from "@/types/courtside";

export const dynamic = "force-dynamic";

type EventRow = CourtSideEvent & { host: Pick<Venue, "id" | "name" | "organisation_type"> | null };

export default async function CompeteEventDetailPage({ params, searchParams }: { params: { eventId: string }; searchParams?: { player?: string } }) {
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
    <section className="surface-card p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="section-kicker">{event.host?.name ?? "Organisation event"}</p><h2 className="section-title mt-1">Event details</h2></div><div className="flex flex-wrap gap-2"><span className="ui-chip ui-chip-brand">{formatLabel(event.host?.organisation_type ?? "organisation")}</span><span className="ui-chip">{formatLabel(event.visibility)}</span>{relevance ? <span className={`ui-chip ${relevance.is_assigned ? "ui-chip-success" : "ui-chip-muted"}`}>{relevance.is_assigned ? "Selected" : "Eligible"}</span> : null}{staffAssignment ? <span className="ui-chip ui-chip-brand">{eventStaffRoleLabel(staffAssignment.event_role)}</span> : null}</div></div>
      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="font-black text-court-navy">Date and time</dt><dd className="mt-1 text-slate-600">{formatDateTime(startsAt)} – {formatDateTime(endsAt)}</dd></div><div><dt className="font-black text-court-navy">Location</dt><dd className="mt-1 text-slate-600">{event.location ?? "To be confirmed"}</dd></div><div><dt className="font-black text-court-navy">Stage/category</dt><dd className="mt-1 text-slate-600">{event.junior_stage ? formatLabel(event.junior_stage) : "Mixed / General"}</dd></div><div><dt className="font-black text-court-navy">Availability</dt><dd className="mt-1 text-slate-600">{formatLabel(event.visibility)} · Capacity {event.capacity ?? "not set"}</dd></div>{event.description ? <div className="sm:col-span-2"><dt className="font-black text-court-navy">Description</dt><dd className="mt-1 whitespace-pre-wrap leading-6 text-slate-600">{event.description}</dd></div> : null}</dl>
      {relevance ? <p className="mt-5 rounded border border-court-teal/30 bg-court-mist p-3 text-sm font-bold text-court-navy">{relevance.relevance_reason}</p> : null}
      {staffAssignment ? <p className="mt-3 text-sm font-semibold text-slate-600">You can view this event as assigned {eventStaffRoleLabel(staffAssignment.event_role)}. Score entry and broader operations are not available yet.</p> : null}
    </section>
  </PageShell>;
}
