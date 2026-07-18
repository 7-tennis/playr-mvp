import Link from "next/link";
import { ClubIcon, StatusIcon, TimeIcon } from "@/components/playr-icons";
import { loadClubRCourtOccupancy, loadClubRCourts, occupancyDescription } from "@/lib/clubr-data";
import { formatDateTime, formatLabel } from "@/lib/courtside-format";
import { ClubRDataErrorCard, ClubRPageFrame, getProtectedClubRPage } from "../clubr-shared";

export const dynamic = "force-dynamic";

function stateForCourt(courtStatus: "active" | "inactive", currentType?: string) {
  if (courtStatus === "inactive") return { label: "Disabled", chip: "ui-chip-muted" };
  if (currentType === "maintenance") return { label: "Maintenance", chip: "ui-chip-warning" };
  if (currentType === "club_programme") return { label: "Closed", chip: "ui-chip-warning" };
  if (currentType) return { label: "Occupied", chip: "ui-chip-brand" };
  return { label: "Available", chip: "ui-chip-success" };
}

export default async function ClubRCourtsPage() {
  const { content, context, venue } = await getProtectedClubRPage("clubr:courts");
  if (content) return content;
  if (!context) return null;

  const now = new Date();
  const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [courtsResult, occupancyResult] = await Promise.all([
    loadClubRCourts(context),
    loadClubRCourtOccupancy(context, now.toISOString(), end.toISOString())
  ]);

  return (
    <ClubRPageFrame context={context} subtitle="What is the condition and availability of each court?" title="Courts" venue={venue}>
      {courtsResult.error || occupancyResult.error ? <div className="mb-4"><ClubRDataErrorCard error={(courtsResult.error ?? occupancyResult.error)!} title="Live court status could not be confirmed" /></div> : null}

      {!courtsResult.error && courtsResult.data.length > 0 ? (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {courtsResult.data.map((court) => {
            const courtBookings = occupancyResult.data.filter((item) => item.court_id === court.id && item.booking_status === "confirmed");
            const current = courtBookings.find((item) => new Date(item.start_time) <= now && new Date(item.end_time) > now);
            const next = courtBookings.find((item) => new Date(item.start_time) > now);
            const futureClosure = courtBookings.find((item) => new Date(item.start_time) > now && ["maintenance", "club_programme"].includes(item.occupancy_type));
            const state = stateForCourt(court.status, current?.occupancy_type);

            return (
              <article className="surface-card p-4" key={court.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-court-mist text-court-teal"><ClubIcon size={20} /></span><div><h2 className="font-black text-court-navy">{court.name}</h2><p className="mt-1 text-sm font-semibold text-slate-500">{court.surface ? formatLabel(court.surface) : "Surface not set"}</p></div></div>
                  <span className={`ui-chip ${state.chip}`}>{state.label}</span>
                </div>
                <div className="mt-4 grid gap-2 text-sm">
                  <p className="flex items-center gap-2 font-bold text-slate-700"><StatusIcon size={15} /> {current ? `${occupancyDescription(current)} until ${new Intl.DateTimeFormat("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" }).format(new Date(current.end_time))}` : state.label}</p>
                  <p className="flex items-center gap-2 text-slate-600"><TimeIcon size={15} /> {next ? `Next: ${formatDateTime(next.start_time)}` : "No booking in the next 7 days"}</p>
                  {futureClosure ? <p className="rounded bg-amber-50 p-2 font-semibold text-amber-900">Closure: {formatDateTime(futureClosure.start_time)}</p> : null}
                </div>
                <Link className="btn-secondary mt-4 w-full" href={`/dashboard/clubr/courts/${court.id}`}>View Court</Link>
              </article>
            );
          })}
        </section>
      ) : !courtsResult.error ? (
        <section className="empty-state"><h2 className="section-title">No courts configured</h2><p className="mt-2 text-sm text-slate-600">Add courts from ClubR setup before opening bookings.</p><Link className="btn-primary mt-4" href="/dashboard/clubr/settings">Open Settings</Link></section>
      ) : null}
    </ClubRPageFrame>
  );
}
