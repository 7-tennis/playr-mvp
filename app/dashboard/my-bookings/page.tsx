import Link from "next/link";
import { redirect } from "next/navigation";
import { cancelOwnCourtBooking } from "@/app/dashboard/book-court/actions";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { formatDateTime, formatLabel } from "@/lib/courtside-format";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { Court, CourtBooking, Profile } from "@/types/courtside";

export const dynamic = "force-dynamic";

type BookingRow = CourtBooking & {
  courts: Pick<Court, "name"> | null;
  profiles: Pick<Profile, "first_name" | "last_name" | "is_junior"> | null;
};

function message(searchParams?: { booking?: string; error?: string }) {
  if (searchParams?.booking === "created") {
    return "Court booking confirmed.";
  }
  if (searchParams?.booking === "cancelled") {
    return "Court booking cancelled.";
  }
  return null;
}

function errorMessage(searchParams?: { error?: string }) {
  switch (searchParams?.error) {
    case "cannot_cancel":
      return "Only future confirmed bookings can be cancelled.";
    case "cancel_failed":
      return "We could not cancel that booking. Please try again.";
    case "invalid_booking":
      return "That booking could not be found.";
    default:
      return null;
  }
}

export default async function MyBookingsPage({ searchParams }: { searchParams?: { booking?: string; error?: string } }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("court_bookings")
    .select("*,courts:court_id(name),profiles:player_profile_id(first_name,last_name,is_junior)")
    .order("start_time", { ascending: false })
    .limit(100);

  const bookings = (data ?? []) as unknown as BookingRow[];
  const upcomingBookings = bookings.filter((booking) => new Date(booking.start_time).getTime() > Date.now() && booking.status === "confirmed");
  const pastBookings = bookings.filter((booking) => !upcomingBookings.some((upcoming) => upcoming.id === booking.id));

  function BookingCard({ booking }: { booking: BookingRow }) {
    const canCancel = booking.status === "confirmed" && new Date(booking.start_time).getTime() > Date.now();
    return (
      <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-black uppercase tracking-wide text-court-teal">{booking.courts?.name ?? "Court"}</p>
              <span className={`rounded-full px-2 py-1 text-xs font-bold ${booking.status === "confirmed" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                {formatLabel(booking.status)}
              </span>
            </div>
            <h2 className="mt-2 text-xl font-black text-court-navy">{formatDateTime(booking.start_time)}</h2>
            <p className="mt-2 text-sm text-slate-600">
              {booking.profiles
                ? `${booking.profiles.first_name} ${booking.profiles.last_name}${booking.profiles.is_junior ? " (junior)" : ""}`
                : "Player profile unavailable"}
            </p>
            <p className="mt-2 text-sm text-slate-600">{formatLabel(booking.booking_type)}</p>
            {booking.notes ? <p className="mt-2 text-sm text-slate-500">Notes: {booking.notes}</p> : null}
          </div>
          {canCancel ? (
            <form action={cancelOwnCourtBooking}>
              <input name="bookingId" type="hidden" value={booking.id} />
              <button className="w-full rounded border border-rose-200 px-4 py-3 text-sm font-bold text-rose-700 md:w-auto md:py-2" type="submit">
                Cancel booking
              </button>
            </form>
          ) : null}
        </div>
      </article>
    );
  }

  return (
    <PageShell eyebrow="Bookings" title="My Bookings">
      <StatusAlert className="mb-5" message={message(searchParams)} tone="success" />
      <StatusAlert className="mb-5" message={errorMessage(searchParams)} tone="error" />
      {error ? <StatusAlert className="mb-5" message="Your bookings could not be loaded right now." tone="error" /> : null}

      {bookings.length === 0 ? (
        <section className="empty-state">
          <h2 className="section-title">No bookings yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Book a court for yourself or a linked junior and your upcoming court time will appear here.</p>
          <Link className="mt-5 inline-flex rounded bg-court-teal px-4 py-3 font-bold text-white transition hover:bg-teal-500" href="/dashboard/book-court">
            Book a Court
          </Link>
        </section>
      ) : (
        <div className="grid gap-8">
          <section>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="section-kicker">Upcoming</p>
                <h2 className="section-title mt-1">Ready-to-play bookings</h2>
              </div>
              <Link className="inline-flex justify-center rounded bg-court-teal px-4 py-3 text-sm font-bold text-white" href="/dashboard/book-court">
                Book Another Court
              </Link>
            </div>
            {upcomingBookings.length > 0 ? (
              <div className="grid gap-4">{upcomingBookings.map((booking) => <BookingCard booking={booking} key={booking.id} />)}</div>
            ) : (
              <div className="empty-state">
                <h3 className="text-lg font-black text-court-navy">No upcoming bookings</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">Book a court for the next 7 days when you are ready to play.</p>
              </div>
            )}
          </section>

          <section>
            <p className="text-sm font-black uppercase tracking-wide text-slate-500">Past and cancelled</p>
            {pastBookings.length > 0 ? (
              <div className="mt-4 grid gap-4 opacity-90">{pastBookings.map((booking) => <BookingCard booking={booking} key={booking.id} />)}</div>
            ) : (
              <div className="soft-card mt-4 p-5">
                <h3 className="text-lg font-black text-court-navy">No past bookings yet</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">Completed and cancelled bookings will appear here later.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </PageShell>
  );
}
