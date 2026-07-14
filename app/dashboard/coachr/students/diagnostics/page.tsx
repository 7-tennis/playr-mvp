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
  searchParams?: { venue?: string };
};

export default async function CoachRConnectionDiagnosticsPage({ searchParams }: DiagnosticsPageProps) {
  const { access, content } = await getProtectedCoachRPage("coachr:students");

  if (content) return content;
  if (access.context.kind !== "authenticated") return null;

  const canView = access.context.role === "platform_admin" || ["organisation_admin", "club_manager"].includes(access.context.activeOrganisationRole ?? "");
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
