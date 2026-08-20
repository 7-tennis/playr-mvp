import Link from "next/link";
import { EventIcon, StageIcon } from "@/components/playr-icons";
import { StatusAlert } from "@/components/status-alert";
import { formatDate, formatLabel, formatTime } from "@/lib/courtside-format";
import { canManageOrganisationEvents, loadOrganisationEvents, organisationEventState, type OrganisationEvent } from "@/lib/organisation-events";
import { TeamRPageFrame, getProtectedTeamRPage } from "../teamr-shared";

export const dynamic = "force-dynamic";

function EventCard({ event }: { event: OrganisationEvent }) {
  const startsAt = event.starts_at ?? event.start_datetime;
  const endsAt = event.ends_at ?? event.end_datetime;
  const state = organisationEventState(event);
  return <Link className="surface-card block p-4 transition hover:border-court-teal" href={`/dashboard/teamr/competitions/${event.id}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-black text-court-navy">{event.title}</h3><p className="mt-1 text-sm font-semibold text-slate-600">{formatDate(startsAt)} · {formatTime(startsAt)}–{formatTime(endsAt)}</p><p className="mt-1 text-sm text-slate-600">{event.location ?? "Location to be confirmed"}</p></div><div className="flex flex-wrap gap-2"><span className="ui-chip ui-chip-brand capitalize">{event.visibility}</span><span className="ui-chip capitalize">{state}</span></div></div><div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-600"><span className="ui-chip"><StageIcon size={13} />{event.junior_stage ? formatLabel(event.junior_stage) : "Mixed / General"}</span>{event.capacity ? <span className="ui-chip">Capacity {event.capacity}</span> : <span className="ui-chip">No capacity set</span>}</div></Link>;
}

function EventGroup({ events, title }: { events: OrganisationEvent[]; title: string }) {
  if (events.length === 0) return null;
  return <section><h2 className="section-title mb-3">{title} <span className="text-sm text-slate-500">({events.length})</span></h2><div className="grid gap-3 lg:grid-cols-2">{events.map((event) => <EventCard event={event} key={event.id} />)}</div></section>;
}

export default async function TeamRCompetitionsPage({ searchParams }: { searchParams?: { error?: string; message?: string; view?: string } }) {
  const { content, context, venue } = await getProtectedTeamRPage();
  if (content) return content;
  if (!context) return null;
  const archivedView = searchParams?.view === "archived";
  const result = await loadOrganisationEvents(context, archivedView);
  const events = result.data;
  const now = Date.now();
  const upcoming = events.filter((event) => event.status === "published" && new Date(event.starts_at ?? event.start_datetime).getTime() >= now);
  const draft = events.filter((event) => event.status === "draft");
  const completed = events.filter((event) => event.status === "completed" || event.status === "published" && new Date(event.starts_at ?? event.start_datetime).getTime() < now);
  const cancelled = events.filter((event) => event.status === "cancelled");
  const canManage = canManageOrganisationEvents({ activeOrganisationRole: context.activeOrganisationRole, organisationType: venue?.organisation_type, role: context.role });
  return <TeamRPageFrame context={context} subtitle="Create and manage organisation-owned tennis events. Competition structures remain a later layer." title="Events" venue={venue}>
    <StatusAlert className="mb-4" message={searchParams?.message === "archived" ? "Event archived." : null} tone="success" />
    <StatusAlert className="mb-4" message={searchParams?.error === "access" ? "Your current role can view events but cannot manage them." : searchParams?.error ? "The event request could not be completed." : null} tone="error" />
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="max-w-2xl text-sm leading-6 text-slate-600">Closed events stay within the host organisation context. Open events are prepared for future broader discovery, but public discovery, entry and eligibility workflows are intentionally not part of this phase.</p><div className="flex gap-2">{canManage && !archivedView ? <Link className="btn-primary" href="/dashboard/teamr/competitions/new">Create Event</Link> : null}<Link className="btn-secondary" href={archivedView ? "/dashboard/teamr/competitions" : "/dashboard/teamr/competitions?view=archived"}>{archivedView ? "View Current" : "View Archived"}</Link></div></div>
    {result.error ? <div className="ui-empty-card">{result.error}</div> : null}
    {!result.error && events.length === 0 ? <section className="empty-state"><EventIcon className="mx-auto text-court-teal" size={30} /><h2 className="section-title mt-3">{archivedView ? "No archived events" : "Create your first event"}</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">Events share the canonical PlayR model across Schools, Districts and compatible Clubs.</p></section> : null}
    <div className="grid gap-6">{archivedView ? <EventGroup events={events} title="Archived" /> : <><EventGroup events={upcoming} title="Upcoming" /><EventGroup events={draft} title="Draft" /><EventGroup events={completed} title="Completed / Past" /><EventGroup events={cancelled} title="Cancelled" /></>}</div>
  </TeamRPageFrame>;
}
