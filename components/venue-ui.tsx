import Link from "next/link";
import { ArrowRightIcon, BookingIcon, ClubIcon, LocationIcon, MembershipIcon } from "@/components/playr-icons";
import type { ManagedVenueProfile, VenueCardData } from "@/lib/venues";
import { profileDisplayName, venueRelationshipChip, venueRelationshipLabel } from "@/lib/venues";

export function VenueProfileSelector({
  profiles,
  selectedProfileId,
  search = ""
}: {
  profiles: ManagedVenueProfile[];
  selectedProfileId: string;
  search?: string;
}) {
  if (profiles.length < 2) return null;
  return (
    <form className="surface-card mb-5 grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
      {search ? <input name="q" type="hidden" value={search} /> : null}
      <label className="text-sm font-black text-court-navy">
        Playing as
        <select className="mt-1.5 w-full rounded border border-slate-300 bg-white px-3 py-3 focus-ring" defaultValue={selectedProfileId} name="profile">
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profileDisplayName(profile)}{profile.is_junior ? " · Junior" : ""}
            </option>
          ))}
        </select>
      </label>
      <button className="btn-secondary" type="submit">Switch Profile</button>
    </form>
  );
}

function relationshipAction(venue: VenueCardData, profileId: string) {
  if (venue.relationship.relationshipType === "pending" && venue.relationship.applicationId) {
    return `/dashboard/memberships/applications/${venue.relationship.applicationId}`;
  }
  return `/dashboard/venues/${venue.venueId}?profile=${profileId}`;
}

export function VenueCard({ venue, profileId }: { venue: VenueCardData; profileId: string }) {
  const actionLabel = venue.relationship.relationshipType === "pending" ? "View Application" : "Open Club";
  return (
    <article className="surface-card overflow-hidden">
      <div className="h-1.5 bg-gradient-to-r from-court-navy via-court-teal to-emerald-500" />
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded bg-court-mist text-court-navy">
            <ClubIcon size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-lg font-black text-court-navy">{venue.venueName}</h3>
              <span className={`ui-chip ${venueRelationshipChip(venue.relationship.relationshipType)}`}>
                {venueRelationshipLabel(venue.relationship.relationshipType)}
              </span>
            </div>
            {venue.locationSummary ? <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600"><LocationIcon size={14} /> {venue.locationSummary}</p> : null}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold text-slate-700">
          <span className="ui-counter"><BookingIcon size={14} /> {venue.courtCount} court{venue.courtCount === 1 ? "" : "s"}</span>
          <span className="ui-counter"><MembershipIcon size={14} /> {venue.publishedMembershipsAvailable ? "Memberships" : "No public plans"}</span>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {venue.relationship.relationshipType === "member"
            ? venue.relationship.membershipStatus === "active" ? "Active club membership" : "Member booking access"
            : venue.relationship.relationshipType === "pending"
              ? "Your membership application is with the club."
              : venue.relationship.relationshipType === "former_member"
                ? venue.guestBookingAvailable ? "Guest booking is available while you explore rejoining." : "View current membership options to rejoin."
                : venue.guestBookingAvailable ? "Guest bookings available" : "Membership information available"}
        </p>
        <Link className="btn-primary mt-4 w-full justify-between" href={relationshipAction(venue, profileId)}>
          {actionLabel}<ArrowRightIcon size={16} />
        </Link>
      </div>
    </article>
  );
}
