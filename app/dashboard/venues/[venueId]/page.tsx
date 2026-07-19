import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRightIcon, BookingIcon, ClubIcon, EventIcon, InfoIcon, LeaderboardIcon, LocationIcon, MembershipIcon } from "@/components/playr-icons";
import { PageShell } from "@/components/page-shell";
import { VenueProfileSelector } from "@/components/venue-ui";
import {
  bookingEligibilityMessage,
  loadManagedVenueProfiles,
  loadPublicVenueNotices,
  loadVenueBookingEligibility,
  loadVenuePage,
  selectManagedVenueProfile,
  venueRelationshipChip,
  venueRelationshipLabel
} from "@/lib/venues";
import { createServerSupabaseClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

function venueHref(venueId: string, segment: string, profileId: string) {
  return `/dashboard/venues/${venueId}/${segment}?profile=${profileId}`;
}

export default async function VenuePage({ params, searchParams }: { params: { venueId: string }; searchParams?: { profile?: string } }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const profilesResult = await loadManagedVenueProfiles(supabase, user.id);
  const selectedProfile = selectManagedVenueProfile(profilesResult.data, searchParams?.profile);
  if (!selectedProfile) redirect("/dashboard/profile");

  const [venueResult, eligibilityResult, noticesResult] = await Promise.all([
    loadVenuePage(supabase, params.venueId, selectedProfile.id),
    loadVenueBookingEligibility(supabase, params.venueId, selectedProfile.id),
    loadPublicVenueNotices(supabase, params.venueId, selectedProfile.id)
  ]);
  if (venueResult.error?.kind === "not_found") notFound();
  if (venueResult.error || !venueResult.data) {
    return (
      <PageShell eyebrow="Venues" title="Club unavailable">
        <section className="empty-state"><h2 className="section-title">This club cannot be opened</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">{venueResult.error?.message ?? "The club could not be loaded."}</p><Link className="btn-secondary mt-5" href={`/dashboard/venues?profile=${selectedProfile.id}`}>Back to Venues</Link></section>
      </PageShell>
    );
  }

  const venue = venueResult.data;
  const relationship = venue.relationship;
  const eligibility = eligibilityResult.data;
  const canSeeLeaderboard = Object.values(venue.leaderboardVisibility).some((visibility) => visibility === "public" || (visibility === "members_only" && relationship.relationshipType === "member"));
  const bookingHref = venueHref(venue.id, "book", selectedProfile.id);
  const membershipHref = venueHref(venue.id, "memberships", selectedProfile.id);
  const primaryMembershipHref = relationship.relationshipType === "member" && relationship.subscriptionId
    ? `/dashboard/memberships/${relationship.subscriptionId}`
    : relationship.relationshipType === "pending" && relationship.applicationId
      ? `/dashboard/memberships/applications/${relationship.applicationId}`
      : membershipHref;

  return (
    <PageShell eyebrow="Club" subtitle="Choose what you want to do at this venue." title={venue.name}>
      <VenueProfileSelector profiles={profilesResult.data} selectedProfileId={selectedProfile.id} />
      <section className="surface-card mb-5 overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-court-navy via-court-teal to-emerald-500" />
        <div className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded bg-court-mist text-court-navy"><ClubIcon size={22} /></div>
              <div><h1 className="text-2xl font-black text-court-navy">{venue.name}</h1>{venue.address || venue.suburb || venue.town || venue.city ? <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600"><LocationIcon size={14} /> {[venue.address, venue.suburb, venue.town, venue.city].filter(Boolean).join(", ")}</p> : null}</div>
            </div>
            <span className={`ui-chip ${venueRelationshipChip(relationship.relationshipType)}`}>{venueRelationshipLabel(relationship.relationshipType)}</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:max-w-sm"><div className="ui-counter"><BookingIcon size={15} /> {venue.courtCount} court{venue.courtCount === 1 ? "" : "s"}</div><div className="ui-counter"><MembershipIcon size={15} /> {venue.membershipsAvailable ? "Plans available" : "No public plans"}</div></div>
          {venue.description ? <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">{venue.description}</p> : null}
        </div>
      </section>

      {eligibilityResult.error ? <div className="mb-4 rounded border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">Booking eligibility could not be confirmed. No booking action is available.</div> : eligibility && !eligibility.allowed ? <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">{bookingEligibilityMessage(eligibility.reason)}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {eligibility?.allowed ? <Link className="action-card flex min-h-28 flex-col justify-between gap-3" href={bookingHref}><span className="flex items-center gap-2 font-black text-court-navy"><BookingIcon className="text-court-teal" size={19} /> {eligibility.bookingType === "member_booking" ? "Book as Member" : "Book as Guest"}</span><span className="flex items-center justify-between text-sm font-bold text-slate-600">View court times <ArrowRightIcon size={15} /></span></Link> : null}
        <Link className="action-card flex min-h-28 flex-col justify-between gap-3" href={primaryMembershipHref}><span className="flex items-center gap-2 font-black text-court-navy"><MembershipIcon className="text-court-teal" size={19} /> {relationship.relationshipType === "member" ? "View Membership" : relationship.relationshipType === "pending" ? "Application Pending" : relationship.relationshipType === "former_member" ? "Rejoin Club" : "Membership"}</span><span className="flex items-center justify-between text-sm font-bold text-slate-600">{relationship.relationshipType === "pending" ? "Track your application" : "Plans and benefits"} <ArrowRightIcon size={15} /></span></Link>
        {canSeeLeaderboard ? <Link className="action-card flex min-h-28 flex-col justify-between gap-3" href={venueHref(venue.id, "leaderboard", selectedProfile.id)}><span className="flex items-center gap-2 font-black text-court-navy"><LeaderboardIcon className="text-court-teal" size={19} /> Leaderboard</span><span className="flex items-center justify-between text-sm font-bold text-slate-600">Club standings <ArrowRightIcon size={15} /></span></Link> : null}
        <Link className="action-card flex min-h-28 flex-col justify-between gap-3" href={venueHref(venue.id, "information", selectedProfile.id)}><span className="flex items-center gap-2 font-black text-court-navy"><InfoIcon className="text-court-teal" size={19} /> Club Information</span><span className="flex items-center justify-between text-sm font-bold text-slate-600">Before you visit <ArrowRightIcon size={15} /></span></Link>
        <Link className="action-card flex min-h-28 flex-col justify-between gap-3" href={venueHref(venue.id, "events", selectedProfile.id)}><span className="flex items-center gap-2 font-black text-court-navy"><EventIcon className="text-court-teal" size={19} /> Events</span><span className="flex items-center justify-between text-sm font-bold text-slate-600">Public club activity <ArrowRightIcon size={15} /></span></Link>
      </section>

      {noticesResult.data.length > 0 ? <section className="mt-6"><div className="mb-3"><p className="section-kicker">Club updates</p><h2 className="section-title mt-1">Public Notices</h2></div><div className="grid gap-3">{noticesResult.data.slice(0, 3).map((notice) => <article className="soft-card p-4" key={notice.noticeId}><span className="ui-chip ui-chip-muted">{notice.category}</span><h3 className="mt-2 font-black text-court-navy">{notice.title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{notice.message}</p></article>)}</div></section> : null}
    </PageShell>
  );
}
