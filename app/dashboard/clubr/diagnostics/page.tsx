import { dayRange } from "@/lib/clubr";
import { loadClubRBookingDetail, loadClubRBookingSettings, loadClubRCourtOccupancy, loadClubRCourts, loadClubROperationalBlocks } from "@/lib/clubr-data";
import { loadMembershipApplication, loadMembershipSubscription } from "@/lib/club-memberships";
import { organisationRoleLabel } from "@/lib/organisations";
import { canAccessClubRPermission, roleLabel } from "@/lib/permissions";
import { ClubRDataErrorCard, ClubRPageFrame, getProtectedClubRPage } from "../clubr-shared";

export const dynamic = "force-dynamic";

export default async function ClubRDiagnosticsPage({ searchParams }: { searchParams?: { court?: string; booking?: string; application?: string; subscription?: string } }) {
  const { content, context, venue } = await getProtectedClubRPage("clubr:diagnostics");
  if (content) return content;
  if (!context) return null;
  const { dayStart, dayEnd } = dayRange();
  const [courts, occupancy, blocks, settings, booking, application, subscription] = await Promise.all([
    loadClubRCourts(context),
    loadClubRCourtOccupancy(context, dayStart.toISOString(), dayEnd.toISOString()),
    loadClubROperationalBlocks(context),
    loadClubRBookingSettings(context),
    searchParams?.booking ? loadClubRBookingDetail(context, searchParams.booking) : Promise.resolve({ data: null, error: null }),
    searchParams?.application ? loadMembershipApplication(context.supabase, searchParams.application) : Promise.resolve({ data: null, error: null }),
    searchParams?.subscription ? loadMembershipSubscription(context.supabase, searchParams.subscription) : Promise.resolve({ data: null, error: null })
  ]);
  const error = courts.error ?? occupancy.error ?? blocks.error ?? settings.error ?? booking.error ?? application.error ?? subscription.error;
  const selectedCourt = courts.data.find((court) => court.id === searchParams?.court) ?? courts.data[0] ?? null;
  const selectedOccupancy = occupancy.data.filter((item) => !selectedCourt || item.court_id === selectedCourt.id);

  return (
    <ClubRPageFrame context={context} subtitle="Why does ClubR consider this court or booking available?" title="Diagnostics" venue={venue}>
      {error ? <div className="mb-4"><ClubRDataErrorCard error={error} title="One or more diagnostics failed" /></div> : null}
      <section className="surface-card mb-4 p-4 sm:p-5">
        <p className="section-kicker">Permission resolution</p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded bg-slate-50 p-3"><dt className="text-xs font-black uppercase text-slate-500">Organisation</dt><dd className="mt-1 font-black text-court-navy">{venue?.name ?? "Global platform scope"}</dd></div>
          <div className="rounded bg-slate-50 p-3"><dt className="text-xs font-black uppercase text-slate-500">App role</dt><dd className="mt-1 font-black text-court-navy">{roleLabel(context.role)}</dd></div>
          <div className="rounded bg-slate-50 p-3"><dt className="text-xs font-black uppercase text-slate-500">Club role</dt><dd className="mt-1 font-black text-court-navy">{organisationRoleLabel(context.activeOrganisationRole)}</dd></div>
          <div className="rounded bg-slate-50 p-3"><dt className="text-xs font-black uppercase text-slate-500">Settings access</dt><dd className="mt-1 font-black text-court-navy">{canAccessClubRPermission(context.role, "clubr:settings:manage") ? "Manage" : "Read only"}</dd></div>
        </dl>
      </section>

      <section className="surface-card mb-4 p-4 sm:p-5">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end"><label className="text-sm font-bold text-slate-700">Court<select className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={selectedCourt?.id} name="court">{courts.data.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}</select></label><label className="text-sm font-bold text-slate-700">Booking ID<input className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={searchParams?.booking ?? ""} name="booking" placeholder="Optional UUID" /></label><label className="text-sm font-bold text-slate-700">Application ID<input className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={searchParams?.application ?? ""} name="application" placeholder="Optional UUID" /></label><label className="text-sm font-bold text-slate-700">Subscription ID<input className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={searchParams?.subscription ?? ""} name="subscription" placeholder="Optional UUID" /></label><button className="btn-primary" type="submit">Inspect</button></form>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <article className="surface-card p-4"><h2 className="section-title">Court resolver</h2><dl className="mt-3 grid gap-2 text-sm"><div className="rounded bg-slate-50 p-3"><dt className="font-bold text-slate-500">Court</dt><dd className="font-black text-court-navy">{selectedCourt?.name ?? "No court"} · {selectedCourt?.status ?? "unknown"}</dd></div><div className="rounded bg-slate-50 p-3"><dt className="font-bold text-slate-500">Occupancy rows today</dt><dd className="font-black text-court-navy">{occupancy.error ? "Query failed" : selectedOccupancy.length}</dd></div><div className="rounded bg-slate-50 p-3"><dt className="font-bold text-slate-500">Active maintenance relationship</dt><dd className="font-black text-court-navy">{blocks.data.some((block) => block.court_id === selectedCourt?.id && block.status === "active") ? "Linked operational block" : "None"}</dd></div><div className="rounded bg-slate-50 p-3"><dt className="font-bold text-slate-500">Availability resolver</dt><dd className="font-black text-court-navy">{occupancy.error ? "Unavailable: fail closed" : selectedCourt?.status === "inactive" || selectedOccupancy.some((item) => item.booking_status === "confirmed") ? "Unavailable during occupied ranges" : "Available during configured hours"}</dd></div></dl></article>
        <article className="surface-card p-4"><h2 className="section-title">Configuration</h2><dl className="mt-3 grid gap-2 text-sm"><div className="rounded bg-slate-50 p-3"><dt className="font-bold text-slate-500">Booking hours</dt><dd className="font-black text-court-navy">{settings.data ? `${settings.data.opening_time.slice(0, 5)}-${settings.data.closing_time.slice(0, 5)}` : "Not configured"}</dd></div><div className="rounded bg-slate-50 p-3"><dt className="font-bold text-slate-500">Slot duration</dt><dd className="font-black text-court-navy">{settings.data ? `${settings.data.slot_minutes} minutes` : "Default 60 minutes"}</dd></div><div className="rounded bg-slate-50 p-3"><dt className="font-bold text-slate-500">Advance window</dt><dd className="font-black text-court-navy">{settings.data ? `${settings.data.advance_booking_days} days` : "Default 7 days"}</dd></div></dl></article>
      </section>

      {booking.data ? <section className="surface-card mt-4 p-4"><h2 className="section-title">Booking relationship</h2><pre className="mt-3 overflow-x-auto rounded bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify({ booking_id: booking.data.booking_id, booking_status: booking.data.booking_status, booking_type: booking.data.booking_type, court_id: booking.data.court_id, source: booking.data.source_product, occupancy_type: booking.data.occupancy_type, occurrence_id: booking.data.coach_session_occurrence_id, lesson_id: booking.data.coach_lesson_id, maintenance_id: booking.data.operational_block_id }, null, 2)}</pre></section> : null}
      {application.data ? <section className="surface-card mt-4 p-4"><h2 className="section-title">Membership application</h2><pre className="mt-3 overflow-x-auto rounded bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify({ application_id: application.data.id, venue_id: application.data.venue_id, status: application.data.status, plan_id: application.data.plan_id, plan_version: application.data.price_snapshot.plan_version, covered_members: application.data.price_snapshot.members.map((member) => member.profile_id), pricing_inputs: application.data.price_snapshot, permission_resolution: "clubr:diagnostics + application RLS" }, null, 2)}</pre></section> : null}
      {subscription.data ? <section className="surface-card mt-4 p-4"><h2 className="section-title">Membership subscription</h2><pre className="mt-3 overflow-x-auto rounded bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify({ subscription_id: subscription.data.id, venue_id: subscription.data.venue_id, status: subscription.data.status, plan_id: subscription.data.plan_id, plan_version: subscription.data.price_snapshot.plan_version, access_effect: subscription.data.coveredMembers.map((member) => ({ profile_id: member.profile_id, club_membership_id: member.club_membership_id, status: member.status })), billing_schedule: subscription.data.billingSchedule.map((item) => ({ due_date: item.due_date, amount_cents: item.amount_cents, status: item.status })), price_snapshot: subscription.data.price_snapshot, organisation_isolation: subscription.data.venue_id }, null, 2)}</pre></section> : null}
    </ClubRPageFrame>
  );
}
