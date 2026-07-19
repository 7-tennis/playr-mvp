import Link from "next/link";
import { saveClubBookingSettings, saveClubDetails } from "@/app/dashboard/clubr/actions";
import { CollapsibleCard } from "@/components/collapsible-card";
import { StatusAlert } from "@/components/status-alert";
import { loadClubRBookingSettings } from "@/lib/clubr-data";
import { clubRError, clubRMessage } from "@/lib/clubr-ui";
import { productSetupPath } from "@/lib/organisation-setup";
import { canAccessClubRPermission } from "@/lib/permissions";
import { ClubRDataErrorCard, ClubRPageFrame, getProtectedClubRPage } from "../clubr-shared";

export const dynamic = "force-dynamic";

export default async function ClubRSettingsPage({ searchParams }: { searchParams?: { error?: string; message?: string } }) {
  const { content, context, venue } = await getProtectedClubRPage("clubr:settings");
  if (content) return content;
  if (!context || !venue) return null;
  const settingsResult = await loadClubRBookingSettings(context, venue.id);
  const settings = settingsResult.data;
  const canManage = canAccessClubRPermission(context.role, "clubr:settings:manage");

  return (
    <ClubRPageFrame context={context} subtitle="How is this club configured?" title="Settings" venue={venue}>
      <StatusAlert className="mb-4" message={clubRMessage(searchParams?.message)} tone="success" />
      <StatusAlert className="mb-4" message={clubRError(searchParams?.error)} tone="error" />
      {settingsResult.error ? <div className="mb-4"><ClubRDataErrorCard error={settingsResult.error} title="Booking settings could not be confirmed" /></div> : null}

      <div className="grid gap-3">
        <section className="grid gap-3 sm:grid-cols-2"><Link className="action-card" href="/dashboard/clubr/settings/public-page"><p className="section-kicker">Discovery</p><h2 className="section-title mt-1">Public Club Page</h2><p className="mt-2 text-sm text-slate-600">Visibility, visitor information and leaderboards.</p></Link><Link className="action-card" href="/dashboard/clubr/settings/guest-booking"><p className="section-kicker">Court access</p><h2 className="section-title mt-1">Guest Booking</h2><p className="mt-2 text-sm text-slate-600">Guest hours, courts, prices and limits.</p></Link></section>
        <CollapsibleCard summary={`${venue.name} · ${venue.organisation_type.replaceAll("_", " ")}`} title="Club Details">
          {canManage ? <form action={saveClubDetails} className="grid gap-3 sm:grid-cols-2"><input name="venueId" type="hidden" value={venue.id} /><label className="text-sm font-bold text-slate-700 sm:col-span-2">Club name<input className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={venue.name} name="name" required /></label><label className="text-sm font-bold text-slate-700">Contact email<input className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={venue.contact_email ?? ""} name="contactEmail" type="email" /></label><label className="text-sm font-bold text-slate-700">Contact telephone<input className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={venue.contact_phone ?? ""} name="contactPhone" /></label><label className="text-sm font-bold text-slate-700 sm:col-span-2">Physical address<textarea className="mt-1.5 min-h-20 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={venue.address ?? ""} name="address" /></label><label className="text-sm font-bold text-slate-700">Timezone<select className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={venue.timezone} name="timezone"><option value="Africa/Johannesburg">Africa/Johannesburg</option></select></label><button className="btn-primary self-end" type="submit">Save Club Details</button></form> : <div className="grid gap-2 text-sm"><p><strong>Email:</strong> {venue.contact_email ?? "Not configured"}</p><p><strong>Telephone:</strong> {venue.contact_phone ?? "Not configured"}</p><p><strong>Address:</strong> {venue.address ?? "Not configured"}</p><p><strong>Timezone:</strong> {venue.timezone}</p></div>}
        </CollapsibleCard>

        <CollapsibleCard summary={settings ? `${settings.slot_minutes} minute slots · ${settings.opening_time.slice(0, 5)}-${settings.closing_time.slice(0, 5)} · ${settings.advance_booking_days} days ahead` : "Booking rules have not been configured"} title="Booking Hours">
          {canManage ? <form action={saveClubBookingSettings} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><input name="venueId" type="hidden" value={venue.id} /><label className="text-sm font-bold text-slate-700">Opens<input className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={settings?.opening_time.slice(0, 5) ?? "06:00"} name="openingTime" type="time" /></label><label className="text-sm font-bold text-slate-700">Closes<input className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={settings?.closing_time.slice(0, 5) ?? "21:00"} name="closingTime" type="time" /></label><label className="text-sm font-bold text-slate-700">Slot duration<select className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={settings?.slot_minutes ?? 60} name="slotMinutes"><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option><option value="90">90 minutes</option><option value="120">120 minutes</option></select></label><label className="text-sm font-bold text-slate-700">Advance booking days<input className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={settings?.advance_booking_days ?? 7} max="90" min="1" name="advanceBookingDays" type="number" /></label><label className="text-sm font-bold text-slate-700">Maximum active bookings<input className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={settings?.max_active_bookings ?? 3} max="100" min="1" name="maxActiveBookings" type="number" /></label><label className="text-sm font-bold text-slate-700">Non-member price (R)<input className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={(settings?.non_member_price_cents ?? 0) / 100} min="0" name="nonMemberPrice" step="1" type="number" /></label><label className="flex items-center gap-2 rounded border border-slate-200 p-3 text-sm font-bold text-slate-700"><input defaultChecked={settings?.member_booking_enabled ?? true} name="memberBookingEnabled" type="checkbox" /> Member booking enabled</label><label className="flex items-center gap-2 rounded border border-slate-200 p-3 text-sm font-bold text-slate-700"><input defaultChecked={settings?.non_member_booking_enabled ?? false} name="nonMemberBookingEnabled" type="checkbox" /> Non-member booking enabled</label><button className="btn-primary lg:col-span-3" type="submit">Save Booking Rules</button></form> : <p className="text-sm leading-6 text-slate-600">Booking rules are read-only for your ClubR role.</p>}
          <p className="mt-3 rounded bg-court-mist p-3 text-xs font-semibold leading-5 text-court-navy">These hours, slot intervals, booking windows and active-booking limits are enforced by the player booking server policy.</p>
        </CollapsibleCard>

        <CollapsibleCard summary="Court names, surfaces and operating status" title="Courts"><Link className="btn-secondary" href="/dashboard/clubr/courts">Manage Courts</Link></CollapsibleCard>
        <CollapsibleCard summary="Logo and club colours" title="Appearance"><div className="ui-empty-card">Appearance settings are coming later. No branding values are invented in this phase.</div></CollapsibleCard>
        {canManage ? <CollapsibleCard summary="Authorised staff, roles and shared court access" title="Advanced Setup"><Link className="btn-secondary" href={productSetupPath("clubr", "staff")}>Manage Staff Access</Link></CollapsibleCard> : null}
      </div>
    </ClubRPageFrame>
  );
}
