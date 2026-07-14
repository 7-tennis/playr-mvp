import Link from "next/link";
import { BookingIcon, ClubIcon, MembershipIcon, NotificationIcon, PrivateIcon, StatusIcon } from "@/components/playr-icons";
import { clubRScopeLabel } from "@/lib/clubr";
import { formatLabel } from "@/lib/courtside-format";
import { roleLabel } from "@/lib/permissions";
import { ClubRActionCard, ClubRPageFrame, getProtectedClubRPage } from "../clubr-shared";

export const dynamic = "force-dynamic";

export default async function ClubRMorePage() {
  const { content, context, venue } = await getProtectedClubRPage();

  if (content) {
    return content;
  }

  if (!context) {
    return null;
  }

  return (
    <ClubRPageFrame context={context} subtitle={`Setup and account tools for ${clubRScopeLabel(context, venue)}.`} title="More" venue={venue}>
      <section className="mb-5 surface-card p-4 sm:p-5">
        <p className="section-kicker">Club Profile</p>
        <h2 className="section-title mt-1">{venue?.name ?? "All venues"}</h2>
        <div className="mt-4 grid gap-3 text-sm font-semibold text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
          <p className="rounded bg-slate-50 p-3">
            Role <span className="block font-black text-court-navy">{roleLabel(context.role)}</span>
          </p>
          <p className="rounded bg-slate-50 p-3">
            Venue <span className="block font-black text-court-navy">{venue ? "Linked" : context.role === "platform_admin" ? "Global" : "Missing"}</span>
          </p>
          <p className="rounded bg-slate-50 p-3">
            Type <span className="block font-black text-court-navy">{venue?.organisation_type ? formatLabel(venue.organisation_type) : "To be confirmed"}</span>
          </p>
          <p className="rounded bg-slate-50 p-3">
            Contact <span className="block font-black text-court-navy">{context.user.email ?? "Email unavailable"}</span>
          </p>
        </div>
      </section>

      <section className="mb-5">
        <p className="section-kicker mb-3">ClubR Tools</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ClubRActionCard href="/dashboard/clubr" icon={<ClubIcon size={18} />} text="One View summary for your club." title="Club Profile" />
          <ClubRActionCard href="/dashboard/clubr/settings" icon={<BookingIcon size={18} />} text="Club details, courts, booking rules and shared access." title="Club Settings" />
          <ClubRActionCard href="/dashboard/clubr/members" icon={<MembershipIcon size={18} />} text="Member cards and visible membership state." title="Membership Setup" />
          <ClubRActionCard href="/dashboard/profile" icon={<PrivateIcon size={18} />} text="Your private account and member profile." title="Club Admin Profile" />
          <ClubRActionCard href="/dashboard/notifications" icon={<NotificationIcon size={18} />} text="Club, event and booking notifications." title="Notifications" />
          <ClubRActionCard href="/dashboard/clubr/more" icon={<StatusIcon size={18} />} text="Configuration guidance and future help." title="Help" />
          <ClubRActionCard href="/dashboard" icon={<ClubIcon size={18} />} text="Return to member and player cards." title="MyPlayR Profile" />
          <ClubRActionCard href="/logout" icon={<PrivateIcon size={18} />} text="End this session." title="Sign out" />
        </div>
      </section>

      {context.role === "platform_admin" ? (
        <section className="mb-5">
          <p className="section-kicker mb-3">SupeR UseR</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ClubRActionCard href="/admin/organisations" icon={<ClubIcon size={18} />} text="Assign Club Admins and Head Coaches." title="Organisation Access" />
            <ClubRActionCard href="/admin/organisations" icon={<MembershipIcon size={18} />} text="Change or remove Club Admin access." title="Change Club Admin" />
            <ClubRActionCard href="/admin/organisations" icon={<StatusIcon size={18} />} text="Review incomplete organisation setup." title="Setup Status" />
          </div>
        </section>
      ) : null}
    </ClubRPageFrame>
  );
}
