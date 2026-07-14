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
  searchParams?: { lesson?: string; venue?: string };
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
