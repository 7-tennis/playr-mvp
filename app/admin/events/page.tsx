import Link from "next/link";
import { updateEventStatus } from "@/app/admin/actions";
import { AdminNav } from "@/components/admin-nav";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { formatDate, formatDateTime, formatLabel, formatPrice } from "@/lib/courtside-format";
import { getAdminContext } from "@/lib/admin-auth";
import type { CourtSideEvent, EventStatus } from "@/types/courtside";

const eventStatuses: EventStatus[] = ["draft", "published", "cancelled", "completed"];

type EventWithEntryCount = CourtSideEvent & {
  entry_count: number | null;
};

export const dynamic = "force-dynamic";

type AdminEventsPageProps = {
  searchParams?: {
    status?: string;
    admin_message?: string;
  };
};

function adminEventMessage(message?: string) {
  switch (message) {
    case "event_published":
      return "Event published.";
    case "event_draft":
      return "Event saved as draft.";
    case "event_completed":
      return "Event closed.";
    case "event_cancelled":
      return "Event cancelled.";
    default:
      return null;
  }
}

export default async function AdminEventsPage({ searchParams }: AdminEventsPageProps) {
  const { supabase } = await getAdminContext();
  const status = searchParams?.status ?? "all";
  let query = supabase.from("events").select("*").order("start_datetime", { ascending: false }).limit(100);

  if (eventStatuses.includes(status as EventStatus)) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  const events = await Promise.all(
    ((data ?? []) as CourtSideEvent[]).map(async (event) => {
      const { data: countData } = await supabase.rpc("event_entry_count", { check_event_id: event.id });
      return {
        ...event,
        entry_count: typeof countData === "number" ? countData : null
      };
    })
  );
  const now = Date.now();
  const drafts = events.filter((event) => event.status === "draft");
  const upcomingPublished = events.filter((event) => event.status === "published" && new Date(event.start_datetime).getTime() >= now);
  const pastPublished = events.filter((event) => event.status === "published" && new Date(event.start_datetime).getTime() < now);
  const closed = events.filter((event) => event.status === "cancelled" || event.status === "completed");
  const sections =
    status === "all"
      ? [
          { title: "Upcoming published", events: upcomingPublished },
          { title: "Draft events", events: drafts },
          { title: "Past published", events: pastPublished },
          { title: "Closed or cancelled", events: closed }
        ]
      : [{ title: `${formatLabel(status)} events`, events }];

  return (
    <PageShell eyebrow="ClubR" title="Events">
      <AdminNav />
      <StatusAlert className="mb-5" message={adminEventMessage(searchParams?.admin_message)} tone="success" />
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Link className="rounded bg-court-blue px-4 py-3 font-bold text-white" href="/admin/events/new">
          New event
        </Link>
        <form className="flex gap-2">
          <select className="rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={status} name="status">
            <option value="all">All statuses</option>
            {eventStatuses.map((eventStatus) => (
              <option key={eventStatus} value={eventStatus}>
                {formatLabel(eventStatus)}
              </option>
            ))}
          </select>
          <button className="rounded bg-court-teal px-4 py-2 font-bold text-white" type="submit">
            Filter
          </button>
        </form>
      </div>

      {error ? <p className="rounded bg-amber-50 p-4 text-sm text-amber-900">Events could not be loaded right now.</p> : null}

      {events.length > 0 ? (
        <div className="space-y-6">
          {sections.map((section) =>
            section.events.length > 0 ? (
              <section className="rounded-lg border border-slate-200 bg-white" key={section.title}>
                <div className="border-b border-slate-200 p-4">
                  <h2 className="text-xl font-black text-court-navy">{section.title}</h2>
                </div>
                <div className="divide-y divide-slate-200">
                  {section.events.map((event: EventWithEntryCount) => {
                    const isPast = new Date(event.start_datetime).getTime() < now;
                    return (
                      <article className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-start" key={event.id}>
                        <div>
                          <div className="mb-2 flex flex-wrap gap-2">
                            <span className="rounded bg-court-mist px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-court-teal">
                              {formatLabel(event.status)}
                            </span>
                            {isPast ? (
                              <span className="rounded bg-slate-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-slate-600">Past</span>
                            ) : null}
                            <span className="rounded bg-slate-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-slate-600">
                              {formatLabel(event.sport)}
                            </span>
                          </div>
                          <h3 className="text-lg font-black text-court-navy">{event.title}</h3>
                          <dl className="mt-3 grid gap-3 text-sm text-slate-700 md:grid-cols-4">
                            <div>
                              <dt className="font-semibold text-slate-500">Date</dt>
                              <dd className="font-bold text-court-ink">{formatDateTime(event.start_datetime)}</dd>
                            </div>
                            <div>
                              <dt className="font-semibold text-slate-500">Location</dt>
                              <dd className="font-bold text-court-ink">{event.location ?? "PlayR venue"}</dd>
                            </div>
                            <div>
                              <dt className="font-semibold text-slate-500">Entry fee</dt>
                              <dd className="font-bold text-court-ink">
                                {formatPrice(event.member_price)} / {formatPrice(event.non_member_price)}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-semibold text-slate-500">Entries</dt>
                              <dd className="font-bold text-court-ink">
                                {event.entry_count ?? 0}
                                {event.max_entries ? ` / ${event.max_entries}` : ""}
                              </dd>
                            </div>
                          </dl>
                        </div>
                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          <Link className="rounded border border-slate-300 px-3 py-2 text-sm font-bold text-court-navy" href={`/admin/events/${event.id}/edit`}>
                            Edit
                          </Link>
                          <Link className="rounded border border-slate-300 px-3 py-2 text-sm font-bold text-court-navy" href={`/admin/events/${event.id}/entries`}>
                            Entries
                          </Link>
                          <Link className="rounded border border-slate-300 px-3 py-2 text-sm font-bold text-court-navy" href={`/admin/results?event_id=${event.id}`}>
                            Results
                          </Link>
                          <form action={updateEventStatus}>
                            <input name="eventId" type="hidden" value={event.id} />
                            <input name="status" type="hidden" value={event.status === "published" ? "draft" : "published"} />
                            <button className="rounded bg-court-teal px-3 py-2 text-sm font-bold text-white" type="submit">
                              {event.status === "published" ? "Unpublish" : "Publish"}
                            </button>
                          </form>
                          <form action={updateEventStatus}>
                            <input name="eventId" type="hidden" value={event.id} />
                            <input name="status" type="hidden" value="completed" />
                            <button className="rounded border border-slate-300 px-3 py-2 text-sm font-bold text-court-navy" type="submit">
                              Close
                            </button>
                          </form>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null
          )}
        </div>
      ) : (
        <div className="empty-state">
          <h2 className="section-title">No events found</h2>
          <p className="mt-2 text-sm text-slate-600">Create the first ClubR event or change the status filter.</p>
        </div>
      )}
    </PageShell>
  );
}
