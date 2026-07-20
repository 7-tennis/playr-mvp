import Link from "next/link";
import { redirect } from "next/navigation";
import { ClubIcon, MembershipIcon } from "@/components/playr-icons";
import { PageShell } from "@/components/page-shell";
import { VenueCard, VenueProfileSelector } from "@/components/venue-ui";
import { discoverVenues, loadManagedVenueProfiles, loadMyVenues, selectManagedVenueProfile } from "@/lib/venues";
import { createServerSupabaseClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export default async function VenuesPage({ searchParams }: { searchParams?: { profile?: string; q?: string } }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profilesResult = await loadManagedVenueProfiles(supabase, user.id);
  const selectedProfile = selectManagedVenueProfile(profilesResult.data, searchParams?.profile);
  if (!selectedProfile) {
    return (
      <PageShell eyebrow="Places to play" subtitle="Find clubs, courts and places to play." title="Venues">
        <section className="empty-state">
          <ClubIcon className="mx-auto text-court-teal" size={28} />
          <h2 className="section-title mt-3">Create your player profile first</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Your club relationships and booking rules are linked to your PlayR card.</p>
          <Link className="btn-primary mt-5" href="/dashboard/settings">Create Profile</Link>
        </section>
      </PageShell>
    );
  }

  const [myClubs, discovery] = await Promise.all([
    loadMyVenues(supabase, selectedProfile.id),
    discoverVenues(supabase, selectedProfile.id, searchParams?.q)
  ]);
  const myClubIds = new Set(myClubs.data.map((venue) => venue.venueId));
  const discoverable = discovery.data.filter((venue) => !myClubIds.has(venue.venueId));

  return (
    <PageShell eyebrow="Places to play" subtitle="Find clubs, courts and places to play." title="Venues">
      <VenueProfileSelector profiles={profilesResult.data} search={searchParams?.q} selectedProfileId={selectedProfile.id} />
      {profilesResult.error ? <div className="mb-5 rounded border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">Player choices could not be loaded right now.</div> : null}

      <section className="mb-8">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div><p className="section-kicker">Connected</p><h2 className="section-title mt-1">My Clubs</h2></div>
          <span className="ui-chip ui-chip-brand">{myClubs.data.length}</span>
        </div>
        {myClubs.error ? (
          <div className="ui-empty-card">Your linked clubs could not be loaded right now.</div>
        ) : myClubs.data.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">{myClubs.data.map((venue) => <VenueCard key={venue.venueId} profileId={selectedProfile.id} venue={venue} />)}</div>
        ) : (
          <div className="empty-state">
            <MembershipIcon className="mx-auto text-court-teal" size={26} />
            <h3 className="mt-3 text-lg font-black text-court-navy">You are not linked to a club yet</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Discover clubs to book courts or view memberships.</p>
          </div>
        )}
      </section>

      <section>
        <div className="mb-4"><p className="section-kicker">Explore</p><h2 className="section-title mt-1">Discover Clubs</h2></div>
        <form className="surface-card mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <input name="profile" type="hidden" value={selectedProfile.id} />
          <label className="text-sm font-black text-court-navy">Search clubs<input className="mt-1.5 w-full rounded border border-slate-300 px-3 py-3 focus-ring" defaultValue={searchParams?.q ?? ""} name="q" placeholder="Club, suburb, town or city" /></label>
          <button className="btn-primary" type="submit">Search</button>
        </form>
        {discovery.error ? (
          <div className="ui-empty-card">Venue discovery could not be loaded right now. Refresh the page to try again.</div>
        ) : discoverable.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">{discoverable.map((venue) => <VenueCard key={venue.venueId} profileId={selectedProfile.id} venue={venue} />)}</div>
        ) : (
          <div className="empty-state"><h3 className="text-lg font-black text-court-navy">No clubs matched your search</h3><p className="mt-2 text-sm text-slate-600">Try a club name, suburb, town or city.</p></div>
        )}
      </section>
    </PageShell>
  );
}
