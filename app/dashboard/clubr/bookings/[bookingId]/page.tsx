import Link from "next/link";
import { notFound } from "next/navigation";
import { BookingIcon, ClubIcon, EntriesIcon, StatusIcon, TimeIcon } from "@/components/playr-icons";
import { loadClubRBookingDetail } from "@/lib/clubr-data";
import { formatDate, formatLabel, formatTime } from "@/lib/courtside-format";
import { ClubRDataErrorCard, ClubRPageFrame, getProtectedClubRPage } from "../../clubr-shared";

export const dynamic = "force-dynamic";

export default async function ClubRBookingDetailPage({ params }: { params: { bookingId: string } }) {
  const { content, context, venue } = await getProtectedClubRPage("clubr:bookings");
  if (content) return content;
  if (!context) return null;

  const result = await loadClubRBookingDetail(context, params.bookingId);
  if (result.error) return <ClubRPageFrame context={context} subtitle="What does the club need to know about this booking?" title="Booking" venue={venue}><ClubRDataErrorCard error={result.error} title="Booking details could not be loaded" /></ClubRPageFrame>;
  if (!result.data) notFound();
  const booking = result.data;
  const source = booking.source_product === "coachr" ? "CoachR" : booking.source_product === "playr" ? "Member" : booking.source_product === "clubr" ? "ClubR" : formatLabel(booking.source_product);

  return (
    <ClubRPageFrame context={context} subtitle="What does the club need to know about this booking?" title="Booking Detail" venue={venue}>
      <section className="surface-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div><p className="section-kicker">{source}</p><h2 className="mt-1 text-xl font-black text-court-navy">{booking.court_name}</h2><p className="mt-2 text-sm font-semibold text-slate-600">{formatDate(booking.start_time)} · {formatTime(booking.start_time)}-{formatTime(booking.end_time)}</p></div>
          <span className={`ui-chip ${booking.booking_status === "confirmed" ? "ui-chip-success" : "ui-chip-muted"}`}>{formatLabel(booking.booking_status)}</span>
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded bg-slate-50 p-3"><dt className="flex items-center gap-2 text-xs font-black uppercase text-slate-500"><ClubIcon size={14} /> Court</dt><dd className="mt-2 font-black text-court-navy">{booking.court_name}</dd></div>
          <div className="rounded bg-slate-50 p-3"><dt className="flex items-center gap-2 text-xs font-black uppercase text-slate-500"><TimeIcon size={14} /> Time</dt><dd className="mt-2 font-black text-court-navy">{formatTime(booking.start_time)}-{formatTime(booking.end_time)}</dd></div>
          <div className="rounded bg-slate-50 p-3"><dt className="flex items-center gap-2 text-xs font-black uppercase text-slate-500"><BookingIcon size={14} /> Source</dt><dd className="mt-2 font-black text-court-navy">{source}</dd></div>
          <div className="rounded bg-slate-50 p-3"><dt className="flex items-center gap-2 text-xs font-black uppercase text-slate-500"><StatusIcon size={14} /> Type</dt><dd className="mt-2 font-black text-court-navy">{formatLabel(booking.occupancy_type)}</dd></div>
          <div className="rounded bg-slate-50 p-3"><dt className="flex items-center gap-2 text-xs font-black uppercase text-slate-500"><EntriesIcon size={14} /> Owner</dt><dd className="mt-2 font-black text-court-navy">{booking.owner_name ?? booking.coach_name ?? "Private occupancy"}</dd></div>
          <div className="rounded bg-slate-50 p-3"><dt className="text-xs font-black uppercase text-slate-500">Created</dt><dd className="mt-2 font-black text-court-navy">{formatDate(booking.created_at)}</dd></div>
        </dl>

        {booking.operational_block_reason ? <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="font-black text-amber-950">{formatLabel(booking.operational_block_reason)}</p><p className="mt-1 text-sm text-amber-900">This is a ClubR operational block linked to the shared court schedule.</p></div> : null}
        {booking.coach_session_occurrence_id || booking.coach_lesson_id ? <div className="mt-4 rounded-lg border border-court-teal/20 bg-court-mist p-4"><p className="font-black text-court-navy">Linked CoachR occurrence</p><p className="mt-1 text-sm text-slate-600">The court reservation follows the linked coaching record. Private notes, attendance and participant reports are not shown in ClubR.</p></div> : null}
      </section>
      <div className="mt-4 flex flex-wrap gap-2"><Link className="btn-secondary" href="/dashboard/clubr/bookings">Back to Bookings</Link><Link className="btn-secondary" href={`/dashboard/clubr/courts/${booking.court_id}`}>View Court</Link></div>
    </ClubRPageFrame>
  );
}
