import Link from "next/link";
import { BookingIcon, ClubIcon, StatusIcon, TimeIcon } from "@/components/playr-icons";
import { dateInput, dayRange } from "@/lib/clubr";
import { loadClubRCourtOccupancy, loadClubRCourts, occupancyDescription, occupancySourceLabel, type ClubRCourtOccupancy } from "@/lib/clubr-data";
import { formatDate, formatLabel, formatTime } from "@/lib/courtside-format";
import { ClubRDataErrorCard, ClubRPageFrame, getProtectedClubRPage } from "../clubr-shared";

export const dynamic = "force-dynamic";

type BookingsPageProps = {
  searchParams?: { court?: string; date?: string; source?: string; status?: string };
};

function localDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function BookingGroup({ items, title }: { items: ClubRCourtOccupancy[]; title: string }) {
  return (
    <section className="surface-card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3"><h2 className="section-title">{title}</h2><span className="ui-chip ui-chip-muted">{items.length}</span></div>
      <div className="grid gap-2">
        {items.map((booking) => (
          <Link className="grid gap-3 rounded-lg border border-slate-200 p-3 transition hover:bg-court-mist sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)_auto] sm:items-center" href={`/dashboard/clubr/bookings/${booking.booking_id}`} key={booking.booking_id}>
            <div><p className="font-black text-court-navy">{booking.court_name}</p><p className="mt-0.5 text-sm font-semibold text-slate-600"><TimeIcon className="mr-1 inline" size={14} />{formatTime(booking.start_time)}-{formatTime(booking.end_time)}</p></div>
            <div><p className="font-bold text-court-ink">{occupancyDescription(booking)}</p><p className="mt-0.5 text-xs font-semibold text-slate-500">{occupancySourceLabel(booking)}</p></div>
            <span className={`ui-chip ${booking.booking_status === "confirmed" ? "ui-chip-success" : "ui-chip-muted"}`}>{formatLabel(booking.booking_status)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function ClubRBookingsPage({ searchParams }: BookingsPageProps) {
  const { content, context, venue } = await getProtectedClubRPage("clubr:bookings");
  if (content) return content;
  if (!context) return null;

  const selectedDate = searchParams?.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date) ? searchParams.date : "";
  const today = dateInput();
  const tomorrow = new Date(`${today}T00:00:00+02:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowValue = dateInput(tomorrow);
  const range = selectedDate ? dayRange(selectedDate) : { dayStart: dayRange(today).dayStart, dayEnd: new Date(dayRange(today).dayStart.getTime() + 31 * 24 * 60 * 60 * 1000) };
  const [courtsResult, occupancyResult] = await Promise.all([
    loadClubRCourts(context),
    loadClubRCourtOccupancy(context, range.dayStart.toISOString(), range.dayEnd.toISOString())
  ]);
  const court = searchParams?.court ?? "all";
  const source = searchParams?.source ?? "all";
  const status = searchParams?.status ?? "confirmed";
  const filtered = occupancyResult.data.filter((booking) =>
    (court === "all" || booking.court_id === court)
    && (source === "all" || occupancySourceLabel(booking).toLowerCase() === source)
    && (status === "all" || booking.booking_status === status)
  );
  const todayItems = filtered.filter((item) => localDate(item.start_time) === today);
  const tomorrowItems = filtered.filter((item) => localDate(item.start_time) === tomorrowValue);
  const upcomingItems = filtered.filter((item) => localDate(item.start_time) > tomorrowValue);

  return (
    <ClubRPageFrame context={context} subtitle="What is scheduled on the club’s courts?" title="Bookings" venue={venue}>
      {courtsResult.error || occupancyResult.error ? <div className="mb-4"><ClubRDataErrorCard error={(courtsResult.error ?? occupancyResult.error)!} title="The unified schedule could not be loaded" /></div> : null}

      <section className="surface-card mb-4 p-4">
        <form className="grid gap-3 md:grid-cols-[repeat(4,minmax(0,1fr))_auto] md:items-end">
          <label className="text-sm font-bold text-slate-700">Date<input className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={selectedDate} name="date" type="date" /></label>
          <label className="text-sm font-bold text-slate-700">Court<select className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={court} name="court"><option value="all">All courts</option>{courtsResult.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="text-sm font-bold text-slate-700">Source<select className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={source} name="source"><option value="all">All sources</option><option value="member">Member</option><option value="coachr">CoachR</option><option value="club">Club</option><option value="maintenance">Maintenance</option><option value="event">Event</option></select></label>
          <label className="text-sm font-bold text-slate-700">Status<select className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={status} name="status"><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option><option value="all">All</option></select></label>
          <button className="btn-primary" type="submit">Apply</button>
        </form>
      </section>

      {!occupancyResult.error ? <div className="mb-4 flex flex-wrap gap-2"><span className="ui-chip ui-chip-brand"><BookingIcon size={14} /> {filtered.length} bookings</span><span className="ui-chip ui-chip-muted"><ClubIcon size={14} /> {courtsResult.data.length} courts</span><span className="ui-chip ui-chip-success"><StatusIcon size={14} /> Shared schedule</span></div> : null}

      {!occupancyResult.error && filtered.length > 0 ? (
        selectedDate ? <BookingGroup items={filtered} title={formatDate(range.dayStart.toISOString())} /> : <div className="grid gap-4"><BookingGroup items={todayItems} title="Today" /><BookingGroup items={tomorrowItems} title="Tomorrow" /><BookingGroup items={upcomingItems} title="Upcoming" /></div>
      ) : !occupancyResult.error ? (
        <section className="empty-state"><h2 className="section-title">No bookings for this view</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">The club’s courts have no scheduled activity matching these filters.</p></section>
      ) : null}
    </ClubRPageFrame>
  );
}
