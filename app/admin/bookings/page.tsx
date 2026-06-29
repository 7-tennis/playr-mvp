import { AdminNav } from "@/components/admin-nav";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { cancelCourtBookingAdmin, createCourtBlock } from "@/app/admin/actions";
import { formatDateTime, formatLabel } from "@/lib/courtside-format";
import { getAdminContext } from "@/lib/admin-auth";
import type { Court, CourtBooking, CourtBookingType, Profile } from "@/types/courtside";

export const dynamic = "force-dynamic";

const blockTypes: CourtBookingType[] = ["lesson", "maintenance", "club_programme", "competition", "americano"];

type BookingRow = CourtBooking & {
  courts: Pick<Court, "name"> | null;
  profiles: Pick<Profile, "first_name" | "last_name" | "is_junior"> | null;
};

function dateInput(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function localDateTimeValue(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function message(value?: string) {
  switch (value) {
    case "booking_created":
      return "Court block created.";
    case "booking_cancelled":
      return "Booking cancelled.";
    case "booking_save_failed":
      return "Booking could not be saved. Check for overlapping bookings.";
    case "booking_cancel_failed":
      return "Booking could not be cancelled.";
    case "missing_booking_fields":
      return "Court, start time, and end time are required.";
    case "invalid_booking":
      return "Booking could not be found.";
    default:
      return null;
  }
}

export default async function AdminBookingsPage({ searchParams }: { searchParams?: { date?: string; court?: string; admin_message?: string } }) {
  const { supabase } = await getAdminContext();
  const selectedDate = searchParams?.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date) ? searchParams.date : dateInput();
  const dayStart = new Date(`${selectedDate}T00:00:00+02:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const { data: courtData } = await supabase.from("courts").select("*").order("sort_order", { ascending: true });
  const courts = (courtData ?? []) as Court[];

  let query = supabase
    .from("court_bookings")
    .select("*,courts:court_id(name),profiles:player_profile_id(first_name,last_name,is_junior)")
    .gte("start_time", dayStart.toISOString())
    .lt("start_time", dayEnd.toISOString())
    .order("start_time", { ascending: true });

  if (searchParams?.court && searchParams.court !== "all") {
    query = query.eq("court_id", searchParams.court);
  }

  const { data: bookingData, error } = await query;
  const bookings = (bookingData ?? []) as unknown as BookingRow[];
  const defaultStart = localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000));
  const defaultEnd = localDateTimeValue(new Date(Date.now() + 2 * 60 * 60 * 1000));

  return (
    <PageShell eyebrow="ClubR" title="Bookings">
      <AdminNav />
      <StatusAlert
        className="mb-5"
        message={message(searchParams?.admin_message)}
        tone={searchParams?.admin_message?.includes("failed") ? "error" : "success"}
      />

      <section className="surface-card mb-6 p-5">
        <h2 className="section-title">Create court block</h2>
        <p className="mt-2 text-sm text-slate-600">Use blocks for lessons, maintenance, club programmes, competitions, or future Americano sessions.</p>
        <form action={createCourtBlock} className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="text-sm font-semibold text-slate-700">
            Court
            <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="courtId" required>
              {courts.map((court) => (
                <option key={court.id} value={court.id}>
                  {court.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Type
            <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="booking_type" defaultValue="maintenance">
              {blockTypes.map((type) => (
                <option key={type} value={type}>
                  {formatLabel(type)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Notes
            <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="notes" placeholder="Optional" />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Start
            <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="start_time" type="datetime-local" defaultValue={defaultStart} required />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            End
            <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="end_time" type="datetime-local" defaultValue={defaultEnd} required />
          </label>
          <button className="self-end rounded bg-court-blue px-4 py-3 font-bold text-white" type="submit">
            Create block
          </button>
        </form>
      </section>

      <section className="surface-card p-5">
        <form className="mb-5 grid gap-3 md:grid-cols-[auto_1fr_auto] md:items-end">
          <label className="text-sm font-semibold text-slate-700">
            Date
            <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="date" type="date" defaultValue={selectedDate} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Court
            <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="court" defaultValue={searchParams?.court ?? "all"}>
              <option value="all">All courts</option>
              {courts.map((court) => (
                <option key={court.id} value={court.id}>
                  {court.name}
                </option>
              ))}
            </select>
          </label>
          <button className="rounded bg-court-teal px-4 py-2 font-bold text-white" type="submit">
            Filter
          </button>
        </form>

        {error ? <StatusAlert className="mb-5" message="Bookings could not be loaded right now." tone="error" /> : null}
        {bookings.length === 0 ? (
          <div className="empty-state">
            <h2 className="text-lg font-black text-court-navy">No bookings for this view</h2>
            <p className="mt-2 text-sm text-slate-600">Bookings and club blocks will appear here when they exist for the selected date and court.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 overflow-hidden rounded border border-slate-200">
            {bookings.map((booking) => (
              <div className="grid gap-4 p-4 md:grid-cols-[1fr_1fr_auto] md:items-center" key={booking.id}>
                <div>
                  <p className="font-black text-court-navy">{booking.courts?.name ?? "Court"}</p>
                  <p className="text-sm text-slate-600">{formatDateTime(booking.start_time)} - {formatDateTime(booking.end_time)}</p>
                </div>
                <div className="text-sm text-slate-700">
                  <p className="font-bold">{formatLabel(booking.booking_type)} / {formatLabel(booking.status)}</p>
                  <p>
                    {booking.profiles
                      ? `${booking.profiles.first_name} ${booking.profiles.last_name}${booking.profiles.is_junior ? " (junior)" : ""}`
                      : booking.notes ?? "Club block"}
                  </p>
                </div>
                {booking.status === "confirmed" ? (
                  <form action={cancelCourtBookingAdmin}>
                    <input name="bookingId" type="hidden" value={booking.id} />
                    <button className="w-full rounded border border-rose-200 px-4 py-2 text-sm font-bold text-rose-700 md:w-auto" type="submit">
                      Cancel
                    </button>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}
