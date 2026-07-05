import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { enterDashboardEvent, withdrawDashboardEventEntry } from "@/app/dashboard/events/actions";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { formatDateTime, formatJuniorStage, formatLabel, formatPrice } from "@/lib/courtside-format";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { CourtSideEvent, EntryStatus, MemberStatus, PaymentStatus, Profile } from "@/types/courtside";

export const dynamic = "force-dynamic";

type EntryProfileOption = Pick<Profile, "id" | "first_name" | "last_name" | "member_status" | "is_junior" | "junior_stage">;

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

type EventVisual = {
  border: string;
  strip: string;
  badge: string;
  icon: string;
};

const DEFAULT_VISUAL: EventVisual = {
  border: "border-court-teal/35",
  strip: "bg-court-teal",
  badge: "bg-court-mist text-court-teal",
  icon: "bg-court-teal text-white"
};

const EVENT_VISUALS: Record<string, EventVisual> = {
  red: {
    border: "border-red-300",
    strip: "bg-red-500",
    badge: "bg-red-50 text-red-700",
    icon: "bg-red-500 text-white"
  },
  orange: {
    border: "border-orange-300",
    strip: "bg-orange-500",
    badge: "bg-orange-50 text-orange-700",
    icon: "bg-orange-500 text-white"
  },
  green: {
    border: "border-emerald-300",
    strip: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700",
    icon: "bg-emerald-500 text-white"
  },
  yellow: {
    border: "border-amber-300",
    strip: "bg-amber-400",
    badge: "bg-amber-50 text-amber-700",
    icon: "bg-amber-400 text-court-navy"
  },
  navy: {
    border: "border-court-navy/20",
    strip: "bg-court-navy",
    badge: "bg-court-navy text-white",
    icon: "bg-court-navy text-white"
  }
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

function eventText(event: CourtSideEvent) {
  return [event.title, event.description, event.event_type, event.category, event.age_group, event.location]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function eventStageKey(event: CourtSideEvent) {
  const text = eventText(event);

  if (includesAny(text, ["red ball", "red_ball", "red-ball"])) {
    return "red";
  }

  if (includesAny(text, ["orange ball", "orange_ball", "orange-ball"])) {
    return "orange";
  }

  if (includesAny(text, ["green ball", "green_ball", "green-ball"])) {
    return "green";
  }

  if (includesAny(text, ["yellow ball", "yellow_ball", "yellow-ball"])) {
    return "yellow";
  }

  return null;
}

function eventAudienceLabel(event: CourtSideEvent) {
  const stage = eventStageKey(event);

  if (stage) {
    return `${stage.charAt(0).toUpperCase()}${stage.slice(1)} Ball`;
  }

  const text = eventText(event);
  if (includesAny(text, ["junior", "kids", "children", "primary"])) {
    return "Junior";
  }

  if (includesAny(text, ["adult", "open", "senior"])) {
    return "Adult/Open";
  }

  return formatLabel(event.age_group ?? event.category ?? event.event_type ?? event.sport);
}

function eventVisual(event: CourtSideEvent) {
  const stage = eventStageKey(event);

  if (stage) {
    return EVENT_VISUALS[stage];
  }

  const text = eventText(event);
  if (includesAny(text, ["adult", "open", "league", "tournament"])) {
    return EVENT_VISUALS.navy;
  }

  return DEFAULT_VISUAL;
}

function hostLabel(event: CourtSideEvent) {
  const text = eventText(event);

  if (text.includes("school")) {
    return "🏫 School Event";
  }

  if (text.includes("district")) {
    return "🏆 District Event";
  }

  if (text.includes("club")) {
    return "🏟 Club Event";
  }

  if (text.includes("academy")) {
    return "🎾 Academy Event";
  }

  if (text.includes("coach")) {
    return "🎾 Coach Event";
  }

  if (text.includes("playr")) {
    return "🎾 PlayR Event";
  }

  return null;
}

function isRatingRelevant(event: CourtSideEvent) {
  const text = eventText(event);
  return includesAny(text, ["rating", "rated", "matchplay", "match play", "competition", "competitive", "tournament", "league", "results"]);
}

function eventCostLabel(event: CourtSideEvent) {
  if (event.member_price === 0 && event.non_member_price === 0) {
    return "Free entry";
  }

  if (event.member_price === event.non_member_price) {
    return formatPrice(event.member_price);
  }

  return `${formatPrice(event.member_price)} members / ${formatPrice(event.non_member_price)} visitors`;
}

function profileName(profile: EntryProfileOption) {
  return `${profile.first_name} ${profile.last_name}`;
}

function profileSelectLabel(profile: EntryProfileOption, event: CourtSideEvent) {
  const stage = profile.is_junior && profile.junior_stage ? ` - ${formatJuniorStage(profile.junior_stage)}` : "";
  const label = profile.is_junior ? `${profileName(profile)}${stage}` : `${profileName(profile)} (myself)`;
  return `${label} - ${formatPrice(priceForProfile(event, profile.member_status))}`;
}

function entryPlayerLabel(entry: EventEntryRow) {
  if (!entry.profiles) {
    return "Player";
  }

  return `${entry.profiles.first_name} ${entry.profiles.last_name}${entry.profiles.is_junior ? " (junior)" : ""}`;
}

function DetailSection({
  title,
  icon,
  children
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded bg-court-mist text-lg">{icon}</span>
        <h2 className="text-lg font-black text-court-navy">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function QuickChip({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs font-bold text-slate-500">{icon} {label}</p>
      <p className="mt-1 font-black text-court-navy">{value}</p>
    </div>
  );
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
  const visual = eventVisual(event);
  const host = hostLabel(event);
  const ratingRelevant = isRatingRelevant(event);

  const { data: countData } = await supabase.rpc("event_entry_count", { check_event_id: event.id });
  const entryCount = typeof countData === "number" ? countData : 0;
  const spotsLeft = event.max_entries ? Math.max(event.max_entries - entryCount, 0) : null;
  const isFull = spotsLeft === 0;

  const { data: parentProfileData } = await supabase
    .from("profiles")
    .select("id,first_name,last_name,member_status,is_junior,junior_stage")
    .eq("user_id", user.id)
    .eq("is_junior", false)
    .maybeSingle();

  const parentProfile = parentProfileData as EntryProfileOption | null;
  const { data: juniorProfileData } = parentProfile
    ? await supabase
        .from("profiles")
        .select("id,first_name,last_name,member_status,is_junior,junior_stage")
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
  const statusLabel = isOpen ? "Open for entries" : event.status === "published" ? "Past event" : formatLabel(event.status);
  const capacityLabel = event.max_entries ? `${entryCount} / ${event.max_entries}` : `${entryCount} entered`;

  return (
    <PageShell eyebrow="Events" subtitle="Event overview, entry status and actions." title={event.title}>
      <Link className="mb-5 inline-flex rounded border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-court-navy hover:border-court-teal" href="/dashboard/events">
        Back to Events
      </Link>

      <StatusAlert
        className="mb-5"
        message={searchParams?.entered ? `Entry confirmed for ${searchParams.player ?? "player"}. Payment is tracked manually by the club.` : null}
        tone="success"
      />
      <StatusAlert className="mb-5" message={searchParams?.withdrawn ? "Entry withdrawn. The club can still see it as cancelled." : null} tone="success" />
      <StatusAlert className="mb-5" message={errorMessage(searchParams?.error)} tone="error" />

      <section className={`mb-6 overflow-hidden rounded-lg border bg-white shadow-court ${visual.border}`}>
        <div className={`h-1.5 ${visual.strip}`} />
        <div className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className={`grid h-16 w-16 shrink-0 place-items-center rounded ${visual.icon} text-2xl font-black`}>🎾</div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-2 text-sm font-bold">
                <span className={`ui-chip ${visual.badge}`}>🏷 {eventAudienceLabel(event)}</span>
                <span className="ui-chip ui-chip-muted">🎟 {statusLabel}</span>
                {host ? <span className="ui-chip ui-chip-muted">{host}</span> : null}
                {entries.some((entry) => entry.entry_status !== "cancelled") ? <span className="ui-chip ui-chip-success">✅ Entered</span> : null}
              </div>
              <div className="mt-4 grid gap-2 text-sm font-bold text-court-navy sm:grid-cols-2 lg:grid-cols-4">
                <span className="ui-chip ui-chip-muted ui-chip-block">📅 {formatDateTime(event.start_datetime)}</span>
                <span className="ui-chip ui-chip-muted ui-chip-block">📍 {event.location ?? "Venue TBC"}</span>
                <span className="ui-chip ui-chip-muted ui-chip-block">💳 {eventCostLabel(event)}</span>
                <span className="ui-chip ui-chip-muted ui-chip-block">👥 {capacityLabel}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <QuickChip icon="👥" label="Entries" value={capacityLabel} />
        <QuickChip icon="💳" label="Cost" value={event.member_price === event.non_member_price ? eventCostLabel(event) : "Member / visitor"} />
        <QuickChip icon="⚡" label="Rewards" value="TBC" />
        <QuickChip icon="⭐" label="Rating" value={ratingRelevant ? "Relevant" : "Not marked"} />
        <QuickChip icon="🏷" label="Stage" value={eventAudienceLabel(event)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_0.78fr]">
        <div className="grid gap-5">
          <DetailSection icon="ℹ️" title="Overview">
            {event.description ? (
              <p className="text-sm leading-6 text-slate-700">{event.description}</p>
            ) : (
              <p className="rounded bg-slate-50 p-4 text-sm text-slate-600">Overview to be confirmed.</p>
            )}
          </DetailSection>

          <DetailSection icon="👥" title="Entries">
            <div className="flex flex-wrap gap-2 text-sm font-bold text-court-navy">
              <span className="ui-chip ui-chip-muted">{entryCount} entered</span>
              {spotsLeft !== null ? <span className="ui-chip ui-chip-muted">{spotsLeft} spots left</span> : <span className="ui-chip ui-chip-muted">Open entries</span>}
            </div>
            <p className="mt-3 text-sm text-slate-600">Your entered players are shown in the actions panel.</p>
          </DetailSection>

          <DetailSection icon="🎾" title="Format">
            <div className="flex flex-wrap gap-2 text-sm font-bold text-court-navy">
              <span className="ui-chip ui-chip-muted">{formatLabel(event.sport)}</span>
              {event.event_type ? <span className="ui-chip ui-chip-muted">{formatLabel(event.event_type)}</span> : null}
              {event.category ? <span className="ui-chip ui-chip-muted">{formatLabel(event.category)}</span> : null}
              {event.age_group ? <span className="ui-chip ui-chip-muted">{formatLabel(event.age_group)}</span> : null}
            </div>
            {!event.event_type && !event.category ? <p className="mt-3 rounded bg-slate-50 p-4 text-sm text-slate-600">Format to be confirmed.</p> : null}
          </DetailSection>

          <DetailSection icon="📅" title="Schedule">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded bg-slate-50 p-4">
                <p className="font-bold text-slate-500">Starts</p>
                <p className="mt-1 font-black text-court-navy">{formatDateTime(event.start_datetime)}</p>
              </div>
              <div className="rounded bg-slate-50 p-4">
                <p className="font-bold text-slate-500">Ends</p>
                <p className="mt-1 font-black text-court-navy">{event.end_datetime ? formatDateTime(event.end_datetime) : "Schedule to be confirmed"}</p>
              </div>
            </div>
          </DetailSection>

          <DetailSection icon="💳" title="Payment">
            <div className="flex flex-wrap gap-2 text-sm font-bold text-court-navy">
              <span className="ui-chip ui-chip-muted">{eventCostLabel(event)}</span>
              <span className="ui-chip ui-chip-brand">Payment handled by organiser</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">Online payment is not enabled yet. The organiser can mark payment received after entry.</p>
          </DetailSection>

          <DetailSection icon="⚡" title="Rewards">
            <div className="flex flex-wrap gap-2 text-sm font-bold text-court-navy">
              <span className="ui-chip ui-chip-muted">⚡ Participation rewards TBC</span>
              <span className="ui-chip ui-chip-muted">🏅 Badge eligibility TBC</span>
              {ratingRelevant ? <span className="ui-chip ui-chip-navy">⭐ Rating relevant</span> : <span className="ui-chip ui-chip-muted">⭐ Rating not marked</span>}
            </div>
          </DetailSection>

          <DetailSection icon="📋" title="Rules">
            <p className="rounded bg-slate-50 p-4 text-sm text-slate-600">Rules / scoring format to be confirmed.</p>
          </DetailSection>
        </div>

        <aside className="grid content-start gap-5">
          <DetailSection icon="🎟" title="Actions">
            {!parentProfile ? (
              <div className="rounded bg-court-mist p-4 text-sm text-court-ink">
                <p>Create your adult profile before entering yourself or linked juniors.</p>
                <Link className="mt-4 inline-flex rounded bg-court-blue px-4 py-3 font-bold text-white" href="/dashboard/profile">
                  Create profile
                </Link>
              </div>
            ) : !isOpen ? (
              <p className="rounded bg-slate-50 p-4 text-sm text-slate-600">Entries are not open for this event.</p>
            ) : isFull ? (
              <p className="rounded bg-slate-50 p-4 text-sm text-slate-600">This event is full.</p>
            ) : availableProfiles.length === 0 ? (
              <p className="rounded bg-emerald-50 p-4 text-sm font-bold text-emerald-700">All linked profiles are already entered for this event.</p>
            ) : (
              <form action={enterDashboardEvent} className="space-y-4">
                <input name="eventId" type="hidden" value={event.id} />
                <input name="returnTo" type="hidden" value={returnTo} />
                <label className="block text-sm font-semibold text-slate-700">
                  Enter for
                  <select className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" name="profileId" required>
                    {availableProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profileSelectLabel(profile, event)}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="w-full rounded bg-court-teal px-4 py-3 font-bold text-white transition hover:bg-teal-500" type="submit">
                  Enter Event
                </button>
              </form>
            )}
          </DetailSection>

          <DetailSection icon="✅" title="Your Entries">
            {entries.length > 0 ? (
              <div className="grid gap-3">
                {entries.map((entry) => {
                  const canWithdraw = entry.entry_status !== "cancelled" && isOpen;

                  return (
                    <article className="rounded-lg border border-slate-200 bg-slate-50 p-4" key={entry.id}>
                      <div className="flex flex-col gap-3">
                        <div>
                          <p className="font-black text-court-navy">{entryPlayerLabel(entry)}</p>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-court-navy">
                            <span className="rounded bg-white px-2.5 py-1">💳 {formatLabel(entry.payment_status)}</span>
                            <span className="rounded bg-white px-2.5 py-1">🎟 {formatLabel(entry.entry_status)}</span>
                            <span className="rounded bg-white px-2.5 py-1">{formatPrice(entry.price_charged)}</span>
                          </div>
                        </div>
                        {canWithdraw ? (
                          <form action={withdrawDashboardEventEntry}>
                            <input name="entryId" type="hidden" value={entry.id} />
                            <input name="returnTo" type="hidden" value={returnTo} />
                            <button className="w-full rounded border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-court-navy" type="submit">
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
              <p className="rounded bg-slate-50 p-4 text-sm text-slate-600">Entries will appear once your players register.</p>
            )}
          </DetailSection>
        </aside>
      </div>
    </PageShell>
  );
}
