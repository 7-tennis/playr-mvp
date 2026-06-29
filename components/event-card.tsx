import Link from "next/link";
import type { CourtSideEvent } from "@/types/courtside";
import { formatDateTime, formatLabel, formatPrice } from "@/lib/courtside-format";

type EventCardProps = {
  event: CourtSideEvent & {
    entry_count?: number | null;
  };
};

export function EventCard({ event }: EventCardProps) {
  const hasEntryCount = typeof event.entry_count === "number";
  const spotsLeft = event.max_entries && hasEntryCount ? Math.max(event.max_entries - event.entry_count!, 0) : null;

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-court">
      <div className="mb-4 flex flex-wrap gap-2">
        <span className="rounded bg-court-mist px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-court-teal">
          Open
        </span>
        <span className="rounded bg-court-mist px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-court-teal">
          {formatLabel(event.sport)}
        </span>
        <span className="rounded bg-slate-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-slate-600">
          {formatLabel(event.category)}
        </span>
        <span className="rounded bg-slate-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-slate-600">
          {formatLabel(event.age_group)}
        </span>
      </div>
      <h3 className="text-xl font-black tracking-tight text-court-navy">{event.title}</h3>
      <p className="mt-2 text-sm text-slate-600">{event.description}</p>
      <dl className="mt-5 grid gap-3 text-sm">
        <div>
          <dt className="font-semibold text-slate-500">When</dt>
          <dd className="font-medium text-court-ink">{formatDateTime(event.start_datetime)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-500">Location</dt>
          <dd className="font-medium text-court-ink">{event.location ?? "PlayR venue"}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-500">Prices</dt>
          <dd className="font-medium text-court-ink">
            {formatPrice(event.member_price)} members / {formatPrice(event.non_member_price)} visitors
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-500">Availability</dt>
          <dd className="font-medium text-court-ink">
            {event.max_entries
              ? hasEntryCount
                ? spotsLeft === 0
                  ? "Event full"
                  : `${spotsLeft} of ${event.max_entries} spots left`
                : `Up to ${event.max_entries} entries`
              : "Open entries"}
          </dd>
        </div>
      </dl>
      <Link className="mt-5 inline-flex rounded bg-court-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-court-blue" href={`/events/${event.slug}`}>
        View event
      </Link>
    </article>
  );
}
