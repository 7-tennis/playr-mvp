import { ClubIcon } from "@/components/playr-icons";
import { switchActiveOrganisation } from "@/app/dashboard/organisations/actions";
import { organisationRoleLabel, productLabelForOrganisationRole, type OrganisationMembershipWithVenue } from "@/lib/organisations";

export function OrganisationSwitcher({
  activeMembershipId,
  memberships
}: {
  activeMembershipId: string | null;
  memberships: OrganisationMembershipWithVenue[];
}) {
  if (memberships.length <= 1) {
    return null;
  }

  return (
    <form action={switchActiveOrganisation} className="rounded-lg border border-court-teal/20 bg-white p-3 shadow-sm">
      <label className="flex flex-col gap-2 text-xs font-black uppercase tracking-wide text-slate-500 sm:flex-row sm:items-center">
        <span className="inline-flex items-center gap-2">
          <ClubIcon size={14} /> Current organisation
        </span>
        <select
          className="min-w-0 rounded border border-slate-300 px-3 py-2 text-sm font-bold normal-case tracking-normal text-court-navy focus-ring sm:min-w-72"
          defaultValue={activeMembershipId ?? ""}
          name="membershipId"
        >
          {memberships.map((membership) => (
            <option key={membership.id} value={membership.id}>
              {membership.venue?.name ?? "Organisation"} - {organisationRoleLabel(membership.role)} - {productLabelForOrganisationRole(membership.role)}
            </option>
          ))}
        </select>
        <button className="btn-secondary px-3 py-2 text-xs" type="submit">
          Switch
        </button>
      </label>
    </form>
  );
}
