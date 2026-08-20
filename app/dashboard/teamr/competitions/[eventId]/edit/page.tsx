import { OrganisationEventForm } from "@/components/organisation-event-form";
import { StatusAlert } from "@/components/status-alert";
import { canManageOrganisationEvents, loadOrganisationEvent } from "@/lib/organisation-events";
import { TeamRPageFrame, TeamRRestricted, getProtectedTeamRPage } from "../../../teamr-shared";
import { updateOrganisationEvent } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditTeamREventPage({ params, searchParams }: { params: { eventId: string }; searchParams?: { error?: string } }) {
  const { content, context, venue } = await getProtectedTeamRPage();
  if (content) return content;
  if (!context) return null;
  const canManage = canManageOrganisationEvents({ activeOrganisationRole: context.activeOrganisationRole, organisationType: venue?.organisation_type, role: context.role });
  if (!canManage) return <TeamRRestricted reason="Your current organisation role cannot edit events." />;
  const result = await loadOrganisationEvent(context, params.eventId);
  if (!result.data || result.data.archived_at || !["draft", "published"].includes(result.data.status)) return <TeamRPageFrame context={context} title="Event cannot be edited" venue={venue}><section className="empty-state">Only current Draft or Published events can be edited.</section></TeamRPageFrame>;
  return <TeamRPageFrame context={context} subtitle="The host organisation is fixed. Edit the reusable event details below." title={`Edit ${result.data.title}`} venue={venue}><StatusAlert className="mb-4" message={searchParams?.error ? "Check the event fields and try again." : null} tone="error" /><OrganisationEventForm action={updateOrganisationEvent} event={result.data} submitLabel="Save Changes" /></TeamRPageFrame>;
}
