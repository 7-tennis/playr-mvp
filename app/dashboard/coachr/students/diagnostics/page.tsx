import { formatDateTime, formatLabel } from "@/lib/courtside-format";
import { getProtectedCoachRPage, CoachRPageFrame } from "../../coachr-shared";

export const dynamic = "force-dynamic";

type ConnectionDiagnostic = {
  invitation_id: string;
  invitation_status: string;
  accepted_profile_id: string | null;
  accepted_by_profile_id: string | null;
  player_profile_id: string | null;
  player_name: string | null;
  organisation_player_link_id: string | null;
  organisation_player_link_status: string | null;
  intended_coach_profile_id: string | null;
  intended_coach_name: string | null;
  coach_assignment_status: string;
  myplayr_card_eligible: boolean;
  lesson_selector_eligible: boolean;
  proposal_status: string;
};

function shortId(value: string | null) {
  return value ? `${value.slice(0, 8)}...` : "Not set";
}

type DiagnosticsPageProps = {
  searchParams?: { lesson?: string; occurrence?: string; request?: string; venue?: string };
};

type RequestDiagnostic = {
  request_id: string;
  request_origin: string;
  request_status: string;
  occurrence_id: string;
  player_profile_id: string;
  responder_user_id: string;
  coach_profile_id: string;
  current_booking_ids: string[];
  proposed_court_id: string;
  availability_result: string;
  approval_result: string;
  replacement_occurrence_id: string | null;
  notification_count: number;
};

type ReservationDiagnostic = {
  lesson_id: string;
  series_id: string | null;
  selected_court_id: string | null;
  linked_booking_id: string | null;
  booking_status: string | null;
  booking_start: string | null;
  booking_end: string | null;
  owner_organisation_id: string | null;
  booking_organisation_id: string | null;
  player_availability_blocked: boolean;
  reservation_valid: boolean;
  recurrence_end_mode: string | null;
  next_generation_boundary: string | null;
};

type OccurrenceDiagnostic = {
  occurrence_id: string;
  session_id: string;
  session_name: string;
  coach_names: string;
  court_id: string | null;
  court_name: string | null;
  booking_id: string | null;
  booking_status: string | null;
  availability_resolver_result: "available" | "unavailable" | "not_applicable";
  occupancy_type: string;
};

export default async function CoachRConnectionDiagnosticsPage({ searchParams }: DiagnosticsPageProps) {
  const { access, content } = await getProtectedCoachRPage("coachr:students");

  if (content) return content;
  if (access.context.kind !== "authenticated") return null;

  const canView = ["platform_admin", "head_coach", "club_admin"].includes(access.context.role)
    || ["organisation_admin", "club_manager", "head_coach"].includes(access.context.activeOrganisationRole ?? "");
  const platformVenuesResult = access.context.role === "platform_admin"
    ? await access.context.supabase.from("venues").select("id,name").eq("status", "active").order("name", { ascending: true }).limit(200)
    : { data: [] };
  const platformVenues = (platformVenuesResult.data ?? []) as { id: string; name: string }[];
  const requestedVenueId = platformVenues.some((venue) => venue.id === searchParams?.venue) ? searchParams?.venue ?? null : null;
  const venueId = access.context.role === "platform_admin"
    ? requestedVenueId ?? access.context.activeOrganisationMembership?.venue_id ?? platformVenues[0]?.id ?? null
    : access.context.venueId ?? access.context.activeOrganisationMembership?.venue_id ?? null;

  if (!canView || !venueId) {
    return (
      <CoachRPageFrame context={access.context} subtitle="This technical view is limited to organisation administrators and the PlayR platform team." title="Access Restricted">
        <section className="empty-state">Connection diagnostics are not available for this role.</section>
      </CoachRPageFrame>
    );
  }

  const { data, error } = await access.context.supabase.rpc("coachr_connection_diagnostics", {
    p_invitation_id: null,
    p_venue_id: venueId
  });
  const diagnostics = ((data ?? []) as ConnectionDiagnostic[]) ?? [];
  const requestedLessonId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(searchParams?.lesson ?? "")
    ? searchParams?.lesson ?? null
    : null;
  const reservationResult = requestedLessonId
    ? await access.context.supabase.rpc("coachr_lesson_reservation_diagnostics", { p_lesson_id: requestedLessonId })
    : { data: [], error: null };
  const reservation = ((reservationResult.data?.[0] ?? null) as ReservationDiagnostic | null);
  const requestedOccurrenceId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(searchParams?.occurrence ?? "")
    ? searchParams?.occurrence ?? null
    : null;
  const occurrenceResult = requestedOccurrenceId
    ? await access.context.supabase.rpc("coachr_occurrence_diagnostics", { p_occurrence_id: requestedOccurrenceId })
    : { data: [], error: null };
  const occurrenceDiagnostics = (occurrenceResult.data ?? []) as OccurrenceDiagnostic[];
  const requestedRequestId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(searchParams?.request ?? "")
    ? searchParams?.request ?? null
    : null;
  const requestResult = requestedRequestId
    ? await access.context.supabase.rpc("coachr_reschedule_request_diagnostics", { p_request_id: requestedRequestId })
    : { data: [], error: null };
  const requestDiagnostic = (requestResult.data?.[0] ?? null) as RequestDiagnostic | null;

  if (error) {
    console.error("CoachR connection diagnostics could not be loaded", {
      code: error.code,
      role: access.context.role,
      venueId
    });
  }

  return (
    <CoachRPageFrame context={access.context} subtitle="Trace connection acceptance, coach assignment and student visibility without exposing invitation tokens." title="Connection Diagnostics">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {access.context.role === "platform_admin" ? (
          <form className="flex items-center gap-2" method="get">
            <label className="text-sm font-semibold text-slate-700">
              Organisation
              <select className="ml-2 rounded border border-slate-300 bg-white px-3 py-2 focus-ring" defaultValue={venueId ?? ""} name="venue">
                {platformVenues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
              </select>
            </label>
            <button className="btn-secondary" type="submit">Switch</button>
          </form>
        ) : <span />}
        <a className="btn-secondary" href="/dashboard/coachr/students">Back to Students</a>
      </div>

      {requestedLessonId ? (
        <section className="surface-card mb-5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="section-kicker">Court reservation</p>
              <h2 className="section-title mt-1">Lesson {shortId(requestedLessonId)}</h2>
            </div>
            <span className={`ui-chip ${reservation?.reservation_valid ? "ui-chip-success" : "ui-chip-warning"}`}>
              {reservation?.reservation_valid ? "Reservation valid" : "Needs review"}
            </span>
          </div>
          {reservationResult.error ? (
            <p className="mt-3 text-sm font-semibold text-amber-800">Reservation diagnostics could not be loaded for this lesson.</p>
          ) : reservation ? (
            <div className="mt-4 grid gap-2 text-sm font-semibold text-slate-600 sm:grid-cols-2">
              <p>Series: <span className="font-black text-court-navy">{shortId(reservation.series_id)}</span></p>
              <p>Court: <span className="font-black text-court-navy">{shortId(reservation.selected_court_id)}</span></p>
              <p>Booking: <span className="font-black text-court-navy">{shortId(reservation.linked_booking_id)}</span></p>
              <p>Status: <span className="font-black text-court-navy">{reservation.booking_status ? formatLabel(reservation.booking_status) : "Not linked"}</span></p>
              <p>Owner organisation: <span className="font-black text-court-navy">{shortId(reservation.owner_organisation_id)}</span></p>
              <p>Booking organisation: <span className="font-black text-court-navy">{shortId(reservation.booking_organisation_id)}</span></p>
              <p>Player availability: <span className="font-black text-court-navy">{reservation.player_availability_blocked ? "Blocked" : "Available"}</span></p>
              <p>Recurrence: <span className="font-black text-court-navy">{reservation.recurrence_end_mode ? formatLabel(reservation.recurrence_end_mode) : "Once-off"}</span></p>
              <p>Booking time: <span className="font-black text-court-navy">{reservation.booking_start ? formatDateTime(reservation.booking_start) : "Not set"}</span></p>
              <p>Generation boundary: <span className="font-black text-court-navy">{reservation.next_generation_boundary ?? "Not recurring"}</span></p>
            </div>
          ) : (
            <p className="mt-3 text-sm font-semibold text-amber-800">No permitted lesson reservation was found.</p>
          )}
        </section>
      ) : null}

      {requestedOccurrenceId ? (
        <section className="surface-card mb-5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="section-kicker">Unified schedule</p>
              <h2 className="section-title mt-1">Occurrence {shortId(requestedOccurrenceId)}</h2>
            </div>
            <span className={`ui-chip ${occurrenceDiagnostics.length > 0 && occurrenceDiagnostics.every((item) => item.availability_resolver_result !== "available") ? "ui-chip-success" : "ui-chip-warning"}`}>
              {occurrenceDiagnostics.length > 0 && occurrenceDiagnostics.every((item) => item.availability_resolver_result !== "available") ? "Occupancy valid" : "Needs review"}
            </span>
          </div>
          {occurrenceResult.error ? (
            <p className="mt-3 text-sm font-semibold text-amber-800">Occurrence diagnostics could not be loaded.</p>
          ) : occurrenceDiagnostics.length > 0 ? (
            <div className="mt-4 grid gap-3">
              {occurrenceDiagnostics.map((item) => (
                <article className="rounded border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-600" key={`${item.occurrence_id}:${item.court_id ?? "no-court"}`}>
                  <p className="font-black text-court-navy">{item.session_name}</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <p>Occurrence: <span className="font-black text-court-navy">{shortId(item.occurrence_id)}</span></p>
                    <p>Coach: <span className="font-black text-court-navy">{item.coach_names}</span></p>
                    <p>Court: <span className="font-black text-court-navy">{item.court_name ?? "Not managed"}</span></p>
                    <p>Booking: <span className="font-black text-court-navy">{shortId(item.booking_id)}</span></p>
                    <p>Booking status: <span className="font-black text-court-navy">{item.booking_status ? formatLabel(item.booking_status) : "Not linked"}</span></p>
                    <p>Availability resolver: <span className="font-black text-court-navy">{formatLabel(item.availability_resolver_result)}</span></p>
                    <p>Occupancy: <span className="font-black text-court-navy">{formatLabel(item.occupancy_type)}</span></p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm font-semibold text-amber-800">No permitted occurrence was found.</p>
          )}
        </section>
      ) : null}

      {requestedRequestId ? (
        <section className="surface-card mb-5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="section-kicker">Rescheduling</p><h2 className="section-title mt-1">Request {shortId(requestedRequestId)}</h2></div><span className={`ui-chip ${requestDiagnostic?.availability_result === "available" ? "ui-chip-success" : "ui-chip-warning"}`}>{requestDiagnostic?.availability_result ? formatLabel(requestDiagnostic.availability_result) : "Needs review"}</span></div>
          {requestResult.error ? <p className="mt-3 text-sm font-semibold text-amber-800">Request diagnostics could not be loaded.</p> : requestDiagnostic ? <div className="mt-4 grid gap-2 text-sm font-semibold text-slate-600 sm:grid-cols-2"><p>Origin: <span className="font-black text-court-navy">{formatLabel(requestDiagnostic.request_origin)}</span></p><p>Status: <span className="font-black text-court-navy">{formatLabel(requestDiagnostic.request_status)}</span></p><p>Occurrence: <span className="font-black text-court-navy">{shortId(requestDiagnostic.occurrence_id)}</span></p><p>Player: <span className="font-black text-court-navy">{shortId(requestDiagnostic.player_profile_id)}</span></p><p>Responder: <span className="font-black text-court-navy">{shortId(requestDiagnostic.responder_user_id)}</span></p><p>Coach: <span className="font-black text-court-navy">{shortId(requestDiagnostic.coach_profile_id)}</span></p><p>Current bookings: <span className="font-black text-court-navy">{requestDiagnostic.current_booking_ids.length}</span></p><p>Proposed court: <span className="font-black text-court-navy">{shortId(requestDiagnostic.proposed_court_id)}</span></p><p>Approval: <span className="font-black text-court-navy">{formatLabel(requestDiagnostic.approval_result)}</span></p><p>Replacement: <span className="font-black text-court-navy">{shortId(requestDiagnostic.replacement_occurrence_id)}</span></p><p>Notifications: <span className="font-black text-court-navy">{requestDiagnostic.notification_count}</span></p></div> : <p className="mt-3 text-sm font-semibold text-amber-800">No permitted request was found.</p>}
        </section>
      ) : null}

      {error ? (
        <section className="empty-state">Diagnostics could not be loaded. Confirm the latest migration is applied.</section>
      ) : diagnostics.length > 0 ? (
        <section className="grid gap-3">
          {diagnostics.map((item) => (
            <details className="ui-collapsible overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" key={item.invitation_id}>
              <summary className="flex cursor-pointer items-start justify-between gap-3 p-4">
                <span>
                  <span className="block font-black text-court-navy">{item.player_name ?? "Player not resolved"}</span>
                  <span className="mt-1 block text-sm font-semibold text-slate-600">
                    Invitation {formatLabel(item.invitation_status)} · Academy connection {item.organisation_player_link_status ? formatLabel(item.organisation_player_link_status) : "missing"}
                  </span>
                </span>
                <span className={`ui-chip ${item.lesson_selector_eligible ? "ui-chip-success" : "ui-chip-warning"}`}>
                  {item.lesson_selector_eligible ? "Selectable" : "Needs review"}
                </span>
              </summary>
              <div className="grid gap-2 border-t border-slate-100 p-4 text-sm font-semibold text-slate-600 sm:grid-cols-2">
                <p>Invitation: <span className="font-black text-court-navy">{shortId(item.invitation_id)}</span></p>
                <p>Accepted player: <span className="font-black text-court-navy">{shortId(item.accepted_profile_id)}</span></p>
                <p>Accepted by: <span className="font-black text-court-navy">{shortId(item.accepted_by_profile_id)}</span></p>
                <p>Linked player: <span className="font-black text-court-navy">{shortId(item.player_profile_id)}</span></p>
                <p>Academy connection: <span className="font-black text-court-navy">{shortId(item.organisation_player_link_id)}</span></p>
                <p>Intended coach: <span className="font-black text-court-navy">{item.intended_coach_name ?? "Unassigned"}</span></p>
                <p>Coach assignment: <span className="font-black text-court-navy">{formatLabel(item.coach_assignment_status)}</span></p>
                <p>Proposal: <span className="font-black text-court-navy">{formatLabel(item.proposal_status)}</span></p>
                <p>MyPlayR card: <span className="font-black text-court-navy">{item.myplayr_card_eligible ? "Eligible" : "Not eligible"}</span></p>
                <p>Lesson selector: <span className="font-black text-court-navy">{item.lesson_selector_eligible ? "Eligible" : "Not eligible"}</span></p>
              </div>
            </details>
          ))}
        </section>
      ) : (
        <section className="empty-state">No player connection invitations are available for this organisation.</section>
      )}

      <p className="mt-4 text-xs font-semibold text-slate-500">Loaded {formatDateTime(new Date().toISOString())}. Secure invitation tokens are never shown.</p>
    </CoachRPageFrame>
  );
}
