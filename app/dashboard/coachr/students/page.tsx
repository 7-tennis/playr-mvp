import { PageShell } from "@/components/page-shell";
import { formatDateTime, formatLabel } from "@/lib/courtside-format";
import { attendanceResultLabel, lessonAttendanceRows, loadCoachLessons, profileDisplayName, type CoachLessonProfile, type CoachLessonWithRelations } from "@/lib/coach-lessons";
import { canAccessHeadCoach } from "@/lib/permissions";
import type { CoachLessonAttendanceResult } from "@/types/courtside";
import { CoachRNav, CoachRRoleSummary, getProtectedCoachRPage } from "../coachr-shared";

export const dynamic = "force-dynamic";

type StudentSummary = {
  id: string;
  name: string;
  isJunior: boolean;
  totalLessons: number;
  attendedLessons: number;
  missedLessons: number;
  affectedLessons: number;
  nextLesson: string | null;
  recentHistory: { date: string; status: string }[];
};

function fallbackAttendanceResult(lesson: CoachLessonWithRelations): CoachLessonAttendanceResult | "scheduled" {
  if (lesson.status === "completed" || lesson.attendance_status === "attended") {
    return "attended";
  }
  if (lesson.status === "missed" || lesson.attendance_status === "missed") {
    return "missed";
  }
  if (lesson.status === "cancelled" || lesson.status === "rain" || lesson.status === "sick") {
    return lesson.status;
  }

  return "scheduled";
}

function upsertStudent(studentMap: Map<string, StudentSummary>, profile: CoachLessonProfile | null, profileId: string) {
  const existing = studentMap.get(profileId);

  if (existing) {
    return existing;
  }

  const summary: StudentSummary = {
    affectedLessons: 0,
    attendedLessons: 0,
    id: profileId,
    isJunior: Boolean(profile?.is_junior),
    missedLessons: 0,
    name: profileDisplayName(profile),
    nextLesson: null,
    recentHistory: [],
    totalLessons: 0
  };

  studentMap.set(profileId, summary);
  return summary;
}

function addStudentLesson(summary: StudentSummary, lesson: CoachLessonWithRelations, status: CoachLessonAttendanceResult | "scheduled") {
  summary.totalLessons += 1;

  if (status === "attended") {
    summary.attendedLessons += 1;
  } else if (status === "missed") {
    summary.missedLessons += 1;
  } else if (status === "cancelled" || status === "rain" || status === "sick") {
    summary.affectedLessons += 1;
  }

  if (lesson.status === "scheduled" && (!summary.nextLesson || new Date(lesson.start_time).getTime() < new Date(summary.nextLesson).getTime())) {
    summary.nextLesson = lesson.start_time;
  }

  summary.recentHistory.push({
    date: lesson.start_time,
    status: status === "scheduled" ? formatLabel(lesson.status) : attendanceResultLabel(status)
  });
}

export default async function CoachRStudentsPage() {
  const { access, content } = await getProtectedCoachRPage("coachr:students");

  if (content) {
    return content;
  }

  if (access.context.kind !== "authenticated") {
    return null;
  }

  const coachOnly = access.context.role === "coach";
  const lessons = await loadCoachLessons(access.context, 120);
  const studentMap = new Map<string, StudentSummary>();

  lessons.forEach((lesson) => {
    const attendanceRows = lessonAttendanceRows(lesson);

    if (attendanceRows.length > 0) {
      attendanceRows.forEach((row) => {
        const summary = upsertStudent(studentMap, row.player ?? row.junior, row.player_profile_id);
        addStudentLesson(summary, lesson, row.attendance_status);
      });
      return;
    }

    const summary = upsertStudent(studentMap, lesson.player, lesson.player_id);
    addStudentLesson(summary, lesson, fallbackAttendanceResult(lesson));
  });

  const students = Array.from(studentMap.values())
    .map((student) => ({
      ...student,
      recentHistory: student.recentHistory
        .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
        .slice(0, 3)
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return (
    <PageShell eyebrow="CoachR" subtitle="View students inside the permitted coaching scope." title="CoachR Students">
      <CoachRNav canUseHeadCoach={canAccessHeadCoach(access.context.role)} />
      <CoachRRoleSummary context={access.context} />
      <section className="surface-card p-4 sm:p-5">
        <p className="section-kicker">Students</p>
        <h2 className="section-title mt-1">{coachOnly ? "My students" : "Venue students"}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {coachOnly
            ? "Coach access should only manage students assigned to your own coaching work."
            : "Head coach and admin access can review students linked to coaches at the permitted venue."}
        </p>
        {students.length > 0 ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {students.map((student) => (
              <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={student.id}>
                <div className="flex flex-wrap gap-2 text-xs font-bold">
                  <span className="ui-chip ui-chip-muted">{student.isJunior ? "Junior" : "Player"}</span>
                  <span className="ui-chip ui-chip-brand">{student.totalLessons} lessons</span>
                  <span className="ui-chip ui-chip-success">{student.attendedLessons} attended</span>
                  <span className="ui-chip bg-rose-50 text-rose-700">{student.missedLessons} missed</span>
                  <span className="ui-chip ui-chip-warning">{student.affectedLessons} rain/cancelled</span>
                </div>
                <h3 className="mt-2 font-black text-court-navy">{student.name}</h3>
                <p className="mt-1 text-sm text-slate-600">{student.nextLesson ? `Next: ${formatDateTime(student.nextLesson)}` : "No upcoming lesson scheduled"}</p>
                {student.recentHistory.length > 0 ? (
                  <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3">
                    {student.recentHistory.map((item) => (
                      <p className="text-xs font-semibold text-slate-600" key={`${student.id}-${item.date}-${item.status}`}>
                        {formatDateTime(item.date)} · {item.status}
                      </p>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="ui-empty-card mt-5">No lesson-linked students found yet.</div>
        )}
      </section>
    </PageShell>
  );
}
