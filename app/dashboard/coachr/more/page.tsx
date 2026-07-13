import Link from "next/link";
import { BookingIcon, ClubIcon, EntriesIcon, MatchIcon, MembershipIcon, NotificationIcon, PrivateIcon, StatusIcon } from "@/components/playr-icons";
import { loadCoachLessonOptions, profileDisplayName } from "@/lib/coach-lessons";
import { canManageOrganisationCourtAccess } from "@/lib/organisations";
import { canAccessHeadCoach, roleLabel } from "@/lib/permissions";
import { CoachRActionCard, CoachRCompactGrid, CoachRPageFrame, CoachRRoleSummary, getProtectedCoachRPage } from "../coachr-shared";

export const dynamic = "force-dynamic";

export default async function CoachRMorePage() {
  const { access, content } = await getProtectedCoachRPage("coachr:more");

  if (content) {
    return content;
  }

  if (access.context.kind !== "authenticated") {
    return null;
  }

  const context = access.context;
  const options = await loadCoachLessonOptions(context);
  const ownCoach = context.adultProfileId ? options.coachProfiles.find((profile) => profile.id === context.adultProfileId) ?? null : null;
  const canUseHeadCoachTools = canAccessHeadCoach(context.role);
  const canManageCourts = context.role === "platform_admin" || canManageOrganisationCourtAccess(context.activeOrganisationRole);

  return (
    <CoachRPageFrame context={context} subtitle="Coach profile, tools and account links in one compact place." title="More">
      <CoachRRoleSummary context={context} />

      <section className="mb-5 surface-card p-4 sm:p-5">
        <p className="section-kicker">Coach Profile</p>
        <h2 className="section-title mt-1">{ownCoach ? profileDisplayName(ownCoach) : roleLabel(context.role)}</h2>
        <div className="mt-4 grid gap-3 text-sm font-semibold text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
          <p className="rounded bg-slate-50 p-3">
            Role <span className="block font-black text-court-navy">{roleLabel(context.role)}</span>
          </p>
          <p className="rounded bg-slate-50 p-3">
            Venue <span className="block font-black text-court-navy">{context.venueId ? "Linked" : "To be linked"}</span>
          </p>
          <p className="rounded bg-slate-50 p-3">
            Coach profile <span className="block font-black text-court-navy">{context.adultProfileId ? "Configured" : "Missing"}</span>
          </p>
          <p className="rounded bg-slate-50 p-3">
            Contact <span className="block font-black text-court-navy">{context.user.email ?? "Email unavailable"}</span>
          </p>
        </div>
      </section>

      <section className="mb-5">
        <p className="section-kicker mb-3">Coach Tools</p>
        <CoachRCompactGrid>
          <CoachRActionCard href="/dashboard/coachr/availability" icon={<StatusIcon size={18} />} text="Availability windows and future gaps." title="Availability" />
          <CoachRActionCard href="/dashboard/coachr/schedule" icon={<BookingIcon size={18} />} text="Weekly lessons, attendance and changes." title="Lesson History" />
          <CoachRActionCard href="/dashboard/coachr/students" icon={<EntriesIcon size={18} />} text="Students and attendance history." title="Attendance History" />
          <CoachRActionCard href="/dashboard/coachr" icon={<MatchIcon size={18} />} text="Programme mix from lesson types." title="Programmes" />
          <CoachRActionCard href="/dashboard/coachr/messages" icon={<NotificationIcon size={18} />} text="Lesson updates and future feedback messages." title="Notifications" />
          <CoachRActionCard href="/dashboard/coachr/more" icon={<PrivateIcon size={18} />} text="CoachR help and configuration status." title="Help" />
        </CoachRCompactGrid>
      </section>

      {canUseHeadCoachTools ? (
        <section className="mb-5">
          <p className="section-kicker mb-3">Head Coach Tools</p>
          <CoachRCompactGrid>
            <CoachRActionCard href="/dashboard/coachr/coaches" icon={<EntriesIcon size={18} />} text="Add, reactivate and deactivate venue coaches." title="Manage Coaches" />
            <CoachRActionCard href="/dashboard/coachr/students#pending-links" icon={<NotificationIcon size={18} />} text="Review pending player and parent approvals." title="Invitations" />
            <CoachRActionCard href="/dashboard/coachr" icon={<ClubIcon size={18} />} text="Venue-level lesson summary." title="Venue Overview" />
            <CoachRActionCard href="/dashboard/coachr/students" icon={<EntriesIcon size={18} />} text="Student placement by coach." title="Student Allocation" />
            {canManageCourts ? <CoachRActionCard href="/dashboard/coachr/courts" icon={<BookingIcon size={18} />} text="Owned courts and approved organisation access." title="Courts & Access" /> : null}
          </CoachRCompactGrid>
        </section>
      ) : null}

      <section className="surface-card p-4 sm:p-5">
        <p className="section-kicker">Account</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link className="btn-secondary" href="/dashboard">
            MyPlayR
          </Link>
          <Link className="btn-secondary" href="/dashboard/profile">
            Settings
          </Link>
          <Link className="btn-primary" href="/logout">
            Sign out
          </Link>
        </div>
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-600">
          <MembershipIcon size={16} /> ClubR administration is only linked where the current role is authorised.
        </p>
      </section>
    </CoachRPageFrame>
  );
}
