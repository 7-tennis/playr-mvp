import Link from "next/link";
import { redirect } from "next/navigation";
import { LeaderboardIcon } from "@/components/playr-icons";
import { PageShell } from "@/components/page-shell";
import { loadManagedVenueProfiles, loadVenuePage, selectManagedVenueProfile } from "@/lib/venues";
import { createServerSupabaseClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export default async function VenueLeaderboardPage({ params, searchParams }: { params: { venueId: string }; searchParams?: { profile?: string } }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const profiles = await loadManagedVenueProfiles(supabase, user.id);
  const profile = selectManagedVenueProfile(profiles.data, searchParams?.profile);
  if (!profile) redirect("/dashboard/profile");
  const venue = (await loadVenuePage(supabase, params.venueId, profile.id)).data;
  if (!venue) redirect(`/dashboard/venues?profile=${profile.id}`);
  const member = venue.relationship.relationshipType === "member";
  const visibleBoards = Object.entries(venue.leaderboardVisibility).filter(([, visibility]) => visibility === "public" || (visibility === "members_only" && member));

  return (
    <PageShell eyebrow={venue.name} subtitle="Only club-approved leaderboard categories are shown." title="Club Leaderboard">
      <Link className="mb-4 inline-flex font-bold text-court-blue" href={`/dashboard/venues/${venue.id}?profile=${profile.id}`}>Back to Club</Link>
      {visibleBoards.length === 0 ? <section className="empty-state"><LeaderboardIcon className="mx-auto text-court-teal" size={28} /><h2 className="section-title mt-3">Leaderboard not available</h2><p className="mt-2 text-sm text-slate-600">This club has not made a leaderboard visible to the selected profile.</p></section> : <div className="grid gap-4 sm:grid-cols-3">{visibleBoards.map(([name]) => <article className="surface-card p-5" key={name}><span className="ui-chip ui-chip-brand">{name}</span><h2 className="mt-3 font-black capitalize text-court-navy">{name} Leaderboard</h2><p className="mt-2 text-sm leading-6 text-slate-600">No leaderboard results are available yet.</p></article>)}</div>}
    </PageShell>
  );
}
