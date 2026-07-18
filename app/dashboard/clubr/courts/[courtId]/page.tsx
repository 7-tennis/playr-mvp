import Link from "next/link";
import { notFound } from "next/navigation";
import { createClubOperationalBlock, releaseClubOperationalBlock, updateClubCourt } from "@/app/dashboard/clubr/actions";
import { ClubRBlockBuilder } from "@/components/clubr-block-builder";
import { CollapsibleCard } from "@/components/collapsible-card";
import { BookingIcon, ClubIcon, StatusIcon, TimeIcon } from "@/components/playr-icons";
import { StatusAlert } from "@/components/status-alert";
import { dateInput, dayRange } from "@/lib/clubr";
import { loadClubRBlockConflicts, loadClubRBookingSettings, loadClubRCourtOccupancy, loadClubRCourts, loadClubROperationalBlocks, occupancyDescription } from "@/lib/clubr-data";
import { clubRError, clubRMessage } from "@/lib/clubr-ui";
import { formatDate, formatDateTime, formatLabel, formatTime } from "@/lib/courtside-format";
import { canAccessClubRPermission } from "@/lib/permissions";
import { ClubRDataErrorCard, ClubRPageFrame, getProtectedClubRPage } from "../../clubr-shared";

export const dynamic = "force-dynamic";

type CourtDetailPageProps = {
  params: { courtId: string };
  searchParams?: { date?: string; review?: string; reason?: string; start?: string; end?: string; note?: string; error?: string; message?: string };
};

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00+02:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function queryIso(value?: string) {
  if (!value) return null;
  const parsed = new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}:00+02:00`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function atLocalTime(date: string, time: string) {
  return new Date(`${date}T${time.slice(0, 5)}:00+02:00`);
}

export default async function ClubRCourtDetailPage({ params, searchParams }: CourtDetailPageProps) {
  const { content, context, venue } = await getProtectedClubRPage("clubr:courts");
  if (content) return content;
  if (!context) return null;

  const selectedDate = searchParams?.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date) ? searchParams.date : dateInput();
  const { dayEnd, dayStart } = dayRange(selectedDate);
  const [courtsResult, occupancyResult, blocksResult, settingsResult] = await Promise.all([
    loadClubRCourts(context),
    loadClubRCourtOccupancy(context, dayStart.toISOString(), dayEnd.toISOString()),
    loadClubROperationalBlocks(context),
    loadClubRBookingSettings(context)
  ]);
  const court = courtsResult.data.find((item) => item.id === params.courtId);
  if (!court && !courtsResult.error) notFound();
  if (!court) return <ClubRPageFrame context={context} title="Court" venue={venue}><ClubRDataErrorCard error={courtsResult.error!} /></ClubRPageFrame>;

  const canManage = canAccessClubRPermission(context.role, "clubr:courts:manage");
  const bookings = occupancyResult.data.filter((item) => item.court_id === court.id && item.booking_status === "confirmed").sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  const activeBlocks = blocksResult.data.filter((block) => block.court_id === court.id && block.status === "active");
  const now = new Date();
  const current = bookings.find((item) => new Date(item.start_time) <= now && new Date(item.end_time) > now);
  const currentState = court.status === "inactive" ? "Disabled" : current?.occupancy_type === "maintenance" ? "Maintenance" : current?.occupancy_type === "club_programme" ? "Closed" : current ? "Occupied" : "Available";
  const openingTime = court.opening_time ?? settingsResult.data?.opening_time ?? "06:00";
  const closingTime = court.closing_time ?? settingsResult.data?.closing_time ?? "21:00";
  const opening = atLocalTime(selectedDate, openingTime);
  const closing = atLocalTime(selectedDate, closingTime);
  const timeline: { key: string; start: Date; end: Date; label: string; bookingId?: string; available: boolean }[] = [];
  let cursor = opening;

  bookings.forEach((booking) => {
    const start = new Date(Math.max(opening.getTime(), new Date(booking.start_time).getTime()));
    const end = new Date(Math.min(closing.getTime(), new Date(booking.end_time).getTime()));
    if (end <= opening || start >= closing) return;
    if (start > cursor) timeline.push({ available: true, end: start, key: `gap-${cursor.toISOString()}`, label: "Available", start: cursor });
    timeline.push({ available: false, bookingId: booking.booking_id, end, key: booking.booking_id, label: occupancyDescription(booking), start });
    if (end > cursor) cursor = end;
  });
  if (cursor < closing) timeline.push({ available: true, end: closing, key: `gap-${cursor.toISOString()}`, label: "Available", start: cursor });

  const reviewStart = queryIso(searchParams?.start);
  const reviewEnd = queryIso(searchParams?.end);
  const conflictResult = searchParams?.review === "true" && reviewStart && reviewEnd
    ? await loadClubRBlockConflicts(context, court.id, reviewStart, reviewEnd)
    : null;

  return (
    <ClubRPageFrame context={context} subtitle="What is happening on this court, and can it be used?" title={court.name} venue={venue}>
      <StatusAlert className="mb-4" message={clubRMessage(searchParams?.message)} tone="success" />
      <StatusAlert className="mb-4" message={clubRError(searchParams?.error)} tone="error" />
      {occupancyResult.error || blocksResult.error || settingsResult.error ? <div className="mb-4"><ClubRDataErrorCard error={(occupancyResult.error ?? blocksResult.error ?? settingsResult.error)!} title="Court availability could not be confirmed" /></div> : null}

      <section className="surface-card mb-4 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3"><span className="grid h-12 w-12 place-items-center rounded bg-court-mist text-court-teal"><ClubIcon size={22} /></span><div><h2 className="text-xl font-black text-court-navy">{court.name}</h2><p className="mt-1 text-sm font-semibold text-slate-500">{court.surface ? formatLabel(court.surface) : "Surface not set"} · {openingTime.slice(0, 5)}-{closingTime.slice(0, 5)}</p></div></div>
          <span className={`ui-chip ${currentState === "Available" ? "ui-chip-success" : currentState === "Occupied" ? "ui-chip-brand" : "ui-chip-warning"}`}>{currentState}</span>
        </div>
        {current ? <p className="mt-4 rounded bg-slate-50 p-3 text-sm font-bold text-slate-700"><TimeIcon size={15} className="mr-2 inline" />{occupancyDescription(current)} until {formatTime(current.end_time)}</p> : null}
      </section>

      <section className="mb-4 surface-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="section-kicker">Day Timeline</p><h2 className="section-title mt-1">{formatDate(dayStart.toISOString())}</h2></div><div className="flex flex-wrap gap-2"><Link className="btn-secondary px-3 py-2" href={`/dashboard/clubr/courts/${court.id}?date=${addDays(selectedDate, -1)}`}>Previous</Link><Link className="btn-secondary px-3 py-2" href={`/dashboard/clubr/courts/${court.id}`}>Today</Link><Link className="btn-secondary px-3 py-2" href={`/dashboard/clubr/courts/${court.id}?date=${addDays(selectedDate, 1)}`}>Next</Link><form><input name="date" type="date" defaultValue={selectedDate} className="rounded border border-slate-300 px-3 py-2 text-sm font-bold focus-ring" /></form></div></div>
        {!occupancyResult.error ? <div className="mt-4 grid gap-2">{timeline.map((item) => item.available ? <div className="grid gap-1 rounded border border-emerald-200 bg-emerald-50 p-3 sm:grid-cols-[120px_1fr]" key={item.key}><span className="font-black text-emerald-900">{formatTime(item.start.toISOString())}-{formatTime(item.end.toISOString())}</span><span className="font-bold text-emerald-800">Available</span></div> : <Link className="grid gap-1 rounded border border-slate-200 p-3 hover:bg-court-mist sm:grid-cols-[120px_1fr]" href={`/dashboard/clubr/bookings/${item.bookingId}`} key={item.key}><span className="font-black text-court-navy">{formatTime(item.start.toISOString())}-{formatTime(item.end.toISOString())}</span><span className="font-bold text-slate-700">{item.label}</span></Link>)}</div> : null}
      </section>

      {canManage ? <section className="grid gap-3 lg:grid-cols-2">
        <CollapsibleCard summary="Name, surface, hours and administrative availability" title="Court Settings">
          <form action={updateClubCourt} className="grid gap-3 sm:grid-cols-2"><input name="courtId" type="hidden" value={court.id} /><input name="venueId" type="hidden" value={court.venue_id ?? ""} /><label className="text-sm font-bold text-slate-700 sm:col-span-2">Court name<input className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={court.name} name="name" required /></label><label className="text-sm font-bold text-slate-700">Surface<input className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={court.surface ?? ""} name="surface" /></label><label className="text-sm font-bold text-slate-700">Status<select className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={court.status} name="status"><option value="active">Active</option><option value="inactive">Disabled</option></select></label><label className="text-sm font-bold text-slate-700">Opens<input className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={openingTime.slice(0, 5)} name="openingTime" type="time" /></label><label className="text-sm font-bold text-slate-700">Closes<input className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={closingTime.slice(0, 5)} name="closingTime" type="time" /></label><button className="btn-primary sm:col-span-2" type="submit">Save Court</button></form>
        </CollapsibleCard>

        <CollapsibleCard badge={<StatusIcon size={15} />} defaultOpen={searchParams?.review === "true"} summary="Create a maintenance or club closure in the shared schedule" title="Make Court Unavailable">
          {searchParams?.review === "true" && reviewStart && reviewEnd && conflictResult ? (
            <div>
              <p className="section-kicker">Review</p><h3 className="mt-1 font-black text-court-navy">{formatLabel(searchParams.reason ?? "maintenance")}</h3><p className="mt-2 text-sm font-semibold text-slate-600">{formatDateTime(reviewStart)} to {formatDateTime(reviewEnd)}</p>{searchParams.note ? <p className="mt-2 text-sm text-slate-600">{searchParams.note}</p> : null}
              {conflictResult.error ? <div className="mt-3"><ClubRDataErrorCard error={conflictResult.error} title="Conflicts could not be checked" /></div> : conflictResult.data.length > 0 ? <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4"><h4 className="font-black text-amber-950">This closure conflicts with {conflictResult.data.length} booking{conflictResult.data.length === 1 ? "" : "s"}.</h4><div className="mt-3 grid gap-2">{conflictResult.data.map((conflict) => <Link className="rounded bg-white p-3 text-sm font-bold text-amber-950" href={`/dashboard/clubr/bookings/${conflict.booking_id}`} key={conflict.booking_id}>{conflict.description} · {formatDateTime(conflict.start_time)}</Link>)}</div><Link className="btn-secondary mt-3" href={`/dashboard/clubr/courts/${court.id}?date=${selectedDate}`}>Choose Another Time</Link></div> : <form action={createClubOperationalBlock} className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4"><input name="venueId" type="hidden" value={court.venue_id ?? ""} /><input name="courtId" type="hidden" value={court.id} /><input name="reason" type="hidden" value={searchParams.reason ?? "maintenance"} /><input name="startTime" type="hidden" value={searchParams.start} /><input name="endTime" type="hidden" value={searchParams.end} /><input name="note" type="hidden" value={searchParams.note ?? ""} /><p className="font-black text-emerald-950">No booking conflicts found.</p><p className="mt-1 text-sm text-emerald-900">Confirming will reserve this court across ClubR, CoachR and player booking.</p><button className="btn-primary mt-3" type="submit">Confirm Closure</button></form>}
            </div>
          ) : <ClubRBlockBuilder courtId={court.id} defaultDate={selectedDate} />}
        </CollapsibleCard>

        {activeBlocks.length > 0 ? <CollapsibleCard summary={`${activeBlocks.length} active maintenance or operational blocks`} title="Active Closures"> <div className="grid gap-2">{activeBlocks.map((block) => <div className="rounded border border-slate-200 p-3" key={block.id}><p className="font-black text-court-navy">{formatLabel(block.reason)}</p><p className="mt-1 text-sm text-slate-600">{block.note ?? "No note"}</p><form action={releaseClubOperationalBlock} className="mt-3 rounded bg-amber-50 p-3"><input name="venueId" type="hidden" value={block.venue_id} /><input name="courtId" type="hidden" value={court.id} /><input name="blockId" type="hidden" value={block.id} /><p className="text-sm font-bold text-amber-950">Reopen this court and release the linked booking?</p><button className="btn-secondary mt-2" type="submit">Confirm Reopening</button></form></div>)}</div></CollapsibleCard> : null}
      </section> : null}

      <Link className="btn-secondary mt-4" href="/dashboard/clubr/courts"><BookingIcon size={15} /> Back to Courts</Link>
    </ClubRPageFrame>
  );
}
