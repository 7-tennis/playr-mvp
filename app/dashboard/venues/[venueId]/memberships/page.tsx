import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRightIcon, CostIcon, MembershipIcon } from "@/components/playr-icons";
import { PageShell } from "@/components/page-shell";
import { VenueProfileSelector } from "@/components/venue-ui";
import { formatMembershipMoney } from "@/lib/club-memberships";
import { loadManagedVenueProfiles, loadPublicMembershipPlans, loadVenuePage, selectManagedVenueProfile } from "@/lib/venues";
import { createServerSupabaseClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

function frequencyLabel(value: string) {
  const labels: Record<string, string> = { annually: "Annual", every_3_months: "Every 3 months", every_6_months: "Every 6 months", monthly: "Monthly", once_off: "Once upfront" };
  return labels[value] ?? value.replaceAll("_", " ");
}

export default async function VenueMembershipsPage({ params, searchParams }: { params: { venueId: string }; searchParams?: { profile?: string } }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const profiles = await loadManagedVenueProfiles(supabase, user.id);
  const selectedProfile = selectManagedVenueProfile(profiles.data, searchParams?.profile);
  if (!selectedProfile) redirect("/dashboard/profile");
  const [venueResult, plansResult] = await Promise.all([
    loadVenuePage(supabase, params.venueId, selectedProfile.id),
    loadPublicMembershipPlans(supabase, params.venueId, selectedProfile.id)
  ]);
  if (venueResult.error || !venueResult.data) redirect(`/dashboard/venues?profile=${selectedProfile.id}`);
  const venue = venueResult.data;

  return (
    <PageShell eyebrow={venue.name} subtitle="Compare published prices, terms and benefits before applying." title="What memberships does this club offer?">
      <VenueProfileSelector profiles={profiles.data} selectedProfileId={selectedProfile.id} />
      <Link className="mb-4 inline-flex font-bold text-court-blue" href={`/dashboard/venues/${venue.id}?profile=${selectedProfile.id}`}>Back to Club</Link>
      {plansResult.error ? <div className="ui-empty-card">{plansResult.error.message}</div> : plansResult.data.length === 0 ? (
        <section className="empty-state"><MembershipIcon className="mx-auto text-court-teal" size={28} /><h2 className="section-title mt-3">No published plans yet</h2><p className="mt-2 text-sm text-slate-600">This club has not published membership plans yet.</p></section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {plansResult.data.map((plan) => {
            const firstOption = plan.pricingOptions[0];
            return (
              <article className="surface-card p-5" key={plan.planId}>
                <div className="flex items-start justify-between gap-3"><div><span className="ui-chip ui-chip-brand">{plan.categoryName}</span><h2 className="mt-2 text-xl font-black text-court-navy">{plan.planName}</h2></div><MembershipIcon className="text-court-teal" size={22} /></div>
                {plan.description ? <p className="mt-3 text-sm leading-6 text-slate-600">{plan.description}</p> : null}
                <div className="mt-4 rounded bg-court-mist p-3"><p className="flex items-center gap-2 text-sm font-bold text-slate-600"><CostIcon size={15} /> Starting price</p><p className="mt-1 text-xl font-black text-court-navy">{formatMembershipMoney(firstOption?.displayedPriceCents ?? plan.basePriceCents, plan.currency)}</p>{firstOption ? <p className="mt-1 text-xs font-bold text-slate-600">{frequencyLabel(firstOption.paymentFrequency)}</p> : null}</div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold"><span className="ui-chip ui-chip-muted">{plan.noFixedTerm ? "No fixed term" : `${plan.durationMonths ?? 1} months`}</span>{plan.joiningFeeCents > 0 ? <span className="ui-chip ui-chip-muted">{formatMembershipMoney(plan.joiningFeeCents, plan.currency)} joining fee</span> : null}{plan.pricingOptions.some((option) => option.discountType !== "none") ? <span className="ui-chip ui-chip-success">Discount options</span> : null}</div>
                <Link className="btn-primary mt-4 w-full justify-between" href={`/dashboard/venues/${venue.id}/memberships/${plan.planId}?profile=${selectedProfile.id}`}>View Membership <ArrowRightIcon size={16} /></Link>
              </article>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
