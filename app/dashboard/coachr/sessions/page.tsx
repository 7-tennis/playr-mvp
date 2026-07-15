import Link from "next/link";
import { CollapsibleCard } from "@/components/collapsible-card";
import { ArrowRightIcon, BookingIcon, EntriesIcon, LocationIcon, MatchIcon, StatusIcon, TimeIcon } from "@/components/playr-icons";
import { StatusAlert } from "@/components/status-alert";
import { formatDateTime, formatLabel } from "@/lib/courtside-format";
import { loadCoachLessonOptions, profileDisplayName } from "@/lib/coach-lessons";
import {
  activeSessionParticipants,
  coachSessionLocation,
  coachSessionTypeLabel,
  loadCoachSessionOccurrencesForRange,
  loadCoachSessions
} from "@/lib/coach-sessions";
import { updateCoachSessionParticipant } from "./actions";
import { CoachRPageFrame, CoachRRoleSummary, getProtectedCoachRPage } from "../coachr-shared";

export const dynamic = "force-dynamic";

type CoachRSessionsPageProps = {
  searchParams?: {
    focus?: string;
    session?: string;
    session_error?: string;
  };
};

function successMessage(value?: string) {
  if (value === "created") return "Session created and managed courts reserved.";
  if (value === "roster_updated") return "Session roster updated.";
  return null;
}

function errorMessage(value?: string) {
  if (!value) return null;
  if (value === "capacity") return "This session is already at capacity.";
  if (value === "invalid_student") return "This player is not actively connected to the selected academy.";
  if (value === "access") return "Your role cannot update this session.";
  return "The session could not be updated. Please try again.";
}

function sessionScheduleLabel(weekday: number | null, startTime: string, repeatMode: "none" | "weekly") {
  if (repeatMode === "none") return "One-off session";
  const day = weekday ? ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][weekday - 1] : "Weekly";
  return `${day} · ${startTime.slice(0, 5)}`;
}

export default async function CoachRSessionsPage({ searchParams }: CoachRSessionsPageProps) {
  const { access, content } = await getProtectedCoachRPage("coachr:schedule");
  if (content) return content;
  if (access.context.kind !== "authenticated") return null;

  const context = access.context;
  const now = new Date();
  const end = new Date(now.getTime() + 91 * 24 * 60 * 60 * 1000);
  const [sessions, occurrences, options] = await Promise.all([
    loadCoachSessions(context),
    loadCoachSessionOccurrencesForRange(context, now.toISOString(), end.toISOString()),
    loadCoachLessonOptions(context)
  ]);
  const nextBySession = new Map<string, (typeof occurrences)[number]>();
  occurrences.filter((occurrence) => occurrence.status === "scheduled").forEach((occurrence) => {
    if (!nextBySession.has(occurrence.session_id)) nextBySession.set(occurrence.session_id, occurrence);
  });
  const activeSessions = sessions.filter((session) => session.status === "active");
  const groups = activeSessions.filter((session) => session.session_type !== "private");
  const privateSessions = activeSessions.filter((session) => session.session_type === "private");
  const returnTo = "/dashboard/coachr/sessions";

  return (
    <CoachRPageFrame context={context} subtitle="Private lessons, semi-private sessions and squads in one place." title="Sessions">
      <CoachRRoleSummary context={context} />
      <StatusAlert className="mb-4" message={successMessage(searchParams?.session)} tone="success" />
      <StatusAlert className="mb-4" message={errorMessage(searchParams?.session_error)} tone="error" />

      <section className="mb-5 flex flex-col gap-3 rounded-lg bg-court-navy p-4 text-white shadow-court sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div><p className="text-xs font-black uppercase tracking-wide text-court-lime">CoachR Planner</p><h2 className="mt-1 text-xl font-black">Create once. Reserve courts once.</h2><p className="mt-1 max-w-xl text-sm text-slate-200">Players can belong to several non-overlapping sessions. Shared sessions keep one roster and one court reservation per court.</p></div>
        <Link className="btn-primary shrink-0" href="/dashboard/coachr/sessions/new">Create Session <ArrowRightIcon size={16} /></Link>
      </section>

      <div className="mb-5 grid grid-cols-3 gap-2">
        <div className="surface-card p-3"><p className="text-2xl font-black text-court-navy">{privateSessions.length}</p><p className="text-xs font-bold text-slate-500">Private</p></div>
        <div className="surface-card p-3"><p className="text-2xl font-black text-court-navy">{groups.filter((session) => session.session_type === "semi_private").length}</p><p className="text-xs font-bold text-slate-500">Semi-private</p></div>
        <div className="surface-card p-3"><p className="text-2xl font-black text-court-navy">{groups.filter((session) => session.session_type === "squad").length}</p><p className="text-xs font-bold text-slate-500">Squads</p></div>
      </div>

      {activeSessions.length === 0 ? (
        <section className="empty-state"><MatchIcon className="mx-auto text-court-teal" size={28} /><h2 className="section-title mt-3">Your session planner is ready</h2><p className="mx-auto mt-2 max-w-md text-sm text-slate-600">Create a private, semi-private or squad session to reserve the schedule and courts.</p><Link className="btn-primary mt-4" href="/dashboard/coachr/sessions/new">Create Session</Link></section>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          {activeSessions.map((session) => {
            const participants = activeSessionParticipants(session);
            const next = nextBySession.get(session.id);
            const availableStudents = options.studentOptions.filter((student) => !participants.some((participant) => participant.player_profile_id === student.profile.id));
            return (
              <CollapsibleCard
                badge={<span className={`ui-chip ${session.session_type === "squad" ? "ui-chip-brand" : session.session_type === "semi_private" ? "ui-chip-success" : "ui-chip-muted"}`}>{coachSessionTypeLabel(session.session_type)}</span>}
                defaultOpen={searchParams?.focus === session.id}
                eyebrow={session.session_type === "squad" ? "Group & Squad" : "Coaching Session"}
                key={session.id}
                summary={`${participants.length}/${session.capacity} players · ${sessionScheduleLabel(session.weekday, session.start_local_time, session.repeat_mode)}`}
                title={session.name}
              >
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <p className="flex items-center gap-2 rounded bg-slate-50 p-3 font-semibold text-slate-700"><EntriesIcon size={16} /><span>{participants.length} active player{participants.length === 1 ? "" : "s"}</span></p>
                  <p className="flex items-center gap-2 rounded bg-slate-50 p-3 font-semibold text-slate-700"><StatusIcon size={16} /><span>{profileDisplayName(session.primary_coach)}</span></p>
                  <p className="flex items-center gap-2 rounded bg-slate-50 p-3 font-semibold text-slate-700"><LocationIcon size={16} /><span>{coachSessionLocation(session)}</span></p>
                  <p className="flex items-center gap-2 rounded bg-slate-50 p-3 font-semibold text-slate-700"><TimeIcon size={16} /><span>{next ? formatDateTime(next.start_time) : "No upcoming occurrence"}</span></p>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between gap-3"><h3 className="font-black text-court-navy">Roster</h3><span className="text-xs font-bold text-slate-500">{participants.length} of {session.capacity}</span></div>
                  <div className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200">
                    {participants.map((participant) => (
                      <div className="flex items-center justify-between gap-3 p-3" key={participant.id}>
                        <div className="min-w-0"><p className="truncate font-black text-court-navy">{profileDisplayName(participant.player)}</p><p className="text-xs font-semibold text-slate-500">Active from {participant.joined_on}</p></div>
                        {session.session_type !== "private" ? (
                          <form action={updateCoachSessionParticipant}>
                            <input name="sessionId" type="hidden" value={session.id} /><input name="playerProfileId" type="hidden" value={participant.player_profile_id} /><input name="participantStatus" type="hidden" value="removed" /><input name="effectiveDate" type="hidden" value={new Date().toISOString().slice(0, 10)} /><input name="returnTo" type="hidden" value={returnTo} />
                            <button className="text-sm font-black text-rose-700" type="submit">Remove</button>
                          </form>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>

                {session.session_type !== "private" && participants.length < session.capacity && availableStudents.length > 0 ? (
                  <form action={updateCoachSessionParticipant} className="mt-4 grid gap-2 rounded-lg border border-court-teal/25 bg-court-mist p-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <input name="sessionId" type="hidden" value={session.id} /><input name="participantStatus" type="hidden" value="active" /><input name="effectiveDate" type="hidden" value={new Date().toISOString().slice(0, 10)} /><input name="returnTo" type="hidden" value={returnTo} />
                    <label className="text-sm font-bold text-slate-700">Add player<select className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 focus-ring" name="playerProfileId" required><option value="">Choose active student</option>{availableStudents.map((student) => <option key={student.profile.id} value={student.profile.id}>{profileDisplayName(student.profile)}</option>)}</select></label>
                    <button className="btn-secondary" type="submit">Add to roster</button>
                  </form>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
                  <Link className="btn-primary" href={`/dashboard/coachr/schedule?${new URLSearchParams({ ...(next ? { week: next.occurrence_date } : {}), session: session.id }).toString()}`}>Open Schedule <BookingIcon size={16} /></Link>
                  <span className="ui-chip ui-chip-muted">{formatLabel(session.status)}</span>
                </div>
              </CollapsibleCard>
            );
          })}
        </section>
      )}
    </CoachRPageFrame>
  );
}
