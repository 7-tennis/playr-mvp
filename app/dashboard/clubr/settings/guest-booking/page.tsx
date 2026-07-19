import Link from "next/link";
import { saveGuestBookingSettings } from "@/app/dashboard/clubr/actions";
import { StatusAlert } from "@/components/status-alert";
import { loadClubRBookingSettings, loadClubRCourts } from "@/lib/clubr-data";
import { canAccessClubRPermission } from "@/lib/permissions";
import { ClubRPageFrame, getProtectedClubRPage } from "../../clubr-shared";

export const dynamic = "force-dynamic";
const fieldClass = "mt-1.5 w-full rounded border border-slate-300 bg-white px-3 py-3 focus-ring";
const labelClass = "text-sm font-black text-court-navy";

export default async function ClubRGuestBookingSettings({ searchParams }: { searchParams?: { error?: string; message?: string } }) {
  const { content, context, venue } = await getProtectedClubRPage("clubr:settings");
  if (content) return content;
  if (!context || !venue) return null;
  const [settingsResult, courtsResult] = await Promise.all([loadClubRBookingSettings(context, venue.id), loadClubRCourts(context)]);
  const settings = settingsResult.data;
  const canManage = canAccessClubRPermission(context.role, "clubr:settings:manage");
  const selectedCourtIds = new Set(settings?.guest_accessible_court_ids ?? []);

  return (
    <ClubRPageFrame context={context} subtitle="How may non-members book at this venue?" title="Guest Booking" venue={venue}>
      <StatusAlert className="mb-4" message={searchParams?.message ? "Guest booking rules saved." : null} tone="success" />
      <StatusAlert className="mb-4" message={searchParams?.error ? "Guest booking rules could not be saved." : null} tone="error" />
      <Link className="mb-4 inline-flex font-bold text-court-blue" href="/dashboard/clubr/settings">Back to Settings</Link>
      {!canManage ? <section className="ui-empty-card">Guest booking settings are read-only for your ClubR role.</section> : (
        <form action={saveGuestBookingSettings} className="grid gap-5">
          <input name="venueId" type="hidden" value={venue.id} />
          <section className="surface-card p-5"><label className="flex items-start gap-3 text-sm font-black text-court-navy"><input className="mt-1" defaultChecked={settings?.non_member_booking_enabled ?? false} name="allowGuestBookings" type="checkbox" /><span>Allow guest bookings<span className="mt-1 block font-normal text-slate-600">Guests book under separate hours, prices and limits.</span></span></label></section>
          <section className="surface-card p-5"><p className="section-kicker">Time & price</p><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><label className={labelClass}>Guest price (R)<input className={fieldClass} defaultValue={(settings?.non_member_price_cents ?? 0) / 100} min="0" name="guestPrice" step="1" type="number" /></label><label className={labelClass}>Advance booking days<input className={fieldClass} defaultValue={settings?.guest_advance_booking_days ?? 3} max="90" min="0" name="guestAdvanceBookingDays" type="number" /></label><label className={labelClass}>Maximum duration<input className={fieldClass} defaultValue={settings?.guest_max_duration_minutes ?? 60} max="240" min="15" name="guestMaxDurationMinutes" step="15" type="number" /></label><label className={labelClass}>Guest hours start<input className={fieldClass} defaultValue={settings?.guest_opening_time?.slice(0, 5) ?? "08:00"} name="guestOpeningTime" type="time" /></label><label className={labelClass}>Guest hours end<input className={fieldClass} defaultValue={settings?.guest_closing_time?.slice(0, 5) ?? "18:00"} name="guestClosingTime" type="time" /></label><label className={labelClass}>Availability display<select className={fieldClass} defaultValue={settings?.public_availability_visibility ?? "sign_in_required"} name="publicAvailabilityVisibility"><option value="full">Full available slots</option><option value="guest_eligible">Guest-eligible slots only</option><option value="sign_in_required">After sign-in</option><option value="after_approval">After club approval</option></select></label></div></section>
          <section className="surface-card p-5"><p className="section-kicker">Limits</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className={labelClass}>Maximum guest bookings<input className={fieldClass} defaultValue={settings?.max_guest_bookings_per_period ?? 1} max="100" min="1" name="maxGuestBookingsPerPeriod" type="number" /></label><label className={labelClass}>Per number of days<input className={fieldClass} defaultValue={settings?.guest_booking_period_days ?? 7} max="90" min="1" name="guestBookingPeriodDays" type="number" /></label></div></section>
          <section className="surface-card p-5"><p className="section-kicker">Eligible courts</p><p className="mt-1 text-sm text-slate-600">Leave every court unchecked to allow all active courts.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{courtsResult.data.map((court) => <label className="flex items-center gap-3 rounded border border-slate-200 p-3 text-sm font-bold text-court-navy" key={court.id}><input defaultChecked={selectedCourtIds.has(court.id)} name="guestCourtIds" type="checkbox" value={court.id} /> {court.name}</label>)}</div></section>
          <section className="surface-card p-5"><p className="section-kicker">Approval & contact</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{[{ key: "guestApprovalRequired", label: "Club approval required", checked: settings?.guest_approval_required }, { key: "guestNameRequired", label: "Guest name required", checked: settings?.guest_name_required ?? true }, { key: "guestEmailRequired", label: "Guest email required", checked: settings?.guest_email_required ?? true }, { key: "guestPhoneRequired", label: "Guest phone required", checked: settings?.guest_phone_required }, { key: "guestFuturePaymentRequired", label: "Future payment required", checked: settings?.guest_future_payment_required }].map((item) => <label className="flex items-center gap-3 rounded border border-slate-200 p-3 text-sm font-bold text-court-navy" key={item.key}><input defaultChecked={item.checked ?? false} name={item.key} type="checkbox" /> {item.label}</label>)}</div><p className="mt-3 rounded bg-court-mist p-3 text-xs font-semibold leading-5 text-court-navy">Approval and future payment settings withhold instant booking. No online checkout or approval workflow is added in this phase.</p></section>
          <button className="btn-primary" type="submit">Save Guest Booking Rules</button>
        </form>
      )}
    </ClubRPageFrame>
  );
}
