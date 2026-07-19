import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BookingIcon, CostIcon, MembershipIcon, RulesIcon } from "@/components/playr-icons";
import { PageShell } from "@/components/page-shell";
import { formatMembershipMoney } from "@/lib/club-memberships";
import { loadManagedVenueProfiles, loadPublicMembershipPlans, loadVenuePage, selectManagedVenueProfile } from "@/lib/venues";
import { createServerSupabaseClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

function readableFrequency(value: string) {
  return value.replace("every_3_months", "Every 3 months").replace("every_6_months", "Every 6 months").replace("once_off", "Once upfront").replace("monthly", "Monthly").replace("annually", "Annually");
}

export default async function VenueMembershipPlanPage({ params, searchParams }: { params: { venueId: string; planId: string }; searchParams?: { profile?: string } }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const profiles = await loadManagedVenueProfiles(supabase, user.id);
  const profile = selectManagedVenueProfile(profiles.data, searchParams?.profile);
  if (!profile) redirect("/dashboard/profile");
  const [venueResult, plansResult] = await Promise.all([loadVenuePage(supabase, params.venueId, profile.id), loadPublicMembershipPlans(supabase, params.venueId, profile.id)]);
  const venue = venueResult.data;
  const plan = plansResult.data.find((item) => item.planId === params.planId);
  if (!venue || !plan) notFound();
  const relationship = venue.relationship.relationshipType;
  const eligibility = plan.categoryEligibility === "any" || (plan.categoryEligibility === "junior" && profile.is_junior) || (plan.categoryEligibility === "adult" && !profile.is_junior);
  const joinHref = `/dashboard/memberships/join?venue=${venue.id}&plan=${plan.planId}&profile=${profile.id}`;
  const familyOptions = plan.addonRules.flatMap((rule) => typeof rule.addonPlanName === "string" ? [`${rule.addonPlanName} · up to ${Number(rule.maximumAddons ?? 1)}`] : []);
  const bookingDetails = [
    Number.isFinite(Number(plan.bookingEntitlement.advance_booking_days)) ? `${Number(plan.bookingEntitlement.advance_booking_days)} days advance booking` : null,
    Number.isFinite(Number(plan.bookingEntitlement.max_active_bookings)) ? `${Number(plan.bookingEntitlement.max_active_bookings)} active bookings` : null,
    Number.isFinite(Number(plan.bookingEntitlement.max_duration_minutes)) ? `${Number(plan.bookingEntitlement.max_duration_minutes)} minute maximum` : null
  ].filter((item): item is string => Boolean(item));

  return (
    <PageShell eyebrow={venue.name} subtitle="Price, commitment and club-configured benefits." title={plan.planName}>
      <Link className="mb-4 inline-flex font-bold text-court-blue" href={`/dashboard/venues/${venue.id}/memberships?profile=${profile.id}`}>Back to Memberships</Link>
      <section className="surface-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><span className="ui-chip ui-chip-brand">{plan.categoryName}</span><h2 className="mt-2 text-2xl font-black text-court-navy">{plan.planName}</h2></div><MembershipIcon className="text-court-teal" size={24} /></div>
        {plan.description ? <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{plan.description}</p> : null}
        <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded bg-court-mist p-3"><p className="flex items-center gap-1.5 text-xs font-black uppercase text-slate-500"><CostIcon size={14} /> Base price</p><p className="mt-1 font-black text-court-navy">{formatMembershipMoney(plan.basePriceCents, plan.currency)}</p></div><div className="rounded bg-slate-50 p-3"><p className="text-xs font-black uppercase text-slate-500">Commitment</p><p className="mt-1 font-black text-court-navy">{plan.noFixedTerm ? "No fixed term" : `${plan.durationMonths ?? 1} months`}</p></div><div className="rounded bg-slate-50 p-3"><p className="text-xs font-black uppercase text-slate-500">Joining fee</p><p className="mt-1 font-black text-court-navy">{plan.joiningFeeCents > 0 ? formatMembershipMoney(plan.joiningFeeCents, plan.currency) : "None"}</p></div></div>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <article className="surface-card p-5"><h2 className="flex items-center gap-2 text-lg font-black text-court-navy"><CostIcon className="text-court-teal" size={18} /> Payment Options</h2><div className="mt-3 grid gap-2">{plan.pricingOptions.map((option) => <div className="rounded border border-slate-200 p-3" key={option.id}><div className="flex items-start justify-between gap-3"><p className="font-black text-court-navy">{option.label}</p><p className="font-black text-court-navy">{formatMembershipMoney(option.displayedPriceCents ?? plan.basePriceCents, plan.currency)}</p></div><p className="mt-1 text-xs font-bold text-slate-600">{readableFrequency(option.paymentFrequency)}{option.noFixedTerm ? " · No fixed term" : option.commitmentMonths ? ` · ${option.commitmentMonths} months` : ""}</p>{option.discountType !== "none" ? <span className="ui-chip ui-chip-success mt-2">{option.discountType === "percentage" ? `${option.discountValue}% discount` : `${formatMembershipMoney(option.discountValue * 100, plan.currency)} discount`}</span> : null}</div>)}</div></article>
        <article className="surface-card p-5"><h2 className="flex items-center gap-2 text-lg font-black text-court-navy"><BookingIcon className="text-court-teal" size={18} /> Benefits</h2>{plan.publicBenefits.length > 0 ? <ul className="mt-3 grid gap-2">{plan.publicBenefits.map((benefit) => <li className="rounded bg-court-mist px-3 py-2 text-sm font-bold text-court-navy" key={benefit}>{benefit}</li>)}</ul> : plan.benefitsText ? <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">{plan.benefitsText}</p> : <p className="mt-3 text-sm text-slate-600">Benefits depend on the club setup.</p>}</article>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <article className="surface-card p-5"><h2 className="text-lg font-black text-court-navy">Court Access</h2>{bookingDetails.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{bookingDetails.map((detail) => <span className="ui-chip ui-chip-brand" key={detail}>{detail}</span>)}</div> : <p className="mt-3 text-sm text-slate-600">Court access follows the club&apos;s member booking rules.</p>}</article>
        <article className="surface-card p-5"><h2 className="text-lg font-black text-court-navy">Family & Renewal</h2>{familyOptions.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{familyOptions.map((option) => <span className="ui-chip ui-chip-success" key={option}>{option}</span>)}</div> : <p className="mt-3 text-sm text-slate-600">No household add-ons are published for this plan.</p>}<p className="mt-3 text-xs font-semibold leading-5 text-slate-500">{plan.noFixedTerm ? "No fixed term. Renewal details are confirmed by the club." : `${plan.durationMonths ?? 1}-month commitment. Renewal details are confirmed by the club.`}</p></article>
      </section>

      {plan.termsText ? <details className="ui-collapsible surface-card mt-4 p-4"><summary className="flex cursor-pointer items-center gap-2 font-black text-court-navy"><RulesIcon size={17} /> Terms Summary</summary><p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">{plan.termsText}</p></details> : null}

      <section className="sticky bottom-20 mt-5 rounded-lg border border-court-teal/30 bg-white p-4 shadow-court md:static md:shadow-sm">
        {relationship === "member" ? <Link className="btn-primary w-full" href={`/dashboard/venues/${venue.id}?profile=${profile.id}`}>View Membership</Link> : relationship === "pending" ? <p className="text-center font-black text-court-navy">Application Pending</p> : eligibility ? <Link className="btn-primary w-full" href={joinHref}>{relationship === "former_member" ? "Rejoin Club" : "Choose This Membership"}</Link> : <p className="text-center text-sm font-bold text-amber-900">This plan is not eligible for the selected profile.</p>}
      </section>
    </PageShell>
  );
}
