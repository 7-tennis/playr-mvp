import Link from "next/link";
import { notFound } from "next/navigation";
import { updateClubMemberRole, updateClubMemberStatus } from "@/app/dashboard/clubr/actions";
import { CollapsibleCard } from "@/components/collapsible-card";
import { BookingIcon, MembershipIcon, PrivateIcon, StatusIcon } from "@/components/playr-icons";
import { StatusAlert } from "@/components/status-alert";
import { loadClubRMember, loadClubRMemberBookings, loadClubRMemberFamily } from "@/lib/clubr-data";
import { clubRError, clubRMessage } from "@/lib/clubr-ui";
import { formatDate, formatDateTime, formatLabel } from "@/lib/courtside-format";
import { organisationRoleLabel } from "@/lib/organisations";
import { canAccessClubRPermission } from "@/lib/permissions";
import { ClubRDataErrorCard, ClubRPageFrame, getProtectedClubRPage } from "../../clubr-shared";

export const dynamic = "force-dynamic";

type MemberDetailPageProps = {
  params: { memberId: string };
  searchParams?: { error?: string; message?: string };
};

export default async function ClubRMemberDetailPage({ params, searchParams }: MemberDetailPageProps) {
  const { content, context, venue } = await getProtectedClubRPage("clubr:members");
  if (content) return content;
  if (!context) return null;

  const memberResult = await loadClubRMember(context, params.memberId);
  if (memberResult.error) {
    return <ClubRPageFrame context={context} subtitle="What does the club need to know about this member?" title="Member" venue={venue}><ClubRDataErrorCard error={memberResult.error} /></ClubRPageFrame>;
  }
  if (!memberResult.data) notFound();

  const member = memberResult.data;
  const now = new Date();
  const start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const [familyResult, bookingsResult] = await Promise.all([
    loadClubRMemberFamily(context, member),
    loadClubRMemberBookings(context, member, start.toISOString(), end.toISOString())
  ]);
  const upcoming = bookingsResult.data.filter((booking) => booking.booking_status === "confirmed" && new Date(booking.start_time) >= now).sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  const recent = bookingsResult.data.filter((booking) => new Date(booking.start_time) < now).slice(0, 4);
  const canManage = canAccessClubRPermission(context.role, "clubr:members:manage");
  const canManageRoles = canAccessClubRPermission(context.role, "clubr:roles:manage");

  return (
    <ClubRPageFrame context={context} subtitle="What does the club need to know about this member?" title={`${member.profile.first_name} ${member.profile.last_name}`} venue={venue}>
      <StatusAlert className="mb-4" message={clubRMessage(searchParams?.message)} tone="success" />
      <StatusAlert className="mb-4" message={clubRError(searchParams?.error)} tone="error" />
      {bookingsResult.error || familyResult.error ? <div className="mb-4"><ClubRDataErrorCard error={(bookingsResult.error ?? familyResult.error)!} title="Some member activity could not be confirmed" /></div> : null}

      <section className="surface-card mb-4 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded bg-court-mist text-lg font-black text-court-teal">{member.profile.first_name[0]}{member.profile.last_name[0]}</span>
            <div><h2 className="text-xl font-black text-court-navy">{member.profile.first_name} {member.profile.last_name}</h2><p className="mt-1 text-sm font-semibold text-slate-500">{member.profile.is_junior ? "Junior profile" : "Adult profile"} · Joined {formatDate(member.joined_at ?? member.profile.created_at)}</p></div>
          </div>
          <span className={`ui-chip ${member.status === "active" ? "ui-chip-success" : member.status === "pending" ? "ui-chip-warning" : "ui-chip-muted"}`}>{formatLabel(member.status)}</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="ui-chip ui-chip-brand"><MembershipIcon size={14} /> Member</span>
          {member.roles.map((role) => <span className="ui-chip ui-chip-muted" key={role}>{organisationRoleLabel(role)}</span>)}
          {member.linked_junior_count > 0 ? <span className="ui-chip ui-chip-brand">{member.linked_junior_count} linked junior{member.linked_junior_count === 1 ? "" : "s"}</span> : null}
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <CollapsibleCard defaultOpen summary="Contact and club membership information" title="Member Details">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded bg-slate-50 p-3"><dt className="font-bold text-slate-500">Email</dt><dd className="mt-1 font-black text-court-navy">{member.profile.email ?? "No email linked"}</dd></div>
            <div className="rounded bg-slate-50 p-3"><dt className="font-bold text-slate-500">Telephone</dt><dd className="mt-1 font-black text-court-navy">{member.profile.phone ?? "No telephone linked"}</dd></div>
            <div className="rounded bg-slate-50 p-3"><dt className="font-bold text-slate-500">Profile</dt><dd className="mt-1 font-black text-court-navy">{member.profile.is_junior ? "Junior" : "Adult"}</dd></div>
            <div className="rounded bg-slate-50 p-3"><dt className="font-bold text-slate-500">Activity</dt><dd className="mt-1 font-black text-court-navy">{upcoming.length} upcoming bookings</dd></div>
          </dl>
        </CollapsibleCard>

        <CollapsibleCard summary={familyResult.data.length > 0 ? `${familyResult.data.length} linked family profiles` : "No linked family in this club"} title="Linked Family">
          {familyResult.data.length > 0 ? <div className="grid gap-2">{familyResult.data.map((relative) => <Link className="rounded border border-slate-200 p-3 font-bold text-court-navy hover:bg-court-mist" href={`/dashboard/clubr/members/${relative.membership_id}`} key={relative.membership_id}>{relative.profile.first_name} {relative.profile.last_name}<span className="ml-2 text-xs text-slate-500">{relative.profile.is_junior ? "Junior" : "Adult"}</span></Link>)}</div> : <div className="ui-empty-card">No linked family profiles are recorded for this club.</div>}
        </CollapsibleCard>

        <CollapsibleCard summary={upcoming[0] ? `${upcoming.length} upcoming · next ${formatDateTime(upcoming[0].start_time)}` : "No upcoming court bookings"} title="Upcoming Bookings">
          {upcoming.length > 0 ? <div className="grid gap-2">{upcoming.slice(0, 5).map((booking) => <Link className="rounded border border-slate-200 p-3" href={`/dashboard/clubr/bookings/${booking.booking_id}`} key={booking.booking_id}><span className="font-black text-court-navy">{booking.court_name}</span><span className="mt-1 block text-sm text-slate-600">{formatDateTime(booking.start_time)}</span></Link>)}</div> : <div className="ui-empty-card">No upcoming bookings.</div>}
        </CollapsibleCard>

        <CollapsibleCard summary={recent.length > 0 ? `${recent.length} recent bookings shown` : "No recent bookings"} title="Recent Activity">
          {recent.length > 0 ? <div className="grid gap-2">{recent.map((booking) => <Link className="rounded border border-slate-200 p-3" href={`/dashboard/clubr/bookings/${booking.booking_id}`} key={booking.booking_id}><span className="font-black text-court-navy">{booking.court_name}</span><span className="mt-1 block text-sm text-slate-600">{formatDateTime(booking.start_time)} · {formatLabel(booking.booking_status)}</span></Link>)}</div> : <div className="ui-empty-card">No recent court activity.</div>}
          <Link className="btn-secondary mt-3" href="/dashboard/clubr/bookings"><BookingIcon size={15} /> View All Club Bookings</Link>
        </CollapsibleCard>

        <CollapsibleCard summary="Club roles only; CoachR reports and attendance stay private" title="Club Roles">
          <div className="flex flex-wrap gap-2">{member.roles.length > 0 ? member.roles.map((role) => <span className="ui-chip ui-chip-brand" key={role}>{organisationRoleLabel(role)}</span>) : <span className="text-sm text-slate-600">No additional club roles.</span>}</div>
          {canManageRoles ? <div className="mt-4 grid gap-2 sm:grid-cols-3">{(["committee", "reception", "viewer"] as const).map((role) => { const active = member.roles.includes(role); return <form action={updateClubMemberRole} className="rounded border border-slate-200 p-3" key={role}><input name="venueId" type="hidden" value={member.venue_id} /><input name="membershipId" type="hidden" value={member.membership_id} /><input name="profileId" type="hidden" value={member.profile.id} /><input name="role" type="hidden" value={role} /><input name="intent" type="hidden" value={active ? "remove" : "add"} /><p className="font-bold text-court-navy">{organisationRoleLabel(role)}</p><button className="btn-secondary mt-2 w-full px-2 py-2" type="submit">{active ? "Remove" : "Add"}</button></form>; })}</div> : null}
        </CollapsibleCard>

        {canManage ? (
          <CollapsibleCard badge={<StatusIcon size={15} />} summary="Confirmed changes preserve booking history" title="Member Status">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h3 className="font-black text-amber-950">Change member access?</h3>
              <p className="mt-1 text-sm leading-6 text-amber-900">Deactivation removes member booking access for this club. Historical records remain.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {member.status !== "active" ? <form action={updateClubMemberStatus}><input name="venueId" type="hidden" value={member.venue_id} /><input name="membershipId" type="hidden" value={member.membership_id} /><input name="status" type="hidden" value="active" /><button className="btn-primary" type="submit">Confirm Activation</button></form> : null}
                {member.status !== "inactive" ? <form action={updateClubMemberStatus}><input name="venueId" type="hidden" value={member.venue_id} /><input name="membershipId" type="hidden" value={member.membership_id} /><input name="status" type="hidden" value="inactive" /><button className="btn-secondary border-red-300 text-red-800" type="submit">Confirm Deactivation</button></form> : null}
              </div>
            </div>
          </CollapsibleCard>
        ) : null}
      </section>

      <div className="mt-4 flex flex-wrap gap-2"><Link className="btn-secondary" href="/dashboard/clubr/members"><PrivateIcon size={15} /> Back to Members</Link></div>
    </ClubRPageFrame>
  );
}
