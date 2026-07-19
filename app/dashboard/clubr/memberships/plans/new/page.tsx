import Link from "next/link";
import { MembershipPlanBuilder } from "@/components/membership-plan-builder";
import { StatusAlert } from "@/components/status-alert";
import { hasClubRMembershipCapability } from "@/lib/clubr";
import { loadMembershipCategories } from "@/lib/club-memberships";
import { ClubRPageFrame, getProtectedClubRPage } from "../../../clubr-shared";

export const dynamic = "force-dynamic";

export default async function NewMembershipPlanPage({ searchParams }: { searchParams?: { error?: string } }) {
  const { content, context, venue } = await getProtectedClubRPage("clubr:memberships");
  if (content) return content;
  if (!context) return null;
  if (!venue || !(await hasClubRMembershipCapability(context, "catalog_manage", venue.id))) return <ClubRPageFrame context={context} subtitle="Only authorised membership managers can create plans." title="Create Membership Plan" venue={venue}><div className="ui-empty-card">Access restricted.</div></ClubRPageFrame>;
  const categories = await loadMembershipCategories(context.supabase, venue.id);
  const directCategories = categories.data.filter((category) => category.status === "active" && category.name !== "Legacy Membership");

  return (
    <ClubRPageFrame context={context} subtitle="Create one clear membership choice at a time." title="Create Membership Plan" venue={venue}>
      <StatusAlert className="mb-4" message={searchParams?.error ? "The plan draft could not be created. Check each step and try again." : null} tone="error" />
      <Link className="mb-4 inline-block font-bold text-court-blue" href="/dashboard/clubr/memberships/plans">Back to Plans</Link>
      {directCategories.length > 0 ? <MembershipPlanBuilder categories={directCategories} venueId={venue.id} /> : <div className="ui-empty-card">Create a membership category before building a plan.</div>}
    </ClubRPageFrame>
  );
}
