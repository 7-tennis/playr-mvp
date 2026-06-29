import Link from "next/link";
import { notFound } from "next/navigation";
import { updateEvent, updateEventStatus } from "@/app/admin/actions";
import { AdminEventForm } from "@/components/admin-event-form";
import { AdminNav } from "@/components/admin-nav";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { formatDateTime, formatLabel } from "@/lib/courtside-format";
import { getAdminContext } from "@/lib/admin-auth";
import type { CourtSideEvent } from "@/types/courtside";

export const dynamic = "force-dynamic";

function adminEventMessage(message?: string) {
  switch (message) {
    case "event_created":
      return "Event created. It is ready to review and publish.";
    case "event_updated":
      return "Event updated.";
    case "event_published":
      return "Event published.";
    case "event_draft":
      return "Event saved as draft.";
    case "event_completed":
      return "Event closed.";
    default:
      return null;
  }
}

export default async function EditEventPage({ params, searchParams }: { params: { id: string }; searchParams?: { admin_message?: string } }) {
  const { supabase } = await getAdminContext();
  const { data, error } = await supabase.from("events").select("*").eq("id", params.id).single();

  if (error || !data) {
    notFound();
  }

  const event = data as CourtSideEvent;
  const { count: resultCount } = await supabase
    .from("event_results")
    .select("id", { count: "exact", head: true })
    .eq("event_id", event.id);

  return (
    <PageShell eyebrow="ClubR Events" title={`Edit ${event.title}`}>
      <AdminNav />
      <StatusAlert className="mb-5" message={adminEventMessage(searchParams?.admin_message)} tone="success" />
      <div className="mb-5 rounded-lg border border-slate-200 bg-white p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-slate-500">{formatLabel(event.status)}</p>
            <p className="mt-1 font-black text-court-navy">{formatDateTime(event.start_datetime)}</p>
            <p className="mt-1 text-sm text-slate-600">{resultCount ?? 0} captured result{resultCount === 1 ? "" : "s"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={updateEventStatus}>
              <input name="eventId" type="hidden" value={event.id} />
              <input name="status" type="hidden" value="draft" />
              <button className="rounded border border-slate-300 px-3 py-2 text-sm font-bold text-court-navy" type="submit">
                Save as draft
              </button>
            </form>
            <form action={updateEventStatus}>
              <input name="eventId" type="hidden" value={event.id} />
              <input name="status" type="hidden" value="published" />
              <button className="rounded bg-court-teal px-3 py-2 text-sm font-bold text-white" type="submit">
                Publish
              </button>
            </form>
            <form action={updateEventStatus}>
              <input name="eventId" type="hidden" value={event.id} />
              <input name="status" type="hidden" value="completed" />
              <button className="rounded border border-slate-300 px-3 py-2 text-sm font-bold text-court-navy" type="submit">
                Close event
              </button>
            </form>
            <Link className="rounded border border-slate-300 px-3 py-2 text-sm font-bold text-court-navy" href={`/admin/events/${event.id}/entries`}>
              View entries
            </Link>
            <Link className="rounded border border-slate-300 px-3 py-2 text-sm font-bold text-court-navy" href={`/admin/results?event_id=${event.id}`}>
              Results
            </Link>
          </div>
        </div>
      </div>
      <AdminEventForm action={updateEvent} event={event} submitLabel="Save event" />
    </PageShell>
  );
}
