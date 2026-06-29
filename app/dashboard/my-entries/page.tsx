import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { formatDate, formatLabel, formatPrice } from "@/lib/courtside-format";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { EntryStatus, PaymentStatus } from "@/types/courtside";

type MyEntryRow = {
  id: string;
  price_charged: number;
  payment_status: PaymentStatus;
  payment_received_at: string | null;
  entry_status: EntryStatus;
  notes: string | null;
  payment_notes: string | null;
  events: {
    title: string;
    slug: string;
    start_datetime: string;
  } | null;
  profiles: {
    id: string;
    first_name: string;
    last_name: string;
    is_junior: boolean;
  } | null;
  result?: {
    placement: number | null;
    points: number | null;
  } | null;
};

async function getMyEntries(): Promise<{ entries: MyEntryRow[]; isLoggedIn: boolean; error: string | null }> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return { entries: [], isLoggedIn: false, error: null };
    }

    const { data: adultProfile, error: adultProfileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_junior", false)
      .maybeSingle();

    if (adultProfileError) {
      return { entries: [], isLoggedIn: true, error: "Your player profile could not be loaded right now." };
    }

    const { data: juniorProfiles, error: juniorProfileError } = adultProfile
      ? await supabase.from("profiles").select("id").eq("parent_profile_id", adultProfile.id).eq("is_junior", true)
      : { data: [], error: null };

    if (juniorProfileError) {
      return { entries: [], isLoggedIn: true, error: "Your linked junior profiles could not be loaded right now." };
    }

    const profileIds = [adultProfile?.id, ...((juniorProfiles ?? []) as { id: string }[]).map((profile) => profile.id)].filter(Boolean) as string[];

    if (profileIds.length === 0) {
      return { entries: [], isLoggedIn: true, error: null };
    }

    const { data, error } = await supabase
      .from("event_entries")
      .select(
        "id,event_id,profile_id,price_charged,payment_status,payment_received_at,entry_status,notes,payment_notes,events:event_id(title,slug,start_datetime),profiles:profile_id(id,first_name,last_name,is_junior)"
      )
      .in("profile_id", profileIds)
      .order("created_at", { ascending: false });

    if (error) {
      return { entries: [], isLoggedIn: true, error: "Your entries could not be loaded right now." };
    }

    const entries = (data ?? []) as unknown as (MyEntryRow & { event_id: string; profile_id: string })[];
    const eventIds = Array.from(new Set(entries.map((entry) => entry.event_id)));
    const entryProfileIds = Array.from(new Set(entries.map((entry) => entry.profile_id)));

    const { data: resultData } =
      eventIds.length > 0 && entryProfileIds.length > 0
        ? await supabase
            .from("event_results")
            .select("event_id,profile_id,placement,points")
            .in("event_id", eventIds)
            .in("profile_id", entryProfileIds)
        : { data: [] };

    const resultMap = new Map<string, { placement: number | null; points: number | null }>();
    ((resultData ?? []) as { event_id: string; profile_id: string; placement: number | null; points: number | null }[]).forEach((result) => {
      resultMap.set(`${result.event_id}:${result.profile_id}`, {
        placement: result.placement,
        points: result.points
      });
    });

    return {
      entries: entries.map((entry) => ({
        ...entry,
        result: resultMap.get(`${entry.event_id}:${entry.profile_id}`) ?? null
      })),
      isLoggedIn: true,
      error: null
    };
  } catch {
    return {
      entries: [],
      isLoggedIn: false,
      error: "Supabase is not configured yet. Add your environment variables to load your entries."
    };
  }
}

export default async function MyEntriesPage() {
  const { entries, isLoggedIn, error } = await getMyEntries();

  return (
    <PageShell eyebrow="Events" title="My Entries">
      {error ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}</p> : null}

      {!isLoggedIn && !error ? (
        <div className="empty-state">
          <h2 className="section-title">Log in to view your entries</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Your entries and linked junior entries will appear here.</p>
          <Link className="btn-primary mt-5" href="/login">
            Log in
          </Link>
        </div>
      ) : null}

      {isLoggedIn && entries.length === 0 ? (
        <div className="empty-state">
          <h2 className="section-title">No entries yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Enter an event for yourself or a linked junior. Payment and entry status will stay visible here.</p>
          <Link className="mt-5 inline-flex rounded bg-court-teal px-4 py-3 font-bold text-white" href="/dashboard/events">
            Browse events
          </Link>
        </div>
      ) : null}

      {entries.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="grid gap-4 p-4 text-sm font-bold uppercase tracking-wide text-slate-500 md:grid-cols-[1.1fr_0.8fr_0.9fr_0.7fr_0.9fr_0.8fr_0.8fr_1fr]">
            <span>Event</span>
            <span>Date</span>
            <span>Profile</span>
            <span>Price</span>
            <span>Payment</span>
            <span>Entry</span>
            <span>Result</span>
            <span>Notes</span>
          </div>
          <div className="divide-y divide-slate-200">
            {entries.map((entry) => (
              <div
                className="grid gap-3 p-4 text-sm text-slate-700 md:grid-cols-[1.1fr_0.8fr_0.9fr_0.7fr_0.9fr_0.8fr_0.8fr_1fr] md:items-center"
                key={entry.id}
              >
                <div>
                  {entry.events?.slug ? (
                    <Link className="font-black text-court-navy hover:text-court-blue" href={`/events/${entry.events.slug}`}>
                      {entry.events.title}
                    </Link>
                  ) : (
                    <span className="font-black text-court-navy">Event unavailable</span>
                  )}
                </div>
                <div>{entry.events?.start_datetime ? formatDate(entry.events.start_datetime) : "Date unavailable"}</div>
                <div>
                  {entry.profiles
                    ? `${entry.profiles.first_name} ${entry.profiles.last_name}${entry.profiles.is_junior ? " (junior)" : ""}`
                    : "Profile unavailable"}
                </div>
                <div className="font-semibold text-court-ink">{formatPrice(entry.price_charged)}</div>
                <div>
                  <p>{formatLabel(entry.payment_status)}</p>
                  <p className="text-xs text-slate-500">
                    {entry.payment_status === "paid" ? `${formatPrice(entry.price_charged)} received` : "Not marked paid"}
                  </p>
                </div>
                <div>{formatLabel(entry.entry_status)}</div>
                <div>
                  {entry.result ? (
                    <Link className="font-bold text-court-blue" href="/dashboard/results">
                      {entry.result.placement ? `#${entry.result.placement}` : "Result"} / {entry.result.points ?? "-"} pts
                    </Link>
                  ) : (
                    "Not posted"
                  )}
                </div>
                <div>{entry.payment_notes ?? entry.notes ?? "No notes"}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
