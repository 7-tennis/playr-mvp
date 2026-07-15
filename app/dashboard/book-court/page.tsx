import Link from "next/link";
import { redirect } from "next/navigation";
import { CourtBookingGrid } from "@/components/court-booking-grid";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { formatDate } from "@/lib/courtside-format";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { Court, CourtBooking, CourtBookingType, Profile } from "@/types/courtside";

export const dynamic = "force-dynamic";

type BookCourtPageProps = {
  searchParams?: {
    date?: string;
    court?: string;
    error?: string;
    booking?: string;
  };
};

type BookingRow = Pick<CourtBooking, "court_id" | "player_profile_id" | "start_time" | "end_time" | "booking_type"> & {
  player_name: string | null;
};

function zaDateInput(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function dateWithSaOffset(date: string, hour: number) {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:00:00+02:00`);
}

function clampDate(value?: string) {
  const today = zaDateInput();
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return today;
  }

  const selected = dateWithSaOffset(value, 0).getTime();
  const start = dateWithSaOffset(today, 0).getTime();
  const earliest = start - 7 * 24 * 60 * 60 * 1000;
  const latest = start + 28 * 24 * 60 * 60 * 1000;
  return selected >= earliest && selected <= latest ? value : today;
}

function dateInputFromSerial(serial: number) {
  return new Date(serial).toISOString().slice(0, 10);
}

function weekRange(date: string) {
  const serial = Date.parse(`${date}T00:00:00Z`);
  const day = new Date(serial).getUTCDay();
  const start = serial - ((day + 6) % 7) * 24 * 60 * 60 * 1000;
  return { end: start + 7 * 24 * 60 * 60 * 1000, start };
}

function weekRangeLabel(start: number, end: number) {
  const formatter = new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", timeZone: "UTC" });
  const year = new Intl.DateTimeFormat("en-ZA", { timeZone: "UTC", year: "numeric" }).format(new Date(end - 1));
  return `${formatter.format(new Date(start))} - ${formatter.format(new Date(end - 1))} ${year}`;
}

function slotsForDate(date: string) {
  return Array.from({ length: 15 }, (_, index) => {
    const start = dateWithSaOffset(date, 6 + index);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return {
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      timeLabel: `${String(start.getUTCHours() + 2).padStart(2, "0")}:00 - ${String(end.getUTCHours() + 2).padStart(2, "0")}:00`
    };
  });
}

function errorMessage(error?: string) {
  return error ?? null;
}

function successMessage(value?: string) {
  return value === "created" ? "Court booking confirmed. You can review it in My Bookings, or send a match invite from Play." : null;
}

export default async function BookCourtPage({ searchParams }: BookCourtPageProps) {
  if (!hasSupabaseConfig()) {
    return (
      <PageShell eyebrow="Book a Court" title="Supabase is not configured.">
        <div className="empty-state">
          <p className="text-slate-700">Add Supabase environment variables to book courts.</p>
        </div>
      </PageShell>
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const selectedDate = clampDate(searchParams?.date);
  const dayStart = dateWithSaOffset(selectedDate, 0);
  const selectedWeek = weekRange(selectedDate);
  const rangeStart = dateWithSaOffset(dateInputFromSerial(selectedWeek.start), 0);
  const rangeEnd = dateWithSaOffset(dateInputFromSerial(selectedWeek.end), 0);
  const previousWeekDate = dateInputFromSerial(Date.parse(`${selectedDate}T00:00:00Z`) - 7 * 24 * 60 * 60 * 1000);
  const nextWeekDate = dateInputFromSerial(Date.parse(`${selectedDate}T00:00:00Z`) + 7 * 24 * 60 * 60 * 1000);

  const { data: courtData, error: courtsError } = await supabase
    .from("courts")
    .select("*")
    .eq("status", "active")
    .order("sort_order", { ascending: true });

  const courts = (courtData ?? []) as Court[];
  const selectedCourtId = courts.some((court) => court.id === searchParams?.court) ? String(searchParams?.court) : courts[0]?.id;

  const { data: adultProfileData } = await supabase
    .from("profiles")
    .select("id,first_name,last_name,is_junior")
    .eq("user_id", user.id)
    .eq("is_junior", false)
    .maybeSingle();

  const adultProfile = adultProfileData as Pick<Profile, "id" | "first_name" | "last_name" | "is_junior"> | null;
  const { data: juniorData } = adultProfile
    ? await supabase
        .from("profiles")
        .select("id,first_name,last_name,is_junior")
        .eq("parent_profile_id", adultProfile.id)
        .eq("is_junior", true)
        .order("first_name", { ascending: true })
    : { data: [] };

  const bookableProfiles = [
    ...(adultProfile ? [adultProfile] : []),
    ...((juniorData ?? []) as Pick<Profile, "id" | "first_name" | "last_name" | "is_junior">[])
  ];
  const profileIds = bookableProfiles.map((profile) => profile.id);
  const profiles = bookableProfiles.map((profile) => ({
    id: profile.id,
    name: `${profile.first_name} ${profile.last_name}`,
    label: profile.is_junior ? "linked junior" : "myself"
  }));

  const { data: bookingData } = courts.length
      ? await supabase.rpc("coachr_court_booking_blocks_for_range", {
        check_end_time: rangeEnd.toISOString(),
        check_start_time: rangeStart.toISOString()
      })
    : { data: [] };

  const bookings = ((bookingData ?? []) as unknown as BookingRow[]).map((booking) => ({
    court_id: booking.court_id,
    player_profile_id: booking.player_profile_id,
    start_time: booking.start_time,
    end_time: booking.end_time,
    booking_type: booking.booking_type as CourtBookingType,
    player_name: booking.player_name
  }));

  return (
    <PageShell eyebrow="Book" subtitle="Reserve courts and manage upcoming bookings." title="Book">
      <StatusAlert className="mb-5" message={successMessage(searchParams?.booking)} tone="success" />
      <StatusAlert className="mb-5" message={errorMessage(searchParams?.error)} tone="error" />
      <section className="surface-card mb-5 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="section-kicker">{weekRangeLabel(selectedWeek.start, selectedWeek.end)}</p><h2 className="section-title mt-1">{formatDate(dayStart.toISOString())}</h2><p className="mt-2 text-sm leading-6 text-slate-600">Choose a court, time and player. Availability is refreshed for the displayed week.</p></div>
          <div className="flex gap-2"><Link className="btn-secondary px-3 py-2" href={`/dashboard/book-court?date=${previousWeekDate}${selectedCourtId ? `&court=${selectedCourtId}` : ""}`}>Previous Week</Link><Link className="btn-secondary px-3 py-2" href={`/dashboard/book-court?date=${nextWeekDate}${selectedCourtId ? `&court=${selectedCourtId}` : ""}`}>Next Week</Link></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
          <span className="ui-chip ui-chip-success">Available</span>
          <span className="ui-chip ui-chip-brand">Your booking</span>
          <span className="ui-chip ui-chip-muted">Booked</span>
          <span className="ui-chip ui-chip-warning">Club block</span>
        </div>
      </section>

      {courtsError ? <StatusAlert className="mb-5" message="Courts could not be loaded right now." tone="error" /> : null}

      {!adultProfile ? (
        <section className="empty-state">
          <h2 className="section-title">Create your profile first</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">You need a player profile before booking a court for yourself or a linked junior.</p>
          <Link className="btn-primary mt-5" href="/dashboard/profile">
            Create Player Profile
          </Link>
        </section>
      ) : courts.length === 0 ? (
        <section className="empty-state">
          <h2 className="section-title">No courts are active yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Court availability will appear here once the club activates courts in ClubR.</p>
        </section>
      ) : (
        <CourtBookingGrid
          bookings={bookings}
          courts={courts.map((court) => ({ id: court.id, name: court.name }))}
          profiles={profiles}
          selectedCourtId={selectedCourtId}
          selectedDate={selectedDate}
          slots={slotsForDate(selectedDate)}
          userProfileIds={profileIds}
        />
      )}
    </PageShell>
  );
}
