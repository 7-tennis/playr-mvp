import Link from "next/link";
import { CollapsibleCard } from "@/components/collapsible-card";
import { StatusIcon } from "@/components/playr-icons";
import { loadOrganisationSetup, productSetupPath, setupProgress } from "@/lib/organisation-setup";
import { ClubRPageFrame, getProtectedClubRPage } from "../clubr-shared";

export const dynamic = "force-dynamic";

export default async function ClubRSettingsPage() {
  const { content, context, venue } = await getProtectedClubRPage();
  if (content) return content;
  if (!context || !venue) return null;

  const [snapshot, courts, booking, staff, access, requests] = await Promise.all([
    loadOrganisationSetup(context.supabase, venue.id, "clubr"),
    context.supabase.from("courts").select("id,status", { count: "exact" }).eq("venue_id", venue.id),
    context.supabase.from("organisation_booking_settings").select("*").eq("venue_id", venue.id).maybeSingle(),
    context.supabase.from("organisation_memberships").select("id", { count: "exact", head: true }).eq("venue_id", venue.id).eq("status", "active"),
    context.supabase.from("organisation_court_access").select("id", { count: "exact", head: true }).eq("owner_venue_id", venue.id).eq("status", "active"),
    context.supabase.from("organisation_court_access_requests").select("id", { count: "exact", head: true }).eq("owner_venue_id", venue.id).eq("status", "pending")
  ]);
  const progress = setupProgress(snapshot);
  const activeCourts = (courts.data ?? []).filter((court) => court.status === "active").length;

  return (
    <ClubRPageFrame context={context} subtitle="Review and update club setup without rerunning a technical checklist." title="Settings" venue={venue}>
      <section className="mb-4 rounded-lg border border-court-teal/20 bg-court-mist p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
        <div><p className="section-kicker">Setup status</p><h2 className="mt-1 text-lg font-black text-court-navy">{snapshot.setup.status === "complete" ? "ClubR is ready" : `${progress.completeCount} of ${progress.totalCount} steps saved`}</h2></div>
        <Link className="btn-primary mt-3 sm:mt-0" href={productSetupPath("clubr", snapshot.setup.current_step)}>{snapshot.setup.status === "complete" ? "Review Setup" : "Resume Setup"}</Link>
      </section>

      <div className="grid gap-3">
        <CollapsibleCard summary={`${venue.name} · ${venue.contact_email ?? "Contact email to be added"}`} title="Organisation Details"><Link className="btn-secondary" href={productSetupPath("clubr", "details")}>Edit Club Details</Link></CollapsibleCard>
        <CollapsibleCard summary={`${staff.count ?? 0} active staff and organisation leaders`} title="Staff and Roles"><Link className="btn-secondary" href={productSetupPath("clubr", "staff")}>Manage Staff Access</Link></CollapsibleCard>
        <CollapsibleCard summary={booking.data?.no_courts ? "No PlayR-managed courts" : `${activeCourts} active courts`} title="Courts and Venues"><Link className="btn-secondary" href={productSetupPath("clubr", "courts")}>Manage Courts</Link></CollapsibleCard>
        <CollapsibleCard summary={booking.data ? `${booking.data.slot_minutes} minute slots · ${booking.data.opening_time.slice(0, 5)}-${booking.data.closing_time.slice(0, 5)}` : "Booking basics still need attention"} title="Booking Rules"><Link className="btn-secondary" href={productSetupPath("clubr", "booking")}>Edit Booking Basics</Link></CollapsibleCard>
        <CollapsibleCard badge={(requests.count ?? 0) > 0 ? <span className="ui-chip ui-chip-warning"><StatusIcon size={14} /> {requests.count} waiting</span> : null} summary={`${access.count ?? 0} active organisation access grants`} title="Shared Access"><Link className="btn-secondary" href={productSetupPath("clubr", "sharing")}>Manage Courts and Access</Link></CollapsibleCard>
        <CollapsibleCard summary="Member invitations and linked player records" title="Members"><Link className="btn-secondary" href="/dashboard/clubr/members">Open Members</Link></CollapsibleCard>
      </div>
    </ClubRPageFrame>
  );
}
