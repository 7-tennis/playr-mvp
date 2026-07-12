import Link from "next/link";
import { EntriesIcon, EventIcon, StatusIcon, TicketIcon } from "@/components/playr-icons";
import { clubRScopeLabel } from "@/lib/clubr";
import { loadClubREntriesForEvents, loadClubREvents } from "@/lib/clubr-data";
import { formatDateTime, formatLabel, formatPrice } from "@/lib/courtside-format";
import { ClubRPageFrame, ClubRStatCard, getProtectedClubRPage } from "../clubr-shared";

export const dynamic = "force-dynamic";

export default async function ClubREventsPage() {
  const { content, context, venue } = await getProtectedClubRPage();

  if (content) {
    return content;
  }

  if (!context) {
    return null;
  }

  const events = await loadClubREvents(context, venue);
  const entries = await loadClubREntriesForEvents(context, events.map((event) => event.id));
  const entriesByEvent = new Map<string, number>();

  entries.forEach((entry) => {
    entriesByEvent.set(entry.event_id, (entriesByEvent.get(entry.event_id) ?? 0) + 1);
  });

  return (
    <ClubRPageFrame context={context} subtitle={`Events visible for ${clubRScopeLabel(context, venue)}.`} title="Events" venue={venue}>
      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <ClubRStatCard helper="Upcoming visible events" icon={<EventIcon size={20} />} label="Events" value={events.length} />
        <ClubRStatCard helper="Entries linked to visible events" icon={<EntriesIcon size={20} />} label="Entries" value={entries.length} />
        <ClubRStatCard helper="Published or ready to enter" icon={<StatusIcon size={20} />} label="Published" value={events.filter((event) => event.status === "published").length} />
      </section>

      <section className="surface-card mb-5 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="section-kicker">Event Tools</p>
            <h2 className="section-title mt-1">Manage club events</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Creation, entries and results still use the existing ClubR event tools.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="btn-primary" href="/admin/events/new">
              Create Event
            </Link>
            <Link className="btn-secondary" href="/admin/events">
              Existing Event Admin
            </Link>
          </div>
        </div>
      </section>

      {events.length > 0 ? (
        <section className="grid gap-3">
          {events.map((event) => (
            <article className="surface-card p-4 sm:p-5" key={event.id}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="mb-2 flex flex-wrap gap-2">
                    <span className={`ui-chip ${event.status === "published" ? "ui-chip-success" : "ui-chip-muted"}`}>{formatLabel(event.status)}</span>
                    <span className="ui-chip ui-chip-brand">{formatLabel(event.sport)}</span>
                    <span className="ui-chip ui-chip-muted">
                      <TicketIcon size={14} /> {entriesByEvent.get(event.id) ?? 0} entries
                    </span>
                  </div>
                  <h2 className="section-title">{event.title}</h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{event.location ?? venue?.name ?? "Venue to be confirmed"}</p>
                </div>
                <div className="text-sm font-semibold text-slate-600 lg:text-right">
                  <p>{formatDateTime(event.start_datetime)}</p>
                  <p>{formatPrice(event.member_price)} member · {formatPrice(event.non_member_price)} visitor</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link className="btn-secondary px-3 py-2" href={`/admin/events/${event.id}/edit`}>
                  Manage Event
                </Link>
                <Link className="btn-secondary px-3 py-2" href={`/admin/events/${event.id}/entries`}>
                  Entries
                </Link>
                <Link className="btn-secondary px-3 py-2" href={`/admin/results?event_id=${event.id}`}>
                  Results
                </Link>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="empty-state">
          <h2 className="section-title">No upcoming venue-linked events</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
            Create an event with this club in the location/title, or add a venue-linked event model in a later phase.
          </p>
        </section>
      )}
    </ClubRPageFrame>
  );
}
