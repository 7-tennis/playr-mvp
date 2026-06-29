import { EventCard } from "@/components/event-card";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { CourtSideEvent } from "@/types/courtside";

type EventWithEntryCount = CourtSideEvent & {
  entry_count: number | null;
};

async function getPublishedEvents(): Promise<{ events: EventWithEntryCount[]; error: string | null }> {
  try {
    const supabase = await createServerSupabaseClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("status", "published")
      .gte("start_datetime", now)
      .order("start_datetime", { ascending: true });

    if (error) {
      return { events: [], error: "Published events could not be loaded right now." };
    }

    const events = (data ?? []) as CourtSideEvent[];
    const eventsWithCounts = await Promise.all(
      events.map(async (event) => {
        const { data: countData } = await supabase.rpc("event_entry_count", { check_event_id: event.id });

        return {
          ...event,
          entry_count: typeof countData === "number" ? countData : null
        };
      })
    );

    return { events: eventsWithCounts, error: null };
  } catch {
    return { events: [], error: "Supabase is not configured yet. Add your environment variables to load live events." };
  }
}

export default async function EventsPage() {
  const { events, error } = await getPublishedEvents();

  return (
    <PageShell eyebrow="Events" title="Find your next PlayR event.">
      <StatusAlert className="mb-5" message={error} tone="error" />

      {events.length > 0 ? (
        <div className="grid gap-5 md:grid-cols-3">
          {events.map((event) => (
            <EventCard event={event} key={event.id} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-black text-court-navy">No upcoming events are open right now.</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Check back soon, or create an account so your profile is ready when the next event opens.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a className="rounded bg-court-blue px-4 py-3 font-bold text-white" href="/signup">
              Sign up
            </a>
            <a className="rounded border border-slate-300 bg-white px-4 py-3 font-bold text-court-navy" href="/login">
              Log in
            </a>
          </div>
        </div>
      )}
    </PageShell>
  );
}
