import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { formatDateTime, formatLabel, formatPrice } from "@/lib/courtside-format";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { CourtSideEvent } from "@/types/courtside";

type EventDetail = CourtSideEvent & {
  entry_count: number | null;
};

type EventDetailData = {
  event: EventDetail | null;
  userId: string | null;
  results: PublicResult[];
  error: string | null;
};

type PublicResult = {
  id: string;
  placement: number | null;
  points: number | null;
  profiles: {
    first_name: string;
    last_name: string;
    is_junior: boolean;
  } | null;
};

async function getEventDetail(slug: string): Promise<EventDetailData> {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: eventData, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("slug", slug)
      .in("status", ["published", "completed"])
      .single();

    if (eventError || !eventData) {
      return { event: null, userId: null, results: [], error: null };
    }

    const event = eventData as CourtSideEvent;
    const { data: countData } = await supabase.rpc("event_entry_count", { check_event_id: event.id });
    const entryCount = typeof countData === "number" ? countData : null;
    const { data: resultData } = await supabase
      .from("event_results")
      .select("id,placement,points,profiles:profile_id(first_name,last_name,is_junior)")
      .eq("event_id", event.id)
      .order("placement", { ascending: true, nullsFirst: false });
    const results = (resultData ?? []) as unknown as PublicResult[];

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        event: { ...event, entry_count: entryCount },
        userId: null,
        results,
        error: null
      };
    }

    return {
      event: { ...event, entry_count: entryCount },
      userId: user.id,
      results,
      error: null
    };
  } catch {
    return {
      event: null,
      userId: null,
      results: [],
      error: "Supabase is not configured yet. Add your environment variables to load this event."
    };
  }
}

export default async function EventDetailPage({ params }: { params: { slug: string } }) {
  const { event, userId, results, error } = await getEventDetail(params.slug);

  if (!event && !error) {
    notFound();
  }

  if (!event) {
    return (
      <PageShell eyebrow="Events" title="Event unavailable">
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}</p>
      </PageShell>
    );
  }

  const isFull = Boolean(event.max_entries && event.entry_count !== null && event.entry_count >= event.max_entries);
  const isPast = new Date(event.start_datetime).getTime() < Date.now();
  const entriesOpen = event.status === "published" && !isPast && !isFull;
  const statusLabel = event.status !== "published" ? formatLabel(event.status) : isPast ? "Past" : isFull ? "Event full" : "Open";

  return (
    <PageShell eyebrow={`${formatLabel(event.sport)} / ${formatLabel(event.age_group)}`} title={event.title}>
      <div className="grid gap-8 md:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-5 text-slate-700">
          <StatusAlert message={statusLabel === "Open" ? "Entries are open for this event." : `Entries are not open: ${statusLabel}.`} tone={statusLabel === "Open" ? "success" : "info"} />
          <p className="text-lg leading-8">{event.description}</p>
          <dl className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-semibold text-slate-500">Status</dt>
              <dd className="mt-1 font-bold text-court-ink">{statusLabel}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-slate-500">Sport</dt>
              <dd className="mt-1 font-bold text-court-ink">{formatLabel(event.sport)}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-slate-500">Category</dt>
              <dd className="mt-1 font-bold text-court-ink">{formatLabel(event.category)}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-slate-500">Age group</dt>
              <dd className="mt-1 font-bold text-court-ink">{formatLabel(event.age_group)}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-slate-500">Start</dt>
              <dd className="mt-1 font-bold text-court-ink">{formatDateTime(event.start_datetime)}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-slate-500">End</dt>
              <dd className="mt-1 font-bold text-court-ink">{formatDateTime(event.end_datetime)}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-slate-500">Location</dt>
              <dd className="mt-1 font-bold text-court-ink">{event.location ?? "PlayR venue"}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-slate-500">Member price</dt>
              <dd className="mt-1 font-bold text-court-ink">{formatPrice(event.member_price)}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-slate-500">Non-member price</dt>
              <dd className="mt-1 font-bold text-court-ink">{formatPrice(event.non_member_price)}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-slate-500">Entries</dt>
              <dd className="mt-1 font-bold text-court-ink">
                {event.max_entries
                  ? event.entry_count !== null
                    ? `${event.entry_count} / ${event.max_entries}`
                    : `Maximum ${event.max_entries}`
                  : event.entry_count !== null
                    ? `${event.entry_count} entered`
                    : "Open entries"}
              </dd>
            </div>
          </dl>
        </section>
        <aside className="rounded-lg bg-court-navy p-6 text-white">
          <h2 className="text-2xl font-black">{entriesOpen ? "Ready to enter?" : "Event status"}</h2>
          <p className="mt-3 text-sm leading-6 text-blue-50">
            {entriesOpen
              ? "Create or use your PlayR profile, choose yourself or a linked junior, and enter from your dashboard."
              : `This event is ${statusLabel.toLowerCase()}.`}
          </p>

          <div className="mt-6">
            {!userId ? (
              <div className="space-y-4">
                <p className="rounded bg-white/10 p-4 text-sm leading-6 text-blue-50">
                  Log in or create an account before entering PlayR events.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row md:flex-col">
                  <Link className="inline-flex justify-center rounded bg-court-teal px-5 py-3 font-bold text-white" href="/login">
                    Log in to enter
                  </Link>
                  <Link className="inline-flex justify-center rounded border border-white/30 px-5 py-3 font-bold text-white" href="/signup">
                    Sign up
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <Link className="inline-flex w-full justify-center rounded bg-court-teal px-5 py-3 font-bold text-white" href="/dashboard/events">
                  Go to dashboard to enter
                </Link>
                <Link className="inline-flex w-full justify-center rounded border border-white/30 px-5 py-3 font-bold text-white" href="/dashboard/profile">
                  Check my profile
                </Link>
              </div>
            )}
          </div>
        </aside>
      </div>
      {results.length > 0 && (event.status === "published" || event.status === "completed") ? (
        <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-2xl font-black text-court-navy">Leaderboard</h2>
          <p className="mt-2 text-sm text-slate-600">Captured results for this event. Result notes are kept private to player dashboards.</p>
          <div className="mt-5 divide-y divide-slate-200 overflow-hidden rounded border border-slate-200">
            {results.map((result) => (
              <div className="grid gap-3 p-4 text-sm md:grid-cols-[0.5fr_1fr_0.6fr] md:items-center" key={result.id}>
                <div className="text-2xl font-black text-court-navy">{result.placement ?? "-"}</div>
                <div className="font-bold text-court-ink">
                  {result.profiles ? `${result.profiles.first_name} ${result.profiles.last_name}${result.profiles.is_junior ? " (junior)" : ""}` : "Player"}
                </div>
                <div>{result.points ?? "-"} pts</div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-xl font-black text-court-navy">No results have been posted yet.</h2>
          <p className="mt-2 text-sm text-slate-600">Results will appear here once the event organizer captures them.</p>
        </section>
      )}
    </PageShell>
  );
}
