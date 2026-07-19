import Link from "next/link";
import { redirect } from "next/navigation";
import { ClubIcon, InfoIcon, LocationIcon, TimeIcon } from "@/components/playr-icons";
import { PageShell } from "@/components/page-shell";
import { loadManagedVenueProfiles, loadVenuePage, selectManagedVenueProfile } from "@/lib/venues";
import { createServerSupabaseClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export default async function VenueInformationPage({ params, searchParams }: { params: { venueId: string }; searchParams?: { profile?: string } }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const profiles = await loadManagedVenueProfiles(supabase, user.id);
  const profile = selectManagedVenueProfile(profiles.data, searchParams?.profile);
  if (!profile) redirect("/dashboard/profile");
  const result = await loadVenuePage(supabase, params.venueId, profile.id);
  if (!result.data) redirect(`/dashboard/venues?profile=${profile.id}`);
  const venue = result.data;
  const location = [venue.address, venue.suburb, venue.town, venue.city].filter(Boolean).join(", ");

  return (
    <PageShell eyebrow={venue.name} subtitle="The essentials for your next visit." title="What should I know before visiting this club?">
      <Link className="mb-4 inline-flex font-bold text-court-blue" href={`/dashboard/venues/${venue.id}?profile=${profile.id}`}>Back to Club</Link>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface-card p-5"><h2 className="flex items-center gap-2 text-lg font-black text-court-navy"><LocationIcon className="text-court-teal" size={18} /> Location</h2><p className="mt-3 text-sm leading-6 text-slate-600">{location || "Location details have not been published yet."}</p>{venue.parkingInformation ? <p className="mt-3 rounded bg-slate-50 p-3 text-sm text-slate-700"><strong>Parking:</strong> {venue.parkingInformation}</p> : null}</section>
        <section className="surface-card p-5"><h2 className="flex items-center gap-2 text-lg font-black text-court-navy"><TimeIcon className="text-court-teal" size={18} /> Opening Hours</h2><p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">{venue.openingHours || "Opening hours have not been published yet."}</p></section>
        <section className="surface-card p-5"><h2 className="flex items-center gap-2 text-lg font-black text-court-navy"><ClubIcon className="text-court-teal" size={18} /> Courts & Facilities</h2><div className="mt-3 flex flex-wrap gap-2"><span className="ui-chip ui-chip-brand">{venue.courtCount} courts</span>{venue.surfaceTypes.map((surface) => <span className="ui-chip ui-chip-muted" key={surface}>{surface}</span>)}{venue.facilities.map((facility) => <span className="ui-chip ui-chip-success" key={facility}>{facility}</span>)}</div></section>
        <section className="surface-card p-5"><h2 className="flex items-center gap-2 text-lg font-black text-court-navy"><InfoIcon className="text-court-teal" size={18} /> Visitor Information</h2><p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">{venue.visitorInformation || venue.bookingNotes || "Visitor information has not been published yet."}</p></section>
      </div>
      <section className="surface-card mt-4 p-5"><h2 className="text-lg font-black text-court-navy">Contact</h2><div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2"><p><strong>Phone:</strong> {venue.phone ?? "Not published"}</p><p><strong>Email:</strong> {venue.email ?? "Not published"}</p><p><strong>Membership:</strong> {venue.membershipContact ?? "Contact the club"}</p><p><strong>Website:</strong> {venue.websiteUrl ?? "Not published"}</p></div></section>
    </PageShell>
  );
}
