import { MembershipApplicationCard } from "@/components/membership-ui";
import { loadMembershipApplications } from "@/lib/club-memberships";
import { ClubRDataErrorCard, ClubRPageFrame, getProtectedClubRPage } from "../../clubr-shared";

export const dynamic = "force-dynamic";

export default async function MembershipApplicationsPage() {
  const { content, context, venue } = await getProtectedClubRPage("clubr:memberships:applications");
  if (content) return content;
  if (!context || !venue) return null;
  const applications = await loadMembershipApplications(context.supabase, venue.id);
  const groups = [
    { empty: "No applications need review.", label: "Needs Review", rows: applications.data.filter((item) => item.status === "pending_approval") },
    { empty: "No approved applications yet.", label: "Approved", rows: applications.data.filter((item) => item.status === "approved") },
    { empty: "No declined or correction requests.", label: "Declined & Corrections", rows: applications.data.filter((item) => ["declined", "correction_requested"].includes(item.status)) }
  ];
  return (
    <ClubRPageFrame context={context} subtitle="Which membership applications require a decision?" title="Applications" venue={venue}>
      {applications.error ? <ClubRDataErrorCard error={applications.error} title="Applications could not be loaded" /> : null}
      {!applications.error ? <div className="grid gap-6">{groups.map((group) => <section key={group.label}><div className="mb-3 flex items-center justify-between"><h2 className="section-title">{group.label}</h2><span className="ui-chip ui-chip-muted">{group.rows.length}</span></div>{group.rows.length > 0 ? <div className="grid gap-3 lg:grid-cols-2">{group.rows.map((application) => <MembershipApplicationCard application={application} href={`/dashboard/clubr/memberships/applications/${application.id}`} key={application.id} />)}</div> : <div className="ui-empty-card">{group.empty}</div>}</section>)}</div> : null}
    </ClubRPageFrame>
  );
}
