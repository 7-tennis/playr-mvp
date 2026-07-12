import { formatDateTime, formatLabel } from "@/lib/courtside-format";
import { CollapsibleCard } from "@/components/collapsible-card";
import {
  attendanceResultLabel,
  coachLessonTypes,
  lessonAttendanceRows,
  loadCoachLessonOptions,
  loadCoachLessons,
  profileDisplayName,
  type CoachLessonProfile,
  type CoachLessonWithRelations
} from "@/lib/coach-lessons";
import { invitationLink } from "@/lib/organisations";
import type { CoachLessonAttendanceResult, CoachPlayerAssignment } from "@/types/courtside";
import { CoachRPageFrame, CoachRRoleSummary, getProtectedCoachRPage } from "../coachr-shared";
import { requestPlayerLink } from "./actions";

export const dynamic = "force-dynamic";

type CoachRStudentsPageProps = {
  searchParams?: {
    coach?: string;
    error?: string;
    lessonType?: string;
    message?: string;
    q?: string;
    stage?: string;
    token?: string;
  };
};

type CoachPlayerAssignmentWithProfiles = Pick<CoachPlayerAssignment, "id" | "coach_profile_id" | "player_profile_id" | "venue_id" | "status" | "assigned_at"> & {
  coach: CoachLessonProfile | null;
  player: CoachLessonProfile | null;
};

type StudentSummary = {
  id: string;
  name: string;
  isJunior: boolean;
  stage: string;
  assignedCoach: string;
  assignedCoachId: string;
  lessonTypes: string[];
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

function stageLabel(profile: CoachLessonProfile | null) {
  if (!profile) {
    return "Level TBC";
  }

  return profile.is_junior ? formatLabel(profile.junior_stage ?? "not_sure") : formatLabel(profile.player_level ?? "unknown");
}

function upsertStudent(studentMap: Map<string, StudentSummary>, profile: CoachLessonProfile | null, profileId: string, lesson: CoachLessonWithRelations) {
  const existing = studentMap.get(profileId);

  if (existing) {
    if (!existing.lessonTypes.includes(lesson.lesson_type)) {
      existing.lessonTypes.push(lesson.lesson_type);
    }
    return existing;
  }

  const summary: StudentSummary = {
    affectedLessons: 0,
    attendedLessons: 0,
    assignedCoach: profileDisplayName(lesson.coach),
    assignedCoachId: lesson.coach_id,
    id: profileId,
    isJunior: Boolean(profile?.is_junior),
    lessonTypes: [lesson.lesson_type],
    missedLessons: 0,
    name: profileDisplayName(profile),
    nextLesson: null,
    recentHistory: [],
    stage: stageLabel(profile),
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

function statusMessage(value?: string) {
  return value === "player_invited" ? "Player link request created. Copy the invite link below; email delivery is not configured in this MVP." : null;
}

function errorMessage(value?: string) {
  switch (value) {
    case "access":
      return "You do not have permission to request that player link.";
    case "duplicate_invitation":
      return "A pending request already exists for that parent email.";
    case "missing_fields":
      return "Add the parent email and junior name before sending.";
    case "player_invite_failed":
      return "Player link request could not be created.";
    default:
      return null;
  }
}

export default async function CoachRStudentsPage({ searchParams }: CoachRStudentsPageProps) {
  const { access, content } = await getProtectedCoachRPage("coachr:students");

  if (content) {
    return content;
  }

  if (access.context.kind !== "authenticated") {
    return null;
  }

  const coachOnly = access.context.role === "coach";
  const assignmentsQuery =
    access.context.role === "platform_admin"
      ? access.context.supabase
          .from("coach_player_assignments")
          .select("id,coach_profile_id,player_profile_id,venue_id,status,assigned_at,coach:coach_profile_id(id,user_id,first_name,last_name,is_junior,parent_profile_id,junior_stage,player_level),player:player_profile_id(id,user_id,first_name,last_name,is_junior,parent_profile_id,junior_stage,player_level)")
          .eq("status", "active")
          .limit(220)
      : access.context.role === "coach" && access.context.adultProfileId
        ? access.context.supabase
            .from("coach_player_assignments")
            .select("id,coach_profile_id,player_profile_id,venue_id,status,assigned_at,coach:coach_profile_id(id,user_id,first_name,last_name,is_junior,parent_profile_id,junior_stage,player_level),player:player_profile_id(id,user_id,first_name,last_name,is_junior,parent_profile_id,junior_stage,player_level)")
            .eq("coach_profile_id", access.context.adultProfileId)
            .eq("status", "active")
            .limit(220)
        : access.context.venueId
          ? access.context.supabase
              .from("coach_player_assignments")
              .select("id,coach_profile_id,player_profile_id,venue_id,status,assigned_at,coach:coach_profile_id(id,user_id,first_name,last_name,is_junior,parent_profile_id,junior_stage,player_level),player:player_profile_id(id,user_id,first_name,last_name,is_junior,parent_profile_id,junior_stage,player_level)")
              .eq("venue_id", access.context.venueId)
              .eq("status", "active")
              .limit(220)
          : Promise.resolve({ data: [], error: null });
  const [lessons, options, assignmentResult] = await Promise.all([loadCoachLessons(access.context, 160), loadCoachLessonOptions(access.context), assignmentsQuery]);
  const studentMap = new Map<string, StudentSummary>();
  const assignments = ((assignmentResult.data ?? []) as unknown as CoachPlayerAssignmentWithProfiles[]) ?? [];

  lessons.forEach((lesson) => {
    const attendanceRows = lessonAttendanceRows(lesson);

    if (attendanceRows.length > 0) {
      attendanceRows.forEach((row) => {
        const summary = upsertStudent(studentMap, row.player ?? row.junior, row.player_profile_id, lesson);
        addStudentLesson(summary, lesson, row.attendance_status);
      });
      return;
    }

    const summary = upsertStudent(studentMap, lesson.player, lesson.player_id, lesson);
    addStudentLesson(summary, lesson, fallbackAttendanceResult(lesson));
  });

  assignments.forEach((assignment) => {
    const summary = upsertStudent(studentMap, assignment.player, assignment.player_profile_id, {
      coach: assignment.coach,
      coach_id: assignment.coach_profile_id,
      lesson_type: "private"
    } as CoachLessonWithRelations);

    if (!summary.recentHistory.some((item) => item.date === assignment.assigned_at && item.status === "Assigned")) {
      summary.recentHistory.push({ date: assignment.assigned_at, status: "Assigned" });
    }
  });

  const query = (searchParams?.q ?? "").trim().toLowerCase();
  const selectedCoach = searchParams?.coach ?? "";
  const selectedStage = searchParams?.stage ?? "";
  const selectedLessonType = searchParams?.lessonType ?? "";
  const canFilterCoach = !coachOnly && options.coachProfiles.length > 0;
  const stageOptions = Array.from(new Set(Array.from(studentMap.values()).map((student) => student.stage))).sort();
  const students = Array.from(studentMap.values())
    .map((student) => ({
      ...student,
      recentHistory: student.recentHistory
        .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
        .slice(0, 3)
    }))
    .filter((student) => (query ? student.name.toLowerCase().includes(query) : true))
    .filter((student) => (canFilterCoach && selectedCoach ? student.assignedCoachId === selectedCoach : true))
    .filter((student) => (selectedStage ? student.stage === selectedStage : true))
    .filter((student) => (selectedLessonType ? student.lessonTypes.includes(selectedLessonType) : true))
    .sort((left, right) => left.name.localeCompare(right.name));

  return (
    <CoachRPageFrame context={access.context} subtitle="Search, filter and open student coaching cards without leaving CoachR." title="Students">
      <CoachRRoleSummary context={access.context} />

      {statusMessage(searchParams?.message) ? (
        <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{statusMessage(searchParams?.message)}</div>
      ) : null}
      {errorMessage(searchParams?.error) ? (
        <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{errorMessage(searchParams?.error)}</div>
      ) : null}
      {searchParams?.token ? (
        <div className="mb-5 rounded-lg border border-court-teal/30 bg-court-mist p-3 text-sm font-bold text-court-navy">
          Parent approval link: <code className="break-all rounded bg-white px-2 py-1 text-court-teal">{invitationLink(searchParams.token)}</code>
        </div>
      ) : null}

      <CollapsibleCard
        defaultOpen={searchParams?.q !== undefined}
        eyebrow="Find"
        summary="Search lesson-linked students and filter by coach, stage or programme."
        title="Student filters"
      >
        <form className="grid gap-3 md:grid-cols-4" method="get">
          <label className="text-sm font-semibold text-slate-700">
            Search
            <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={searchParams?.q ?? ""} name="q" placeholder="Player name" />
          </label>
          {canFilterCoach ? (
            <label className="text-sm font-semibold text-slate-700">
              Coach
              <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={selectedCoach} name="coach">
                <option value="">All coaches</option>
                {options.coachProfiles.map((coach) => (
                  <option key={coach.id} value={coach.id}>
                    {profileDisplayName(coach)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="text-sm font-semibold text-slate-700">
            Stage/level
            <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={selectedStage} name="stage">
              <option value="">All stages</option>
              {stageOptions.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Programme
            <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={selectedLessonType} name="lessonType">
              <option value="">All lesson types</option>
              {coachLessonTypes.map((type) => (
                <option key={type} value={type}>
                  {formatLabel(type)}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-primary md:col-span-4" type="submit">
            Apply Filters
          </button>
        </form>
      </CollapsibleCard>

      <CollapsibleCard
        eyebrow="Add"
        summary="Request parent approval before a junior becomes visible in CoachR."
        title="Request Player Link"
      >
        <form action={requestPlayerLink} className="grid gap-3 md:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">
            Parent email
            <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="parentEmail" placeholder="parent@example.com" required type="email" />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Parent name
            <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="parentName" placeholder="Optional" />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Junior first name
            <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="playerFirstName" required />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Junior surname
            <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="playerLastName" required />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Parent phone
            <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="parentPhone" placeholder="Optional" />
          </label>
          {!coachOnly && options.coachProfiles.length > 0 ? (
            <label className="text-sm font-semibold text-slate-700">
              Coach assignment
              <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="coachProfileId">
                <option value="">Assign after acceptance</option>
                {options.coachProfiles.map((coach) => (
                  <option key={coach.id} value={coach.id}>
                    {profileDisplayName(coach)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button className="btn-primary md:col-span-2" type="submit">
            Send Approval Request
          </button>
        </form>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <label className="text-sm font-semibold text-slate-700">
            Existing PlayR profile
            <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="profilePreview">
              <option value="">Choose profile</option>
              {options.playerProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profileDisplayName(profile)}
                  {profile.is_junior ? " (junior)" : ""}
                </option>
              ))}
            </select>
          </label>
          <a className="btn-primary text-center" href="/dashboard/coachr/schedule?new=1#new-lesson">
            Place on Schedule
          </a>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          CoachR does not create duplicate profiles. Use the request first when a junior is not yet approved for this organisation.
        </p>
      </CollapsibleCard>

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
                  <span className="ui-chip ui-chip-muted">{student.stage}</span>
                  <span className="ui-chip ui-chip-brand">{student.totalLessons} lessons</span>
                  <span className="ui-chip ui-chip-success">{student.attendedLessons} attended</span>
                  <span className="ui-chip bg-rose-50 text-rose-700">{student.missedLessons} missed</span>
                  <span className="ui-chip ui-chip-warning">{student.affectedLessons} rain/cancelled</span>
                </div>
                <details className="ui-collapsible mt-2">
                  <summary className="flex cursor-pointer items-start justify-between gap-3">
                    <span>
                      <span className="block font-black text-court-navy">{student.name}</span>
                      <span className="mt-1 block text-sm text-slate-600">
                        {student.nextLesson ? `Next: ${formatDateTime(student.nextLesson)}` : "No upcoming lesson scheduled"}
                      </span>
                    </span>
                    <span className="text-sm font-black text-court-teal">Open</span>
                  </summary>
                  <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3">
                    <div className="grid gap-2 text-sm font-semibold text-slate-600 sm:grid-cols-2">
                      <p>Coach: <span className="font-black text-court-navy">{student.assignedCoach}</span></p>
                      <p>Stage: <span className="font-black text-court-navy">{student.stage}</span></p>
                      <p>Normal slot: <span className="font-black text-court-navy">{student.nextLesson ? formatDateTime(student.nextLesson) : "To be placed"}</span></p>
                      <p>Notifications: <span className="font-black text-court-navy">In-app ready</span></p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a className="btn-secondary px-3 py-2" href={`/dashboard/players/${student.id}`}>
                        View MyPlayR
                      </a>
                      <a className="btn-primary px-3 py-2" href="/dashboard/coachr/schedule?new=1#new-lesson">
                        Schedule Lesson
                      </a>
                    </div>
                    {student.recentHistory.map((item) => (
                      <p className="text-xs font-semibold text-slate-600" key={`${student.id}-${item.date}-${item.status}`}>
                        {formatDateTime(item.date)} · {item.status}
                      </p>
                    ))}
                  </div>
                </details>
              </article>
            ))}
          </div>
        ) : (
          <div className="ui-empty-card mt-5">No lesson-linked students found yet.</div>
        )}
      </section>
    </CoachRPageFrame>
  );
}
