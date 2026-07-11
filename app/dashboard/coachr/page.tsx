import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { ArrowRightIcon, BookingIcon, EntriesIcon, MatchIcon, StatusIcon, TimeIcon } from "@/components/playr-icons";
import { formatDateTime, formatLabel } from "@/lib/courtside-format";
import {
  lessonHasAttendanceResult,
  lessonNeedsAttendance,
  lessonStatusTone,
  loadCoachLessons,
  profileDisplayName,
  upcomingCoachLessons,
  type CoachLessonWithRelations
} from "@/lib/coach-lessons";
import { canAccessHeadCoach } from "@/lib/permissions";
import { CoachRNav, CoachRRoleSummary, getProtectedCoachRPage } from "./coachr-shared";

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
              <span className="ui-chip ui-chip-muted">{lesson.court?.name ?? "Court TBC"}</span>
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

  const lessons = await loadCoachLessons(access.context, lessonLoadLimit);
  const upcomingLessons = upcomingCoachLessons(lessons);
  const nextLesson = upcomingLessons[0] ?? null;
  const todaySerial = localDateSerial(new Date());
  const todayDay = new Date(todaySerial).getUTCDay();
  const weekStartSerial = todaySerial - ((todayDay + 6) % 7) * DAY_MS;
  const weekEndSerial = weekStartSerial + 7 * DAY_MS;
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
  const outstandingAttendanceCount = lessons.filter((lesson) => lessonNeedsAttendance(lesson)).length;
  const scopeLabel =
    access.context.role === "coach"
      ? "Your coaching week"
      : access.context.role === "platform_admin"
        ? "CoachR lesson summary"
        : "Venue coaching week";
  const statCards = [
    {
      label: "Today",
      value: todayLessons.length,
      helper: "lessons",
      icon: <TimeIcon size={18} />,
      tone: "bg-court-mist text-court-teal"
    },
    {
      label: "This week",
      value: weeklyLessonCount,
      helper: "planned lessons",
      icon: <BookingIcon size={18} />,
      tone: "bg-court-navy text-white"
    },
    {
      label: "Missed",
      value: missedLessonCount,
      helper: "player absent",
      icon: <StatusIcon size={18} />,
      tone: "bg-amber-50 text-amber-700"
    },
    {
      label: "Completed",
      value: completedLessonCount,
      helper: "attendance recorded",
      icon: <MatchIcon size={18} />,
      tone: "bg-emerald-50 text-emerald-700"
    },
    {
      label: "Rain",
      value: rainLessonCount,
      helper: "weather affected",
      icon: <StatusIcon size={18} />,
      tone: "bg-sky-50 text-sky-700"
    },
    {
      label: "Attendance",
      value: outstandingAttendanceCount,
      helper: "needs marking",
      icon: <EntriesIcon size={18} />,
      tone: "bg-rose-50 text-rose-700"
    }
  ];
  const quickLinks = [
    {
      title: "Quick Add Lesson",
      text: "Create a lesson for this week.",
      href: "/dashboard/coachr/schedule",
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
    <PageShell eyebrow="CoachR" subtitle="Plan lessons, spot what needs attention, and keep the coaching week moving." title="CoachR">
      <CoachRNav canUseHeadCoach={canAccessHeadCoach(access.context.role)} />
      <CoachRRoleSummary context={access.context} />

      <section className="mb-5 overflow-hidden rounded-lg bg-court-navy text-white shadow-court">
        <div className="grid gap-4 p-5 sm:grid-cols-[1.1fr_0.9fr] sm:p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-court-lime">{scopeLabel}</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
              {nextLesson ? "Next lesson is ready." : "Your coaching schedule is ready."}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/75">
              {nextLesson
                ? `${profileDisplayName(nextLesson.player)} · ${formatDateTime(nextLesson.start_time)}`
                : "Add your first lesson to start planning your week."}
            </p>
          </div>
          <div className="flex flex-col justify-end gap-2 sm:items-end">
            <Link className="inline-flex items-center justify-center gap-2 rounded bg-court-teal px-4 py-3 text-sm font-black text-white transition hover:bg-teal-500" href="/dashboard/coachr/schedule">
              Quick Add Lesson <ArrowRightIcon size={16} />
            </Link>
            <Link className="inline-flex items-center justify-center gap-2 rounded border border-white/20 px-4 py-3 text-sm font-black text-white transition hover:bg-white/10" href="/dashboard/coachr/schedule">
              Weekly Schedule <ArrowRightIcon size={16} />
            </Link>
          </div>
        </div>
      </section>

      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {statCards.map((stat) => (
          <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={stat.label}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">{stat.label}</p>
                <p className="mt-2 text-3xl font-black text-court-navy">{stat.value}</p>
                <p className="mt-1 text-sm font-semibold text-slate-600">{stat.helper}</p>
              </div>
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded ${stat.tone}`}>{stat.icon}</span>
            </div>
          </article>
        ))}
      </section>

      <section className="mb-5 grid gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs font-semibold text-slate-600 shadow-sm sm:grid-cols-4">
        <p>
          <span className="font-black text-court-navy">Completed</span> means attendance was recorded.
        </p>
        <p>
          <span className="font-black text-court-navy">Missed</span> means the player was absent.
        </p>
        <p>
          <span className="font-black text-court-navy">Rain</span> means the lesson was weather affected.
        </p>
        <p>
          <span className="font-black text-court-navy">Sick/Cancelled</span> preserves the lesson history.
        </p>
      </section>

      {lessons.length === 0 ? (
        <section className="empty-state mb-5">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded bg-court-mist text-court-teal">
            <TimeIcon size={22} />
          </div>
          <h2 className="section-title mt-4">Your coaching schedule is ready.</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">Add your first lesson to start planning your week.</p>
          <Link className="btn-primary mt-5" href="/dashboard/coachr/schedule">
            Quick Add Lesson
          </Link>
        </section>
      ) : (
        <section className="mb-5 grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="surface-card p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="section-kicker">Next up</p>
                <h2 className="section-title mt-1">Upcoming lesson</h2>
              </div>
              <span className="grid h-10 w-10 place-items-center rounded bg-court-mist text-court-teal">
                <BookingIcon size={18} />
              </span>
            </div>
            {nextLesson ? (
              <div className="mt-4">
                <p className="text-2xl font-black text-court-navy">{lessonTimeLabel(nextLesson.start_time)}</p>
                <p className="mt-1 text-sm font-bold text-slate-600">{formatDateTime(nextLesson.start_time)}</p>
                <div className="mt-4">
                  <LessonMiniCard lesson={nextLesson} />
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
                No upcoming lessons. Add a new lesson when the next coaching slot is confirmed.
              </div>
            )}
          </div>

          <div className="surface-card p-4 sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="section-kicker">Today</p>
                <h2 className="section-title mt-1">Today&apos;s lessons</h2>
              </div>
              <Link className="inline-flex items-center gap-1 text-sm font-black text-court-teal hover:text-court-blue" href="/dashboard/coachr/schedule">
                View schedule <ArrowRightIcon size={14} />
              </Link>
            </div>
            {todayLessons.length > 0 ? (
              <div className="mt-4 grid gap-3">
                {todayLessons.slice(0, 4).map((lesson) => (
                  <LessonMiniCard compact key={lesson.id} lesson={lesson} />
                ))}
                {todayLessons.length > 4 ? <p className="text-sm font-semibold text-slate-500">+{todayLessons.length - 4} more today</p> : null}
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
                No lessons today. Your schedule is clear.
              </div>
            )}
          </div>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {quickLinks.map((link) => (
          <Link className="surface-card block p-4 transition hover:-translate-y-0.5 hover:shadow-court" href={link.href} key={link.title}>
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-court-mist text-court-teal">{link.icon}</span>
              <div className="min-w-0">
                <h3 className="font-black text-court-navy">{link.title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">{link.text}</p>
              </div>
            </div>
          </Link>
        ))}
      </section>
    </PageShell>
  );
}
