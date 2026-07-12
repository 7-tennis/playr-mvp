import Link from "next/link";
import { BookingIcon, ClubIcon, StatusIcon, TimeIcon } from "@/components/playr-icons";
import { clubRScopeLabel, dateInput, dayRange, weekRange } from "@/lib/clubr";
import { loadClubRBookings, loadClubRCourts } from "@/lib/clubr-data";
import { formatDateTime, formatLabel } from "@/lib/courtside-format";
import { ClubRPageFrame, ClubRStatCard, getProtectedClubRPage } from "../clubr-shared";

export const dynamic = "force-dynamic";

type BookingsPageProps = {
  searchParams?: {
    court?: string;
    date?: string;
  };
};

function bookingName(bookingType: string) {
  return bookingType === "lesson" ? "Coach Lesson" : formatLabel(bookingType);
}

export default async function ClubRBookingsPage({ searchParams }: BookingsPageProps) {
  const { content, context, venue } = await getProtectedClubRPage();

  if (content) {
    return content;
  }

  if (!context) {
    return null;
  }

  const selectedDate = searchParams?.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date) ? searchParams.date : dateInput();
  const selectedCourt = searchParams?.court ?? "all";
  const { dayEnd, dayStart } = dayRange(selectedDate);
  const { weekEnd, weekStart } = weekRange(dayStart);
  const [courts, dayBookings, weekBookings] = await Promise.all([
    loadClubRCourts(context),
    loadClubRBookings(context, dayStart.toISOString(), dayEnd.toISOString(), 180),
    loadClubRBookings(context, weekStart.toISOString(), weekEnd.toISOString(), 300)
  ]);
  const visibleDayBookings = selectedCourt === "all" ? dayBookings : dayBookings.filter((booking) => booking.court_id === selectedCourt);
  const visibleWeekBookings = selectedCourt === "all" ? weekBookings : weekBookings.filter((booking) => booking.court_id === selectedCourt);
  const confirmed = visibleDayBookings.filter((booking) => booking.status === "confirmed");
  const cancelled = visibleDayBookings.filter((booking) => booking.status === "cancelled");
  const coachLessons = visibleWeekBookings.filter((booking) => booking.booking_type === "lesson");

  return (
    <ClubRPageFrame context={context} subtitle={`Court booking view for ${clubRScopeLabel(context, venue)}.`} title="Bookings" venue={venue}>
      <section className="surface-card mb-5 p-4 sm:p-5">
        <form className="grid gap-3 md:grid-cols-[auto_1fr_auto] md:items-end">
          <label className="text-sm font-semibold text-slate-700">
            Date
            <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={selectedDate} name="date" type="date" />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Court
            <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={selectedCourt} name="court">
              <option value="all">All courts</option>
              {courts.map((court) => (
                <option key={court.id} value={court.id}>
                  {court.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-primary" type="submit">
            Filter
          </button>
        </form>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link className="btn-secondary" href="/admin/bookings">
            Create or Manage Booking
          </Link>
          <Link className="btn-secondary" href="/admin/courts">
            Courts
          </Link>
        </div>
      </section>

      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ClubRStatCard helper="Confirmed bookings on selected day" icon={<BookingIcon size={20} />} label="Today" value={confirmed.length} />
        <ClubRStatCard helper="Cancelled bookings on selected day" icon={<StatusIcon size={20} />} label="Cancelled" value={cancelled.length} />
        <ClubRStatCard helper="CoachR-linked lesson bookings this week" icon={<TimeIcon size={20} />} label="Coach Lessons" value={coachLessons.length} />
        <ClubRStatCard helper="Visible courts in this scope" icon={<ClubIcon size={20} />} label="Courts" value={courts.length} />
      </section>

      {visibleDayBookings.length > 0 ? (
        <section className="surface-card p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="section-kicker">Daily View</p>
              <h2 className="section-title mt-1">{visibleDayBookings.length} bookings</h2>
            </div>
            <span className="ui-chip ui-chip-brand">Week total: {visibleWeekBookings.length}</span>
          </div>
          <div className="divide-y divide-slate-200 overflow-hidden rounded border border-slate-200">
            {visibleDayBookings.map((booking) => (
              <article className="grid gap-3 p-4 md:grid-cols-[1fr_1fr_auto] md:items-center" key={booking.id}>
                <div>
                  <p className="font-black text-court-navy">{booking.courts?.name ?? "Court"}</p>
                  <p className="text-sm font-semibold text-slate-600">{formatDateTime(booking.start_time)} - {formatDateTime(booking.end_time)}</p>
                </div>
                <div className="text-sm font-semibold text-slate-600">
                  <p className="font-black text-court-ink">{bookingName(booking.booking_type)}</p>
                  <p>
                    {booking.profiles
                      ? `${booking.profiles.first_name} ${booking.profiles.last_name}${booking.profiles.is_junior ? " (junior)" : ""}`
                      : booking.notes ?? "Club block"}
                  </p>
                </div>
                <span className={`ui-chip ${booking.status === "confirmed" ? "ui-chip-success" : "ui-chip-warning"}`}>{formatLabel(booking.status)}</span>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="empty-state">
          <h2 className="section-title">No bookings for this view</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Create a court block, CoachR lesson or player booking to fill this day.</p>
        </section>
      )}
    </ClubRPageFrame>
  );
}
