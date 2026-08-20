import { OrganisationEventForm } from "@/components/organisation-event-form";
import { StatusAlert } from "@/components/status-alert";
import { canManageOrganisationEvents } from "@/lib/organisation-events";
import { TeamRPageFrame, TeamRRestricted, getProtectedTeamRPage } from "../../teamr-shared";
import { createOrganisationEvent } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewTeamREventPage({ searchParams }: { searchParams?: { error?: string } }) {
  const { content, context, venue } = await getProtectedTeamRPage();
  if (content) return content;
  if (!context) return null;
  const canManage = canManageOrganisationEvents({ activeOrganisationRole: context.activeOrganisationRole, organisationType: venue?.organisation_type, role: context.role });
  if (!canManage || !venue) return <TeamRRestricted reason="Your current organisation role cannot create events." />;
  return <TeamRPageFrame context={context} subtitle={`Create an event owned by ${venue.name}. The host cannot be changed after creation.`} title="Create Event" venue={venue}><StatusAlert className="mb-4" message={searchParams?.error ? "Check the event fields and try again." : null} tone="error" /><OrganisationEventForm action={createOrganisationEvent} submitLabel="Create Event" /></TeamRPageFrame>;
}
