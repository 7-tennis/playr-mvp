import { BookingIcon, ClubIcon, MembershipIcon, NotificationIcon, PrivateIcon, StatusIcon } from "@/components/playr-icons";
import { canAccessClubRPermission } from "@/lib/permissions";
import { ClubRActionCard, ClubRPageFrame, getProtectedClubRPage } from "../clubr-shared";

export const dynamic = "force-dynamic";

export default async function ClubRMorePage() {
  const { content, context, venue } = await getProtectedClubRPage();
  if (content) return content;
  if (!context) return null;

  return (
    <ClubRPageFrame context={context} subtitle="Where are the club’s secondary tools?" title="More" venue={venue}>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ClubRActionCard href="/dashboard/clubr/notices" icon={<NotificationIcon size={18} />} text="Publish and review club updates." title="Notices" />
        <ClubRActionCard href="/dashboard/clubr/memberships" icon={<MembershipIcon size={18} />} text="Plans, applications and subscriptions." title="Memberships" />
        <ClubRActionCard href="/dashboard/clubr/settings" icon={<BookingIcon size={18} />} text="Club details and booking rules." title="Settings" />
        {canAccessClubRPermission(context.role, "clubr:diagnostics") ? <ClubRActionCard href="/dashboard/clubr/diagnostics" icon={<StatusIcon size={18} />} text="Restricted schedule and permission checks." title="Diagnostics" /> : null}
        <ClubRActionCard href="/dashboard/profile" icon={<PrivateIcon size={18} />} text="Your private PlayR account." title="My Profile" />
        <ClubRActionCard href="/dashboard" icon={<MembershipIcon size={18} />} text="Return to member and player cards." title="MyPlayR" />
        <ClubRActionCard href="/logout" icon={<PrivateIcon size={18} />} text="End this signed-in session." title="Sign Out" />
        {context.role === "platform_admin" ? <ClubRActionCard href="/admin/organisations" icon={<ClubIcon size={18} />} text="Organisation access and delegation." title="SupeR UseR" /> : null}
      </section>
    </ClubRPageFrame>
  );
}
