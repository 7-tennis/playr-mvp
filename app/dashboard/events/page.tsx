import Link from "next/link";
import { redirect } from "next/navigation";
import { enterDashboardEvent, withdrawDashboardEventEntry } from "@/app/dashboard/events/actions";
import { CollapsibleCard } from "@/components/collapsible-card";
import { PageShell } from "@/components/page-shell";
import {
  ClubIcon,
  CostIcon,
  DistrictIcon,
  EntriesIcon,
  EventIcon,
  LocationIcon,
  ParticipationIcon,
  RatingIcon,
  SchoolIcon,
  StatusIcon,
  TagIcon,
  TicketIcon
} from "@/components/playr-icons";
import { StatusAlert } from "@/components/status-alert";
import { formatDate, formatDateTime, formatJuniorStage, formatLabel, formatPrice } from "@/lib/courtside-format";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { CourtSideEvent, EntryStatus, MemberStatus, PaymentStatus, Profile } from "@/types/courtside";

export const dynamic = "force-dynamic";

type EntryProfileOption = Pick<Profile, "id" | "first_name" | "last_name" | "member_status" | "is_junior" | "junior_stage">;

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
    filter?: string;
    player?: string;
    profileId?: string;
    view?: string;
    withdrawn?: string;
    error?: string;
  };
};

type EventVisual = {
  border: string;
  strip: string;
  badge: string;
  icon: string;
};

const EVENT_VIEWS = [
  { id: "recommended", label: "Recommended" },
  { id: "current", label: "Current" },
  { id: "upcoming", label: "Upcoming" },
  { id: "entries", label: "My Entries" }
] as const;

const PRIMARY_EVENT_FILTERS = [
  { id: "all", label: "All" },
  { id: "competitive", label: "Competitive" },
  { id: "rating", label: "Rating" },
  { id: "junior", label: "Junior" },
  { id: "social", label: "Social" }
] as const;

const MORE_EVENT_FILTERS = [
  { id: "adult", label: "Adult/Open" },
  { id: "club", label: "Club" },
  { id: "school", label: "School" },
  { id: "district", label: "District" }
] as const;

const EVENT_FILTERS = [...PRIMARY_EVENT_FILTERS, ...MORE_EVENT_FILTERS] as const;

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
    return "School Event";
  }

  if (text.includes("district")) {
    return "District Event";
  }

  if (text.includes("club")) {
    return "Club Event";
  }

  if (text.includes("academy")) {
    return "Academy Event";
  }

  if (text.includes("coach")) {
    return "Coach Event";
  }

  if (text.includes("playr")) {
    return "PlayR Event";
  }

  return null;
}

function hostIcon(event: CourtSideEvent) {
  const text = eventText(event);

  if (text.includes("school")) {
    return <SchoolIcon size={14} />;
  }

  if (text.includes("district")) {
    return <DistrictIcon size={14} />;
  }

  return <ClubIcon size={14} />;
}

function isRatingRelevant(event: CourtSideEvent) {
  const text = eventText(event);
  return includesAny(text, ["rating", "rated", "matchplay", "match play", "competition", "competitive", "tournament", "league", "results"]);
}

function isSocialEvent(event: CourtSideEvent) {
  return includesAny(eventText(event), ["social", "fun", "friendly", "americano"]);
}

function isJuniorEvent(event: CourtSideEvent) {
  return eventStageKey(event) !== null || includesAny(eventText(event), ["junior", "kids", "children", "primary"]);
}

function isAdultEvent(event: CourtSideEvent) {
  const text = eventText(event);
  return includesAny(text, ["adult", "open", "senior"]) || !isJuniorEvent(event);
}

function eventCostLabel(event: CourtSideEvent) {
  if (event.member_price === 0 && event.non_member_price === 0) {
    return "Free";
  }

  if (event.member_price === event.non_member_price) {
    return formatPrice(event.member_price);
  }

  return `${formatPrice(event.member_price)} mem`;
}

function spotsLabel(event: EventWithEntryCount) {
  if (!event.max_entries) {
    return "Open entries";
  }

  if (event.entry_count === null) {
    return `Up to ${event.max_entries}`;
  }

  const spotsLeft = Math.max(event.max_entries - event.entry_count, 0);
  return spotsLeft === 0 ? "Full" : `${spotsLeft} spots left`;
}

function profileName(profile: EntryProfileOption) {
  return `${profile.first_name} ${profile.last_name}`;
}

function profileChipLabel(profile: EntryProfileOption) {
  if (!profile.is_junior) {
    return profile.first_name;
  }

  const stage = profile.junior_stage ? formatJuniorStage(profile.junior_stage) : "Junior";
  return `${profile.first_name} - ${stage}`;
}

function profileSelectLabel(profile: EntryProfileOption, event: CourtSideEvent) {
  const label = profile.is_junior ? `${profileName(profile)} (junior)` : `${profileName(profile)} (myself)`;
  return `${label} - ${formatPrice(priceForProfile(event, profile.member_status))}`;
}

function eventMatchesProfile(event: CourtSideEvent, profile: EntryProfileOption) {
  const text = eventText(event);
  const stage = eventStageKey(event);

  if (profile.is_junior) {
    if (profile.junior_stage) {
      const stageText = profile.junior_stage.replace("_", " ");
      if (text.includes(stageText) || text.includes(profile.junior_stage) || text.includes(formatJuniorStage(profile.junior_stage).toLowerCase())) {
        return true;
      }
    }

    return stage === null && isJuniorEvent(event);
  }

  return isAdultEvent(event);
}

function filterMatches(event: EventWithEntryCount, filter: string) {
  switch (filter) {
    case "competitive":
      return isRatingRelevant(event);
    case "junior":
      return isJuniorEvent(event);
    case "adult":
      return isAdultEvent(event);
    case "club":
      return eventText(event).includes("club");
    case "school":
      return eventText(event).includes("school");
    case "district":
      return eventText(event).includes("district");
    case "social":
      return isSocialEvent(event);
    case "rating":
      return isRatingRelevant(event);
    default:
      return true;
  }
}

function dashboardEventsHref({
  filter = "all",
  profileId,
  view = "recommended"
}: {
  filter?: string;
  profileId?: string;
  view?: string;
}) {
  const params = new URLSearchParams();

  if (view !== "recommended") {
    params.set("view", view);
  }

  if (filter !== "all") {
    params.set("filter", filter);
  }

  if (profileId) {
    params.set("profileId", profileId);
  }

  const query = params.toString();
  return query ? `/dashboard/events?${query}` : "/dashboard/events";
}

function activeEntryStatus(entries: CurrentEntry[]) {
  if (entries.length === 0) {
    return null;
  }

  if (entries.some((entry) => entry.payment_status !== "paid")) {
    return "Payment pending";
  }

  return entries.length === 1 ? "Entered" : `${entries.length} entered`;
}

function entryPlayerLabel(entry: CurrentEntry) {
  if (!entry.profiles) {
    return "Player";
  }

  return `${entry.profiles.first_name} ${entry.profiles.last_name}${entry.profiles.is_junior ? " (junior)" : ""}`;
}

function SpotlightEventCard({
  event,
  label,
  profile
}: {
  event: EventWithEntryCount;
  label: string;
  profile: EntryProfileOption | null;
}) {
  const visual = eventVisual(event);
  const host = hostLabel(event);

  return (
    <section className={`mb-4 overflow-hidden rounded-lg border bg-white shadow-sm ${visual.border}`}>
      <div className={`h-1 ${visual.strip}`} />
      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="section-kicker">{label}</p>
            <div className="mt-2 flex gap-3">
              <div className={`grid h-11 w-11 shrink-0 place-items-center rounded ${visual.icon}`}>
                <EventIcon size={20} />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-xl font-black text-court-navy">{event.title}</h2>
                {profile ? <p className="mt-1 text-sm font-bold text-slate-600">Best fit for {profileName(profile)}</p> : null}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-sm font-bold">
              <span className={`ui-chip ${visual.badge}`}>
                <TagIcon size={14} /> {eventAudienceLabel(event)}
              </span>
              {host ? (
                <span className="ui-chip ui-chip-muted">
                  {hostIcon(event)} {host}
                </span>
              ) : null}
              <span className="ui-chip ui-chip-muted">
                <EventIcon size={14} /> {formatDate(event.start_datetime)}
              </span>
              <span className="ui-chip ui-chip-muted">
                <LocationIcon size={14} /> {event.location ?? "Venue TBC"}
              </span>
              {isRatingRelevant(event) ? (
                <span className="ui-chip ui-chip-navy">
                  <RatingIcon size={14} /> Rating
                </span>
              ) : null}
            </div>
          </div>
          <Link className="btn-primary shrink-0 justify-center px-4 py-2.5 text-sm" href={`/dashboard/events/${event.id}`}>
            View Event
          </Link>
        </div>
      </div>
    </section>
  );
}

function EventCard({
  event,
  profiles,
  activeEntries,
  returnTo
}: {
  event: EventWithEntryCount;
  profiles: EntryProfileOption[];
  activeEntries: CurrentEntry[];
  returnTo: string;
}) {
  const visual = eventVisual(event);
  const host = hostLabel(event);
  const enteredProfileIds = new Set(activeEntries.map((entry) => entry.profile_id));
  const availableProfiles = profiles.filter((profile) => !enteredProfileIds.has(profile.id));
  const spotsLeft = event.max_entries && event.entry_count !== null ? Math.max(event.max_entries - event.entry_count, 0) : null;
  const isFull = spotsLeft === 0;
  const enteredStatus = activeEntryStatus(activeEntries);

  return (
    <article className={`overflow-hidden rounded-lg border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-court ${visual.border}`}>
      <div className={`h-1.5 ${visual.strip}`} />
      <div className="p-4 sm:p-5">
        <div className="flex gap-3">
          <div className={`grid h-11 w-11 shrink-0 place-items-center rounded ${visual.icon} font-black`}>
            <EventIcon size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2">
              <span className={`ui-chip ${visual.badge}`}>
                <TagIcon size={14} /> {eventAudienceLabel(event)}
              </span>
              {enteredStatus ? (
                <span className="ui-chip ui-chip-success">
                  <StatusIcon size={14} /> {enteredStatus}
                </span>
              ) : null}
              {isFull ? <span className="ui-chip ui-chip-muted">Full</span> : null}
            </div>
            <h3 className="mt-2 text-xl font-black text-court-navy">{event.title}</h3>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-sm font-bold text-court-navy">
          {host ? (
            <span className="ui-chip ui-chip-muted">
              {hostIcon(event)} {host}
            </span>
          ) : null}
          <span className="ui-chip ui-chip-muted">
            <EventIcon size={14} /> {formatDateTime(event.start_datetime)}
          </span>
          <span className="ui-chip ui-chip-muted">
            <LocationIcon size={14} /> {event.location ?? "Venue TBC"}
          </span>
          <span className="ui-chip ui-chip-muted">
            <EntriesIcon size={14} /> {event.entry_count ?? 0} entered
          </span>
          <span className="ui-chip ui-chip-muted">
            <TicketIcon size={14} /> {spotsLabel(event)}
          </span>
          <span className="ui-chip ui-chip-muted">
            <CostIcon size={14} /> {eventCostLabel(event)}
          </span>
          <span className="ui-chip ui-chip-muted">
            <ParticipationIcon size={14} /> Rewards TBC
          </span>
          {isRatingRelevant(event) ? (
            <span className="ui-chip ui-chip-navy">
              <RatingIcon size={14} /> Rating relevant
            </span>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[auto_1fr] lg:items-end">
          <Link className="btn-secondary w-full lg:w-auto" href={`/dashboard/events/${event.id}`}>
            View Event
          </Link>

          {profiles.length === 0 ? (
            <Link className="inline-flex justify-center rounded bg-court-blue px-4 py-3 text-sm font-bold text-white" href="/dashboard/profile">
              Create profile to enter
            </Link>
          ) : isFull ? (
            <p className="rounded bg-slate-50 px-3 py-3 text-sm font-bold text-slate-600">Entries are full.</p>
          ) : availableProfiles.length === 0 ? (
            <p className="rounded bg-emerald-50 px-3 py-3 text-sm font-bold text-emerald-700">All linked profiles are entered.</p>
          ) : (
            <form action={enterDashboardEvent} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input name="eventId" type="hidden" value={event.id} />
              <input name="returnTo" type="hidden" value={returnTo} />
              <label className="sr-only" htmlFor={`profile-${event.id}`}>
                Player
              </label>
              <select className="w-full rounded border border-slate-300 px-3 py-3 text-sm font-semibold text-court-navy focus-ring" id={`profile-${event.id}`} name="profileId" required>
                {availableProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profileSelectLabel(profile, event)}
                  </option>
                ))}
              </select>
              <button className="rounded bg-court-teal px-4 py-3 text-sm font-black text-white transition hover:bg-teal-500" type="submit">
                Enter
              </button>
            </form>
          )}
        </div>
      </div>
    </article>
  );
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
  const activeEntriesByEvent = new Map<string, CurrentEntry[]>();
  currentEntries.forEach((entry) => {
    if (entry.entry_status !== "cancelled") {
      const entries = activeEntriesByEvent.get(entry.event_id) ?? [];
      entries.push(entry);
      activeEntriesByEvent.set(entry.event_id, entries);
    }
  });

  const activeView = EVENT_VIEWS.some((view) => view.id === searchParams?.view) ? searchParams?.view ?? "recommended" : "recommended";
  const activeFilter = EVENT_FILTERS.some((filter) => filter.id === searchParams?.filter) ? searchParams?.filter ?? "all" : "all";
  const activeProfile = profiles.find((profile) => profile.id === searchParams?.profileId) ?? null;
  const recommendedProfile =
    activeProfile ??
    profiles.find((profile) => upcomingEvents.some((event) => eventMatchesProfile(event, profile))) ??
    profiles[0] ??
    null;
  const recommendedEvent = recommendedProfile ? upcomingEvents.find((event) => eventMatchesProfile(event, recommendedProfile)) ?? null : null;
  const spotlightEvent = recommendedEvent ?? upcomingEvents[0] ?? null;
  const spotlightLabel = recommendedEvent && recommendedProfile ? `Recommended for ${recommendedProfile.first_name}` : "Next Upcoming Event";
  const baseEvents = activeProfile ? upcomingEvents.filter((event) => eventMatchesProfile(event, activeProfile)) : upcomingEvents;
  const categoryEvents = baseEvents.filter((event) => filterMatches(event, activeFilter));
  const visibleSpotlightEvent = spotlightEvent && categoryEvents.some((event) => event.id === spotlightEvent.id) ? spotlightEvent : null;
  const visibleCurrentEntries = activeProfile ? currentEntries.filter((entry) => entry.profile_id === activeProfile.id) : currentEntries;
  const activeEntryEventIds = new Set(visibleCurrentEntries.filter((entry) => entry.entry_status !== "cancelled").map((entry) => entry.event_id));
  const entryEvents = categoryEvents.filter((event) => activeEntryEventIds.has(event.id));
  const filteredEvents = (() => {
    if (activeView === "recommended") {
      return visibleSpotlightEvent ? [visibleSpotlightEvent] : [];
    }

    if (activeView === "entries") {
      return entryEvents;
    }

    return categoryEvents;
  })();
  const returnTo = dashboardEventsHref({ filter: activeFilter, profileId: activeProfile?.id, view: activeView });
  const message = errorMessage(searchParams?.error);
  const listEyebrow = activeView === "recommended" ? "Recommended" : activeView === "entries" ? "My Entries" : activeView === "current" ? "Current" : "Upcoming";
  const listTitle =
    activeView === "recommended"
      ? "Best fit now"
      : activeView === "entries"
        ? "Recent event entries"
        : activeView === "current"
          ? "Open events"
          : "Upcoming events";
  const emptyTitle =
    activeView === "recommended"
      ? "No recommended events yet"
      : activeView === "entries"
        ? "No entries yet"
        : activeView === "current"
          ? "No current events open"
          : "No upcoming events yet";
  const emptyText =
    activeView === "recommended"
      ? "Try Upcoming or switch player. New recommendations will appear when suitable events open."
      : activeView === "entries"
        ? "Choose an open event to enter yourself or a linked player."
        : "Try another player or quick filter. New events will appear here when entries open.";

  return (
    <PageShell eyebrow="Events" subtitle="Find matchplay, competitions and events suited to your players." title="Events">
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

      <section className="surface-card mb-4 p-4 sm:p-5">
        <div className="grid gap-4">
          {profiles.length > 0 ? (
            <div>
              <p className="section-kicker">Player</p>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                <Link
                  className={`shrink-0 rounded border px-3 py-2 text-sm font-black ${
                    activeProfile ? "border-slate-200 bg-white text-court-navy" : "border-court-teal bg-court-mist text-court-navy"
                  }`}
                  href={dashboardEventsHref({ filter: activeFilter, view: activeView })}
                >
                  All players
                </Link>
                {profiles.map((profile) => (
                  <Link
                    className={`shrink-0 rounded border px-3 py-2 text-sm font-black ${
                      activeProfile?.id === profile.id ? "border-court-teal bg-court-mist text-court-navy" : "border-slate-200 bg-white text-court-navy"
                    }`}
                    href={dashboardEventsHref({ filter: activeFilter, profileId: profile.id, view: activeView })}
                    key={profile.id}
                  >
                    {profileChipLabel(profile)}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <p className="section-kicker">View</p>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {EVENT_VIEWS.map((view) => (
                  <Link
                    className={`shrink-0 rounded px-3 py-2 text-sm font-black ${
                      activeView === view.id ? "bg-court-navy text-white" : "bg-slate-100 text-court-navy hover:bg-court-mist"
                    }`}
                    href={dashboardEventsHref({ filter: activeFilter, profileId: activeProfile?.id, view: view.id })}
                    key={view.id}
                  >
                    {view.label}
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <p className="section-kicker">Quick Filters</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {PRIMARY_EVENT_FILTERS.map((filter) => (
                  <Link
                    className={`rounded px-3 py-2 text-sm font-black ${
                      activeFilter === filter.id ? "bg-court-teal text-white" : "bg-slate-100 text-court-navy hover:bg-court-mist"
                    }`}
                    href={dashboardEventsHref({ filter: filter.id, profileId: activeProfile?.id, view: activeView })}
                    key={filter.id}
                  >
                    {filter.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mb-4">
        <CollapsibleCard
          defaultOpen={MORE_EVENT_FILTERS.some((filter) => filter.id === activeFilter)}
          summary="Adult/open, club, school and district filters."
          title="More Filters"
        >
          <div className="flex flex-wrap gap-2">
            {MORE_EVENT_FILTERS.map((filter) => (
              <Link
                className={`rounded px-3 py-2 text-sm font-black ${
                  activeFilter === filter.id ? "bg-court-teal text-white" : "bg-slate-100 text-court-navy hover:bg-court-mist"
                }`}
                href={dashboardEventsHref({ filter: filter.id, profileId: activeProfile?.id, view: activeView })}
                key={filter.id}
              >
                {filter.label}
              </Link>
            ))}
          </div>
        </CollapsibleCard>
      </div>

      {activeView !== "entries" && visibleSpotlightEvent ? <SpotlightEventCard event={visibleSpotlightEvent} label={spotlightLabel} profile={recommendedEvent ? recommendedProfile : null} /> : null}

      {eventsError ? <p className="mb-5 rounded bg-amber-50 p-4 text-sm text-amber-900">Events could not be loaded right now.</p> : null}

      <section>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-kicker">{listEyebrow}</p>
            <h2 className="text-2xl font-black text-court-navy">{listTitle}</h2>
          </div>
          <p className="text-sm font-bold text-slate-600">{activeView === "entries" ? visibleCurrentEntries.length : filteredEvents.length} showing</p>
        </div>

        {activeView === "entries" && visibleCurrentEntries.length > 0 ? (
          <>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {visibleCurrentEntries.slice(0, 6).map((entry) => {
                const canWithdraw = entry.entry_status !== "cancelled" && entry.events?.start_datetime && new Date(entry.events.start_datetime).getTime() > Date.now();

                return (
                  <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={entry.id}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <Link className="font-black text-court-navy hover:text-court-blue" href={`/dashboard/events/${entry.event_id}`}>
                          {entry.events?.title ?? "Event unavailable"}
                        </Link>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-court-navy">
                          <span className="inline-flex items-center gap-1.5 rounded bg-court-mist px-2.5 py-1">
                            <EntriesIcon size={14} /> {entryPlayerLabel(entry)}
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded bg-slate-100 px-2.5 py-1">
                            <EventIcon size={14} /> {entry.events?.start_datetime ? formatDate(entry.events.start_datetime) : "Date TBC"}
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded bg-slate-100 px-2.5 py-1">
                            <CostIcon size={14} /> {formatLabel(entry.payment_status)}
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded bg-slate-100 px-2.5 py-1">
                            <TicketIcon size={14} /> {formatLabel(entry.entry_status)}
                          </span>
                        </div>
                        {entry.payment_notes ? <p className="mt-2 text-xs font-semibold text-slate-500">{entry.payment_notes}</p> : null}
                      </div>
                      {canWithdraw ? (
                        <form action={withdrawDashboardEventEntry}>
                          <input name="entryId" type="hidden" value={entry.id} />
                          <input name="returnTo" type="hidden" value={returnTo} />
                          <button className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-court-navy" type="submit">
                            Withdraw
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
            <Link className="mt-4 inline-flex font-bold text-court-blue" href="/dashboard/my-entries">
              View full history
            </Link>
          </>
        ) : activeView !== "entries" && filteredEvents.length > 0 ? (
          <div className="mt-5 grid gap-4">
            {filteredEvents.map((event) => (
              <EventCard activeEntries={activeEntriesByEvent.get(event.id) ?? []} event={event} key={event.id} profiles={profiles} returnTo={returnTo} />
            ))}
          </div>
        ) : (
          <div className="empty-state mt-5">
            <h3 className="text-lg font-black text-court-navy">{emptyTitle}</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">{emptyText}</p>
          </div>
        )}
      </section>

      {(closedEventData ?? []).length > 0 ? (
        <section className="mt-8">
          <h2 className="text-xl font-black text-court-navy">Past or closed events</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {(closedEventData ?? []).map((event) => (
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm" key={event.id}>
                <p className="font-bold text-court-ink">{event.title}</p>
                <p className="mt-1 text-slate-600">
                  {formatDate(event.start_datetime)} / {event.status === "completed" ? "Closed" : formatLabel(event.status)}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </PageShell>
  );
}
