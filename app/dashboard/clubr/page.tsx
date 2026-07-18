import Link from "next/link";
import { SetupReminderCard } from "@/components/organisation-setup-wizard";
import { BookingIcon, ClubIcon, EntriesIcon, EventIcon, MembershipIcon } from "@/components/playr-icons";
import { dayRange } from "@/lib/clubr";
import {
  loadClubRCourtOccupancy,
  loadClubRCourts,
  loadClubRMembers,
  loadClubRNotices,
  noticeIsActive,
  occupancyDescription,
  occupancySourceLabel
} from "@/lib/clubr-data";
import { formatTime } from "@/lib/courtside-format";
import { loadOrganisationSetup } from "@/lib/organisation-setup";
import { canAccessClubRPermission } from "@/lib/permissions";
import { ClubRDataErrorCard, ClubRPageFrame, ClubRStatCard, getProtectedClubRPage } from "./clubr-shared";

export const dynamic = "force-dynamic";

export default async function ClubRPage() {
  const { content, context, venue } = await getProtectedClubRPage();
  if (content) return content;
  if (!context) return null;

  const now = new Date();
  const { dayEnd, dayStart } = dayRange();
  const [courtsResult, occupancyResult, membersResult, noticesResult] = await Promise.all([
    loadClubRCourts(context),
    loadClubRCourtOccupancy(context, dayStart.toISOString(), dayEnd.toISOString()),
    loadClubRMembers(context),
    loadClubRNotices(context)
  ]);
  const setupSnapshot = venue && canAccessClubRPermission(context.role, "clubr:settings:manage")
    ? await loadOrganisationSetup(context.supabase, venue.id, "clubr")
    : null;
  const errors = [courtsResult.error, occupancyResult.error, membersResult.error, noticesResult.error].filter(Boolean);
  const courts = courtsResult.data;
  const activity = occupancyResult.data.filter((item) => item.booking_status === "confirmed");
  const members = membersResult.data;
  const notices = noticesResult.data.filter((notice) => noticeIsActive(notice, now));
  const nowMs = now.getTime();
  const currentActivity = activity.filter((item) => new Date(item.start_time).getTime() <= nowMs && new Date(item.end_time).getTime() > nowMs);
  const unavailableCourtIds = new Set([
    ...courts.filter((court) => court.status === "inactive").map((court) => court.id),
    ...currentActivity.filter((item) => item.occupancy_type === "maintenance" || item.occupancy_type === "club_programme").map((item) => item.court_id)
  ]);
  const coachSessions = activity.filter((item) => item.occupancy_type === "coaching_lesson" || item.occupancy_type === "coaching_session");
  const activeMembers = members.filter((member) => member.status === "active");
  const pendingMembers = members.filter((member) => member.status === "pending");

  return (
    <ClubRPageFrame context={context} subtitle="What needs attention at the club today?" title="MyClubR" venue={venue}>
      {setupSnapshot && venue ? <SetupReminderCard organisationName={venue.name} snapshot={setupSnapshot} /> : null}

      {errors.length > 0 ? <div className="mb-4"><ClubRDataErrorCard error={errors[0]!} title="Some live club data could not be confirmed" /></div> : null}

      <section className="mb-5 grid gap-3 grid-cols-2 lg:grid-cols-5">
        <ClubRStatCard helper="Active" icon={<MembershipIcon size={19} />} label="Members" value={membersResult.error ? "--" : activeMembers.length} />
        <ClubRStatCard helper={`${unavailableCourtIds.size} unavailable`} icon={<ClubIcon size={19} />} label="Courts" value={courtsResult.error ? "--" : courts.length} />
        <ClubRStatCard helper="Confirmed" icon={<BookingIcon size={19} />} label="Bookings today" value={occupancyResult.error ? "--" : activity.length} />
        <ClubRStatCard helper="CoachR" icon={<EntriesIcon size={19} />} label="Coach sessions" value={occupancyResult.error ? "--" : coachSessions.length} />
        <ClubRStatCard helper="Visible now" icon={<EventIcon size={19} />} label="Notices" value={noticesResult.error ? "--" : notices.length} />
      </section>

      <section className="mb-5 grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
        <article className="surface-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div><p className="section-kicker">Today</p><h2 className="section-title mt-1">Club activity</h2></div>
            <Link className="btn-secondary px-3 py-2" href="/dashboard/clubr/bookings">View Bookings</Link>
          </div>
          {occupancyResult.error ? (
            <div className="mt-4"><ClubRDataErrorCard error={occupancyResult.error} title="Today’s schedule is unavailable" /></div>
          ) : activity.length > 0 ? (
            <div className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200">
              {activity.slice(0, 8).map((item) => (
                <Link className="grid gap-2 p-3 transition hover:bg-court-mist sm:grid-cols-[auto_1fr_auto] sm:items-center" href={`/dashboard/clubr/bookings/${item.booking_id}`} key={item.booking_id}>
                  <p className="font-black text-court-navy">{formatTime(item.start_time)}-{formatTime(item.end_time)}</p>
                  <div><p className="font-bold text-court-ink">{item.court_name} · {occupancyDescription(item)}</p><p className="text-xs font-semibold text-slate-500">{occupancySourceLabel(item)}</p></div>
                  <span className="ui-chip ui-chip-success">Confirmed</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="ui-empty-card mt-4">No bookings today. The club’s courts have no scheduled activity.</div>
          )}
        </article>

        <article className="surface-card p-4 sm:p-5">
          <p className="section-kicker">Attention</p>
          <h2 className="section-title mt-1">Needs a look</h2>
          <div className="mt-4 grid gap-2">
            {pendingMembers.length > 0 ? <Link className="rounded-lg border border-amber-200 bg-amber-50 p-3 font-bold text-amber-900" href="/dashboard/clubr/members?status=pending">{pendingMembers.length} pending members</Link> : null}
            {unavailableCourtIds.size > 0 ? <Link className="rounded-lg border border-slate-200 bg-slate-50 p-3 font-bold text-court-navy" href="/dashboard/clubr/courts">{unavailableCourtIds.size} courts unavailable</Link> : null}
            {notices.slice(0, 2).map((notice) => <Link className="rounded-lg border border-court-teal/20 bg-court-mist p-3" href="/dashboard/clubr/notices" key={notice.id}><span className="text-xs font-black uppercase text-court-teal">{notice.category}</span><span className="mt-1 block font-bold text-court-navy">{notice.title}</span></Link>)}
            {!errors.length && pendingMembers.length === 0 && unavailableCourtIds.size === 0 && notices.length === 0 ? <div className="ui-empty-card">Nothing needs attention right now.</div> : null}
          </div>
        </article>
      </section>
    </ClubRPageFrame>
  );
}
