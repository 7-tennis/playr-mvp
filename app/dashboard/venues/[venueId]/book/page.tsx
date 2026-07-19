import Link from "next/link";
import { redirect } from "next/navigation";
import { CourtBookingGrid } from "@/components/court-booking-grid";
import { BookingIcon } from "@/components/playr-icons";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { formatMembershipMoney } from "@/lib/club-memberships";
import { formatDate } from "@/lib/courtside-format";
import { bookingEligibilityMessage, loadManagedVenueProfiles, loadVenueBookingEligibility, loadVenuePage, selectManagedVenueProfile } from "@/lib/venues";
import { clampVenueBookingDate, dateInputFromSerial, dateWithSaOffset, venueBookingSlots, venueBookingWeekLabel, venueBookingWeekRange } from "@/lib/venue-booking";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { Court, CourtBookingType } from "@/types/courtside";

export const dynamic = "force-dynamic";

type BookingRow = {
  court_id: string;
  player_profile_id: string | null;
  start_time: string;
  end_time: string;
  booking_type: CourtBookingType | null;
  occupancy_type: "own_booking" | "unavailable";
  player_name: string | null;
};

export default async function VenueBookingPage({ params, searchParams }: { params: { venueId: string }; searchParams?: { profile?: string; date?: string; court?: string; error?: string; booking?: string } }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const profilesResult = await loadManagedVenueProfiles(supabase, user.id);
  const profile = selectManagedVenueProfile(profilesResult.data, searchParams?.profile);
  if (!profile) redirect("/dashboard/profile");
  const [venueResult, eligibilityResult] = await Promise.all([
    loadVenuePage(supabase, params.venueId, profile.id),
    loadVenueBookingEligibility(supabase, params.venueId, profile.id)
  ]);
  if (!venueResult.data) redirect(`/dashboard/venues?profile=${profile.id}`);
  const venue = venueResult.data;
  const eligibility = eligibilityResult.data;
  const routePath = `/dashboard/venues/${venue.id}/book`;

  if (eligibilityResult.error || !eligibility || !eligibility.allowed || !eligibility.bookingType) {
    return (
      <PageShell eyebrow={venue.name} subtitle="Your club relationship and booking rules are checked before court times are shown." title="Court booking unavailable">
        <section className="empty-state"><BookingIcon className="mx-auto text-court-teal" size={28} /><h2 className="section-title mt-3">Booking is not available</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">{eligibilityResult.error?.message ?? bookingEligibilityMessage(eligibility?.reason ?? "booking_rules_unavailable")}</p><div className="mt-5 flex flex-wrap justify-center gap-2"><Link className="btn-secondary" href={`/dashboard/venues/${venue.id}?profile=${profile.id}`}>Back to Club</Link>{venue.membershipsAvailable ? <Link className="btn-primary" href={`/dashboard/venues/${venue.id}/memberships?profile=${profile.id}`}>View Memberships</Link> : null}</div></section>
      </PageShell>
    );
  }

  const eligibleCourtIds = eligibility.eligibleCourtIds ?? [];
  const showAllGuestCourts = eligibility.bookingType === "guest_booking" && ["full", "sign_in_required"].includes(eligibility.availabilityVisibility ?? "");
  let courtsQuery = supabase.from("courts").select("*").eq("venue_id", venue.id).eq("status", "active").order("sort_order");
  if (eligibleCourtIds.length > 0 && !showAllGuestCourts) courtsQuery = courtsQuery.in("id", eligibleCourtIds);
  const { data: courtData, error: courtsError } = await courtsQuery;
  const courts = (courtData ?? []) as Court[];
  const bookableCourtIds = eligibleCourtIds.length > 0 ? eligibleCourtIds : courts.map((court) => court.id);
  const defaultCourt = courts.find((court) => bookableCourtIds.includes(court.id)) ?? courts[0];
  const selectedCourtId = courts.some((court) => court.id === searchParams?.court) ? String(searchParams?.court) : defaultCourt?.id;
  const advanceDays = eligibility.advanceDays ?? 0;
  const selectedDate = clampVenueBookingDate(searchParams?.date, advanceDays);
  const selectedWeek = venueBookingWeekRange(selectedDate);
  const rangeStart = dateWithSaOffset(dateInputFromSerial(selectedWeek.start), 0);
  const rangeEnd = dateWithSaOffset(dateInputFromSerial(selectedWeek.end), 0);
  const occupancyResult = courts.length > 0 ? await supabase.rpc("playr_venue_court_occupancy_for_range", {
    check_end_time: rangeEnd.toISOString(),
    check_start_time: rangeStart.toISOString(),
    p_profile_id: profile.id,
    p_venue_id: venue.id
  }) : { data: [], error: null };
  const courtIds = new Set(courts.map((court) => court.id));
  const bookings = ((occupancyResult.data ?? []) as BookingRow[]).filter((booking) => courtIds.has(booking.court_id));
  const previousWeekDate = dateInputFromSerial(Date.parse(`${selectedDate}T00:00:00Z`) - 7 * 24 * 60 * 60 * 1000);
  const nextWeekDate = dateInputFromSerial(Date.parse(`${selectedDate}T00:00:00Z`) + 7 * 24 * 60 * 60 * 1000);
  const bookingLabel = eligibility.bookingType === "member_booking" ? "Book as Member" : "Book as Guest";
  const priceLabel = (eligibility.priceCents ?? 0) > 0 ? formatMembershipMoney(eligibility.priceCents ?? 0, eligibility.currency ?? "ZAR") : "No court fee shown";
  const adultContact = profilesResult.data.find((item) => !item.is_junior);

  return (
    <PageShell eyebrow={venue.name} subtitle={`${profile.first_name} ${profile.last_name} · ${bookingLabel}`} title="Choose a court and time">
      <StatusAlert className="mb-4" message={searchParams?.booking === "created" ? `${bookingLabel} confirmed at ${venue.name}.` : null} tone="success" />
      <StatusAlert className="mb-4" message={searchParams?.error ?? null} tone="error" />
      <section className="surface-card mb-5 p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><span className="ui-chip ui-chip-brand">{bookingLabel}</span><h2 className="section-title mt-2">{venue.name}</h2><p className="mt-1 text-sm text-slate-600">{venueBookingWeekLabel(selectedWeek.start, selectedWeek.end)} · {formatDate(dateWithSaOffset(selectedDate, 0).toISOString())}</p></div><div className="flex gap-2"><Link className="btn-secondary px-3 py-2" href={`${routePath}?profile=${profile.id}&date=${previousWeekDate}${selectedCourtId ? `&court=${selectedCourtId}` : ""}`}>Previous</Link><Link className="btn-secondary px-3 py-2" href={`${routePath}?profile=${profile.id}&date=${nextWeekDate}${selectedCourtId ? `&court=${selectedCourtId}` : ""}`}>Next</Link></div></div><div className="mt-4 flex flex-wrap gap-2 text-xs font-bold"><span className="ui-chip ui-chip-success">Available</span><span className="ui-chip ui-chip-brand">Your booking</span><span className="ui-chip ui-chip-muted">Unavailable</span><span className="ui-chip ui-chip-warning">{priceLabel}</span></div></section>
      {courtsError ? <StatusAlert className="mb-4" message="Courts could not be loaded right now." tone="error" /> : null}
      {occupancyResult.error ? <section className="empty-state"><h2 className="section-title">Availability is temporarily unavailable</h2><p className="mt-2 text-sm text-slate-600">No booking can be made until the live court schedule is confirmed.</p></section> : courts.length === 0 || !selectedCourtId ? <section className="empty-state"><h2 className="section-title">No eligible courts are available</h2><p className="mt-2 text-sm text-slate-600">Contact the club about court access for this booking type.</p></section> : <CourtBookingGrid bookableCourtIds={bookableCourtIds} bookingType={eligibility.bookingType} bookings={bookings} courts={courts.map((court) => ({ id: court.id, name: court.name }))} guestContact={eligibility.bookingType === "guest_booking" ? { email: profile.email ?? adultContact?.email ?? user.email ?? "", name: `${profile.first_name} ${profile.last_name}`, phone: profile.phone ?? adultContact?.phone ?? "", requiresEmail: eligibility.requiresEmail ?? false, requiresName: eligibility.requiresName ?? false, requiresPhone: eligibility.requiresPhone ?? false } : undefined} paymentNote={eligibility.futurePaymentRequired ? "Payment may be required by the club later. No online payment is taken now." : null} priceLabel={priceLabel} profiles={[{ id: profile.id, label: profile.is_junior ? "linked junior" : "myself", name: `${profile.first_name} ${profile.last_name}` }]} routePath={routePath} selectedCourtId={selectedCourtId} selectedDate={selectedDate} slotMinutes={eligibility.slotMinutes ?? 60} slots={venueBookingSlots(selectedDate, eligibility.openingTime ?? "06:00", eligibility.closingTime ?? "21:00", eligibility.slotMinutes ?? 60)} userProfileIds={profilesResult.data.map((item) => item.id)} venueId={venue.id} venueName={venue.name} />}
    </PageShell>
  );
}
