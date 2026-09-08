import Link from "next/link";
import { CollapsibleCard } from "@/components/collapsible-card";
import { EntriesIcon, PrivateIcon, StatusIcon } from "@/components/playr-icons";
import { StatusAlert } from "@/components/status-alert";
import { SubmitButton } from "@/components/submit-button";
import { formatDateTime } from "@/lib/courtside-format";
import { invitationLink, organisationRoleLabel, organisationStatusLabel } from "@/lib/organisations";
import { canManageTeamRPeople, loadTeamRPeople, teamRStaffRolesForContext } from "@/lib/teamr";
import { TeamRPageFrame, getProtectedTeamRPage } from "../teamr-shared";
import { cancelTeamRStaffInvitation, inviteTeamRStaff, removeTeamRStaff, updateTeamRStaffRole } from "./actions";

export const dynamic = "force-dynamic";

function messageText(message?: string) {
  if (message === "invited") return "Invitation ready. Share the secure acceptance link with the intended person.";
  if (message === "updated") return "Organisation role updated.";
  if (message === "removed") return "Organisation access removed.";
  if (message === "cancelled") return "Pending invitation cancelled.";
  return null;
}

function errorText(error?: string) {
  if (error === "access") return "Only an Organisation Admin or Sports Coordinator can manage TeamR people and access.";
  if (error === "confirm_required") return "Confirm the removal or cancellation before continuing.";
  if (error === "already_member") return "That person already has this organisation role.";
  if (error === "invalid_role" || error === "invalid_role_change") return "That role change is not permitted for your organisation authority.";
  if (error) return "The requested access change could not be completed.";
  return null;
}

export default async function TeamRPeoplePage({ searchParams }: { searchParams?: { error?: string; message?: string; token?: string } }) {
  const { content, context, venue } = await getProtectedTeamRPage();
  if (content) return content;
  if (!context) return null;

  const result = await loadTeamRPeople(context);
  const canManage = canManageTeamRPeople(context);
  const roles = teamRStaffRolesForContext(context);

  return (
    <TeamRPageFrame context={context} subtitle="Canonical organisation memberships supply the staff pool for event-specific assignments." title="People & Access" venue={venue}>
      <StatusAlert className="mb-4" message={messageText(searchParams?.message)} tone="success" />
      <StatusAlert className="mb-4" message={errorText(searchParams?.error)} tone="error" />
      {searchParams?.token ? <div className="mb-4 rounded-lg border border-court-teal/30 bg-court-mist p-3 text-sm font-bold text-court-navy">Acceptance link: <code className="break-all rounded bg-white px-2 py-1 text-court-teal">{invitationLink(searchParams.token)}</code></div> : null}

      {canManage ? <CollapsibleCard eyebrow="Invite" summary="The recipient accepts while signed in; pending invitations are not event-staff candidates." title="Invite staff">
        <form action={inviteTeamRStaff} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold text-court-navy">Name (optional)<input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" maxLength={120} name="name" /></label>
          <label className="text-sm font-bold text-court-navy">Email<input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="email" required type="email" /></label>
          <label className="text-sm font-bold text-court-navy sm:col-span-2">Organisation role<select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="role" required><option value="">Choose role</option>{roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
          <SubmitButton className="btn-primary sm:col-span-2" pendingText="Inviting…">Create Invitation</SubmitButton>
        </form>
      </CollapsibleCard> : <div className="ui-empty-card mb-4"><PrivateIcon className="mr-2" size={16} /> You can view people, but only an Organisation Admin or Sports Coordinator can change access.</div>}

      {result.error ? <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800" role="alert">{result.error}</section> : null}
      {!result.error && result.data.length === 0 ? <section className="empty-state"><EntriesIcon className="mx-auto text-court-teal" size={28} /><h2 className="section-title mt-3">No staff access yet</h2><p className="mt-2 text-sm text-slate-600">Invite operational staff to this School or District.</p></section> : null}
      {result.data.length > 0 ? <section aria-label="Organisation people and access" className="mt-4 grid gap-3">
        {result.data.map((person) => {
          const protectedMembership = person.role === "organisation_admin"
            || !canManage
            || (context.activeOrganisationRole === "sports_coordinator" && person.role === "sports_coordinator");
          return <article className="surface-card p-4" key={`${person.kind}-${person.id}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h2 className="truncate font-black text-court-navy">{person.name}</h2><p className="mt-1 break-all text-xs font-semibold text-slate-500">{person.email ?? "No email available"}</p><p className="mt-1 text-xs font-semibold text-slate-500">Added {formatDateTime(person.createdAt)}</p></div><div className="flex flex-wrap gap-2"><span className="ui-chip ui-chip-brand">{organisationRoleLabel(person.role)}</span><span className={`ui-chip ${person.status === "active" ? "ui-chip-success" : person.status === "pending" ? "ui-chip-warning" : "ui-chip-muted"}`}><StatusIcon size={13} /> {organisationStatusLabel(person.status)}</span></div></div>
            {person.kind === "membership" && !protectedMembership ? <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 lg:grid-cols-[1fr_auto]">
              <form action={updateTeamRStaffRole} className="flex flex-col gap-2 sm:flex-row sm:items-end"><input name="membershipId" type="hidden" value={person.id} /><label className="flex-1 text-xs font-bold text-court-navy">Role<select className="mt-1 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={person.role} name="role">{roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label><SubmitButton className="btn-secondary" pendingText="Saving…">Save Role</SubmitButton></form>
              <form action={removeTeamRStaff} className="flex items-center gap-2"><label className="text-xs font-semibold text-slate-600"><input className="mr-1" name="confirm" type="checkbox" /> Confirm</label><input name="membershipId" type="hidden" value={person.id} /><SubmitButton className="btn-secondary" pendingText="Removing…">Remove</SubmitButton></form>
            </div> : null}
            {person.kind === "invitation" && canManage ? <form action={cancelTeamRStaffInvitation} className="mt-4 flex items-center justify-end gap-2 border-t border-slate-200 pt-4"><label className="text-xs font-semibold text-slate-600"><input className="mr-1" name="confirm" type="checkbox" /> Confirm</label><input name="invitationId" type="hidden" value={person.id} /><SubmitButton className="btn-secondary" pendingText="Cancelling…">Cancel Invitation</SubmitButton></form> : null}
          </article>;
        })}
      </section> : null}
      <Link className="btn-secondary mt-5" href="/dashboard/teamr/more">Back to More</Link>
    </TeamRPageFrame>
  );
}
