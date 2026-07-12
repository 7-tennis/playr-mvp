import Link from "next/link";
import { BookingIcon, ClubIcon, EntriesIcon, EventIcon, MembershipIcon, StatusIcon, TimeIcon } from "@/components/playr-icons";
import { clubRScopeLabel, dayRange, loadClubRVenue, weekRange } from "@/lib/clubr";
import { loadClubRBookings, loadClubRCourts, loadClubREntriesForEvents, loadClubREvents, loadClubRMembers } from "@/lib/clubr-data";
import { formatDateTime, formatLabel } from "@/lib/courtside-format";
import { roleLabel } from "@/lib/permissions";
import { ClubRActionCard, ClubRPageFrame, ClubRStatCard, getProtectedClubRPage } from "./clubr-shared";

export const dynamic = "force-dynamic";

export default async function ClubRPage() {
  const { content, context, venue } = await getProtectedClubRPage();

  if (content) {
    return content;
  }

  if (!context) {
    return null;
  }

  const now = new Date();
  const { dayEnd, dayStart } = dayRange();
  const { weekEnd, weekStart } = weekRange(now);
  const [courts, todayBookings, weekBookings, members, events] = await Promise.all([
    loadClubRCourts(context),
    loadClubRBookings(context, dayStart.toISOString(), dayEnd.toISOString(), 160),
    loadClubRBookings(context, weekStart.toISOString(), weekEnd.toISOString(), 240),
    loadClubRMembers(context),
    loadClubREvents(context, venue)
  ]);
  const eventEntries = await loadClubREntriesForEvents(context, events.map((event) => event.id));
  const nowMs = now.getTime();
  const confirmedToday = todayBookings.filter((booking) => booking.status === "confirmed");
  const courtsInUse = new Set(
    confirmedToday
      .filter((booking) => new Date(booking.start_time).getTime() <= nowMs && new Date(booking.end_time).getTime() >= nowMs)
      .map((booking) => booking.court_id)
  ).size;
  const nextBooking = confirmedToday.find((booking) => new Date(booking.start_time).getTime() >= nowMs);
  const activeCourts = courts.filter((court) => court.status === "active");
  const unavailableCourts = courts.filter((court) => court.status !== "active");
  const upcomingBookings = weekBookings.filter((booking) => booking.status === "confirmed" && new Date(booking.start_time).getTime() >= nowMs);
  const cancelledBookings = weekBookings.filter((booking) => booking.status === "cancelled");
  const coachingBookings = weekBookings.filter((booking) => booking.booking_type === "lesson");
  const activeMembers = members.filter((member) => member.member_status === "member");
  const pendingMembers = members.filter((member) => member.member_status === "pending");
  const setupChecks = [
    venue ? "Venue linked" : "Venue to be linked",
    activeCourts.length > 0 ? "Courts active" : "Courts need setup",
    context.role === "platform_admin" || context.venueId ? "Access scoped" : "Access needs venue",
    members.length > 0 ? "Member activity found" : "Member links pending"
  ];

  return (
    <ClubRPageFrame context={context} subtitle={`${clubRScopeLabel(context, venue)} management at a glance.`} title="MyClubR" venue={venue}>
      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ClubRStatCard helper="Confirmed bookings today" icon={<BookingIcon size={20} />} label="Today" value={confirmedToday.length} />
        <ClubRStatCard helper="Courts currently occupied" icon={<TimeIcon size={20} />} label="Courts in use" value={courtsInUse} />
        <ClubRStatCard helper={nextBooking ? formatDateTime(nextBooking.start_time) : "No upcoming booking today"} icon={<StatusIcon size={20} />} label="Next booking" value={nextBooking?.courts?.name ?? "Clear"} />
        <ClubRStatCard helper="Inactive or maintenance courts" icon={<ClubIcon size={20} />} label="Unavailable courts" value={unavailableCourts.length} />
      </section>

      <section className="mb-5 grid gap-4 lg:grid-cols-2">
        <article className="surface-card p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="section-kicker">Members</p>
              <h2 className="section-title mt-1">{activeMembers.length} active members</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{pendingMembers.length} pending membership items · {members.slice(0, 3).length} recent member records</p>
            </div>
            <MembershipIcon className="text-court-teal" size={22} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link className="btn-secondary" href="/dashboard/clubr/members">
              View Members
            </Link>
            <Link className="btn-secondary" href="/admin/profiles">
              Existing Player Admin
            </Link>
          </div>
        </article>

        <article className="surface-card p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="section-kicker">Bookings</p>
              <h2 className="section-title mt-1">{upcomingBookings.length} upcoming this week</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{cancelledBookings.length} cancelled · {coachingBookings.length} Coach Lesson bookings</p>
            </div>
            <BookingIcon className="text-court-teal" size={22} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link className="btn-secondary" href="/dashboard/clubr/bookings">
              View Bookings
            </Link>
            <Link className="btn-secondary" href="/admin/bookings">
              Manage Blocks
            </Link>
          </div>
        </article>

        <article className="surface-card p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="section-kicker">Events</p>
              <h2 className="section-title mt-1">{events.length} upcoming club events</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{eventEntries.length} entries linked to visible events</p>
            </div>
            <EventIcon className="text-court-teal" size={22} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link className="btn-secondary" href="/dashboard/clubr/events">
              View Events
            </Link>
            <Link className="btn-secondary" href="/admin/events">
              Existing Event Admin
            </Link>
          </div>
        </article>

        <article className="surface-card p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="section-kicker">Courts</p>
              <h2 className="section-title mt-1">{activeCourts.length} active courts</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{unavailableCourts.length} unavailable · {confirmedToday.length} bookings today</p>
            </div>
            <ClubIcon className="text-court-teal" size={22} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link className="btn-secondary" href="/admin/courts">
              Court Management
            </Link>
          </div>
        </article>
      </section>

      <section className="mb-5 surface-card p-4 sm:p-5">
        <p className="section-kicker">Club Setup</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded bg-slate-50 p-3 text-sm font-semibold text-slate-600">
            Club <span className="block font-black text-court-navy">{venue?.name ?? "All venues"}</span>
          </div>
          <div className="rounded bg-slate-50 p-3 text-sm font-semibold text-slate-600">
            Admin <span className="block font-black text-court-navy">{roleLabel(context.role)}</span>
          </div>
          <div className="rounded bg-slate-50 p-3 text-sm font-semibold text-slate-600">
            Type <span className="block font-black text-court-navy">{venue?.organisation_type ? formatLabel(venue.organisation_type) : "Global"}</span>
          </div>
          <div className="rounded bg-slate-50 p-3 text-sm font-semibold text-slate-600">
            Status <span className="block font-black text-court-navy">{setupChecks.filter((check) => !check.includes("need") && !check.includes("pending")).length} / {setupChecks.length}</span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {setupChecks.map((check) => (
            <span className={`ui-chip ${check.includes("need") || check.includes("pending") ? "ui-chip-warning" : "ui-chip-success"}`} key={check}>
              {check}
            </span>
          ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ClubRActionCard href="/dashboard/clubr/members" icon={<EntriesIcon size={18} />} text="Search members and linked juniors." title="Members" />
        <ClubRActionCard href="/dashboard/clubr/bookings" icon={<BookingIcon size={18} />} text="Daily and weekly court picture." title="Bookings" />
        <ClubRActionCard href="/dashboard/clubr/events" icon={<EventIcon size={18} />} text="Upcoming events and entries." title="Events" />
        <ClubRActionCard href="/dashboard/clubr/more" icon={<StatusIcon size={18} />} text="Setup, profile and admin links." title="More" />
      </section>
    </ClubRPageFrame>
  );
}
