import { formatDateTime, formatLabel } from "@/lib/courtside-format";
import { CollapsibleCard } from "@/components/collapsible-card";
import { CoachRPlayerConnectionSearch } from "@/components/coachr-player-connection-search";
import {
  academyStudentProposal,
  activeAcademyStudentName,
  loadActiveAcademyStudents
} from "@/lib/academy-students";
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
import type { ActiveAcademyStudent, CoachLessonAttendanceResult, OrganisationInvitation } from "@/types/courtside";
import { CoachRCompactGrid, CoachRPageFrame, CoachRRoleSummary, CoachRSummaryCard, getProtectedCoachRPage } from "../coachr-shared";
import {
  assignStudentCoach,
  cancelPlayerLinkRequest,
  requestAdultPlayerLink,
  requestPlayerLink
} from "./actions";

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

type PlayerLinkInvitation = Pick<OrganisationInvitation, "id" | "invitation_kind" | "invited_email" | "invited_name" | "status" | "token" | "expires_at" | "metadata" | "created_at">;

type StudentSummary = {
  id: string;
  name: string;
  isJunior: boolean;
  stage: string;
  assignedCoach: string;
  assignedCoachId: string;
  assignedCoachIds: string[];
  parentName: string | null;
  proposal: Record<string, unknown> | null;
  proposalStatus: string;
  lessonTypes: string[];
  totalLessons: number;
  attendedLessons: number;
  missedLessons: number;
  affectedLessons: number;
  nextLesson: string | null;
  recentHistory: { date: string; status: string }[];
};

function ProposalFields() {
  return (
    <details className="rounded-lg border border-slate-200 bg-white p-3 md:col-span-2">
      <summary className="cursor-pointer font-black text-court-navy">Lesson proposal <span className="text-xs font-semibold text-slate-500">Optional</span></summary>
      <p className="mt-2 text-xs leading-5 text-slate-600">This explains the proposed arrangement. Accepting the academy connection does not confirm a paid or recurring lesson.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">Lesson type<select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="lessonType"><option value="">Not specified</option>{coachLessonTypes.map((type) => <option key={type} value={type}>{formatLabel(type)}</option>)}</select></label>
        <label className="text-sm font-semibold text-slate-700">Day<input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="proposedDay" placeholder="Tuesday" /></label>
        <label className="text-sm font-semibold text-slate-700">Start time<input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="proposedStartTime" type="time" /></label>
        <label className="text-sm font-semibold text-slate-700">Duration<select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="proposedDuration"><option value="">Not specified</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option><option value="90">90 minutes</option></select></label>
        <label className="text-sm font-semibold text-slate-700">Proposed start date<input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="proposedStartDate" type="date" /></label>
        <label className="text-sm font-semibold text-slate-700">Frequency<select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="proposalRecurrence"><option value="">Not specified</option><option value="once">Once-off</option><option value="weekly">Weekly proposal</option></select></label>
        <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Venue or location<input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="proposalVenue" placeholder="Kenmare Tennis Club or private estate court" /></label>
        <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Proposal notes<textarea className="mt-2 min-h-20 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="proposalNotes" /></label>
      </div>
    </details>
  );
}

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

function studentSummary(student: ActiveAcademyStudent): StudentSummary {
  const primaryCoach = student.assignedCoaches[0] ?? null;
  const profile: CoachLessonProfile = {
    first_name: student.firstName,
    id: student.playerProfileId,
    is_junior: student.isJunior,
    junior_stage: student.juniorStage,
    last_name: student.lastName,
    parent_profile_id: student.parentProfileId,
    player_level: student.playerLevel ?? "unknown",
    user_id: null
  };

  return {
    affectedLessons: 0,
    attendedLessons: 0,
    assignedCoach: student.assignedCoaches.length > 0 ? student.assignedCoaches.map((coach) => coach.coachName).join(", ") : "Unassigned",
    assignedCoachId: primaryCoach?.coachProfileId ?? "",
    assignedCoachIds: student.assignedCoaches.map((coach) => coach.coachProfileId),
    id: student.playerProfileId,
    isJunior: student.isJunior,
    lessonTypes: [],
    missedLessons: 0,
    name: activeAcademyStudentName(student),
    nextLesson: null,
    parentName: student.parentName,
    proposal: academyStudentProposal(student),
    proposalStatus: student.proposalStatus,
    recentHistory: [],
    stage: stageLabel(profile),
    totalLessons: 0
  };
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
  switch (value) {
    case "player_invited":
      return "Player link request created. The invited account will see an action notification when its PlayR profile is available; the secure link remains available for manual sharing.";
    case "player_invite_cancelled":
      return "Player link request cancelled.";
    case "coach_assigned":
      return "Coach assignment saved.";
    default:
      return null;
  }
}

function errorMessage(value?: string) {
  switch (value) {
    case "access":
      return "You do not have permission to request that player link.";
    case "duplicate_invitation":
      return "A pending player request already exists for that email.";
    case "missing_fields":
      return "Add the required player or parent details before sending.";
    case "already_connected":
      return "That player is already connected to this academy.";
    case "invalid_coach":
    case "assignment_failed":
      return "The coach assignment could not be saved for this academy.";
    case "parent_contact_missing":
      return "That junior does not have a parent email available for approval.";
    case "player_contact_missing":
      return "That player does not have an email available for approval.";
    case "player_invite_failed":
      return "Player link request could not be created.";
    case "player_invite_cancel_failed":
      return "Player link request could not be cancelled.";
    case "invitation_closed":
      return "That request is no longer pending.";
    default:
      return null;
  }
}

function metadataText(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value : "";
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
  const canManageStudents = !coachOnly;
  const activeVenueId = access.context.venueId ?? access.context.activeOrganisationMembership?.venue_id ?? null;
  const playerInvitationQuery =
    activeVenueId
      ? access.context.supabase
          .from("organisation_invitations")
          .select("id,invitation_kind,invited_email,invited_name,status,token,expires_at,metadata,created_at")
          .eq("venue_id", activeVenueId)
          .in("invitation_kind", ["player", "player_junior"])
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(80)
      : Promise.resolve({ data: [], error: null });
  const [activeStudentsResult, lessons, options, playerInvitationsResult] = await Promise.all([
    loadActiveAcademyStudents(access.context, activeVenueId),
    loadCoachLessons(access.context, 160),
    loadCoachLessonOptions(access.context),
    playerInvitationQuery
  ]);
  const studentMap = new Map(activeStudentsResult.students.map((student) => [student.playerProfileId, studentSummary(student)]));
  const playerInvitations = ((playerInvitationsResult.data ?? []) as PlayerLinkInvitation[]) ?? [];

  lessons.forEach((lesson) => {
    const attendanceRows = lessonAttendanceRows(lesson);

    if (attendanceRows.length > 0) {
      attendanceRows.forEach((row) => {
        const summary = studentMap.get(row.player_profile_id);
        if (!summary) return;
        if (!summary.lessonTypes.includes(lesson.lesson_type)) summary.lessonTypes.push(lesson.lesson_type);
        addStudentLesson(summary, lesson, row.attendance_status);
      });
      return;
    }

    const summary = studentMap.get(lesson.player_id);
    if (!summary) return;
    if (!summary.lessonTypes.includes(lesson.lesson_type)) summary.lessonTypes.push(lesson.lesson_type);
    addStudentLesson(summary, lesson, fallbackAttendanceResult(lesson));
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
    .filter((student) => (canFilterCoach && selectedCoach ? student.assignedCoachIds.includes(selectedCoach) : true))
    .filter((student) => (selectedStage ? student.stage === selectedStage : true))
    .filter((student) => (selectedLessonType ? student.lessonTypes.includes(selectedLessonType) : true))
    .sort((left, right) => left.name.localeCompare(right.name));
  const allStudents = Array.from(studentMap.values());
  const privateStudentCount = allStudents.filter((student) => student.lessonTypes.includes("private")).length;
  const assignedStudentCount = allStudents.filter((student) => student.assignedCoachIds.length > 0).length;
  const canViewDiagnostics = access.context.role === "platform_admin" || ["organisation_admin", "club_manager"].includes(access.context.activeOrganisationRole ?? "");
  const emptyStudentMessage = activeStudentsResult.error
    ? "Students could not be loaded. Check the active organisation or try again."
    : query || selectedCoach || selectedStage || selectedLessonType
      ? "No active students match these filters."
      : coachOnly
        ? "No students are assigned to this coach yet. A Head Coach can assign an active academy student."
        : playerInvitations.length > 0
          ? "Student invitations are awaiting approval. Lessons can be created once a player connection is accepted."
          : "No students are connected to this academy yet. Invite a student or request access to an existing PlayR profile.";

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

      <CoachRCompactGrid className="mb-5">
        <CoachRSummaryCard helper="active students" label="Total" value={allStudents.length} />
        <CoachRSummaryCard helper="private coaching" label="Private" value={privateStudentCount} />
        <CoachRSummaryCard helper="coach assigned" label="Assigned" value={assignedStudentCount} />
        <CoachRSummaryCard helper="parent approval" href="#pending-links" label="Pending" value={playerInvitations.length} />
      </CoachRCompactGrid>

      {canViewDiagnostics ? (
        <div className="mb-5 flex justify-end">
          <a className="text-sm font-black text-court-teal hover:text-court-navy" href="/dashboard/coachr/students/diagnostics">Connection Diagnostics</a>
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
        summary="Find an existing player, or send a private approval invitation."
        title="Connect a student"
      >
        {canManageStudents ? (
          <CoachRPlayerConnectionSearch coaches={options.coachProfiles.map((coach) => ({ id: coach.id, name: profileDisplayName(coach) }))} />
        ) : null}

        <section className="mb-5 rounded-lg border border-court-teal/20 bg-court-mist p-4">
          <p className="text-sm font-black text-court-navy">Adult player</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">The adult approves the connection from their own PlayR account.</p>
          <form action={requestAdultPlayerLink} className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">Player email<input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="playerEmail" required type="email" /></label>
            <label className="text-sm font-semibold text-slate-700">Player name<input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="playerName" placeholder="Optional" /></label>
            <label className="text-sm font-semibold text-slate-700">Player phone<input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="playerPhone" placeholder="Optional" /></label>
            {!coachOnly && options.coachProfiles.length > 0 ? (
              <label className="text-sm font-semibold text-slate-700">Coach assignment<select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="coachProfileId"><option value="">Assign after acceptance</option>{options.coachProfiles.map((coach) => <option key={coach.id} value={coach.id}>{profileDisplayName(coach)}</option>)}</select></label>
            ) : null}
            <ProposalFields />
            <button className="btn-primary md:col-span-2" type="submit">Send Adult Invitation</button>
          </form>
        </section>

        <p className="mb-3 text-sm font-black text-court-navy">Junior player · parent or guardian approval</p>
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
          <ProposalFields />
          <button className="btn-primary md:col-span-2" type="submit">
            Send Approval Request
          </button>
        </form>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          CoachR reuses PlayR profiles. A junior connection always stays pending until the parent or guardian accepts it.
        </p>
      </CollapsibleCard>

      <CollapsibleCard
        eyebrow="Pending"
        id="pending-links"
        summary={`${playerInvitations.length} parent approvals awaiting a response. Pending juniors are not shown as authorised students yet.`}
        title="Pending Player Requests"
      >
        {playerInvitations.length > 0 ? (
          <div className="grid gap-3">
            {playerInvitations.map((invitation) => {
              const isAdult = invitation.invitation_kind === "player";
              const playerName = isAdult
                ? invitation.invited_name || invitation.invited_email
                : [metadataText(invitation.metadata, "playerFirstName"), metadataText(invitation.metadata, "playerLastName")].filter(Boolean).join(" ") || "Junior player";

              return (
                <article className="rounded-lg border border-slate-200 bg-court-mist p-3" key={invitation.id}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-black text-court-navy">{playerName}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-600">
                        {isAdult ? "Player" : "Parent"}: {invitation.invited_name || invitation.invited_email} · {invitation.invited_email}
                      </p>
                    </div>
                    <span className="ui-chip ui-chip-muted">{isAdult ? "Adult approval" : "Parent approval"}</span>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-slate-600">Expires: {formatDateTime(invitation.expires_at)}</p>
                  <code className="mt-2 block break-all rounded bg-white px-2 py-1 text-xs font-bold text-court-teal">{invitationLink(invitation.token)}</code>
                  <form action={cancelPlayerLinkRequest} className="mt-3 flex flex-wrap items-center gap-2">
                    <input name="invitationId" type="hidden" value={invitation.id} />
                    <label className="text-xs font-semibold text-amber-800">
                      <input className="mr-1" name="confirmCancel" type="checkbox" /> Confirm cancel
                    </label>
                    <button className="rounded border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-800" type="submit">
                      Cancel Request
                    </button>
                  </form>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="ui-empty-card">No pending player-link requests.</div>
        )}
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
                  <span className="ui-chip ui-chip-success">Connected</span>
                  <span className="ui-chip ui-chip-muted">{student.isJunior ? "Junior" : "Player"}</span>
                  <span className="ui-chip ui-chip-muted">{student.stage}</span>
                </div>
                <details className="ui-collapsible mt-2">
                  <summary className="flex cursor-pointer items-start justify-between gap-3">
                    <span>
                      <span className="block font-black text-court-navy">{student.name}</span>
                      <span className="mt-1 block text-sm text-slate-600">
                        {student.assignedCoach} · {student.nextLesson ? `Next ${formatDateTime(student.nextLesson)}` : "No lesson scheduled"}
                      </span>
                    </span>
                    <span className="text-sm font-black text-court-teal">Open</span>
                  </summary>
                  <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3">
                    <div className="flex flex-wrap gap-2 text-xs font-bold">
                      <span className="ui-chip ui-chip-brand">{student.totalLessons} lessons</span>
                      <span className="ui-chip ui-chip-success">{student.attendedLessons} attended</span>
                      <span className="ui-chip bg-rose-50 text-rose-700">{student.missedLessons} missed</span>
                      <span className="ui-chip ui-chip-warning">{student.affectedLessons} rain/cancelled</span>
                    </div>
                    <div className="grid gap-2 text-sm font-semibold text-slate-600 sm:grid-cols-2">
                      <p>Coach: <span className="font-black text-court-navy">{student.assignedCoach}</span></p>
                      {student.isJunior ? <p>Parent: <span className="font-black text-court-navy">{student.parentName ?? "Linked guardian"}</span></p> : null}
                      <p>Stage: <span className="font-black text-court-navy">{student.stage}</span></p>
                      <p>Normal slot: <span className="font-black text-court-navy">{student.nextLesson ? formatDateTime(student.nextLesson) : "To be placed"}</span></p>
                    </div>
                    {student.proposal ? (
                      <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <summary className="cursor-pointer text-sm font-black text-court-navy">Proposed lesson details</summary>
                        <div className="mt-2 grid gap-1 text-xs font-semibold text-slate-600 sm:grid-cols-2">
                          {Object.entries(student.proposal).filter(([, value]) => typeof value === "string" || typeof value === "number").map(([key, value]) => (
                            <p key={key}>{formatLabel(key)}: <span className="font-black text-court-navy">{String(value)}</span></p>
                          ))}
                        </div>
                      </details>
                    ) : null}
                    {canManageStudents && options.coachProfiles.length > 0 ? (
                      <form action={assignStudentCoach} className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_auto] sm:items-end">
                        <input name="playerProfileId" type="hidden" value={student.id} />
                        <label className="text-sm font-semibold text-slate-700">
                          Add coach assignment
                          <select className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 focus-ring" defaultValue={student.assignedCoachId} name="coachProfileId" required>
                            <option value="">Choose coach</option>
                            {options.coachProfiles.map((coach) => <option key={coach.id} value={coach.id}>{profileDisplayName(coach)}</option>)}
                          </select>
                        </label>
                        <button className="btn-secondary px-3 py-2" type="submit">Assign Coach</button>
                      </form>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <a className="btn-secondary px-3 py-2" href={`/dashboard/players/${student.id}`}>
                        View MyPlayR
                      </a>
                      <a className="btn-primary px-3 py-2" href={`/dashboard/coachr/schedule?new=1&player=${student.id}${student.assignedCoachId ? `&coach=${student.assignedCoachId}` : ""}#new-lesson`}>
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
          <div className="ui-empty-card mt-5">{emptyStudentMessage}</div>
        )}
      </section>
    </CoachRPageFrame>
  );
}
