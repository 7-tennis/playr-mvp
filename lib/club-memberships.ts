import type { createServerSupabaseClient } from "@/utils/supabase/server";
import type {
  ClubMembershipAddonRule,
  ClubMembershipApplication,
  ClubMembershipBillingSchedule,
  ClubMembershipCategory,
  ClubMembershipInvoice,
  ClubMembershipManualPayment,
  ClubMembershipPlan,
  ClubMembershipPriceSnapshot,
  ClubMembershipPricingOption,
  ClubMembershipSubscription,
  ClubMembershipSubscriptionMember,
  Profile,
  Venue
} from "@/types/courtside";

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export type MembershipDataError = {
  code: string | null;
  message: string;
};

export type MembershipDataResult<T> = {
  data: T;
  error: MembershipDataError | null;
};

export type MembershipPlanView = ClubMembershipPlan & {
  category: ClubMembershipCategory | null;
  pricingOptions: ClubMembershipPricingOption[];
  addonRules: Array<ClubMembershipAddonRule & { addonPlan: Pick<ClubMembershipPlan, "id" | "name" | "base_price_cents" | "category_id"> | null }>;
};

export type MembershipApplicationView = ClubMembershipApplication & {
  applicant: Pick<Profile, "id" | "first_name" | "last_name" | "is_junior"> | null;
  payer: Pick<Profile, "id" | "first_name" | "last_name"> | null;
  plan: Pick<ClubMembershipPlan, "id" | "name" | "version" | "activation_policy"> | null;
  pricingOption: Pick<ClubMembershipPricingOption, "id" | "label" | "payment_frequency"> | null;
  venue: Pick<Venue, "id" | "name"> | null;
};

export type CoveredMembershipMember = ClubMembershipSubscriptionMember & {
  profile: Pick<Profile, "id" | "first_name" | "last_name" | "is_junior"> | null;
  plan: Pick<ClubMembershipPlan, "id" | "name" | "version"> | null;
};

export type MembershipSubscriptionView = ClubMembershipSubscription & {
  applicant: Pick<Profile, "id" | "first_name" | "last_name" | "is_junior"> | null;
  payer: Pick<Profile, "id" | "first_name" | "last_name"> | null;
  plan: Pick<ClubMembershipPlan, "id" | "name" | "version" | "activation_policy" | "benefits_text"> | null;
  pricingOption: Pick<ClubMembershipPricingOption, "id" | "label" | "payment_frequency"> | null;
  venue: Pick<Venue, "id" | "name"> | null;
  coveredMembers: CoveredMembershipMember[];
  billingSchedule: ClubMembershipBillingSchedule[];
  invoices: ClubMembershipInvoice[];
  manualPayments: ClubMembershipManualPayment[];
};

type ApplicationRow = ClubMembershipApplication & {
  applicant: MembershipApplicationView["applicant"];
  payer: MembershipApplicationView["payer"];
  plan: MembershipApplicationView["plan"];
  pricing_option: MembershipApplicationView["pricingOption"];
  venue: MembershipApplicationView["venue"];
};

type SubscriptionRow = ClubMembershipSubscription & {
  applicant: MembershipSubscriptionView["applicant"];
  payer: MembershipSubscriptionView["payer"];
  plan: MembershipSubscriptionView["plan"];
  pricing_option: MembershipSubscriptionView["pricingOption"];
  venue: MembershipSubscriptionView["venue"];
};

type CoveredMemberRow = ClubMembershipSubscriptionMember & {
  profile: CoveredMembershipMember["profile"];
  plan: CoveredMembershipMember["plan"];
};

function success<T>(data: T): MembershipDataResult<T> {
  return { data, error: null };
}

function failure<T>(fallback: T, event: string, error: { code?: string; message?: string } | null): MembershipDataResult<T> {
  console.error(`[clubr-memberships] ${event}`, { code: error?.code ?? null });
  return {
    data: fallback,
    error: {
      code: error?.code ?? null,
      message: "Membership information could not be loaded right now."
    }
  };
}

export function formatMembershipMoney(cents: number, currency = "ZAR") {
  return new Intl.NumberFormat("en-ZA", {
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    style: "currency"
  }).format(cents / 100);
}

export function membershipStatusLabel(status: string) {
  const labels: Record<string, string> = {
    active: "Active",
    approved: "Approved",
    archived: "Archived",
    cancelled: "Cancelled",
    correction_requested: "Correction Requested",
    declined: "Declined",
    draft: "Draft",
    expired: "Expired",
    expiring: "Expiring",
    manually_paid: "Manually Paid",
    paused: "Paused",
    pending: "Pending",
    pending_activation: "Pending Activation",
    pending_application: "Pending Application",
    pending_approval: "Needs Review",
    scheduled: "Scheduled"
  };
  return labels[status] ?? status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function membershipStatusChip(status: string) {
  if (["active", "approved", "manually_paid"].includes(status)) return "ui-chip-success";
  if (["declined", "cancelled", "expired"].includes(status)) return "ui-chip-danger";
  if (["pending_activation", "pending_approval", "correction_requested", "expiring"].includes(status)) return "ui-chip-warning";
  return "ui-chip-muted";
}

export function membershipTermLabel(option: Pick<ClubMembershipPricingOption, "commitment_months" | "no_fixed_term" | "payment_frequency">) {
  const frequency: Record<string, string> = {
    annually: "paid annually",
    every_3_months: "paid every 3 months",
    every_6_months: "paid every 6 months",
    monthly: "paid monthly",
    once_off: "paid once upfront"
  };
  const commitment = option.no_fixed_term
    ? "No fixed term"
    : `${option.commitment_months ?? 1}-month commitment`;
  return `${commitment} · ${frequency[option.payment_frequency] ?? option.payment_frequency}`;
}

export function priceSnapshotLines(snapshot: ClubMembershipPriceSnapshot) {
  return [
    ...snapshot.members.map((member) => ({
      amountCents: member.base_amount_cents + member.adjustment_cents,
      label: `${member.profile_name} · ${member.plan_name}`,
      note: member.adjustment_cents < 0 ? `Includes ${formatMembershipMoney(Math.abs(member.adjustment_cents), snapshot.currency)} household discount` : null
    })),
    ...(snapshot.term_discount_cents > 0 ? [{ amountCents: -snapshot.term_discount_cents, label: "Term or upfront discount", note: null }] : []),
    ...(snapshot.joining_fee_cents > 0 ? [{ amountCents: snapshot.joining_fee_cents, label: "Joining fee", note: null }] : [])
  ];
}

export async function loadMembershipCategories(supabase: ServerSupabase, venueId: string): Promise<MembershipDataResult<ClubMembershipCategory[]>> {
  const { data, error } = await supabase.from("club_membership_categories").select("*").eq("venue_id", venueId).order("display_order").order("name");
  return error ? failure([], "categories_load_failed", error) : success((data ?? []) as ClubMembershipCategory[]);
}

export async function loadMembershipPlans(supabase: ServerSupabase, venueId: string, includeInactive = false): Promise<MembershipDataResult<MembershipPlanView[]>> {
  let planQuery = supabase.from("club_membership_plans").select("*").eq("venue_id", venueId).order("name").order("version", { ascending: false });
  if (!includeInactive) planQuery = planQuery.eq("status", "active").eq("is_legacy", false);

  const [plansResult, categoriesResult, optionsResult, rulesResult] = await Promise.all([
    planQuery,
    supabase.from("club_membership_categories").select("*").eq("venue_id", venueId).order("display_order"),
    supabase.from("club_membership_pricing_options").select("*").eq("venue_id", venueId).order("display_order"),
    supabase.from("club_membership_addon_rules").select("*,addon_plan:addon_plan_id(id,name,base_price_cents,category_id)").eq("venue_id", venueId).order("display_order")
  ]);

  const error = plansResult.error ?? categoriesResult.error ?? optionsResult.error ?? rulesResult.error;
  if (error) return failure([], "plans_load_failed", error);

  const categories = (categoriesResult.data ?? []) as ClubMembershipCategory[];
  const options = (optionsResult.data ?? []) as ClubMembershipPricingOption[];
  const rules = (rulesResult.data ?? []) as unknown as Array<ClubMembershipAddonRule & { addon_plan: MembershipPlanView["addonRules"][number]["addonPlan"] }>;
  const categoryById = new Map(categories.map((category) => [category.id, category]));

  return success(((plansResult.data ?? []) as ClubMembershipPlan[]).map((plan) => ({
    ...plan,
    addonRules: rules.filter((rule) => rule.primary_plan_id === plan.id).map(({ addon_plan, ...rule }) => ({ ...rule, addonPlan: addon_plan })),
    category: categoryById.get(plan.category_id) ?? null,
    pricingOptions: options.filter((option) => option.plan_id === plan.id)
  })));
}

export async function loadMembershipApplications(supabase: ServerSupabase, venueId?: string): Promise<MembershipDataResult<MembershipApplicationView[]>> {
  let query = supabase
    .from("club_membership_applications")
    .select("*,applicant:applicant_profile_id(id,first_name,last_name,is_junior),payer:payer_profile_id(id,first_name,last_name),plan:plan_id(id,name,version,activation_policy),pricing_option:pricing_option_id(id,label,payment_frequency),venue:venue_id(id,name)")
    .order("submitted_at", { ascending: false });
  if (venueId) query = query.eq("venue_id", venueId);
  const { data, error } = await query;
  if (error) return failure([], "applications_load_failed", error);
  return success(((data ?? []) as unknown as ApplicationRow[]).map(({ pricing_option, ...application }) => ({ ...application, pricingOption: pricing_option })));
}

export async function loadMembershipApplication(supabase: ServerSupabase, applicationId: string): Promise<MembershipDataResult<MembershipApplicationView | null>> {
  const result = await loadMembershipApplications(supabase);
  if (result.error) return { data: null, error: result.error };
  return success(result.data.find((application) => application.id === applicationId) ?? null);
}

export async function loadMembershipSubscriptions(supabase: ServerSupabase, venueId?: string): Promise<MembershipDataResult<MembershipSubscriptionView[]>> {
  let query = supabase
    .from("club_membership_subscriptions")
    .select("*,applicant:applicant_profile_id(id,first_name,last_name,is_junior),payer:payer_profile_id(id,first_name,last_name),plan:plan_id(id,name,version,activation_policy,benefits_text),pricing_option:pricing_option_id(id,label,payment_frequency),venue:venue_id(id,name)")
    .order("created_at", { ascending: false });
  if (venueId) query = query.eq("venue_id", venueId);
  const subscriptionsResult = await query;
  if (subscriptionsResult.error) return failure([], "subscriptions_load_failed", subscriptionsResult.error);

  const subscriptions = (subscriptionsResult.data ?? []) as unknown as SubscriptionRow[];
  const ids = subscriptions.map((subscription) => subscription.id);
  if (ids.length === 0) return success([]);

  const [membersResult, billingResult, invoicesResult, paymentsResult] = await Promise.all([
    supabase.from("club_membership_subscription_members").select("*,profile:profile_id(id,first_name,last_name,is_junior),plan:selected_plan_id(id,name,version)").in("subscription_id", ids),
    supabase.from("club_membership_billing_schedules").select("*").in("subscription_id", ids).order("sequence_number"),
    supabase.from("club_membership_invoices").select("*").in("subscription_id", ids).order("sequence_number"),
    supabase.from("club_membership_manual_payments").select("*").in("subscription_id", ids).order("created_at", { ascending: false })
  ]);
  const detailError = membersResult.error ?? billingResult.error ?? invoicesResult.error ?? paymentsResult.error;
  if (detailError) return failure([], "subscription_details_load_failed", detailError);

  const coveredMembers = (membersResult.data ?? []) as unknown as CoveredMemberRow[];
  const billing = (billingResult.data ?? []) as ClubMembershipBillingSchedule[];
  const invoices = (invoicesResult.data ?? []) as ClubMembershipInvoice[];
  const payments = (paymentsResult.data ?? []) as ClubMembershipManualPayment[];

  return success(subscriptions.map(({ pricing_option, ...subscription }) => ({
    ...subscription,
    billingSchedule: billing.filter((item) => item.subscription_id === subscription.id),
    coveredMembers: coveredMembers.filter((item) => item.subscription_id === subscription.id),
    invoices: invoices.filter((item) => item.subscription_id === subscription.id),
    manualPayments: payments.filter((item) => item.subscription_id === subscription.id),
    pricingOption: pricing_option
  })));
}

export async function loadMembershipSubscription(supabase: ServerSupabase, subscriptionId: string): Promise<MembershipDataResult<MembershipSubscriptionView | null>> {
  const result = await loadMembershipSubscriptions(supabase);
  if (result.error) return { data: null, error: result.error };
  return success(result.data.find((subscription) => subscription.id === subscriptionId) ?? null);
}

export async function calculateMembershipPrice(
  supabase: ServerSupabase,
  input: {
    planId: string;
    pricingOptionId: string;
    members: Array<{ profile_id: string; selected_plan_id: string; member_role: string }>;
    startDate: string;
    userId: string;
  }
): Promise<MembershipDataResult<ClubMembershipPriceSnapshot | null>> {
  const { data, error } = await supabase.rpc("clubr_calculate_membership_price", {
    p_members: input.members,
    p_plan_id: input.planId,
    p_pricing_option_id: input.pricingOptionId,
    p_start_date: input.startDate,
    p_user_id: input.userId
  });
  return error ? failure(null, "price_calculation_failed", error) : success(data as ClubMembershipPriceSnapshot);
}
