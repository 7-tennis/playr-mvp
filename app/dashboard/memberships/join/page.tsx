import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MembershipJoinWizard } from "@/components/membership-join-wizard";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import type { MembershipPlanView } from "@/lib/club-memberships";
import { loadPublicMembershipPlans, loadVenuePage, type PublicMembershipPlan } from "@/lib/venues";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { ClubMembershipAddonRule, Profile, Venue } from "@/types/courtside";

export const dynamic = "force-dynamic";

type JoinProfile = Pick<Profile, "id" | "first_name" | "last_name" | "is_junior" | "date_of_birth">;

function publicPlanView(plan: PublicMembershipPlan, venueId: string): MembershipPlanView {
  const rules = plan.addonRules.flatMap((value, index) => {
    const addonPlanId = typeof value.addonPlanId === "string" ? value.addonPlanId : null;
    const addonPlanName = typeof value.addonPlanName === "string" ? value.addonPlanName : null;
    if (!addonPlanId || !addonPlanName) return [];
    const memberClass = ["adult", "junior"].includes(String(value.memberClass)) ? String(value.memberClass) as "adult" | "junior" : "any";
    const adjustmentType = ["percentage", "fixed"].includes(String(value.adjustmentType)) ? String(value.adjustmentType) as "percentage" | "fixed" : "none";
    const rule: ClubMembershipAddonRule & { addonPlan: MembershipPlanView["addonRules"][number]["addonPlan"] } = {
      addon_plan_id: addonPlanId,
      addonPlan: {
        base_price_cents: Number(value.addonPlanBasePriceCents ?? 0),
        category_id: String(value.addonPlanCategoryId ?? ""),
        id: addonPlanId,
        name: addonPlanName
      },
      adjustment_type: adjustmentType,
      adjustment_value: Number(value.adjustmentValue ?? 0),
      created_at: "",
      created_by_user_id: null,
      display_order: index,
      id: String(value.ruleId ?? `${plan.planId}:${addonPlanId}`),
      is_active: true,
      joining_fee_policy: "plan_default",
      maximum_addons: Number(value.maximumAddons ?? 1),
      member_class: memberClass,
      primary_plan_id: plan.planId,
      updated_at: "",
      use_addon_plan_price: true,
      venue_id: venueId
    };
    return [rule];
  });

  return {
    activation_policy: "after_manual_payment",
    addonRules: rules,
    adult_primary_required: plan.adultPrimaryRequired,
    approval_required: true,
    archived_at: null,
    base_price_cents: plan.basePriceCents,
    benefits_text: plan.benefitsText,
    booking_entitlement: plan.bookingEntitlement,
    category: {
      archived_at: null,
      created_at: "",
      created_by_user_id: null,
      description: null,
      display_order: 0,
      eligibility_class: plan.categoryEligibility as "any" | "adult" | "junior",
      id: plan.categoryId,
      maximum_age: plan.maximumAge,
      minimum_age: plan.minimumAge,
      name: plan.categoryName,
      status: "active",
      updated_at: "",
      updated_by_user_id: null,
      venue_id: venueId
    },
    category_id: plan.categoryId,
    created_at: "",
    created_by_user_id: null,
    currency: plan.currency,
    description: plan.description,
    duration_months: plan.durationMonths,
    id: plan.planId,
    is_legacy: false,
    is_public: true,
    joining_fee_cents: plan.joiningFeeCents,
    joining_fee_scope: plan.joiningFeeScope as "none" | "subscription" | "covered_member",
    maximum_covered_members: plan.maximumCoveredMembers,
    most_expensive_primary: false,
    name: plan.planName,
    no_fixed_term: plan.noFixedTerm,
    parent_may_purchase_for_juniors: true,
    payer_may_differ: true,
    previous_version_id: null,
    pricingOptions: plan.pricingOptions.map((option, index) => ({
      commitment_months: option.commitmentMonths,
      created_at: "",
      created_by_user_id: null,
      discount_type: option.discountType as "none" | "percentage" | "fixed",
      discount_value: option.discountValue,
      displayed_price_cents: option.displayedPriceCents,
      display_order: index,
      id: option.id,
      is_active: true,
      label: option.label,
      no_fixed_term: option.noFixedTerm,
      payment_frequency: option.paymentFrequency as "once_off" | "monthly" | "every_3_months" | "every_6_months" | "annually",
      plan_id: plan.planId,
      updated_at: "",
      venue_id: venueId
    })),
    primary_member_required: true,
    public_benefits: plan.publicBenefits,
    published_at: null,
    start_rule: "immediate",
    status: "active",
    terms_text: plan.termsText,
    updated_at: "",
    updated_by_user_id: null,
    venue_id: venueId,
    version: plan.planVersion
  };
}

export default async function JoinMembershipPage({ searchParams }: { searchParams?: { error?: string; venue?: string; plan?: string; profile?: string } }) {
  if (!hasSupabaseConfig()) return null;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const venueId = searchParams?.venue;
  if (!venueId) notFound();

  const { data: adultData } = await supabase.from("profiles").select("id,first_name,last_name,is_junior,date_of_birth").eq("user_id", user.id).eq("is_junior", false).maybeSingle();
  const adult = adultData as JoinProfile | null;
  if (!adult) redirect("/dashboard/profile");
  const { data: juniorData } = await supabase.from("profiles").select("id,first_name,last_name,is_junior,date_of_birth").eq("parent_profile_id", adult.id).eq("is_junior", true);
  const profiles = [adult, ...((juniorData ?? []) as JoinProfile[])];
  const selectedProfile = profiles.find((profile) => profile.id === searchParams?.profile) ?? adult;
  const [venueResult, publicPlans] = await Promise.all([
    loadVenuePage(supabase, venueId, selectedProfile.id),
    loadPublicMembershipPlans(supabase, venueId, selectedProfile.id)
  ]);
  const venueData = venueResult.data;
  if (!venueData) notFound();
  const venue: Pick<Venue, "id" | "name"> = { id: venueData.id, name: venueData.name };
  const plans = publicPlans.data.map((plan) => publicPlanView(plan, venueId));

  return (
    <PageShell eyebrow="MyPlayR" subtitle="Choose who is joining and see the verified price before applying." title={`Join ${venue.name}`}>
      <StatusAlert className="mb-4" message={searchParams?.error === "duplicate" ? "A current membership or application already exists for one of the selected members." : searchParams?.error ? "The application could not be submitted. No membership was created." : null} tone="error" />
      <Link className="mb-4 inline-block font-bold text-court-blue" href={`/dashboard/venues/${venue.id}/memberships?profile=${selectedProfile.id}`}>Back to Memberships</Link>
      {publicPlans.error ? <div className="ui-empty-card">Membership plans could not be loaded. Try again before submitting an application.</div> : plans.length > 0 ? <MembershipJoinWizard initialPlanId={searchParams?.plan} initialProfileId={selectedProfile.id} plans={plans} profiles={profiles} venue={venue} /> : <div className="ui-empty-card">No published membership plans are available right now.</div>}
    </PageShell>
  );
}
