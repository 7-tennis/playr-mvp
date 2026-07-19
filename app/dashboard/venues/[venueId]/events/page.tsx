import Link from "next/link";
import { redirect } from "next/navigation";
import { EventIcon } from "@/components/playr-icons";
import { PageShell } from "@/components/page-shell";
import { loadManagedVenueProfiles, loadVenuePage, selectManagedVenueProfile } from "@/lib/venues";
import { createServerSupabaseClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export default async function VenueEventsPage({ params, searchParams }: { params: { venueId: string }; searchParams?: { profile?: string } }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const profiles = await loadManagedVenueProfiles(supabase, user.id);
  const profile = selectManagedVenueProfile(profiles.data, searchParams?.profile);
  if (!profile) redirect("/dashboard/profile");
  const venue = (await loadVenuePage(supabase, params.venueId, profile.id)).data;
  if (!venue) redirect(`/dashboard/venues?profile=${profile.id}`);
  return (
    <PageShell eyebrow={venue.name} subtitle="Public club activity will appear here when it is safely linked to this venue." title="What is happening at this club?">
      <Link className="mb-4 inline-flex font-bold text-court-blue" href={`/dashboard/venues/${venue.id}?profile=${profile.id}`}>Back to Club</Link>
      <section className="empty-state"><EventIcon className="mx-auto text-court-teal" size={28} /><h2 className="section-title mt-3">No public events are currently scheduled</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">Browse all available PlayR events while this club prepares its next activity.</p><Link className="btn-secondary mt-5" href="/dashboard/events">Browse PlayR Events</Link></section>
    </PageShell>
  );
}
