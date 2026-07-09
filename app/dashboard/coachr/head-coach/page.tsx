import { PageShell } from "@/components/page-shell";
import { formatDateTime } from "@/lib/courtside-format";
import { loadCoachLessons, profileDisplayName } from "@/lib/coach-lessons";
import { CoachRNav, CoachRRoleSummary, getProtectedCoachRPage } from "../coachr-shared";

export const dynamic = "force-dynamic";

export default async function CoachRHeadCoachPage() {
  const { access, content } = await getProtectedCoachRPage("coachr:head_coach");

  if (content) {
    return content;
  }

  if (access.context.kind !== "authenticated") {
    return null;
  }

  const lessons = await loadCoachLessons(access.context, 160);
  const coachMap = new Map<string, { id: string; name: string; lessonCount: number; nextLesson: string | null }>();

  lessons.forEach((lesson) => {
    const existing = coachMap.get(lesson.coach_id);
    const nextLesson = lesson.status === "scheduled" ? lesson.start_time : null;

    if (existing) {
      existing.lessonCount += 1;
      if (nextLesson && (!existing.nextLesson || new Date(nextLesson).getTime() < new Date(existing.nextLesson).getTime())) {
        existing.nextLesson = nextLesson;
      }
      return;
    }

    coachMap.set(lesson.coach_id, {
      id: lesson.coach_id,
      name: profileDisplayName(lesson.coach),
      lessonCount: 1,
      nextLesson
    });
  });

  const coaches = Array.from(coachMap.values()).sort((left, right) => left.name.localeCompare(right.name));

  return (
    <PageShell eyebrow="CoachR" subtitle="Head coach tools for venue-level coaching oversight." title="Head Coach">
      <CoachRNav canUseHeadCoach />
      <CoachRRoleSummary context={access.context} />
      <section className="surface-card p-4 sm:p-5">
        <p className="section-kicker">Head Coach</p>
        <h2 className="section-title mt-1">Venue coaching oversight</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Head Coaches can view and manage coaches linked to their venue. Club Admins and Platform Admins can also access this area.
        </p>
        {coaches.length > 0 ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {coaches.map((coach) => (
              <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={coach.id}>
                <div className="flex flex-wrap gap-2 text-xs font-bold">
                  <span className="ui-chip ui-chip-brand">{coach.lessonCount} lessons</span>
                </div>
                <h3 className="mt-2 font-black text-court-navy">{coach.name}</h3>
                <p className="mt-1 text-sm text-slate-600">{coach.nextLesson ? `Next: ${formatDateTime(coach.nextLesson)}` : "No upcoming lesson scheduled"}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="ui-empty-card mt-5">No coach lesson records found for this venue yet.</div>
        )}
      </section>
    </PageShell>
  );
}
