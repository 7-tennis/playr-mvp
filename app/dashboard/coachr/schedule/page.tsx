import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { formatDateTime, formatLabel } from "@/lib/courtside-format";
import { coachLessonAttendanceStatuses, coachLessonFeedbackStatuses, coachLessonStatuses, coachLessonTypes, lessonStatusTone, loadCoachLessonOptions, loadCoachLessons, profileDisplayName } from "@/lib/coach-lessons";
import { canAccessHeadCoach } from "@/lib/permissions";
import { cancelCoachLesson, createCoachLesson, updateCoachLesson } from "../actions";
import { CoachRNav, CoachRRoleSummary, getProtectedCoachRPage } from "../coachr-shared";

export const dynamic = "force-dynamic";

type CoachRSchedulePageProps = {
  searchParams?: {
    lesson?: string;
    lesson_error?: string;
  };
};

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
  switch (value) {
    case "missing_fields":
      return "Choose a venue, coach, player, start time and end time.";
    case "time_order":
      return "Lesson end time must be after the start time.";
    case "court_venue":
      return "That court is not linked to the selected venue.";
    case "coach_venue":
      return "Choose a coach linked to the selected venue.";
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

function defaultDateTime(offsetHours: number) {
  return new Date(Date.now() + offsetHours * 60 * 60 * 1000).toISOString().slice(0, 16);
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
  const [lessons, options] = await Promise.all([loadCoachLessons(access.context), loadCoachLessonOptions(access.context)]);
  const returnTo = "/dashboard/coachr/schedule";
  const defaultVenueId = access.context.venueId ?? options.venues[0]?.id ?? "";
  const defaultCoachId = access.context.role === "coach" ? access.context.adultProfileId ?? "" : options.coachProfiles[0]?.id ?? access.context.adultProfileId ?? "";

  return (
    <PageShell eyebrow="CoachR" subtitle="Manage coaching schedule within your permitted scope." title="CoachR Schedule">
      <StatusAlert className="mb-5" message={statusMessage(searchParams?.lesson)} tone="success" />
      <StatusAlert className="mb-5" message={errorMessage(searchParams?.lesson_error)} tone="error" />
      <CoachRNav canUseHeadCoach={canAccessHeadCoach(access.context.role)} />
      <CoachRRoleSummary context={access.context} />
      <section className="surface-card mb-5 p-4 sm:p-5">
        <p className="section-kicker">Schedule</p>
        <h2 className="section-title mt-1">{coachOnly ? "My lessons" : "Venue lesson schedule"}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {coachOnly
            ? "Coach access is limited to lessons assigned to your own coach account."
            : "Head coach and admin access can cover coaches linked to the permitted venue."}
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="surface-card p-4 sm:p-5">
          <p className="section-kicker">Create</p>
          <h2 className="section-title mt-1">New lesson</h2>
          <form action={createCoachLesson} className="mt-4 grid gap-3">
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

            {access.context.role === "coach" ? (
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
              {options.playerProfiles.length > 0 ? (
                <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="playerId" required>
                  <option value="">Choose player</option>
                  {options.playerProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profileDisplayName(profile)}{profile.is_junior ? " (junior)" : ""}
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
                <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={defaultDateTime(24)} name="startTime" required type="datetime-local" />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                End
                <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={defaultDateTime(25)} name="endTime" required type="datetime-local" />
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
                <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="courtId">
                  <option value="">Court TBC</option>
                  {options.courts.map((court) => (
                    <option key={court.id} value={court.id}>
                      {court.name}
                    </option>
                  ))}
                </select>
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
        </div>

        <div className="surface-card p-4 sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="section-kicker">Lessons</p>
              <h2 className="section-title mt-1">{lessons.length} scheduled records</h2>
            </div>
          </div>

          {lessons.length > 0 ? (
            <div className="mt-4 grid gap-3">
              {lessons.map((lesson) => (
                <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={lesson.id}>
                  <div className="flex flex-col gap-3">
                    <div>
                      <div className="flex flex-wrap gap-2 text-xs font-bold">
                        <span className={`ui-chip ${lessonStatusTone(lesson.status)}`}>{formatLabel(lesson.status)}</span>
                        <span className="ui-chip ui-chip-muted">{formatLabel(lesson.lesson_type)}</span>
                        <span className="ui-chip ui-chip-muted">{lesson.venue?.name ?? "Venue TBC"}</span>
                      </div>
                      <h3 className="mt-2 font-black text-court-navy">{lesson.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {formatDateTime(lesson.start_time)} · {profileDisplayName(lesson.player)}
                      </p>
                      <p className="text-xs font-semibold text-slate-500">
                        Coach: {profileDisplayName(lesson.coach)}{lesson.court?.name ? ` · ${lesson.court.name}` : ""}
                      </p>
                    </div>

                    <form action={updateCoachLesson} className="grid gap-2 sm:grid-cols-3">
                      <input name="returnTo" type="hidden" value={returnTo} />
                      <input name="lessonId" type="hidden" value={lesson.id} />
                      <input name="title" type="hidden" value={lesson.title} />
                      <input name="lessonType" type="hidden" value={lesson.lesson_type} />
                      <select className="rounded border border-slate-300 px-2 py-2 text-sm font-semibold focus-ring" defaultValue={lesson.status} name="status">
                        {coachLessonStatuses.map((status) => (
                          <option key={status} value={status}>
                            {formatLabel(status)}
                          </option>
                        ))}
                      </select>
                      <select className="rounded border border-slate-300 px-2 py-2 text-sm font-semibold focus-ring" defaultValue={lesson.attendance_status} name="attendanceStatus">
                        {coachLessonAttendanceStatuses.map((status) => (
                          <option key={status} value={status}>
                            {formatLabel(status)}
                          </option>
                        ))}
                      </select>
                      <select className="rounded border border-slate-300 px-2 py-2 text-sm font-semibold focus-ring" defaultValue={lesson.feedback_status} name="feedbackStatus">
                        {coachLessonFeedbackStatuses.map((status) => (
                          <option key={status} value={status}>
                            {formatLabel(status)}
                          </option>
                        ))}
                      </select>
                      <button className="btn-secondary sm:col-span-3" type="submit">
                        Update Lesson
                      </button>
                    </form>

                    {lesson.status === "scheduled" ? (
                      <form action={cancelCoachLesson} className="flex flex-col gap-2 sm:flex-row">
                        <input name="returnTo" type="hidden" value={returnTo} />
                        <input name="lessonId" type="hidden" value={lesson.id} />
                        <select className="rounded border border-slate-300 px-2 py-2 text-sm font-semibold focus-ring" name="cancelStatus">
                          <option value="cancelled">Cancelled</option>
                          <option value="rain">Rain</option>
                          <option value="sick">Sick</option>
                        </select>
                        <button className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800" type="submit">
                          Cancel
                        </button>
                      </form>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="ui-empty-card mt-4">No lessons found for your permitted CoachR scope yet.</div>
          )}
        </div>
      </section>
    </PageShell>
  );
}
