import Link from "next/link";
import { CoachRSessionBuilder } from "@/components/coachr-session-builder";
import { StatusAlert } from "@/components/status-alert";
import { loadCoachLessonOptions, profileDisplayName } from "@/lib/coach-lessons";
import { formatLabel } from "@/lib/courtside-format";
import { CoachRPageFrame, CoachRRoleSummary, getProtectedCoachRPage } from "../../coachr-shared";

export const dynamic = "force-dynamic";

type NewCoachSessionPageProps = {
  searchParams?: {
    session_error?: string;
  };
};

function errorMessage(value?: string) {
  if (!value) return null;
  if (value.startsWith("player_conflict:")) return `${value.split(":").slice(1).join(":")} already has another session at this time.`;
  if (value.startsWith("coach_conflict:")) return `${value.split(":").slice(1).join(":")} already has another session at this time.`;
  if (value.startsWith("court_conflict:")) return `${value.split(":").slice(1).join(":")} is no longer available for the selected time.`;
  switch (value) {
    case "invalid_student": return "A selected player is not actively connected to this academy.";
    case "coach_venue": return "The selected coach cannot be assigned to this academy session.";
    case "court_access": return "This academy no longer has permission to reserve one of the selected courts.";
    case "missing_court": return "Choose at least one court, or select an off-site location.";
    case "participant_count": return "Private sessions need one player; semi-private sessions need at least two.";
    case "capacity": return "The session capacity must include every selected player.";
    case "recurrence_range": return "Check the weekly day, times and end option.";
    case "time_order": return "The session must end after it starts.";
    case "custom_location": return "Enter the off-site venue or court.";
    case "missing_migration": return "CoachR sessions need the latest database migration before they can be created.";
    case "access": return "Your role cannot create a session in this organisation.";
    case "missing_fields": return "Complete the required session details before saving.";
    case "session_create_failed":
    case "session_failed":
      return "The session could not be created. No court booking was made. Please try again.";
    default: return "The session could not be created. No court booking was made. Please try again.";
  }
}

export default async function NewCoachSessionPage({ searchParams }: NewCoachSessionPageProps) {
  const { access, content } = await getProtectedCoachRPage("coachr:schedule");
  if (content) return content;
  if (access.context.kind !== "authenticated") return null;

  const context = access.context;
  const options = await loadCoachLessonOptions(context);
  const venueId = context.venueId ?? context.activeOrganisationMembership?.venue_id ?? null;
  const venueName = options.venues.find((venue) => venue.id === venueId)?.name
    ?? context.activeOrganisationMembership?.venue?.name
    ?? "your academy";
  const defaultCoachId = context.role === "coach" ? context.adultProfileId : context.adultProfileId ?? options.coachProfiles[0]?.id ?? null;

  return (
    <CoachRPageFrame context={context} subtitle="Choose a session type, then add only the details needed to schedule it." title="Create Session">
      <CoachRRoleSummary context={context} />
      <StatusAlert className="mb-5" message={errorMessage(searchParams?.session_error)} tone="error" />
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link className="btn-secondary" href="/dashboard/coachr/sessions">Back to Sessions</Link>
        <span className="ui-chip ui-chip-brand">{venueName}</span>
      </div>

      {!venueId ? (
        <section className="empty-state"><h2 className="section-title">Choose an organisation first</h2><p className="mt-2 text-sm text-slate-600">Session players, coaches and courts are always scoped to one academy.</p></section>
      ) : options.studentLoadError === "load_failed" ? (
        <section className="empty-state"><h2 className="section-title">Players could not be loaded</h2><p className="mt-2 text-sm text-slate-600">Refresh the page or check the active academy before creating a session.</p></section>
      ) : options.studentOptions.length === 0 ? (
        <section className="empty-state"><h2 className="section-title">Connect a player first</h2><p className="mt-2 text-sm text-slate-600">Only active academy students can be scheduled.</p><Link className="btn-primary mt-4" href="/dashboard/coachr/students">Open Students</Link></section>
      ) : options.coachProfiles.length === 0 ? (
        <section className="empty-state"><h2 className="section-title">Add a coach first</h2><p className="mt-2 text-sm text-slate-600">An active academy coach is required for every session.</p><Link className="btn-primary mt-4" href="/dashboard/coachr/coaches">Open Coaches</Link></section>
      ) : (
        <CoachRSessionBuilder
          coaches={options.coachProfiles.map((coach) => ({ id: coach.id, meta: "Academy coach", name: profileDisplayName(coach) }))}
          courts={options.courts.map((court) => ({ id: court.id, name: court.name, ownerName: court.owner_name ?? null }))}
          defaultCoachId={defaultCoachId}
          externalVenues={options.externalVenues.map((venue) => ({ id: venue.id, name: venue.name }))}
          students={options.studentOptions.map((student) => ({
            id: student.profile.id,
            meta: student.profile.is_junior
              ? student.profile.junior_stage ? formatLabel(student.profile.junior_stage) : "Junior"
              : student.profile.player_level ? formatLabel(student.profile.player_level) : "Adult player",
            name: profileDisplayName(student.profile)
          }))}
          venueId={venueId}
          venueName={venueName}
        />
      )}
    </CoachRPageFrame>
  );
}
