import Link from "next/link";
import { CostIcon, EntriesIcon, MembershipIcon, StatusIcon } from "@/components/playr-icons";
import { MembershipApplicationCard } from "@/components/membership-ui";
import { hasClubRMembershipCapability } from "@/lib/clubr";
import { loadMembershipApplications, loadMembershipPlans, loadMembershipSubscriptions } from "@/lib/club-memberships";
import { ClubRActionCard, ClubRDataErrorCard, ClubRPageFrame, ClubRStatCard, getProtectedClubRPage } from "../clubr-shared";

export const dynamic = "force-dynamic";

export default async function ClubRMembershipsPage() {
  const { content, context, venue } = await getProtectedClubRPage("clubr:memberships");
  if (content) return content;
  if (!context) return null;
  if (!venue) return <ClubRPageFrame context={context} subtitle="Choose a club before managing memberships." title="Memberships" venue={venue}><div className="ui-empty-card">Select a ClubR organisation to continue.</div></ClubRPageFrame>;

  const [plans, applications, subscriptions, canManageCatalog] = await Promise.all([
    loadMembershipPlans(context.supabase, venue.id, true),
    loadMembershipApplications(context.supabase, venue.id),
    loadMembershipSubscriptions(context.supabase, venue.id),
    hasClubRMembershipCapability(context, "catalog_manage", venue.id)
  ]);
  const errors = [plans.error, applications.error, subscriptions.error].filter(Boolean);
  const needsReview = applications.data.filter((item) => item.status === "pending_approval");
  const active = subscriptions.data.filter((item) => item.status === "active");
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 30);
  const expiring = active.filter((item) => item.expiry_date && new Date(item.expiry_date) <= cutoff);
  const activePlans = plans.data.filter((item) => item.status === "active" && !item.is_legacy);

  return (
    <ClubRPageFrame context={context} subtitle="What needs attention in club memberships?" title="Memberships" venue={venue}>
      {errors[0] ? <div className="mb-4"><ClubRDataErrorCard error={errors[0]} title="Some membership data could not be confirmed" /></div> : null}
      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ClubRStatCard helper="Current" icon={<MembershipIcon size={19} />} label="Active" value={subscriptions.error ? "--" : active.length} />
        <ClubRStatCard helper="Decision needed" icon={<EntriesIcon size={19} />} label="Applications" value={applications.error ? "--" : needsReview.length} />
        <ClubRStatCard helper="Next 30 days" icon={<StatusIcon size={19} />} label="Expiring" value={subscriptions.error ? "--" : expiring.length} />
        <ClubRStatCard helper="Selectable" icon={<CostIcon size={19} />} label="Plans" value={plans.error ? "--" : activePlans.length} />
      </section>

      <section className="mb-5 grid gap-3 md:grid-cols-3">
        <ClubRActionCard href="/dashboard/clubr/memberships/applications" icon={<EntriesIcon size={18} />} text="Review applications that need a decision." title="Applications" />
        <ClubRActionCard href="/dashboard/clubr/memberships/subscriptions" icon={<MembershipIcon size={18} />} text="See active and pending memberships." title="Subscriptions" />
        <ClubRActionCard href="/dashboard/clubr/memberships/plans" icon={<CostIcon size={18} />} text={canManageCatalog ? "Configure categories, plans and prices." : "View the club’s membership catalogue."} title="Plans & Pricing" />
      </section>

      <section className="surface-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3"><div><p className="section-kicker">Needs review</p><h2 className="section-title mt-1">Membership applications</h2></div><Link className="btn-secondary px-3 py-2" href="/dashboard/clubr/memberships/applications">View All</Link></div>
        {needsReview.length > 0 ? <div className="mt-4 grid gap-3 lg:grid-cols-2">{needsReview.slice(0, 4).map((application) => <MembershipApplicationCard application={application} href={`/dashboard/clubr/memberships/applications/${application.id}`} key={application.id} />)}</div> : <div className="ui-empty-card mt-4">No applications need review.</div>}
      </section>
    </ClubRPageFrame>
  );
}
