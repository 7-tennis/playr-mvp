import Link from "next/link";
import { notFound } from "next/navigation";
import { updateClubMemberRole, updateClubMemberStatus } from "@/app/dashboard/clubr/actions";
import { CollapsibleCard } from "@/components/collapsible-card";
import { BookingIcon, MembershipIcon, PrivateIcon, StatusIcon } from "@/components/playr-icons";
import { StatusAlert } from "@/components/status-alert";
import { loadClubRMember, loadClubRMemberActivity, loadClubRMemberFamily } from "@/lib/clubr-data";
import { clubRError, clubRMessage } from "@/lib/clubr-ui";
import { loadMembershipSubscriptions, membershipStatusLabel } from "@/lib/club-memberships";
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
  const [familyResult, activityResult, subscriptionsResult] = await Promise.all([
    loadClubRMemberFamily(context, member),
    loadClubRMemberActivity(context, member, start.toISOString(), end.toISOString()),
    loadMembershipSubscriptions(context.supabase, member.venue_id)
  ]);
  const commercialSubscription = subscriptionsResult.data.find((subscription) => subscription.coveredMembers.some((covered) => covered.profile_id === member.profile.id) && ["pending_activation", "active", "paused", "expiring"].includes(subscription.status)) ?? null;
  const upcoming = activityResult.data.filter((activity) => ["confirmed", "scheduled"].includes(activity.activity_status) && new Date(activity.start_time) >= now).sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  const memberBookings = upcoming.filter((activity) => activity.activity_type === "member_booking");
  const coachingSessions = upcoming.filter((activity) => activity.activity_type === "coaching_session" || activity.activity_type === "coaching_lesson");
  const recent = activityResult.data.filter((activity) => new Date(activity.start_time) < now).sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()).slice(0, 4);
  const canManage = canAccessClubRPermission(context.role, "clubr:members:manage");
  const canManageRoles = canAccessClubRPermission(context.role, "clubr:roles:manage");

  return (
    <ClubRPageFrame context={context} subtitle="What does the club need to know about this member?" title={`${member.profile.first_name} ${member.profile.last_name}`} venue={venue}>
      <StatusAlert className="mb-4" message={clubRMessage(searchParams?.message)} tone="success" />
      <StatusAlert className="mb-4" message={clubRError(searchParams?.error)} tone="error" />
      {activityResult.error || familyResult.error || subscriptionsResult.error ? <div className="mb-4"><ClubRDataErrorCard error={(activityResult.error ?? familyResult.error ?? subscriptionsResult.error)!} title="Some member information could not be confirmed" /></div> : null}

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
            <div className="rounded bg-slate-50 p-3"><dt className="font-bold text-slate-500">Club Activity</dt><dd className="mt-1 font-black text-court-navy">{upcoming.length} upcoming items</dd></div>
          </dl>
        </CollapsibleCard>

        <CollapsibleCard summary={familyResult.data.length > 0 ? `${familyResult.data.length} linked family profiles` : "No linked family in this club"} title="Linked Family">
          {familyResult.data.length > 0 ? <div className="grid gap-2">{familyResult.data.map((relative) => <Link className="rounded border border-slate-200 p-3 font-bold text-court-navy hover:bg-court-mist" href={`/dashboard/clubr/members/${relative.membership_id}`} key={relative.membership_id}>{relative.profile.first_name} {relative.profile.last_name}<span className="ml-2 text-xs text-slate-500">{relative.profile.is_junior ? "Junior" : "Adult"}</span></Link>)}</div> : <div className="ui-empty-card">No linked family profiles are recorded for this club.</div>}
        </CollapsibleCard>

        <CollapsibleCard summary={commercialSubscription ? `${commercialSubscription.plan?.name ?? commercialSubscription.price_snapshot.plan_name} · ${membershipStatusLabel(commercialSubscription.status)}` : "Membership details to be confirmed"} title="Membership Subscription">
          {commercialSubscription ? <div className="rounded-lg border border-court-teal/25 bg-court-mist p-4"><p className="font-black text-court-navy">{commercialSubscription.plan?.name ?? commercialSubscription.price_snapshot.plan_name}</p><p className="mt-1 text-sm text-slate-600">{membershipStatusLabel(commercialSubscription.status)} · {commercialSubscription.coveredMembers.length} covered member{commercialSubscription.coveredMembers.length === 1 ? "" : "s"}</p><Link className="btn-secondary mt-3" href={`/dashboard/clubr/memberships/subscriptions/${commercialSubscription.id}`}>View Subscription</Link></div> : <div className="ui-empty-card">No commercial subscription is linked yet. Existing access remains represented by the legacy membership migration.</div>}
        </CollapsibleCard>

        <CollapsibleCard defaultOpen summary={upcoming[0] ? `${upcoming.length} upcoming · next ${formatDateTime(upcoming[0].start_time)}` : "No upcoming club activity"} title="Upcoming Club Activity">
          <div className="grid gap-4">
            <div><div className="mb-2 flex items-center justify-between gap-2"><p className="text-sm font-black uppercase text-slate-500">Member Bookings</p><span className="ui-chip ui-chip-brand">{memberBookings.length}</span></div>{memberBookings.length > 0 ? <div className="grid gap-2">{memberBookings.map((activity) => <Link className="rounded-lg border border-slate-200 p-3 transition hover:bg-court-mist" href={`/dashboard/clubr/bookings/${activity.booking_id}`} key={activity.activity_id}><div className="flex items-start justify-between gap-3"><div><p className="font-black text-court-navy">{activity.court_name ?? activity.title}</p><p className="mt-1 text-sm text-slate-600">{formatDateTime(activity.start_time)}</p></div><span className="ui-chip ui-chip-success">Member-owned</span></div><div className="mt-3 grid gap-1 border-t border-slate-200 pt-2 text-xs font-semibold text-slate-500"><p>Source: PlayR · Owner: {activity.owner_label}</p><p>Management: Member can manage booking · Counts toward booking limit</p></div></Link>)}</div> : <div className="ui-empty-card">No member-owned court bookings.</div>}</div>
            <div><div className="mb-2 flex items-center justify-between gap-2"><p className="text-sm font-black uppercase text-slate-500">Coaching Sessions</p><span className="ui-chip ui-chip-muted">{coachingSessions.length}</span></div>{coachingSessions.length > 0 ? <div className="grid gap-2">{coachingSessions.map((activity) => <div className="rounded-lg border border-court-teal/25 bg-court-mist p-3" key={`${activity.activity_type}-${activity.activity_id}-${activity.booking_id}`}><div className="flex items-start justify-between gap-3"><div><p className="font-black text-court-navy">{activity.title}</p><p className="mt-1 text-sm text-slate-600">{formatDateTime(activity.start_time)} · {activity.court_name ?? "Court arranged by academy"}</p></div><span className="ui-chip ui-chip-brand">Academy-owned</span></div><div className="mt-3 grid gap-1 border-t border-court-teal/20 pt-2 text-xs font-semibold text-slate-600"><p>Source: CoachR · Owner: {activity.owner_label}</p><p>Management: Court arranged by academy · Does not count toward member booking limits</p></div></div>)}</div> : <div className="ui-empty-card">No upcoming coaching sessions at this club.</div>}</div>
          </div>
        </CollapsibleCard>

        <CollapsibleCard summary={recent.length > 0 ? `${recent.length} recent activity items shown` : "No recent activity"} title="Recent Activity">
          {recent.length > 0 ? <div className="grid gap-2">{recent.map((activity) => <div className="rounded border border-slate-200 p-3" key={`${activity.activity_type}-${activity.activity_id}`}><span className="font-black text-court-navy">{activity.court_name ?? activity.title}</span><span className="mt-1 block text-sm text-slate-600">{formatDateTime(activity.start_time)} · {formatLabel(activity.activity_status)} · {activity.source_label}</span></div>)}</div> : <div className="ui-empty-card">No recent court activity.</div>}
          <Link className="btn-secondary mt-3" href="/dashboard/clubr/bookings"><BookingIcon size={15} /> View All Club Bookings</Link>
        </CollapsibleCard>

        <CollapsibleCard summary="Club roles only; CoachR reports and attendance stay private" title="Club Roles">
          <div className="flex flex-wrap gap-2">{member.roles.length > 0 ? member.roles.map((role) => <span className="ui-chip ui-chip-brand" key={role}>{organisationRoleLabel(role)}</span>) : <span className="text-sm text-slate-600">No additional club roles.</span>}</div>
          {canManageRoles ? <div className="mt-4 grid gap-2 sm:grid-cols-3">{(["committee", "reception", "viewer"] as const).map((role) => { const active = member.roles.includes(role); return <form action={updateClubMemberRole} className="rounded border border-slate-200 p-3" key={role}><input name="venueId" type="hidden" value={member.venue_id} /><input name="membershipId" type="hidden" value={member.membership_id} /><input name="profileId" type="hidden" value={member.profile.id} /><input name="role" type="hidden" value={role} /><input name="intent" type="hidden" value={active ? "remove" : "add"} /><p className="font-bold text-court-navy">{organisationRoleLabel(role)}</p><button className="btn-secondary mt-2 w-full px-2 py-2" type="submit">{active ? "Remove" : "Add"}</button></form>; })}</div> : null}
        </CollapsibleCard>

        {canManage && (!commercialSubscription || commercialSubscription.is_legacy) ? (
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

      <div className="mt-4 flex flex-wrap gap-2"><Link className="btn-secondary" href="/dashboard/clubr/members"><PrivateIcon size={15} /> Back to Members</Link><Link className="btn-secondary" href={commercialSubscription ? `/dashboard/clubr/memberships/subscriptions/${commercialSubscription.id}` : "/dashboard/clubr/memberships/subscriptions"}><MembershipIcon size={15} /> Membership Subscription</Link></div>
    </ClubRPageFrame>
  );
}
