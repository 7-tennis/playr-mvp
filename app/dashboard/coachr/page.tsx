import { PageShell } from "@/components/page-shell";
import { BookingIcon, EntriesIcon, TimeIcon } from "@/components/playr-icons";
import { loadCoachLessons, upcomingCoachLessons } from "@/lib/coach-lessons";
import { canAccessHeadCoach } from "@/lib/permissions";
import { CoachRNav, CoachRRoleSummary, CoachRScopeCards, getProtectedCoachRPage } from "./coachr-shared";

export const dynamic = "force-dynamic";

export default async function CoachRPage() {
  const { access, content } = await getProtectedCoachRPage("coachr");

  if (content) {
    return content;
  }

  if (access.context.kind !== "authenticated") {
    return null;
  }

  const lessons = await loadCoachLessons(access.context);
  const upcomingLessons = upcomingCoachLessons(lessons);
  const uniqueStudentCount = new Set(lessons.map((lesson) => lesson.player_id)).size;

  return (
    <PageShell eyebrow="CoachR" subtitle="Private coaching tools for lessons, students, availability and feedback." title="CoachR">
      <CoachRNav canUseHeadCoach={canAccessHeadCoach(access.context.role)} />
      <CoachRRoleSummary context={access.context} />
      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="flex items-center gap-2 text-2xl font-black text-court-navy">
            <TimeIcon size={18} /> {upcomingLessons.length}
          </p>
          <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">Upcoming lessons</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="flex items-center gap-2 text-2xl font-black text-court-navy">
            <EntriesIcon size={18} /> {uniqueStudentCount}
          </p>
          <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">Linked students</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="flex items-center gap-2 text-2xl font-black text-court-navy">
            <BookingIcon size={18} /> {lessons.filter((lesson) => lesson.court_booking_id).length}
          </p>
          <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">Booking-linked</p>
        </div>
      </section>
      <CoachRScopeCards context={access.context} />
    </PageShell>
  );
}
