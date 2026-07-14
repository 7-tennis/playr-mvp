import Link from "next/link";
import { CoachRCourtPicker } from "@/components/coachr-court-picker";
import { CoachRStudentSelector } from "@/components/coachr-student-selector";
import { CollapsibleCard } from "@/components/collapsible-card";
import { ArrowRightIcon, BookingIcon, ChevronDownIcon, EntriesIcon, StatusIcon, TimeIcon } from "@/components/playr-icons";
import { StatusAlert } from "@/components/status-alert";
import { formatDateTime, formatLabel } from "@/lib/courtside-format";
import {
  attendanceResultLabel,
  attendanceResultTone,
  coachLessonAttendanceResults,
  coachLessonStatuses,
  coachLessonTypes,
  hasAttendanceRecorded,
  lessonAttendanceRows,
  lessonStatusTone,
  loadCoachLessonOptions,
  loadCoachLessonsForRange,
  profileDisplayName,
  type CoachLessonAttendanceWithProfile,
  type CoachLessonCourt,
  type CoachLessonExternalVenue,
  type CoachLessonProfile,
  type CoachLessonWithRelations
} from "@/lib/coach-lessons";
import { canManageOrganisationCourtAccess } from "@/lib/organisations";
import type { CoachLessonAttendanceResult } from "@/types/courtside";
import { cancelCoachLesson, createCoachLesson, markCoachLessonAttendance, updateCoachLesson } from "../actions";
import { CoachRCompactGrid, CoachRPageFrame, CoachRRoleSummary, CoachRSummaryCard, getProtectedCoachRPage } from "../coachr-shared";

export const dynamic = "force-dynamic";

type CoachRSchedulePageProps = {
  searchParams?: {
    coach?: string;
    lesson?: string;
    lesson_error?: string;
    new?: string;
    player?: string;
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
    case "series_created":
      return "Weekly lesson series created.";
    case "updated":
      return "Lesson updated.";
    case "series_updated":
      return "Recurring lesson series updated.";
    case "cancelled":
      return "Lesson cancelled.";
    case "series_cancelled":
      return "Recurring lesson series cancelled.";
    case "attendance_marked":
      return "Attendance saved.";
    default:
      return null;
  }
}

function errorMessage(value?: string) {
  if (value?.startsWith("court_conflict:")) {
    const courtName = value.split(":").slice(1).join(":") || "Selected court";
    return `${courtName} is already booked at this time.`;
  }
  if (value?.startsWith("recurrence_conflicts:")) {
    const details = value.split(":").slice(1).join(":").replaceAll("; ", " | ");
    return `Some lessons could not be scheduled: ${details}`;
  }

  switch (value) {
    case "missing_fields":
      return "Complete the venue, coach, player, location and lesson time.";
    case "coach_profile_missing":
      return "Your CoachR profile is not configured yet. Ask your Head Coach to link your user account to a coach profile.";
    case "coach_venue_missing":
      return "Your CoachR profile is not yet linked to a venue. Ask your Head Coach to complete your setup.";
    case "missing_court":
    case "no_active_courts":
      return "Choose a court so PlayR can reserve it for this lesson.";
    case "time_order":
      return "Lesson end time must be after the start time.";
    case "court_conflict":
      return "The selected court is already booked at this time.";
    case "coach_conflict":
      return "This coach already has another lesson at this time.";
    case "recurrence_range":
      return "Choose a weekly recurrence range with at least one matching day and no more than 12 months.";
    case "court_venue":
      return "That court is not linked to the selected venue.";
    case "court_access":
      return "This organisation no longer has access to that court.";
    case "custom_location":
      return "Enter the off-site lesson location.";
    case "external_venue":
      return "Choose an active external venue saved for this academy.";
    case "coach_venue":
      return "Choose a coach linked to the selected venue.";
    case "player_profile":
    case "invalid_student":
      return "Choose a player profile that is available to your CoachR role.";
    case "no_students":
      return "No active academy student was selected. Open Students to connect or assign a player first.";
    case "missing_rpc":
      return "CoachR lesson setup is missing a required database function. Run the latest Supabase migrations.";
    case "access":
      return "Your role cannot manage that lesson scope.";
    case "attendance_confirm":
      return "Confirm the correction before changing a saved attendance result.";
    case "attendance_failed":
      return "Attendance could not be saved.";
    case "attendance_player":
      return "Choose a player linked to this lesson attendance list.";
    case "create_failed":
      return "Lesson could not be created. Check the CoachR setup cards below, then try again.";
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

function recordValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function proposalText(proposal: Record<string, unknown> | null, key: string) {
  const value = proposal?.[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function validDate(value: string, fallback: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function validTime(value: string, fallback: string) {
  return /^\d{2}:\d{2}$/.test(value) ? value : fallback;
}

function addMinutes(time: string, minutes: number) {
  const [hours, minute] = time.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, Math.max(0, hours * 60 + minute + minutes));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function proposedDayOfWeek(value: string, fallback: number) {
  const days = new Map([
    ["monday", 1],
    ["tuesday", 2],
    ["wednesday", 3],
    ["thursday", 4],
    ["friday", 5],
    ["saturday", 6],
    ["sunday", 7]
  ]);
  return days.get(value.trim().toLowerCase()) ?? fallback;
}

function isoDayOfWeek(serial: number) {
  const day = new Date(serial).getUTCDay();
  return day === 0 ? 7 : day;
}

function repeatRuleSummary(rule: string | null) {
  if (!rule?.startsWith("weekly")) {
    return null;
  }

  const details = new Map(
    rule
      .split(";")
      .slice(1)
      .map((part) => {
        const [key, value] = part.split("=");
        return [key, value] as const;
      })
  );
  const start = details.get("start");
  const end = details.get("end");

  return start && end ? `Weekly ${start} to ${end}` : "Weekly";
}

function dayTimeRange(lessons: CoachLessonWithRelations[]) {
  if (lessons.length === 0) {
    return "Open day";
  }

  return `${timeLabel(lessons[0].start_time)} - ${timeLabel(lessons[lessons.length - 1].end_time)}`;
}

function dayStatusSummary(lessons: CoachLessonWithRelations[]) {
  const completed = lessons.filter((lesson) => lesson.status === "completed").length;
  const scheduled = lessons.filter((lesson) => lesson.status === "scheduled").length;
  const changed = lessons.filter((lesson) => lesson.status === "missed" || lesson.status === "cancelled" || lesson.status === "rain" || lesson.status === "sick").length;

  return { changed, completed, scheduled };
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

function setupIssues({
  coachOnly,
  contextAdultProfileId,
  contextVenueId,
  coachCount,
  courtCount,
  playerCount,
  pendingPlayerInvitationCount,
  studentLoadError
}: {
  coachOnly: boolean;
  contextAdultProfileId: string | null;
  contextVenueId: string | null;
  coachCount: number;
  courtCount: number;
  playerCount: number;
  pendingPlayerInvitationCount: number;
  studentLoadError: "missing_organisation" | "load_failed" | null;
}) {
  const issues: { title: string; text: string; tone: "error" | "warning" }[] = [];

  if (coachOnly && !contextAdultProfileId) {
    issues.push({
      title: "Coach profile not configured",
      text: "Your user account is not linked to a coach profile yet. Ask your Head Coach to complete your CoachR setup.",
      tone: "error"
    });
  }
  if (coachOnly && !contextVenueId) {
    issues.push({
      title: "Venue not linked",
      text: "Your CoachR profile is not yet linked to a venue. Ask your Head Coach to complete your setup.",
      tone: "error"
    });
  }
  if (coachCount === 0) {
    issues.push({
      title: "No coach profiles available",
      text: "CoachR could not find a coach/head-coach profile in this permitted venue.",
      tone: "error"
    });
  }
  if (courtCount === 0) {
    issues.push({
      title: "No managed courts available",
      text: "Ask an authorised manager to configure court access, or use a clear off-site location.",
      tone: "warning"
    });
  }
  if (studentLoadError === "load_failed") {
    issues.push({
      title: "Students could not be loaded",
      text: "Check the active organisation or try again. This is a loading problem, not an empty academy.",
      tone: "error"
    });
  } else if (playerCount === 0) {
    issues.push({
      title: coachOnly ? "No assigned students" : "No connected students",
      text: coachOnly
        ? "A Head Coach can assign an active academy student to this coach."
        : pendingPlayerInvitationCount > 0
          ? "Student invitations are awaiting approval. Lessons can be created once a player connection is accepted."
          : "Invite a student or request access to an existing PlayR profile. Lessons can be created after approval.",
      tone: "warning"
    });
  }

  return issues;
}

type AttendanceRosterItem = {
  playerId: string;
  name: string;
  isJunior: boolean;
  attendance: CoachLessonAttendanceWithProfile | null;
};

function isGroupAttendanceLesson(lesson: CoachLessonWithRelations) {
  return lesson.lesson_type === "group" || lesson.lesson_type === "squad";
}

function attendanceRoster(lesson: CoachLessonWithRelations) {
  const roster = new Map<string, AttendanceRosterItem>();

  for (const row of lessonAttendanceRows(lesson)) {
    roster.set(row.player_profile_id, {
      attendance: row,
      isJunior: Boolean(row.player?.is_junior ?? row.junior?.is_junior),
      name: profileDisplayName(row.player ?? row.junior),
      playerId: row.player_profile_id
    });
  }

  if (lesson.player_id && !roster.has(lesson.player_id)) {
    roster.set(lesson.player_id, {
      attendance: null,
      isJunior: Boolean(lesson.player?.is_junior),
      name: profileDisplayName(lesson.player),
      playerId: lesson.player_id
    });
  }

  return Array.from(roster.values()).sort((left, right) => left.name.localeCompare(right.name));
}

function attendanceSummary(lesson: CoachLessonWithRelations) {
  const rows = lessonAttendanceRows(lesson);

  if (rows.length === 0) {
    if (lesson.status === "scheduled") {
      return "Attendance not marked";
    }

    return formatLabel(lesson.status);
  }

  const counts = new Map<CoachLessonAttendanceResult, number>();
  for (const row of rows) {
    counts.set(row.attendance_status, (counts.get(row.attendance_status) ?? 0) + 1);
  }

  if (counts.size === 1) {
    return attendanceResultLabel(rows[0].attendance_status);
  }

  return Array.from(counts.entries())
    .map(([status, count]) => `${count} ${attendanceResultLabel(status).toLowerCase()}`)
    .join(" / ");
}

function latestAttendanceRecordedAt(lesson: CoachLessonWithRelations) {
  return lessonAttendanceRows(lesson)
    .map((row) => row.recorded_at)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
}

function AttendanceButtons({
  attendance,
  lesson,
  playerId,
  returnTo
}: {
  attendance: CoachLessonAttendanceWithProfile | null;
  lesson: CoachLessonWithRelations;
  playerId: string;
  returnTo: string;
}) {
  const recorded = Boolean(attendance);

  return (
    <form action={markCoachLessonAttendance} className="mt-3 grid gap-3">
      <input name="returnTo" type="hidden" value={returnTo} />
      <input name="lessonId" type="hidden" value={lesson.id} />
      <input name="playerId" type="hidden" value={playerId} />
      {recorded ? (
        <label className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-800">
          <input className="mt-1" name="confirmCorrection" type="checkbox" />
          Confirm attendance correction
        </label>
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {coachLessonAttendanceResults.map((status) => {
          const active = attendance?.attendance_status === status;
          return (
            <button
              className={`rounded px-3 py-3 text-sm font-black transition ${
                active ? "bg-court-navy text-white" : "border border-slate-200 bg-white text-court-navy hover:border-court-teal hover:text-court-teal"
              }`}
              key={status}
              name="attendanceStatus"
              type="submit"
              value={status}
            >
              {attendanceResultLabel(status)}
            </button>
          );
        })}
      </div>
    </form>
  );
}

function LessonCard({
  canManageCourtAccess,
  courts,
  externalVenues,
  lesson,
  organisationId,
  playerOptions,
  returnTo,
  showCoach
}: {
  canManageCourtAccess: boolean;
  courts: CoachLessonCourt[];
  externalVenues: CoachLessonExternalVenue[];
  lesson: CoachLessonWithRelations;
  organisationId: string;
  playerOptions: CoachLessonProfile[];
  returnTo: string;
  showCoach: boolean;
}) {
  const seriesSummary = repeatRuleSummary(lesson.repeat_rule);
  const isRecurring = Boolean(lesson.recurring_group_id);
  const roster = attendanceRoster(lesson);
  const groupAttendance = isGroupAttendanceLesson(lesson);
  const recordedAt = latestAttendanceRecordedAt(lesson);
  const attendanceMarked = hasAttendanceRecorded(lesson);
  const rosterPlayerIds = new Set(roster.map((item) => item.playerId));
  const groupPlayerOptions = groupAttendance ? playerOptions.filter((profile) => !rosterPlayerIds.has(profile.id)) : [];

  return (
    <details className="ui-collapsible overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer items-start justify-between gap-3 p-3">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate font-black text-court-navy">{profileDisplayName(lesson.player)}</span>
            <span className={`ui-chip ${lessonStatusTone(lesson.status)}`}>{formatLabel(lesson.status)}</span>
            {isRecurring ? <span className="ui-chip ui-chip-navy">Weekly</span> : null}
          </span>
          <span className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
            <span className="ui-chip ui-chip-muted">
              <TimeIcon size={13} /> {timeLabel(lesson.start_time)} - {timeLabel(lesson.end_time)}
            </span>
            <span className="ui-chip ui-chip-brand">{formatLabel(lesson.lesson_type)}</span>
            <span className={`ui-chip ${attendanceMarked ? "ui-chip-success" : "ui-chip-muted"}`}>{attendanceSummary(lesson)}</span>
            <span className="ui-chip ui-chip-muted">{lesson.external_venue ? `${lesson.external_venue.name} · External` : lesson.location_type === "custom" ? lesson.custom_location ?? "Off-site" : lesson.location_type === "none" ? "No court" : lesson.court ? `${lesson.court.owner?.name ? `${lesson.court.owner.name} — ` : ""}${lesson.court.name}` : "Court TBC"}</span>
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
          {seriesSummary ? <p className="font-bold text-court-teal">{seriesSummary}</p> : null}
          <p className="flex flex-wrap gap-2">
            <span className="ui-chip ui-chip-muted">
              <BookingIcon size={13} /> Booking {lesson.court_booking?.status ? formatLabel(lesson.court_booking.status) : "Not linked yet"}
            </span>
            <span className="ui-chip ui-chip-brand">{lesson.location_type === "managed_court" ? "Court reserved when confirmed" : "No managed court booking"}</span>
          </p>
          {lesson.notes ? <p className="rounded bg-slate-50 p-3 font-medium">{lesson.notes}</p> : null}
        </div>

        <section className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-black text-court-navy">Attendance</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
                {recordedAt ? `Recorded ${formatDateTime(recordedAt)}` : "Mark this lesson occurrence only."}
              </p>
            </div>
            {groupAttendance ? (
              <form action={markCoachLessonAttendance} className="grid gap-2">
                <input name="returnTo" type="hidden" value={returnTo} />
                <input name="lessonId" type="hidden" value={lesson.id} />
                <input name="markAll" type="hidden" value="true" />
                <input name="attendanceStatus" type="hidden" value="attended" />
                {attendanceMarked ? (
                  <label className="flex items-center gap-2 text-xs font-semibold text-amber-800">
                    <input name="confirmCorrection" type="checkbox" />
                    Confirm correction
                  </label>
                ) : null}
                <button className="rounded bg-court-teal px-3 py-2 text-sm font-black text-white transition hover:bg-teal-500" type="submit">
                  Mark All Attended
                </button>
              </form>
            ) : null}
          </div>

          <div className="mt-3 grid gap-3">
            {roster.map((item) => (
              <article className="rounded-lg border border-slate-200 bg-white p-3" key={item.playerId}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black text-court-navy">{item.name}</p>
                      <span className="ui-chip ui-chip-muted">{item.isJunior ? "Junior" : "Player"}</span>
                      {item.attendance ? (
                        <span className={`ui-chip ${attendanceResultTone(item.attendance.attendance_status)}`}>
                          {attendanceResultLabel(item.attendance.attendance_status)}
                        </span>
                      ) : (
                        <span className="ui-chip ui-chip-muted">Not marked</span>
                      )}
                    </div>
                    {item.attendance?.recorded_at ? (
                      <p className="mt-1 text-xs font-semibold text-slate-500">Recorded {formatDateTime(item.attendance.recorded_at)}</p>
                    ) : null}
                  </div>
                </div>
                <AttendanceButtons attendance={item.attendance} lesson={lesson} playerId={item.playerId} returnTo={returnTo} />
              </article>
            ))}
          </div>

          {groupPlayerOptions.length > 0 ? (
            <form action={markCoachLessonAttendance} className="mt-3 grid gap-2 rounded-lg border border-dashed border-slate-300 bg-white p-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <input name="returnTo" type="hidden" value={returnTo} />
              <input name="lessonId" type="hidden" value={lesson.id} />
              <label className="text-sm font-semibold text-slate-700">
                Add group player
                <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="playerId" required>
                  <option value="">Choose player</option>
                  {groupPlayerOptions.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profileDisplayName(profile)}
                      {profile.is_junior ? " (junior)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Result
                <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue="attended" name="attendanceStatus">
                  {coachLessonAttendanceResults.map((status) => (
                    <option key={status} value={status}>
                      {attendanceResultLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
              <button className="rounded bg-court-navy px-3 py-2 text-sm font-black text-white transition hover:bg-court-blue" type="submit">
                Add Attendance
              </button>
            </form>
          ) : null}
        </section>

        <form action={updateCoachLesson} className="grid gap-3">
          <input name="returnTo" type="hidden" value={returnTo} />
          <input name="lessonId" type="hidden" value={lesson.id} />
          <input name="title" type="hidden" value={lesson.title} />
          {isRecurring ? (
            <label className="text-sm font-semibold text-slate-700">
              Apply changes to
              <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue="single" name="editScope">
                <option value="single">This lesson only</option>
                <option value="future">This and future lessons</option>
                <option value="series">Entire series</option>
              </select>
              <span className="mt-2 block text-xs font-normal leading-5 text-slate-600">
                Series edits only affect scheduled lessons. Completed and historical records stay unchanged.
              </span>
            </label>
          ) : (
            <input name="editScope" type="hidden" value="single" />
          )}

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

          <div className="grid gap-3 sm:grid-cols-2">
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

          <CoachRCourtPicker
            canManageAccess={canManageCourtAccess}
            courts={courts}
            defaultCourtId={lesson.court_id ?? ""}
            defaultCustomLocation={lesson.custom_location ?? ""}
            defaultExternalVenueId={lesson.external_venue_id ?? ""}
            defaultLocationType={lesson.location_type ?? (lesson.court_id ? "managed_court" : "none")}
            excludeLessonId={lesson.id}
            externalVenues={externalVenues}
            organisationId={organisationId}
          />

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
            {isRecurring ? (
              <select className="rounded border border-amber-300 bg-white px-3 py-2 text-sm font-semibold focus-ring" defaultValue="single" name="cancelScope">
                <option value="single">This lesson only</option>
                <option value="future">This and future lessons</option>
                <option value="series">Entire series</option>
              </select>
            ) : (
              <input name="cancelScope" type="hidden" value="single" />
            )}
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
  const requestedPlayerId = searchParams?.player ?? "";
  const selectedStudent = options.studentOptions.find((student) => student.profile.id === requestedPlayerId) ?? null;
  const visibleLessons = selectedCoachId ? lessons.filter((lesson) => lesson.coach_id === selectedCoachId) : lessons;
  const playerOptions = mergeProfiles(options.playerProfiles, visibleLessons);
  const lessonPlayers = visibleLessons.map((lesson) => lesson.player).filter(isProfile).length;
  const setupCards = setupIssues({
    coachCount: options.coachProfiles.length,
    coachOnly,
    contextAdultProfileId: access.context.adultProfileId,
    contextVenueId: access.context.venueId,
    courtCount: options.courts.length,
    pendingPlayerInvitationCount: options.pendingPlayerInvitationCount,
    playerCount: options.studentOptions.length,
    studentLoadError: options.studentLoadError
  });
  const returnTo = scheduleHref(selectedWeekStart, selectedCoachId);
  const createHref = scheduleHref(selectedWeekStart, selectedCoachId, true);
  const defaultVenueId = access.context.venueId ?? access.context.activeOrganisationMembership?.venue_id ?? options.venues[0]?.id ?? "";
  const canManageCourtAccess = access.context.role === "platform_admin" || canManageOrganisationCourtAccess(access.context.activeOrganisationRole);
  const defaultCreateSerial = todaySerial >= selectedWeekStart && todaySerial < selectedWeekEnd ? todaySerial : selectedWeekStart;
  const proposal = recordValue(selectedStudent?.connectionContext.proposal);
  const proposalCoachId = typeof selectedStudent?.connectionContext.coachProfileId === "string" ? selectedStudent.connectionContext.coachProfileId : "";
  const validProposalCoachId = options.coachProfiles.some((coach) => coach.id === proposalCoachId) ? proposalCoachId : "";
  const assignedStudentCoachId = selectedStudent?.assignedCoachIds.find((coachId) => options.coachProfiles.some((coach) => coach.id === coachId)) ?? "";
  const defaultCoachId = coachOnly
    ? access.context.adultProfileId ?? ""
    : selectedCoachId || validProposalCoachId || assignedStudentCoachId || options.coachProfiles[0]?.id || access.context.adultProfileId || "";
  const defaultPlayerId = selectedStudent?.profile.id ?? "";
  const fallbackCreateDate = serialDateInput(defaultCreateSerial);
  const proposalStartDate = validDate(proposalText(proposal, "startDate"), fallbackCreateDate);
  const defaultRecurrenceEndDate = new Date(Date.parse(`${proposalStartDate}T00:00:00Z`) + 12 * 7 * DAY_MS).toISOString().slice(0, 10);
  const proposalStartTime = validTime(proposalText(proposal, "startTime"), "14:00");
  const proposalDuration = Number.parseInt(proposalText(proposal, "durationMinutes"), 10);
  const proposalEndTime = addMinutes(proposalStartTime, Number.isFinite(proposalDuration) && proposalDuration > 0 ? proposalDuration : 60);
  const defaultDayOfWeek = proposedDayOfWeek(proposalText(proposal, "day"), isoDayOfWeek(defaultCreateSerial));
  const defaultRepeatMode = proposalText(proposal, "recurrence") === "weekly" ? "weekly" : "none";
  const proposedLessonType = coachLessonTypes.includes(proposalText(proposal, "lessonType") as (typeof coachLessonTypes)[number])
    ? proposalText(proposal, "lessonType")
    : "private";
  const studentSelectorOptions = options.studentOptions.map((student) => ({
    context: [
      student.profile.is_junior ? "Junior" : "Adult",
      student.parentName ? `Parent: ${student.parentName}` : null,
      student.assignedCoachNames.length > 0 ? student.assignedCoachNames.join(", ") : "Unassigned",
      "Active"
    ].filter(Boolean).join(" · "),
    id: student.profile.id,
    name: profileDisplayName(student.profile),
    searchText: student.searchText
  }));
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const serial = selectedWeekStart + index * DAY_MS;
    const dayLessons = visibleLessons
      .filter((lesson) => localDateSerial(lesson.start_time) === serial)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    return { dayLessons, serial };
  });
  const selectedTodayCount = visibleLessons.filter((lesson) => localDateSerial(lesson.start_time) === todaySerial).length;
  const missedCount = visibleLessons.filter((lesson) => lesson.status === "missed").length;
  const replacementCount = visibleLessons.filter((lesson) => /replacement|extra|make.?up|catch.?up/i.test(`${lesson.title} ${lesson.notes ?? ""}`)).length;

  return (
    <CoachRPageFrame context={access.context} subtitle="Plan a coaching week, update lessons quickly, and keep every day easy to scan." title="Weekly Schedule">
      <StatusAlert className="mb-5" message={statusMessage(searchParams?.lesson)} tone="success" />
      <StatusAlert className="mb-5" message={errorMessage(searchParams?.lesson_error)} tone="error" />
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
            <Link className="inline-flex items-center justify-center gap-2 rounded border border-white/20 px-4 py-3 text-sm font-black text-white transition hover:bg-white/10" href={scheduleHref(weekStartSerial(todaySerial), selectedCoachId)}>
              Today
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

      <CoachRCompactGrid className="mb-5">
        <CoachRSummaryCard helper="selected day" label="Today" value={selectedTodayCount} />
        <CoachRSummaryCard helper="lesson slots" label="This Week" value={visibleLessons.length} />
        <CoachRSummaryCard helper="player absent" label="Missed" value={missedCount} />
        <CoachRSummaryCard helper="make-up lessons" label="Replacement" value={replacementCount} />
      </CoachRCompactGrid>

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

      {setupCards.length > 0 ? (
        <section className="mb-5 grid gap-3 md:grid-cols-2">
          {setupCards.map((issue) => (
            <article
              className={`rounded-lg border p-4 shadow-sm ${
                issue.tone === "error" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-court-navy"
              }`}
              key={issue.title}
            >
              <p className="text-sm font-black">{issue.title}</p>
              <p className="mt-1 text-sm font-semibold leading-6 opacity-80">{issue.text}</p>
            </article>
          ))}
        </section>
      ) : null}

      <CollapsibleCard
        defaultOpen={searchParams?.new === "1"}
        eyebrow="Create"
        id="new-lesson"
        summary="Add a lesson to the selected week. Creating it reserves the selected court."
        title="New lesson"
      >
        <form action={createCoachLesson} className="grid gap-3">
          <input name="returnTo" type="hidden" value={returnTo} />

          {selectedStudent && proposal ? (
            <div className="rounded-lg border border-court-teal/25 bg-court-mist p-3 text-sm font-semibold text-court-navy">
              Proposed lesson details for <span className="font-black">{profileDisplayName(selectedStudent.profile)}</span> have been loaded as editable defaults. Review them before saving.
            </div>
          ) : null}

          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-black text-court-navy">Lesson plan</legend>
            <label className="rounded-lg border border-court-teal bg-court-mist p-3 text-sm font-semibold text-court-navy">
              <input className="mr-2" defaultChecked={defaultRepeatMode === "none"} name="repeatMode" type="radio" value="none" />
              Once-off lesson
              <span className="mt-1 block text-xs font-normal leading-5 text-slate-600">Use the one-off start and end fields.</span>
            </label>
            <label className="rounded-lg border border-slate-200 bg-white p-3 text-sm font-semibold text-court-navy">
              <input className="mr-2" defaultChecked={defaultRepeatMode === "weekly"} name="repeatMode" type="radio" value="weekly" />
              Recurring weekly lesson
              <span className="mt-1 block text-xs font-normal leading-5 text-slate-600">Use the weekly repeat settings below.</span>
            </label>
          </fieldset>

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
            <div className="ui-empty-card">No active coaches are available for this organisation. Add or activate a coach before creating a lesson.</div>
          )}

          {studentSelectorOptions.length > 0 ? (
            <CoachRStudentSelector defaultValue={defaultPlayerId} options={studentSelectorOptions} />
          ) : (
            <div className="ui-empty-card">
              {options.studentLoadError === "load_failed"
                ? "Students could not be loaded. Check the active organisation or try again."
                : coachOnly
                  ? "No students are assigned to this coach yet."
                  : options.pendingPlayerInvitationCount > 0
                    ? "Student invitations are awaiting approval."
                    : "No students are connected to this academy yet."}
              <div className="mt-3"><Link className="btn-secondary inline-flex" href="/dashboard/coachr/students">Open Students</Link></div>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-black text-court-navy">Weekly repeat settings</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">Used only when Repeat is set to Every week. PlayR creates one lesson and one court booking for every matching date.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm font-semibold text-slate-700">
                Start date
                <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={proposalStartDate} name="recurrenceStartDate" type="date" />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                End date
                <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={defaultRecurrenceEndDate} name="recurrenceEndDate" type="date" />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Day
                <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={defaultDayOfWeek} name="dayOfWeek">
                  <option value="1">Monday</option>
                  <option value="2">Tuesday</option>
                  <option value="3">Wednesday</option>
                  <option value="4">Thursday</option>
                  <option value="5">Friday</option>
                  <option value="6">Saturday</option>
                  <option value="7">Sunday</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm font-semibold text-slate-700">
                  Start time
                  <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={proposalStartTime} name="lessonStartTime" type="time" />
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  End time
                  <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={proposalEndTime} name="lessonEndTime" type="time" />
                </label>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">
              One-off start
              <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={`${proposalStartDate}T${proposalStartTime}`} name="startTime" required type="datetime-local" />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              One-off end
              <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={`${proposalStartDate}T${proposalEndTime}`} name="endTime" required type="datetime-local" />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">
              Type
              <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={proposedLessonType} name="lessonType">
                {coachLessonTypes.map((type) => (
                  <option key={type} value={type}>
                    {formatLabel(type)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <CoachRCourtPicker
            canManageAccess={canManageCourtAccess}
            courts={options.courts}
            defaultCustomLocation={proposalText(proposal, "venue")}
            defaultLocationType={proposalText(proposal, "venue") ? "custom" : "managed_court"}
            externalVenues={options.externalVenues}
            organisationId={defaultVenueId}
          />

          <label className="text-sm font-semibold text-slate-700">
            Title
            <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={selectedStudent ? `${profileDisplayName(selectedStudent.profile)} coaching` : "Coaching lesson"} name="title" required />
          </label>

          <label className="text-sm font-semibold text-slate-700">
            Notes
            <textarea className="mt-2 min-h-20 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="notes" placeholder="Optional lesson notes" />
          </label>

          <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={!defaultCoachId || studentSelectorOptions.length === 0} type="submit">
            Create Lesson
          </button>
        </form>
      </CollapsibleCard>

      <section className="mt-5 grid gap-3">
        {weekDays.map(({ dayLessons, serial }) => {
          const status = dayStatusSummary(dayLessons);

          return (
            <details
              className={`ui-collapsible overflow-hidden rounded-lg border bg-white shadow-sm ${serial === todaySerial ? "border-court-teal ring-2 ring-court-mist" : "border-slate-200"}`}
              key={serial}
              open={serial === todaySerial}
            >
              <summary className="flex cursor-pointer items-start justify-between gap-3 p-4">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-black text-court-navy">{serialDateLabel(serial, "long")}</span>
                    {serial === todaySerial ? <span className="ui-chip ui-chip-brand">Today</span> : null}
                  </span>
                  <span className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                    <span className="ui-chip ui-chip-muted">{dayLessons.length} lessons</span>
                    <span className="ui-chip ui-chip-muted">{dayTimeRange(dayLessons)}</span>
                    {status.scheduled > 0 ? <span className="ui-chip ui-chip-brand">{status.scheduled} scheduled</span> : null}
                    {status.completed > 0 ? <span className="ui-chip ui-chip-success">{status.completed} completed</span> : null}
                    {status.changed > 0 ? <span className="ui-chip ui-chip-warning">{status.changed} changed</span> : null}
                  </span>
                </span>
                <span className="ui-collapsible-chevron grid h-9 w-9 shrink-0 place-items-center rounded bg-court-mist text-court-teal">
                  <ChevronDownIcon size={18} />
                </span>
              </summary>

              <div className="border-t border-slate-100 p-3">
                {dayLessons.length > 0 ? (
                  <div className="grid gap-3">
                    {dayLessons.map((lesson) => (
                      <LessonCard
                        canManageCourtAccess={canManageCourtAccess}
                        courts={options.courts}
                        externalVenues={options.externalVenues}
                        key={lesson.id}
                        lesson={lesson}
                        organisationId={lesson.venue_id}
                        playerOptions={playerOptions}
                        returnTo={returnTo}
                        showCoach={!coachOnly}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-500">
                    No lessons. This is a good gap for make-ups or admin.
                  </div>
                )}
              </div>
            </details>
          );
        })}
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
    </CoachRPageFrame>
  );
}
