import Link from "next/link";
import { SetupReminderCard } from "@/components/organisation-setup-wizard";
import { ArrowRightIcon, BookingIcon, EntriesIcon, MatchIcon, NotificationIcon, StatusIcon, TimeIcon } from "@/components/playr-icons";
import { formatDateTime, formatLabel } from "@/lib/courtside-format";
import { loadOrganisationSetup } from "@/lib/organisation-setup";
import {
  lessonHasAttendanceResult,
  lessonNeedsAttendance,
  lessonStatusTone,
  loadCoachLessons,
  profileDisplayName,
  upcomingCoachLessons,
  type CoachLessonWithRelations
} from "@/lib/coach-lessons";
import { loadCoachSessionOccurrencesForRange, loadCoachSessions, sessionAttendanceSummary } from "@/lib/coach-sessions";
import { CoachRActionCard, CoachRCompactGrid, CoachRPageFrame, CoachRRoleSummary, CoachRSummaryCard, getProtectedCoachRPage } from "./coachr-shared";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const lessonLoadLimit = 200;

function localDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Johannesburg",
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

function lessonTimeLabel(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Johannesburg"
  }).format(new Date(value));
}

function isCancelledLesson(lesson: CoachLessonWithRelations) {
  return lesson.status === "cancelled" || lesson.status === "rain" || lesson.status === "sick";
}

function coachingHours(lessons: CoachLessonWithRelations[]) {
  const minutes = lessons.reduce((total, lesson) => {
    if (isCancelledLesson(lesson)) {
      return total;
    }

    return total + Math.max(0, new Date(lesson.end_time).getTime() - new Date(lesson.start_time).getTime()) / 60000;
  }, 0);

  return Math.round((minutes / 60) * 10) / 10;
}

function LessonMiniCard({ lesson, compact = false }: { lesson: CoachLessonWithRelations; compact?: boolean }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-court-mist text-court-teal">
          <TimeIcon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-black text-court-navy">{lesson.title}</p>
            <span className={`ui-chip ${lessonStatusTone(lesson.status)}`}>{formatLabel(lesson.status)}</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-700">
            {lessonTimeLabel(lesson.start_time)}-{lessonTimeLabel(lesson.end_time)} · {profileDisplayName(lesson.player)}
          </p>
          {!compact ? (
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
              <span className="ui-chip ui-chip-muted">{formatLabel(lesson.lesson_type)}</span>
              <span className="ui-chip ui-chip-muted">{lesson.location_type === "custom" ? lesson.custom_location ?? "Off-site" : lesson.location_type === "none" ? "No court" : lesson.court?.name ?? "Court TBC"}</span>
              <span className="ui-chip ui-chip-muted">{lesson.coach ? profileDisplayName(lesson.coach) : "Coach TBC"}</span>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default async function CoachRPage() {
  const { access, content } = await getProtectedCoachRPage("coachr");

  if (content) {
    return content;
  }

  if (access.context.kind !== "authenticated") {
    return null;
  }

  const canManageSetup = ["organisation_admin", "club_manager", "head_coach"].includes(access.context.activeOrganisationRole ?? "");
  const setupSnapshot = canManageSetup && access.context.venueId
    ? await loadOrganisationSetup(access.context.supabase, access.context.venueId, "coachr")
    : null;

  const activeStudentsQuery =
    access.context.role === "coach" && access.context.adultProfileId
      ? access.context.supabase
          .from("coach_player_assignments")
          .select("player_profile_id", { count: "exact", head: true })
          .eq("coach_profile_id", access.context.adultProfileId)
          .eq("venue_id", access.context.venueId ?? "00000000-0000-0000-0000-000000000000")
          .eq("status", "active")
      : access.context.venueId
        ? access.context.supabase
            .from("organisation_player_links")
            .select("player_profile_id", { count: "exact", head: true })
            .eq("venue_id", access.context.venueId)
            .eq("status", "active")
        : access.context.supabase.from("organisation_player_links").select("player_profile_id", { count: "exact", head: true }).eq("status", "active");
  const pendingLinksQuery = access.context.venueId
    ? access.context.supabase
        .from("organisation_invitations")
        .select("id", { count: "exact", head: true })
        .eq("venue_id", access.context.venueId)
        .in("invitation_kind", ["player", "player_junior"])
        .eq("status", "pending")
    : access.context.supabase
        .from("organisation_invitations")
        .select("id", { count: "exact", head: true })
        .in("invitation_kind", ["player", "player_junior"])
        .eq("status", "pending");
  const [lessons, activeStudentsResult, pendingLinksResult, unreadMessagesResult] = await Promise.all([
    loadCoachLessons(access.context, lessonLoadLimit),
    activeStudentsQuery,
    pendingLinksQuery,
    access.context.supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", access.context.user.id)
      .is("read_at", null)
  ]);
  const upcomingLessons = upcomingCoachLessons(lessons);
  const nextLesson = upcomingLessons[0] ?? null;
  const todaySerial = localDateSerial(new Date());
  const todayDay = new Date(todaySerial).getUTCDay();
  const weekStartSerial = todaySerial - ((todayDay + 6) % 7) * DAY_MS;
  const weekEndSerial = weekStartSerial + 7 * DAY_MS;
  const [sessions, sessionOccurrences] = await Promise.all([
    loadCoachSessions(access.context),
    loadCoachSessionOccurrencesForRange(
      access.context,
      new Date(weekStartSerial - 2 * 60 * 60 * 1000).toISOString(),
      new Date(weekEndSerial - 2 * 60 * 60 * 1000).toISOString()
    )
  ]);
  const todayLessons = lessons
    .filter((lesson) => localDateSerial(lesson.start_time) === todaySerial)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  const weeklyLessonCount = lessons.filter((lesson) => {
    const lessonSerial = localDateSerial(lesson.start_time);
    return lessonSerial >= weekStartSerial && lessonSerial < weekEndSerial && !isCancelledLesson(lesson);
  }).length;
  const completedLessonCount = lessons.filter((lesson) => lesson.status === "completed" || lessonHasAttendanceResult(lesson, "attended")).length;
  const missedLessonCount = lessons.filter((lesson) => lesson.status === "missed" || lessonHasAttendanceResult(lesson, "missed")).length;
  const rainLessonCount = lessons.filter((lesson) => lesson.status === "rain" || lessonHasAttendanceResult(lesson, "rain")).length;
  const cancelledLessonCount = lessons.filter((lesson) => lesson.status === "cancelled").length;
  const replacementLessonCount = lessons.filter((lesson) => /replacement|extra|make.?up|catch.?up/i.test(`${lesson.title} ${lesson.notes ?? ""}`)).length;
  const outstandingAttendanceCount = lessons.filter((lesson) => lessonNeedsAttendance(lesson)).length;
  const outstandingSessionAttendanceCount = sessionOccurrences
    .filter((occurrence) => occurrence.end_time <= new Date().toISOString() && occurrence.status === "scheduled")
    .reduce((total, occurrence) => total + sessionAttendanceSummary(occurrence).due, 0);
  const outstandingFeedbackCount = lessons.filter(
    (lesson) => new Date(lesson.end_time).getTime() <= Date.now() && (lesson.feedback_status === "not_started" || lesson.feedback_status === "draft")
  ).length;
  const weeklyLessons = lessons.filter((lesson) => {
    const lessonSerial = localDateSerial(lesson.start_time);
    return lessonSerial >= weekStartSerial && lessonSerial < weekEndSerial;
  });
  const activeStudentCount = activeStudentsResult.count ?? new Set(lessons.map((lesson) => lesson.player_id)).size;
  const privateStudentCount = new Set(lessons.filter((lesson) => lesson.lesson_type === "private").map((lesson) => lesson.player_id)).size;
  const pendingLinkCount = pendingLinksResult.count ?? 0;
  const unreadMessageCount = unreadMessagesResult.count ?? 0;
  const activeSquadCount = sessions.filter((session) => session.status === "active" && session.session_type === "squad").length;
  const todaySessionCount = sessionOccurrences.filter((occurrence) => localDateSerial(occurrence.start_time) === todaySerial).length;
  const activeOrganisationName = access.context.activeOrganisationMembership?.venue?.name ?? "Organisation not selected";
  const coachName = access.context.activeOrganisationMembership?.profile
    ? profileDisplayName(access.context.activeOrganisationMembership.profile)
    : nextLesson?.coach
      ? profileDisplayName(nextLesson.coach)
      : access.context.user.email ?? "Coach";
  const todayLabel = new Intl.DateTimeFormat("en-ZA", { dateStyle: "full", timeZone: "Africa/Johannesburg" }).format(new Date());
  const scopeLabel =
    access.context.role === "coach"
      ? "Your coaching week"
      : access.context.role === "platform_admin"
        ? "CoachR lesson summary"
        : "Venue coaching week";
  const statCards = [
    {
      label: "Today",
      value: todayLessons.length + todaySessionCount,
      helper: "sessions",
      href: "/dashboard/coachr/schedule",
      icon: <TimeIcon size={18} />,
      tone: "bg-court-mist text-court-teal"
    },
    {
      label: "Squads",
      value: activeSquadCount,
      helper: "active",
      href: "/dashboard/coachr/sessions",
      icon: <MatchIcon size={18} />,
      tone: "bg-court-mist text-court-teal"
    },
    {
      label: "Attendance",
      value: outstandingAttendanceCount + outstandingSessionAttendanceCount,
      helper: "due",
      href: "/dashboard/coachr/schedule",
      icon: <StatusIcon size={18} />,
      tone: "bg-amber-50 text-amber-700"
    },
    {
      label: "Students",
      value: activeStudentCount,
      helper: "active",
      href: "/dashboard/coachr/students",
      icon: <EntriesIcon size={18} />,
      tone: "bg-court-navy text-white"
    },
    {
      label: "Feedback",
      value: outstandingFeedbackCount,
      helper: "due",
      href: "/dashboard/coachr/students",
      icon: <StatusIcon size={18} />,
      tone: "bg-amber-50 text-amber-700"
    },
    {
      label: "Messages",
      value: unreadMessageCount,
      helper: "unread",
      href: "/dashboard/coachr/messages?filter=unread",
      icon: <NotificationIcon size={18} />,
      tone: "bg-emerald-50 text-emerald-700"
    }
  ];
  const quickLinks = [
    {
      title: "Create Session",
      text: "Private, semi-private or squad.",
      href: "/dashboard/coachr/sessions/new",
      icon: <TimeIcon size={18} />
    },
    {
      title: "Weekly Schedule",
      text: "Review and update lessons.",
      href: "/dashboard/coachr/schedule",
      icon: <BookingIcon size={18} />
    },
    {
      title: "Students",
      text: "See linked lesson students.",
      href: "/dashboard/coachr/students",
      icon: <EntriesIcon size={18} />
    },
    {
      title: "Availability",
      text: "Manage coach availability.",
      href: "/dashboard/coachr/availability",
      icon: <StatusIcon size={18} />
    }
  ];

  return (
    <CoachRPageFrame context={access.context} subtitle="Today, your next lesson and the coaching work that needs attention." title="MyCoachR">
      <CoachRRoleSummary context={access.context} />
      {setupSnapshot ? <SetupReminderCard organisationName={access.context.activeOrganisationMembership?.venue?.name ?? "your academy"} snapshot={setupSnapshot} /> : null}

      <section className="mb-5 overflow-hidden rounded-lg bg-court-navy text-white shadow-court">
        <div className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-end sm:p-5">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-court-lime">{activeOrganisationName}</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight">{coachName}</h2>
            <p className="mt-1 text-sm font-semibold text-white/70">{scopeLabel} · {todayLabel}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="inline-flex items-center justify-center gap-2 rounded border border-white/20 px-3 py-2 text-sm font-black hover:bg-white/10" href="/dashboard/notifications">
              <NotificationIcon size={16} /> Notifications
            </Link>
            <Link className="inline-flex items-center justify-center gap-2 rounded bg-court-teal px-3 py-2 text-sm font-black hover:bg-teal-500" href="/dashboard/coachr/sessions/new">
              Create Session <ArrowRightIcon size={15} />
            </Link>
          </div>
        </div>
      </section>

      <CoachRCompactGrid className="mb-5">
        {statCards.map((stat) => (
          <CoachRSummaryCard helper={stat.helper} href={stat.href} icon={<span className={stat.tone}>{stat.icon}</span>} key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </CoachRCompactGrid>

      {lessons.length === 0 && sessions.length === 0 ? (
        <section className="empty-state mb-5">
          <TimeIcon size={24} />
          <h2 className="section-title mt-3">Your coaching schedule is ready.</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">Add your first lesson to start planning your week.</p>
          <Link className="btn-primary mt-4" href="/dashboard/coachr/sessions/new">Create First Session</Link>
        </section>
      ) : (
        <section className="mb-5 grid gap-4 lg:grid-cols-2">
          <article className="surface-card p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="section-kicker">Next Lesson</p>
                <h2 className="section-title mt-1">{nextLesson ? lessonTimeLabel(nextLesson.start_time) : "Nothing scheduled"}</h2>
              </div>
              <BookingIcon size={20} />
            </div>
            {nextLesson ? <div className="mt-4"><LessonMiniCard lesson={nextLesson} /></div> : <div className="ui-empty-card mt-4">Add a lesson when the next coaching slot is confirmed.</div>}
            <Link className="btn-secondary mt-4 w-full" href="/dashboard/coachr/schedule">Open Schedule</Link>
          </article>

          <article className="surface-card p-4 sm:p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="section-kicker">Today</p>
                <h2 className="section-title mt-1">{todayLessons.length} lessons</h2>
              </div>
              <Link className="text-sm font-black text-court-teal" href="/dashboard/coachr/schedule">View all</Link>
            </div>
            {todayLessons.length > 0 ? (
              <div className="mt-4 grid gap-2">{todayLessons.slice(0, 3).map((lesson) => <LessonMiniCard compact key={lesson.id} lesson={lesson} />)}</div>
            ) : (
              <div className="ui-empty-card mt-4">No lessons today. Your schedule is clear.</div>
            )}
          </article>
        </section>
      )}

      <CoachRCompactGrid className="mb-5">
        <CoachRSummaryCard helper="private students" href="/dashboard/coachr/students?lessonType=private" icon={<EntriesIcon size={18} />} label="Private" value={privateStudentCount} />
        <CoachRSummaryCard helper="awaiting approval" href="/dashboard/coachr/students#pending-links" icon={<NotificationIcon size={18} />} label="Player Links" value={pendingLinkCount} />
        <CoachRSummaryCard helper="player absent" href="/dashboard/coachr/schedule" icon={<StatusIcon size={18} />} label="Missed" value={missedLessonCount} />
        <CoachRSummaryCard helper="needs marking" href="/dashboard/coachr/schedule" icon={<MatchIcon size={18} />} label="Attendance" value={outstandingAttendanceCount + outstandingSessionAttendanceCount} />
      </CoachRCompactGrid>

      <section className="surface-card mb-5 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="section-kicker">Weekly Summary</p>
            <h2 className="section-title mt-1">{weeklyLessonCount} planned · {coachingHours(weeklyLessons)} hours</h2>
          </div>
          <Link className="btn-secondary px-3 py-2" href="/dashboard/coachr/schedule">Open Week</Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="ui-chip ui-chip-success">{completedLessonCount} completed</span>
          <span className="ui-chip ui-chip-warning">{rainLessonCount} rain</span>
          <span className="ui-chip ui-chip-muted">{cancelledLessonCount} cancelled</span>
          <span className="ui-chip ui-chip-brand">{replacementLessonCount} replacement</span>
        </div>
      </section>

      <CoachRCompactGrid>
        {quickLinks.map((link) => (
          <CoachRActionCard href={link.href} icon={link.icon} key={link.title} text={link.text} title={link.title} />
        ))}
      </CoachRCompactGrid>
    </CoachRPageFrame>
  );
}
