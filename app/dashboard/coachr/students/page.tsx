import { PageShell } from "@/components/page-shell";
import { formatDateTime } from "@/lib/courtside-format";
import { loadCoachLessons, profileDisplayName } from "@/lib/coach-lessons";
import { canAccessHeadCoach } from "@/lib/permissions";
import { CoachRNav, CoachRRoleSummary, getProtectedCoachRPage } from "../coachr-shared";

export const dynamic = "force-dynamic";

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
  const studentMap = new Map<string, { id: string; name: string; isJunior: boolean; lessonCount: number; nextLesson: string | null }>();

  lessons.forEach((lesson) => {
    const existing = studentMap.get(lesson.player_id);
    const nextLesson = lesson.status === "scheduled" ? lesson.start_time : null;

    if (existing) {
      existing.lessonCount += 1;
      if (nextLesson && (!existing.nextLesson || new Date(nextLesson).getTime() < new Date(existing.nextLesson).getTime())) {
        existing.nextLesson = nextLesson;
      }
      return;
    }

    studentMap.set(lesson.player_id, {
      id: lesson.player_id,
      name: profileDisplayName(lesson.player),
      isJunior: Boolean(lesson.player?.is_junior),
      lessonCount: 1,
      nextLesson
    });
  });

  const students = Array.from(studentMap.values()).sort((left, right) => left.name.localeCompare(right.name));

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
                  <span className="ui-chip ui-chip-brand">{student.lessonCount} lessons</span>
                </div>
                <h3 className="mt-2 font-black text-court-navy">{student.name}</h3>
                <p className="mt-1 text-sm text-slate-600">{student.nextLesson ? `Next: ${formatDateTime(student.nextLesson)}` : "No upcoming lesson scheduled"}</p>
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
