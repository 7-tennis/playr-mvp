import Link from "next/link";
import { CollapsibleCard } from "@/components/collapsible-card";
import { PageShell } from "@/components/page-shell";
import { ArrowRightIcon, BookingIcon, ChevronDownIcon, EntriesIcon, StatusIcon, TimeIcon } from "@/components/playr-icons";
import { StatusAlert } from "@/components/status-alert";
import { formatDateTime, formatLabel } from "@/lib/courtside-format";
import {
  coachLessonStatuses,
  coachLessonTypes,
  lessonStatusTone,
  loadCoachLessonOptions,
  loadCoachLessonsForRange,
  profileDisplayName,
  type CoachLessonProfile,
  type CoachLessonWithRelations
} from "@/lib/coach-lessons";
import { canAccessHeadCoach } from "@/lib/permissions";
import { cancelCoachLesson, createCoachLesson, updateCoachLesson } from "../actions";
import { CoachRNav, CoachRRoleSummary, getProtectedCoachRPage } from "../coachr-shared";

export const dynamic = "force-dynamic";

type CoachRSchedulePageProps = {
  searchParams?: {
    coach?: string;
    lesson?: string;
    lesson_error?: string;
    new?: string;
    week?: string;
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;
const SCHEDULE_TZ = "Africa/Johannesburg";
const LOCAL_UTC_OFFSET_MS = 2 * 60 * 60 * 1000;

function statusMessage(value?: string) {
  switch (value) {
    case "created":
      return "Lesson created.";
    case "updated":
      return "Lesson updated.";
    case "cancelled":
      return "Lesson cancelled.";
    default:
      return null;
  }
}

function errorMessage(value?: string) {
  if (value?.startsWith("court_conflict:")) {
    const courtName = value.split(":").slice(1).join(":") || "Selected court";
    return `${courtName} is already booked at this time.`;
  }

  switch (value) {
    case "missing_fields":
      return "Choose a venue, coach, player, court, start time and end time.";
    case "missing_court":
      return "Choose a court so PlayR can reserve it for this lesson.";
    case "time_order":
      return "Lesson end time must be after the start time.";
    case "court_conflict":
      return "The selected court is already booked at this time.";
    case "coach_conflict":
      return "This coach already has another lesson at this time.";
    case "court_venue":
      return "That court is not linked to the selected venue.";
    case "coach_venue":
      return "Choose a coach linked to the selected venue.";
    case "player_profile":
      return "Choose a player profile that is available to your CoachR role.";
    case "access":
      return "Your role cannot manage that lesson scope.";
    case "create_failed":
      return "Lesson could not be created.";
    case "update_failed":
      return "Lesson could not be updated.";
    case "cancel_failed":
      return "Lesson could not be cancelled.";
    case "invalid_lesson":
      return "That lesson could not be found.";
    default:
      return null;
  }
}

function localDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: SCHEDULE_TZ,
    year: "numeric"
  }).formatToParts(date);

  return {
    day: Number(parts.find((part) => part.type === "day")?.value ?? "1"),
    month: Number(parts.find((part) => part.type === "month")?.value ?? "1"),
    year: Number(parts.find((part) => part.type === "year")?.value ?? "1970")
  };
}

function localDateSerial(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = localDateParts(date);
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

function dateParamSerial(value?: string) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function weekStartSerial(serial: number) {
  const day = new Date(serial).getUTCDay();
  return serial - ((day + 6) % 7) * DAY_MS;
}

function serialDateInput(serial: number) {
  return new Date(serial).toISOString().slice(0, 10);
}

function serialDateLabel(serial: number, weekday: "long" | "short" = "short") {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    weekday
  }).format(new Date(serial));
}

function weekRangeLabel(startSerial: number) {
  const endSerial = startSerial + 6 * DAY_MS;
  return `${serialDateLabel(startSerial)} - ${serialDateLabel(endSerial)}`;
}

function rangeBoundaryIso(serial: number) {
  return new Date(serial - LOCAL_UTC_OFFSET_MS).toISOString();
}

function scheduleHref(weekSerial: number, coachId?: string, expandCreate = false) {
  const params = new URLSearchParams({ week: serialDateInput(weekSerial) });

  if (coachId) {
    params.set("coach", coachId);
  }
  if (expandCreate) {
    params.set("new", "1");
  }

  return `/dashboard/coachr/schedule?${params.toString()}${expandCreate ? "#new-lesson" : ""}`;
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: SCHEDULE_TZ
  }).format(new Date(value));
}

function dateTimeLocalValue(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: SCHEDULE_TZ,
    year: "numeric"
  }).formatToParts(new Date(value));

  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function dateTimeLocalFromSerial(serial: number, hour: number) {
  return `${serialDateInput(serial)}T${String(hour).padStart(2, "0")}:00`;
}

function isProfile(profile: CoachLessonProfile | null): profile is CoachLessonProfile {
  return Boolean(profile);
}

function mergeProfiles(primary: CoachLessonProfile[], lessons: CoachLessonWithRelations[]) {
  const profiles = new Map<string, CoachLessonProfile>();

  for (const profile of primary) {
    profiles.set(profile.id, profile);
  }
  for (const lesson of lessons) {
    if (lesson.player) {
      profiles.set(lesson.player.id, lesson.player);
    }
  }

  return Array.from(profiles.values()).sort((a, b) => profileDisplayName(a).localeCompare(profileDisplayName(b)));
}

function LessonCard({
  courts,
  lesson,
  playerOptions,
  returnTo,
  showCoach
}: {
  courts: { id: string; name: string; venue_id: string | null }[];
  lesson: CoachLessonWithRelations;
  playerOptions: CoachLessonProfile[];
  returnTo: string;
  showCoach: boolean;
}) {
  return (
    <details className="ui-collapsible overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer items-start justify-between gap-3 p-3">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate font-black text-court-navy">{profileDisplayName(lesson.player)}</span>
            <span className={`ui-chip ${lessonStatusTone(lesson.status)}`}>{formatLabel(lesson.status)}</span>
          </span>
          <span className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
            <span className="ui-chip ui-chip-muted">
              <TimeIcon size={13} /> {timeLabel(lesson.start_time)} - {timeLabel(lesson.end_time)}
            </span>
            <span className="ui-chip ui-chip-brand">{formatLabel(lesson.lesson_type)}</span>
            <span className="ui-chip ui-chip-muted">{lesson.court?.name ?? "Court TBC"}</span>
          </span>
        </span>
        <span className="ui-collapsible-chevron grid h-8 w-8 shrink-0 place-items-center rounded bg-court-mist text-court-teal">
          <ChevronDownIcon size={16} />
        </span>
      </summary>
      <div className="border-t border-slate-100 p-3">
        <div className="mb-4 grid gap-2 text-sm text-slate-600">
          <p>
            <span className="font-black text-court-navy">{lesson.title}</span>
          </p>
          <p>{formatDateTime(lesson.start_time)}</p>
          <p>
            Coach: {profileDisplayName(lesson.coach)}
            {showCoach && lesson.venue?.name ? ` | ${lesson.venue.name}` : ""}
          </p>
          <p className="flex flex-wrap gap-2">
            <span className="ui-chip ui-chip-muted">
              <BookingIcon size={13} /> Booking {lesson.court_booking?.status ? formatLabel(lesson.court_booking.status) : "Not linked yet"}
            </span>
            <span className="ui-chip ui-chip-brand">Court reserved when confirmed</span>
          </p>
          {lesson.notes ? <p className="rounded bg-slate-50 p-3 font-medium">{lesson.notes}</p> : null}
        </div>

        <form action={updateCoachLesson} className="grid gap-3">
          <input name="returnTo" type="hidden" value={returnTo} />
          <input name="lessonId" type="hidden" value={lesson.id} />
          <input name="title" type="hidden" value={lesson.title} />

          <label className="text-sm font-semibold text-slate-700">
            Player
            <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={lesson.player_id} name="playerId" required>
              {playerOptions.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profileDisplayName(profile)}
                  {profile.is_junior ? " (junior)" : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">
              Start
              <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={dateTimeLocalValue(lesson.start_time)} name="startTime" required type="datetime-local" />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              End
              <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={dateTimeLocalValue(lesson.end_time)} name="endTime" required type="datetime-local" />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-semibold text-slate-700">
              Court
              <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={lesson.court_id ?? ""} name="courtId" required>
                <option value="">Choose court</option>
                {courts.map((court) => (
                  <option key={court.id} value={court.id}>
                    {court.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Type
              <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={lesson.lesson_type} name="lessonType">
                {coachLessonTypes.map((type) => (
                  <option key={type} value={type}>
                    {formatLabel(type)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Status
              <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={lesson.status} name="status">
                {coachLessonStatuses.map((status) => (
                  <option key={status} value={status}>
                    {formatLabel(status)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="text-sm font-semibold text-slate-700">
            Notes
            <textarea className="mt-2 min-h-20 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={lesson.notes ?? ""} name="notes" placeholder="Optional lesson notes" />
          </label>

          <button className="btn-primary" type="submit">
            Save Changes
          </button>
        </form>

        {lesson.status === "scheduled" ? (
          <form action={cancelCoachLesson} className="mt-3 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:flex-row">
            <input name="returnTo" type="hidden" value={returnTo} />
            <input name="lessonId" type="hidden" value={lesson.id} />
            <select className="rounded border border-amber-300 bg-white px-3 py-2 text-sm font-semibold focus-ring" name="cancelStatus">
              <option value="cancelled">Cancelled</option>
              <option value="rain">Rain</option>
              <option value="sick">Sick</option>
            </select>
            <button className="rounded bg-amber-600 px-3 py-2 text-sm font-black text-white transition hover:bg-amber-700" type="submit">
              Cancel Lesson
            </button>
          </form>
        ) : null}
      </div>
    </details>
  );
}

export default async function CoachRSchedulePage({ searchParams }: CoachRSchedulePageProps) {
  const { access, content } = await getProtectedCoachRPage("coachr:schedule");

  if (content) {
    return content;
  }

  if (access.context.kind !== "authenticated") {
    return null;
  }

  const coachOnly = access.context.role === "coach";
  const selectedDateSerial = dateParamSerial(searchParams?.week) ?? localDateSerial(new Date());
  const selectedWeekStart = weekStartSerial(selectedDateSerial);
  const selectedWeekEnd = selectedWeekStart + 7 * DAY_MS;
  const todaySerial = localDateSerial(new Date());
  const [lessons, options] = await Promise.all([
    loadCoachLessonsForRange(access.context, rangeBoundaryIso(selectedWeekStart), rangeBoundaryIso(selectedWeekEnd)),
    loadCoachLessonOptions(access.context)
  ]);
  const canFilterByCoach = !coachOnly && options.coachProfiles.length > 0;
  const requestedCoachId = searchParams?.coach ?? "";
  const selectedCoachId = canFilterByCoach && options.coachProfiles.some((profile) => profile.id === requestedCoachId) ? requestedCoachId : "";
  const visibleLessons = selectedCoachId ? lessons.filter((lesson) => lesson.coach_id === selectedCoachId) : lessons;
  const playerOptions = mergeProfiles(options.playerProfiles, visibleLessons);
  const lessonPlayers = visibleLessons.map((lesson) => lesson.player).filter(isProfile).length;
  const returnTo = scheduleHref(selectedWeekStart, selectedCoachId);
  const createHref = scheduleHref(selectedWeekStart, selectedCoachId, true);
  const defaultVenueId = access.context.venueId ?? options.venues[0]?.id ?? "";
  const defaultCoachId = coachOnly ? access.context.adultProfileId ?? "" : selectedCoachId || options.coachProfiles[0]?.id || access.context.adultProfileId || "";
  const defaultCreateSerial = todaySerial >= selectedWeekStart && todaySerial < selectedWeekEnd ? todaySerial : selectedWeekStart;
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const serial = selectedWeekStart + index * DAY_MS;
    const dayLessons = visibleLessons
      .filter((lesson) => localDateSerial(lesson.start_time) === serial)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    return { dayLessons, serial };
  });

  return (
    <PageShell eyebrow="CoachR" subtitle="Plan a coaching week, update lessons quickly, and keep every day easy to scan." title="Weekly Schedule">
      <StatusAlert className="mb-5" message={statusMessage(searchParams?.lesson)} tone="success" />
      <StatusAlert className="mb-5" message={errorMessage(searchParams?.lesson_error)} tone="error" />
      <CoachRNav canUseHeadCoach={canAccessHeadCoach(access.context.role)} />
      <CoachRRoleSummary context={access.context} />

      <section className="mb-5 overflow-hidden rounded-lg bg-court-navy text-white shadow-court">
        <div className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-court-lime">{coachOnly ? "My schedule" : "Venue schedule"}</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{weekRangeLabel(selectedWeekStart)}</h2>
            <p className="mt-2 text-sm font-semibold text-white/75">
              {visibleLessons.length} lessons this week
              {lessonPlayers > 0 ? ` | ${lessonPlayers} student sessions` : ""}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link className="inline-flex items-center justify-center gap-2 rounded border border-white/20 px-4 py-3 text-sm font-black text-white transition hover:bg-white/10" href={scheduleHref(selectedWeekStart - 7 * DAY_MS, selectedCoachId)}>
              Previous Week
            </Link>
            <Link className="inline-flex items-center justify-center gap-2 rounded border border-white/20 px-4 py-3 text-sm font-black text-white transition hover:bg-white/10" href={scheduleHref(selectedWeekStart + 7 * DAY_MS, selectedCoachId)}>
              Next Week
            </Link>
            <Link className="inline-flex items-center justify-center gap-2 rounded bg-court-teal px-4 py-3 text-sm font-black text-white transition hover:bg-teal-500" href={createHref}>
              Create Lesson <ArrowRightIcon size={16} />
            </Link>
          </div>
        </div>
      </section>

      {canFilterByCoach ? (
        <form className="surface-card mb-5 grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-end" method="get">
          <input name="week" type="hidden" value={serialDateInput(selectedWeekStart)} />
          <label className="text-sm font-semibold text-slate-700">
            Coach filter
            <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={selectedCoachId} name="coach">
              <option value="">All permitted coaches</option>
              {options.coachProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profileDisplayName(profile)}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-secondary" type="submit">
            Apply Filter
          </button>
        </form>
      ) : null}

      <CollapsibleCard
        defaultOpen={searchParams?.new === "1" || visibleLessons.length === 0}
        eyebrow="Create"
        id="new-lesson"
        summary="Add a lesson to the selected week. Creating it reserves the selected court."
        title="New lesson"
      >
        <form action={createCoachLesson} className="grid gap-3">
          <input name="returnTo" type="hidden" value={returnTo} />

          {access.context.role !== "platform_admin" && access.context.venueId ? (
            <input name="venueId" type="hidden" value={access.context.venueId} />
          ) : (
            <label className="text-sm font-semibold text-slate-700">
              Venue
              <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={defaultVenueId} name="venueId" required>
                <option value="">Choose venue</option>
                {options.venues.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {coachOnly ? (
            <input name="coachId" type="hidden" value={defaultCoachId} />
          ) : options.coachProfiles.length > 0 ? (
            <label className="text-sm font-semibold text-slate-700">
              Coach
              <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={defaultCoachId} name="coachId" required>
                {options.coachProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profileDisplayName(profile)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="text-sm font-semibold text-slate-700">
              Coach profile ID
              <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="coachId" placeholder="Coach profile UUID" required />
            </label>
          )}

          <label className="text-sm font-semibold text-slate-700">
            Player
            {playerOptions.length > 0 ? (
              <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="playerId" required>
                <option value="">Choose player</option>
                {playerOptions.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profileDisplayName(profile)}
                    {profile.is_junior ? " (junior)" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="playerId" placeholder="Player profile UUID" required />
            )}
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">
              Start
              <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={dateTimeLocalFromSerial(defaultCreateSerial, 14)} name="startTime" required type="datetime-local" />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              End
              <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={dateTimeLocalFromSerial(defaultCreateSerial, 15)} name="endTime" required type="datetime-local" />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">
              Type
              <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="lessonType">
                {coachLessonTypes.map((type) => (
                  <option key={type} value={type}>
                    {formatLabel(type)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Court
              <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="courtId" required>
                <option value="">Choose court</option>
                {options.courts.map((court) => (
                  <option key={court.id} value={court.id}>
                    {court.name}
                  </option>
                ))}
              </select>
              <span className="mt-2 block text-xs font-normal leading-5 text-slate-600">
                This court will be reserved as a Coach Lesson and hidden from normal player availability for the lesson time.
              </span>
            </label>
          </div>

          <label className="text-sm font-semibold text-slate-700">
            Title
            <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue="Coaching lesson" name="title" required />
          </label>

          <label className="text-sm font-semibold text-slate-700">
            Notes
            <textarea className="mt-2 min-h-20 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="notes" placeholder="Optional lesson notes" />
          </label>

          <button className="btn-primary" type="submit">
            Create Lesson
          </button>
        </form>
      </CollapsibleCard>

      <section className="mt-5 grid gap-3 xl:grid-cols-7">
        {weekDays.map(({ dayLessons, serial }) => (
          <article className={`rounded-lg border bg-white p-3 shadow-sm ${serial === todaySerial ? "border-court-teal ring-2 ring-court-mist" : "border-slate-200"}`} key={serial}>
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-black text-court-navy">{serialDateLabel(serial, "long")}</p>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{dayLessons.length} lessons</p>
              </div>
              {serial === todaySerial ? <span className="ui-chip ui-chip-brand">Today</span> : null}
            </div>

            {dayLessons.length > 0 ? (
              <div className="grid gap-3">
                {dayLessons.map((lesson) => (
                  <LessonCard
                    courts={options.courts}
                    key={lesson.id}
                    lesson={lesson}
                    playerOptions={playerOptions}
                    returnTo={returnTo}
                    showCoach={!coachOnly}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-500">
                No lessons.
              </div>
            )}
          </article>
        ))}
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-3">
        <Link className="surface-card block p-4 transition hover:-translate-y-0.5 hover:shadow-court" href={returnTo}>
          <span className="grid h-10 w-10 place-items-center rounded bg-court-mist text-court-teal">
            <BookingIcon size={18} />
          </span>
          <h3 className="mt-3 font-black text-court-navy">Weekly Schedule</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">Stay on this planner view.</p>
        </Link>
        <Link className="surface-card block p-4 transition hover:-translate-y-0.5 hover:shadow-court" href="/dashboard/coachr/students">
          <span className="grid h-10 w-10 place-items-center rounded bg-court-mist text-court-teal">
            <EntriesIcon size={18} />
          </span>
          <h3 className="mt-3 font-black text-court-navy">Students</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">Review players linked to lessons.</p>
        </Link>
        <Link className="surface-card block p-4 transition hover:-translate-y-0.5 hover:shadow-court" href="/dashboard/coachr/availability">
          <span className="grid h-10 w-10 place-items-center rounded bg-court-mist text-court-teal">
            <StatusIcon size={18} />
          </span>
          <h3 className="mt-3 font-black text-court-navy">Availability</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">Keep coach availability tidy.</p>
        </Link>
      </section>
    </PageShell>
  );
}
