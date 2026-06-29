import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { enterDashboardEvent, withdrawDashboardEventEntry } from "@/app/dashboard/events/actions";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { formatDateTime, formatLabel, formatPrice } from "@/lib/courtside-format";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { CourtSideEvent, EntryStatus, MemberStatus, PaymentStatus, Profile } from "@/types/courtside";

export const dynamic = "force-dynamic";

type EntryProfileOption = Pick<Profile, "id" | "first_name" | "last_name" | "member_status" | "is_junior">;

type EventEntryRow = {
  id: string;
  profile_id: string;
  payment_status: PaymentStatus;
  entry_status: EntryStatus;
  price_charged: number;
  profiles: Pick<Profile, "first_name" | "last_name" | "is_junior"> | null;
};

type EventDetailProps = {
  params: { id: string };
  searchParams?: {
    entered?: string;
    withdrawn?: string;
    player?: string;
    error?: string;
  };
};

function errorMessage(error?: string) {
  switch (error) {
    case "missing_fields":
      return "Choose a player before entering.";
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

export default async function DashboardEventDetailPage({ params, searchParams }: EventDetailProps) {
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

  const { data: eventData, error: eventError } = await supabase.from("events").select("*").eq("id", params.id).maybeSingle();

  if (eventError || !eventData) {
    notFound();
  }

  const event = eventData as CourtSideEvent;
  const isFuture = new Date(event.start_datetime).getTime() > Date.now();
  const isOpen = event.status === "published" && isFuture;

  const { data: countData } = await supabase.rpc("event_entry_count", { check_event_id: event.id });
  const entryCount = typeof countData === "number" ? countData : 0;
  const spotsLeft = event.max_entries ? Math.max(event.max_entries - entryCount, 0) : null;
  const isFull = spotsLeft === 0;

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
  const profileIds = profiles.map((profile) => profile.id);

  const { data: entryData } =
    profileIds.length > 0
      ? await supabase
          .from("event_entries")
          .select("id,profile_id,price_charged,payment_status,entry_status,profiles:profile_id(first_name,last_name,is_junior)")
          .eq("event_id", event.id)
          .in("profile_id", profileIds)
          .order("created_at", { ascending: false })
      : { data: [] };

  const entries = (entryData ?? []) as unknown as EventEntryRow[];
  const activeEnteredProfileIds = new Set(entries.filter((entry) => entry.entry_status !== "cancelled").map((entry) => entry.profile_id));
  const availableProfiles = profiles.filter((profile) => !activeEnteredProfileIds.has(profile.id));
  const returnTo = `/dashboard/events/${event.id}`;

  return (
    <PageShell eyebrow="Events" title={event.title}>
      <StatusAlert
        className="mb-5"
        message={searchParams?.entered ? `Entry confirmed for ${searchParams.player ?? "player"}. Payment is tracked manually by the club.` : null}
        tone="success"
      />
      <StatusAlert className="mb-5" message={searchParams?.withdrawn ? "Entry withdrawn. The club can still see it as cancelled." : null} tone="success" />
      <StatusAlert className="mb-5" message={errorMessage(searchParams?.error)} tone="error" />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap gap-2">
            <span className="rounded bg-court-mist px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-court-teal">
              {isOpen ? "Open" : event.status === "published" ? "Past" : formatLabel(event.status)}
            </span>
            <span className="rounded bg-slate-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-slate-600">{formatLabel(event.sport)}</span>
            {event.category ? <span className="rounded bg-slate-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-slate-600">{event.category}</span> : null}
          </div>

          {event.description ? <p className="text-sm leading-6 text-slate-700">{event.description}</p> : null}

          <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
            <div className="rounded bg-slate-50 p-4">
              <dt className="font-semibold text-slate-500">Date and time</dt>
              <dd className="mt-1 font-black text-court-navy">{formatDateTime(event.start_datetime)}</dd>
            </div>
            <div className="rounded bg-slate-50 p-4">
              <dt className="font-semibold text-slate-500">Location</dt>
              <dd className="mt-1 font-black text-court-navy">{event.location ?? "PlayR venue"}</dd>
            </div>
            <div className="rounded bg-slate-50 p-4">
              <dt className="font-semibold text-slate-500">Entry fee</dt>
              <dd className="mt-1 font-black text-court-navy">{formatPrice(event.member_price)} members / {formatPrice(event.non_member_price)} visitors</dd>
            </div>
            <div className="rounded bg-slate-50 p-4">
              <dt className="font-semibold text-slate-500">Capacity</dt>
              <dd className="mt-1 font-black text-court-navy">
                {event.max_entries ? `${entryCount} / ${event.max_entries} entered` : `${entryCount} entered`}
              </dd>
              {spotsLeft !== null ? <p className="mt-1 text-xs text-slate-500">{spotsLeft} spots remaining</p> : null}
            </div>
          </dl>
        </section>

        <aside className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-court-navy">Enter this event</h2>
          {!parentProfile ? (
            <div className="mt-4 rounded bg-court-mist p-4 text-sm text-court-ink">
              <p>Create your adult profile before entering yourself or linked juniors.</p>
              <Link className="mt-4 inline-flex rounded bg-court-blue px-4 py-3 font-bold text-white" href="/dashboard/profile">
                Create profile
              </Link>
            </div>
          ) : !isOpen ? (
            <p className="mt-4 rounded bg-slate-50 p-4 text-sm text-slate-600">Entries are not open for this event.</p>
          ) : isFull ? (
            <p className="mt-4 rounded bg-slate-50 p-4 text-sm text-slate-600">This event is full.</p>
          ) : availableProfiles.length === 0 ? (
            <p className="mt-4 rounded bg-slate-50 p-4 text-sm text-slate-600">All linked profiles are already entered for this event.</p>
          ) : (
            <form action={enterDashboardEvent} className="mt-5 space-y-4">
              <input name="eventId" type="hidden" value={event.id} />
              <input name="returnTo" type="hidden" value={returnTo} />
              <label className="block text-sm font-semibold text-slate-700">
                Enter for
                <select className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" name="profileId" required>
                  {availableProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.first_name} {profile.last_name}
                      {profile.is_junior ? " (junior)" : " (myself)"} - {formatPrice(priceForProfile(event, profile.member_status))}
                    </option>
                  ))}
                </select>
              </label>
              <p className="rounded bg-court-mist p-3 text-xs leading-5 text-court-ink">Payment is tracked manually by the club for now. Online payments are not enabled yet.</p>
              <button className="w-full rounded bg-court-teal px-4 py-3 font-bold text-white" type="submit">
                Enter event
              </button>
            </form>
          )}
        </aside>
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black text-court-navy">Your entries for this event</h2>
        {entries.length > 0 ? (
          <div className="mt-4 grid gap-3">
            {entries.map((entry) => {
              const canWithdraw = entry.entry_status !== "cancelled" && isOpen;

              return (
                <article className="rounded border border-slate-200 bg-slate-50 p-4" key={entry.id}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-black text-court-navy">
                        {entry.profiles ? `${entry.profiles.first_name} ${entry.profiles.last_name}${entry.profiles.is_junior ? " (junior)" : ""}` : "Player"}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {formatPrice(entry.price_charged)} / {formatLabel(entry.payment_status)} / {formatLabel(entry.entry_status)}
                      </p>
                    </div>
                    {canWithdraw ? (
                      <form action={withdrawDashboardEventEntry}>
                        <input name="entryId" type="hidden" value={entry.id} />
                        <input name="returnTo" type="hidden" value={returnTo} />
                        <button className="rounded border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-court-navy" type="submit">
                          Withdraw
                        </button>
                      </form>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 rounded bg-slate-50 p-4 text-sm text-slate-600">No linked profiles are entered for this event yet.</p>
        )}
      </section>
    </PageShell>
  );
}
