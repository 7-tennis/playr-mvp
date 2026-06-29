import Link from "next/link";
import { redirect } from "next/navigation";
import { enterDashboardEvent, withdrawDashboardEventEntry } from "@/app/dashboard/events/actions";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { formatDate, formatDateTime, formatLabel, formatPrice } from "@/lib/courtside-format";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { CourtSideEvent, EntryStatus, MemberStatus, PaymentStatus, Profile } from "@/types/courtside";

export const dynamic = "force-dynamic";

type EntryProfileOption = Pick<Profile, "id" | "first_name" | "last_name" | "member_status" | "is_junior">;

type EventWithEntryCount = CourtSideEvent & {
  entry_count: number | null;
};

type CurrentEntry = {
  id: string;
  event_id: string;
  profile_id: string;
  price_charged: number;
  payment_status: PaymentStatus;
  payment_notes: string | null;
  entry_status: EntryStatus;
  events: Pick<CourtSideEvent, "title" | "slug" | "start_datetime"> | null;
  profiles: Pick<Profile, "first_name" | "last_name" | "is_junior"> | null;
};

type DashboardEventsPageProps = {
  searchParams?: {
    entered?: string;
    event?: string;
    player?: string;
    withdrawn?: string;
    error?: string;
  };
};

function errorMessage(error?: string) {
  switch (error) {
    case "missing_fields":
      return "Choose an event and player before entering.";
    case "event_unavailable":
      return "That event is no longer available.";
    case "event_closed":
      return "That event is closed for entries.";
    case "event_full":
      return "That event is full.";
    case "profile_not_allowed":
      return "Choose your own profile or a linked junior profile.";
    case "already_entered":
      return "That player is already entered for this event.";
    case "invalid_entry":
      return "That event entry could not be found.";
    case "already_withdrawn":
      return "That entry has already been withdrawn.";
    case "withdraw_closed":
      return "Only future published event entries can be withdrawn online.";
    case "withdraw_failed":
      return "We could not withdraw that entry. Please try again.";
    case "entry_failed":
      return "We could not create the entry. Please try again.";
    default:
      return null;
  }
}

function priceForProfile(event: CourtSideEvent, memberStatus: MemberStatus) {
  return memberStatus === "member" ? event.member_price : event.non_member_price;
}

export default async function DashboardEventsPage({ searchParams }: DashboardEventsPageProps) {
  if (!hasSupabaseConfig()) {
    return (
      <PageShell eyebrow="Events" title="Supabase is not configured.">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <p className="text-slate-700">Add Supabase environment variables to enter events from your dashboard.</p>
        </div>
      </PageShell>
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: parentProfileData } = await supabase
    .from("profiles")
    .select("id,first_name,last_name,member_status,is_junior")
    .eq("user_id", user.id)
    .eq("is_junior", false)
    .maybeSingle();

  const parentProfile = parentProfileData as EntryProfileOption | null;

  const { data: juniorProfileData } = parentProfile
    ? await supabase
        .from("profiles")
        .select("id,first_name,last_name,member_status,is_junior")
        .eq("parent_profile_id", parentProfile.id)
        .eq("is_junior", true)
        .order("first_name", { ascending: true })
    : { data: [] };

  const profiles = [
    ...(parentProfile ? [parentProfile] : []),
    ...((juniorProfileData ?? []) as EntryProfileOption[])
  ];

  const now = new Date().toISOString();
  const { data: upcomingEventData, error: eventsError } = await supabase
    .from("events")
    .select("*")
    .eq("status", "published")
    .gte("start_datetime", now)
    .order("start_datetime", { ascending: true });

  const upcomingEvents = await Promise.all(
    ((upcomingEventData ?? []) as CourtSideEvent[]).map(async (event) => {
      const { data: countData } = await supabase.rpc("event_entry_count", { check_event_id: event.id });
      return {
        ...event,
        entry_count: typeof countData === "number" ? countData : null
      };
    })
  );

  const { data: closedEventData } = await supabase
    .from("events")
    .select("id,title,start_datetime,status")
    .or(`start_datetime.lt.${now},status.neq.published`)
    .order("start_datetime", { ascending: false })
    .limit(6);

  const profileIds = profiles.map((profile) => profile.id);
  const { data: currentEntryData } =
    profileIds.length > 0
      ? await supabase
          .from("event_entries")
          .select(
            "id,event_id,profile_id,price_charged,payment_status,payment_notes,entry_status,events:event_id(title,slug,start_datetime),profiles:profile_id(first_name,last_name,is_junior)"
          )
          .in("profile_id", profileIds)
          .order("created_at", { ascending: false })
      : { data: [] };

  const currentEntries = (currentEntryData ?? []) as unknown as CurrentEntry[];
  const existingEntryProfileIdsByEvent = new Map<string, Set<string>>();
  currentEntries.forEach((entry) => {
    if (entry.entry_status !== "cancelled") {
      const set = existingEntryProfileIdsByEvent.get(entry.event_id) ?? new Set<string>();
      set.add(entry.profile_id);
      existingEntryProfileIdsByEvent.set(entry.event_id, set);
    }
  });

  const message = errorMessage(searchParams?.error);

  return (
    <PageShell eyebrow="Events" title="Events">
      <StatusAlert
        className="mb-5"
        message={
          searchParams?.entered
            ? `Entry confirmed for ${searchParams.player ?? "player"} in ${searchParams.event ?? "the selected event"}. Payment status is unpaid until the club marks it received.`
            : null
        }
        tone="success"
      />
      <StatusAlert className="mb-5" message={searchParams?.withdrawn ? "Entry withdrawn. The club can still see it as cancelled." : null} tone="success" />
      <StatusAlert className="mb-5" message={message} tone="error" />

      {!parentProfile ? (
        <section className="empty-state mb-6">
          <h2 className="section-title">Create your profile first</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">You need an adult player profile before you can enter yourself or linked juniors.</p>
          <Link className="btn-primary mt-5" href="/dashboard/profile">
            Create Player Profile
          </Link>
        </section>
      ) : null}

      <section className="surface-card mb-8 p-5 sm:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-black text-court-navy">My current entries</h2>
            <p className="mt-1 text-sm text-slate-600">Includes your adult profile and linked juniors.</p>
          </div>
          <Link className="font-bold text-court-blue" href="/dashboard/my-entries">
            View full entry history
          </Link>
        </div>

        {currentEntries.length > 0 ? (
          <div className="mt-5 divide-y divide-slate-200 overflow-hidden rounded border border-slate-200">
            {currentEntries.slice(0, 6).map((entry) => {
              const canWithdraw = entry.entry_status !== "cancelled" && entry.events?.start_datetime && new Date(entry.events.start_datetime).getTime() > Date.now();

              return (
                <div className="grid gap-3 p-4 text-sm md:grid-cols-[1.2fr_0.8fr_0.9fr_0.8fr_1fr]" key={entry.id}>
                  <div>
                    {entry.events?.slug ? (
                      <Link className="font-black text-court-navy hover:text-court-blue" href={`/events/${entry.events.slug}`}>
                        {entry.events.title}
                      </Link>
                    ) : (
                      <span className="font-black text-court-navy">Event unavailable</span>
                    )}
                    <p className="text-slate-600">{entry.events?.start_datetime ? formatDate(entry.events.start_datetime) : "Date unavailable"}</p>
                  </div>
                  <div>{entry.profiles ? `${entry.profiles.first_name} ${entry.profiles.last_name}${entry.profiles.is_junior ? " (junior)" : ""}` : "Profile unavailable"}</div>
                  <div>
                    <p>{formatLabel(entry.payment_status)}</p>
                    <p className="text-xs text-slate-500">
                      {entry.payment_status === "paid" ? `${formatPrice(entry.price_charged)} received` : "Not marked paid"}
                    </p>
                  </div>
                  <div>{formatLabel(entry.entry_status)}</div>
                  <div className="space-y-2">
                    <p>{entry.payment_notes ?? "No payment note"}</p>
                    {canWithdraw ? (
                      <form action={withdrawDashboardEventEntry}>
                        <input name="entryId" type="hidden" value={entry.id} />
                        <input name="returnTo" type="hidden" value="/dashboard/events" />
                        <button className="rounded border border-slate-300 px-3 py-2 text-xs font-bold text-court-navy" type="submit">
                          Withdraw
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-5 rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No current entries yet. Choose an open event below to get started.</p>
        )}
      </section>

      {eventsError ? <p className="mb-5 rounded bg-amber-50 p-4 text-sm text-amber-900">Events could not be loaded right now.</p> : null}

      <section>
        <h2 className="text-2xl font-black text-court-navy">Available upcoming events</h2>
        {upcomingEvents.length > 0 ? (
          <div className="mt-5 grid gap-5">
            {upcomingEvents.map((event: EventWithEntryCount) => {
              const spotsLeft = event.max_entries && event.entry_count !== null ? Math.max(event.max_entries - event.entry_count, 0) : null;
              const isFull = spotsLeft === 0;
              const enteredProfileIds = existingEntryProfileIdsByEvent.get(event.id) ?? new Set<string>();
              const availableProfiles = profiles.filter((profile) => !enteredProfileIds.has(profile.id));

              return (
                <article className="surface-card p-5" key={event.id}>
                  <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
                    <div>
                      <div className="mb-3 flex flex-wrap gap-2">
                        <span className="rounded bg-court-mist px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-court-teal">Open</span>
                        <span className="rounded bg-slate-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-slate-600">{formatLabel(event.sport)}</span>
                      </div>
                      <h3 className="text-xl font-black text-court-navy">{event.title}</h3>
                      {event.description ? <p className="mt-2 text-sm leading-6 text-slate-600">{event.description}</p> : null}
                      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
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
                          <dd className="font-bold text-court-ink">{formatPrice(event.member_price)} members / {formatPrice(event.non_member_price)} visitors</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-slate-500">Availability</dt>
                          <dd className="font-bold text-court-ink">
                            {event.max_entries ? (spotsLeft === null ? `Up to ${event.max_entries}` : isFull ? "Event full" : `${spotsLeft} spots left`) : "Open entries"}
                          </dd>
                        </div>
                      </dl>
                      <Link className="btn-secondary mt-5" href={`/dashboard/events/${event.id}`}>
                        View details
                      </Link>
                    </div>

                    <div className="soft-card p-4">
                      <h4 className="font-black text-court-navy">Enter this event</h4>
                      {profiles.length > 0 && enteredProfileIds.size > 0 ? (
                        <div className="mt-3 rounded border border-slate-200 bg-white p-3 text-sm text-slate-700">
                          <p className="font-bold text-court-ink">Already entered</p>
                          <ul className="mt-2 space-y-1">
                            {profiles
                              .filter((profile) => enteredProfileIds.has(profile.id))
                              .map((profile) => (
                                <li key={profile.id}>
                                  {profile.first_name} {profile.last_name}
                                  {profile.is_junior ? " (junior)" : ""}
                                </li>
                              ))}
                          </ul>
                        </div>
                      ) : null}
                      {profiles.length === 0 ? (
                        <p className="mt-3 text-sm leading-6 text-slate-600">Create your profile before entering events.</p>
                      ) : isFull ? (
                        <p className="mt-3 text-sm leading-6 text-slate-600">This event is full.</p>
                      ) : availableProfiles.length === 0 ? (
                        <p className="mt-3 text-sm leading-6 text-slate-600">All linked profiles are already entered for this event.</p>
                      ) : (
                        <form action={enterDashboardEvent} className="mt-4 space-y-3">
                          <input name="eventId" type="hidden" value={event.id} />
                          <input name="returnTo" type="hidden" value="/dashboard/events" />
                          <label className="block text-sm font-semibold text-slate-700">
                            Player
                            <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="profileId" required>
                              {availableProfiles.map((profile) => (
                                <option key={profile.id} value={profile.id}>
                                  {profile.first_name} {profile.last_name}
                                  {profile.is_junior ? " (junior)" : ""} - {formatPrice(priceForProfile(event, profile.member_status))}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button className="w-full rounded bg-court-teal px-4 py-3 font-bold text-white transition hover:bg-teal-500" type="submit">
                            Enter event
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state mt-5">
            <h3 className="text-lg font-black text-court-navy">No open events right now</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Published events will appear here when your club opens entries.</p>
          </div>
        )}
      </section>

      {(closedEventData ?? []).length > 0 ? (
        <section className="mt-8">
          <h2 className="text-xl font-black text-court-navy">Past or closed events</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {(closedEventData ?? []).map((event) => (
              <div className="rounded border border-slate-200 bg-white p-4 text-sm" key={event.id}>
                <p className="font-bold text-court-ink">{event.title}</p>
                <p className="text-slate-600">{formatDate(event.start_datetime)} / {event.status === "completed" ? "Closed" : formatLabel(event.status)} / Past</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </PageShell>
  );
}
