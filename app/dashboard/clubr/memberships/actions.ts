"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ClubMembershipPriceSnapshot } from "@/types/courtside";
import { getPermissionContext } from "@/lib/permissions";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

function integer(formData: FormData, key: string, fallback = 0) {
  const value = Number.parseInt(text(formData, key), 10);
  return Number.isFinite(value) ? value : fallback;
}

function moneyCents(formData: FormData, key: string) {
  const value = Number(text(formData, key));
  return Number.isFinite(value) ? Math.max(0, Math.round(value * 100)) : 0;
}

function resultPath(path: string, key: "error" | "message", value: string) {
  const url = new URL(path, "http://localhost");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

function parseMembers(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      if (typeof row.profile_id !== "string" || typeof row.selected_plan_id !== "string" || typeof row.member_role !== "string") return [];
      return [{ member_role: row.member_role, profile_id: row.profile_id, selected_plan_id: row.selected_plan_id }];
    });
  } catch {
    return [];
  }
}

async function requireMembershipPermission(venueId: string, permission: "catalog_manage" | "applications_review" | "subscriptions_manage" | "payments_record" | "billing_view") {
  const context = await getPermissionContext();
  if (context.kind !== "authenticated" || !venueId || (context.role !== "platform_admin" && context.venueId !== venueId)) {
    throw new Error("clubr_membership_access_denied");
  }

  const { data, error } = await context.supabase.rpc("clubr_membership_permission", {
    check_permission: permission,
    check_user_id: context.user.id,
    check_venue_id: venueId
  });
  if (error || data !== true) {
    console.error("[clubr-memberships] permission_denied", { code: error?.code ?? null, permission, venueId });
    throw new Error("clubr_membership_access_denied");
  }
  return context;
}

function revalidateMemberships() {
  revalidatePath("/dashboard/clubr");
  revalidatePath("/dashboard/clubr/members");
  revalidatePath("/dashboard/clubr/memberships");
  revalidatePath("/dashboard/clubr/memberships/plans");
  revalidatePath("/dashboard/clubr/memberships/applications");
  revalidatePath("/dashboard/clubr/memberships/subscriptions");
  revalidatePath("/dashboard/memberships");
  revalidatePath("/dashboard/venues");
  revalidatePath("/dashboard");
}

export async function saveMembershipPlanPublicDetails(formData: FormData) {
  const venueId = text(formData, "venueId");
  const planId = text(formData, "planId");
  const context = await requireMembershipPermission(venueId, "catalog_manage");
  const publicBenefits = text(formData, "publicBenefits").split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 30);
  const { error } = await context.supabase.from("club_membership_plans").update({
    is_public: checked(formData, "isPublic"),
    public_benefits: publicBenefits,
    updated_by_user_id: context.user.id
  }).eq("id", planId).eq("venue_id", venueId);
  if (error) {
    console.error("[clubr-memberships] public_plan_details_failed", { code: error.code, planId, venueId });
    redirect(resultPath(`/dashboard/clubr/memberships/plans/${planId}`, "error", "public_details_failed"));
  }
  revalidateMemberships();
  redirect(resultPath(`/dashboard/clubr/memberships/plans/${planId}`, "message", "public_details_saved"));
}

export async function saveMembershipCategory(formData: FormData) {
  const venueId = text(formData, "venueId");
  const categoryId = text(formData, "categoryId");
  const context = await requireMembershipPermission(venueId, "catalog_manage");
  const name = text(formData, "name");
  const minimumAge = text(formData, "minimumAge");
  const maximumAge = text(formData, "maximumAge");
  const status = text(formData, "status") === "archived" ? "archived" : "active";
  if (!name) redirect(resultPath("/dashboard/clubr/memberships/plans", "error", "category_invalid"));

  const values = {
    archived_at: status === "archived" ? new Date().toISOString() : null,
    description: text(formData, "description") || null,
    display_order: integer(formData, "displayOrder", 0),
    eligibility_class: ["adult", "junior"].includes(text(formData, "eligibilityClass")) ? text(formData, "eligibilityClass") : "any",
    maximum_age: maximumAge ? integer(formData, "maximumAge") : null,
    minimum_age: minimumAge ? integer(formData, "minimumAge") : null,
    name,
    status,
    updated_by_user_id: context.user.id,
    venue_id: venueId
  };
  const result = categoryId
    ? await context.supabase.from("club_membership_categories").update(values).eq("id", categoryId).eq("venue_id", venueId)
    : await context.supabase.from("club_membership_categories").insert({ ...values, created_by_user_id: context.user.id });
  if (result.error) {
    console.error("[clubr-memberships] category_save_failed", { code: result.error.code, venueId });
    redirect(resultPath("/dashboard/clubr/memberships/plans", "error", "category_save_failed"));
  }
  revalidateMemberships();
  redirect(resultPath("/dashboard/clubr/memberships/plans", "message", "category_saved"));
}

export async function createMembershipPlan(formData: FormData) {
  const venueId = text(formData, "venueId");
  const context = await requireMembershipPermission(venueId, "catalog_manage");
  const categoryId = text(formData, "categoryId");
  const name = text(formData, "name");
  const durationMode = text(formData, "durationMode");
  const noFixedTerm = durationMode === "open";
  if (!categoryId || !name) redirect(resultPath("/dashboard/clubr/memberships/plans/new", "error", "plan_invalid"));

  const { data: planData, error: planError } = await context.supabase.from("club_membership_plans").insert({
    activation_policy: text(formData, "activationPolicy") === "on_approval" ? "on_approval" : "after_manual_payment",
    adult_primary_required: checked(formData, "adultPrimaryRequired"),
    approval_required: true,
    base_price_cents: moneyCents(formData, "basePrice"),
    benefits_text: text(formData, "benefits") || null,
    booking_entitlement: { reference: text(formData, "bookingEntitlement") || "club_default" },
    category_id: categoryId,
    created_by_user_id: context.user.id,
    currency: text(formData, "currency") || "ZAR",
    description: text(formData, "description") || null,
    duration_months: noFixedTerm ? null : Math.max(1, integer(formData, "durationMonths", 12)),
    joining_fee_cents: moneyCents(formData, "joiningFee"),
    joining_fee_scope: ["subscription", "covered_member"].includes(text(formData, "joiningFeeScope")) ? text(formData, "joiningFeeScope") : "none",
    maximum_covered_members: Math.max(1, Math.min(30, integer(formData, "maximumCoveredMembers", 1))),
    name,
    no_fixed_term: noFixedTerm,
    parent_may_purchase_for_juniors: true,
    payer_may_differ: checked(formData, "payerMayDiffer"),
    primary_member_required: true,
    start_rule: text(formData, "startRule") === "selected_date" ? "selected_date" : "immediate",
    status: "draft",
    terms_text: text(formData, "terms") || null,
    venue_id: venueId
  }).select("id").single();

  if (planError || !planData) {
    console.error("[clubr-memberships] plan_create_failed", { code: planError?.code ?? null, venueId });
    redirect(resultPath("/dashboard/clubr/memberships/plans/new", "error", "plan_save_failed"));
  }

  const commitmentMonths = noFixedTerm ? null : Math.max(1, integer(formData, "commitmentMonths", integer(formData, "durationMonths", 12)));
  const discountType = ["percentage", "fixed"].includes(text(formData, "discountType")) ? text(formData, "discountType") : "none";
  const { error: pricingError } = await context.supabase.from("club_membership_pricing_options").insert({
    commitment_months: commitmentMonths,
    created_by_user_id: context.user.id,
    discount_type: discountType,
    discount_value: discountType === "none" ? 0 : Number(text(formData, "discountValue") || "0"),
    displayed_price_cents: moneyCents(formData, "displayedPrice") || moneyCents(formData, "basePrice"),
    is_active: true,
    label: text(formData, "pricingLabel") || "Standard",
    no_fixed_term: noFixedTerm,
    payment_frequency: ["monthly", "every_3_months", "every_6_months", "annually"].includes(text(formData, "paymentFrequency")) ? text(formData, "paymentFrequency") : "once_off",
    plan_id: planData.id,
    venue_id: venueId
  });

  if (pricingError) {
    console.error("[clubr-memberships] plan_pricing_create_failed", { code: pricingError.code, planId: planData.id });
    redirect(resultPath(`/dashboard/clubr/memberships/plans/${planData.id}`, "error", "pricing_save_failed"));
  }
  revalidateMemberships();
  redirect(resultPath(`/dashboard/clubr/memberships/plans/${planData.id}`, "message", "plan_created"));
}

export async function addMembershipPricingOption(formData: FormData) {
  const venueId = text(formData, "venueId");
  const planId = text(formData, "planId");
  const context = await requireMembershipPermission(venueId, "catalog_manage");
  const noFixedTerm = checked(formData, "noFixedTerm");
  const discountType = ["percentage", "fixed"].includes(text(formData, "discountType")) ? text(formData, "discountType") : "none";
  const { error } = await context.supabase.from("club_membership_pricing_options").insert({
    commitment_months: noFixedTerm ? null : Math.max(1, integer(formData, "commitmentMonths", 12)),
    created_by_user_id: context.user.id,
    discount_type: discountType,
    discount_value: discountType === "none" ? 0 : Number(text(formData, "discountValue") || "0"),
    displayed_price_cents: moneyCents(formData, "displayedPrice"),
    is_active: true,
    label: text(formData, "label"),
    no_fixed_term: noFixedTerm,
    payment_frequency: text(formData, "paymentFrequency"),
    plan_id: planId,
    venue_id: venueId
  });
  if (error) redirect(resultPath(`/dashboard/clubr/memberships/plans/${planId}`, "error", "pricing_save_failed"));
  revalidateMemberships();
  redirect(resultPath(`/dashboard/clubr/memberships/plans/${planId}`, "message", "pricing_saved"));
}

export async function updateMembershipPlanDraft(formData: FormData) {
  const venueId = text(formData, "venueId");
  const planId = text(formData, "planId");
  const context = await requireMembershipPermission(venueId, "catalog_manage");
  const { error } = await context.supabase.from("club_membership_plans").update({
    activation_policy: text(formData, "activationPolicy") === "on_approval" ? "on_approval" : "after_manual_payment",
    base_price_cents: moneyCents(formData, "basePrice"),
    benefits_text: text(formData, "benefits") || null,
    description: text(formData, "description") || null,
    joining_fee_cents: moneyCents(formData, "joiningFee"),
    joining_fee_scope: ["subscription", "covered_member"].includes(text(formData, "joiningFeeScope")) ? text(formData, "joiningFeeScope") : "none",
    maximum_covered_members: Math.max(1, Math.min(30, integer(formData, "maximumCoveredMembers", 1))),
    name: text(formData, "name"),
    terms_text: text(formData, "terms") || null,
    updated_by_user_id: context.user.id
  }).eq("id", planId).eq("venue_id", venueId).eq("status", "draft");
  if (error) redirect(resultPath(`/dashboard/clubr/memberships/plans/${planId}`, "error", "plan_save_failed"));
  revalidateMemberships();
  redirect(resultPath(`/dashboard/clubr/memberships/plans/${planId}`, "message", "plan_saved"));
}

export async function addMembershipAddonRule(formData: FormData) {
  const venueId = text(formData, "venueId");
  const planId = text(formData, "planId");
  const context = await requireMembershipPermission(venueId, "catalog_manage");
  const adjustmentType = ["percentage", "fixed"].includes(text(formData, "adjustmentType")) ? text(formData, "adjustmentType") : "none";
  const { error } = await context.supabase.from("club_membership_addon_rules").insert({
    addon_plan_id: text(formData, "addonPlanId"),
    adjustment_type: adjustmentType,
    adjustment_value: adjustmentType === "none" ? 0 : Number(text(formData, "adjustmentValue") || "0"),
    created_by_user_id: context.user.id,
    is_active: true,
    joining_fee_policy: checked(formData, "waiveJoiningFee") ? "waive" : "plan_default",
    maximum_addons: Math.max(1, Math.min(29, integer(formData, "maximumAddons", 1))),
    member_class: ["adult", "junior"].includes(text(formData, "memberClass")) ? text(formData, "memberClass") : "any",
    primary_plan_id: planId,
    use_addon_plan_price: true,
    venue_id: venueId
  });
  if (error) redirect(resultPath(`/dashboard/clubr/memberships/plans/${planId}`, "error", "addon_save_failed"));
  revalidateMemberships();
  redirect(resultPath(`/dashboard/clubr/memberships/plans/${planId}`, "message", "addon_saved"));
}

export async function setMembershipPlanStatus(formData: FormData) {
  const venueId = text(formData, "venueId");
  const planId = text(formData, "planId");
  const context = await requireMembershipPermission(venueId, "catalog_manage");
  const { error } = await context.supabase.rpc("clubr_set_membership_plan_status", {
    p_confirmed: checked(formData, "confirmed"), p_plan_id: planId, p_status: text(formData, "status")
  });
  if (error) redirect(resultPath(`/dashboard/clubr/memberships/plans/${planId}`, "error", "plan_status_failed"));
  revalidateMemberships();
  redirect(resultPath(`/dashboard/clubr/memberships/plans/${planId}`, "message", "plan_status_updated"));
}

export async function createMembershipPlanVersion(formData: FormData) {
  const venueId = text(formData, "venueId");
  const planId = text(formData, "planId");
  const context = await requireMembershipPermission(venueId, "catalog_manage");
  const { data, error } = await context.supabase.rpc("clubr_create_membership_plan_version", { p_plan_id: planId });
  if (error || !data) redirect(resultPath(`/dashboard/clubr/memberships/plans/${planId}`, "error", "plan_version_failed"));
  revalidateMemberships();
  redirect(resultPath(`/dashboard/clubr/memberships/plans/${data}`, "message", "plan_version_created"));
}

export async function approveMembershipApplication(formData: FormData) {
  const venueId = text(formData, "venueId");
  const applicationId = text(formData, "applicationId");
  const context = await requireMembershipPermission(venueId, "applications_review");
  const { data, error } = await context.supabase.rpc("clubr_approve_membership_application", { p_application_id: applicationId, p_confirmed: checked(formData, "confirmed") });
  if (error || !data) {
    const code = error?.message?.includes("membership_price_changed") ? "price_changed" : "approval_failed";
    redirect(resultPath(`/dashboard/clubr/memberships/applications/${applicationId}`, "error", code));
  }
  revalidateMemberships();
  redirect(resultPath(`/dashboard/clubr/memberships/subscriptions/${data}`, "message", "application_approved"));
}

export async function decideMembershipApplication(formData: FormData) {
  const venueId = text(formData, "venueId");
  const applicationId = text(formData, "applicationId");
  const context = await requireMembershipPermission(venueId, "applications_review");
  const { error } = await context.supabase.rpc("clubr_decide_membership_application", {
    p_application_id: applicationId,
    p_confirmed: checked(formData, "confirmed"),
    p_decision: text(formData, "decision"),
    p_reason: text(formData, "reason")
  });
  if (error) redirect(resultPath(`/dashboard/clubr/memberships/applications/${applicationId}`, "error", "decision_failed"));
  revalidateMemberships();
  redirect(resultPath(`/dashboard/clubr/memberships/applications/${applicationId}`, "message", "decision_saved"));
}

export async function recordManualMembershipPayment(formData: FormData) {
  const venueId = text(formData, "venueId");
  const subscriptionId = text(formData, "subscriptionId");
  const context = await requireMembershipPermission(venueId, "payments_record");
  const { error } = await context.supabase.rpc("clubr_record_manual_membership_payment", {
    p_amount_cents: moneyCents(formData, "amount"),
    p_billing_schedule_id: text(formData, "billingScheduleId"),
    p_confirmed: checked(formData, "confirmed"),
    p_note: text(formData, "note") || null,
    p_payment_method: text(formData, "paymentMethod"),
    p_received_on: text(formData, "receivedOn"),
    p_reference: text(formData, "reference"),
    p_subscription_id: subscriptionId
  });
  if (error) redirect(resultPath(`/dashboard/clubr/memberships/subscriptions/${subscriptionId}`, "error", "payment_failed"));
  revalidateMemberships();
  redirect(resultPath(`/dashboard/clubr/memberships/subscriptions/${subscriptionId}`, "message", "payment_recorded"));
}

export async function setMembershipSubscriptionStatus(formData: FormData) {
  const venueId = text(formData, "venueId");
  const subscriptionId = text(formData, "subscriptionId");
  const context = await requireMembershipPermission(venueId, "subscriptions_manage");
  const { error } = await context.supabase.rpc("clubr_set_membership_subscription_status", {
    p_confirmed: checked(formData, "confirmed"),
    p_reason: text(formData, "reason") || null,
    p_status: text(formData, "status"),
    p_subscription_id: subscriptionId
  });
  if (error) redirect(resultPath(`/dashboard/clubr/memberships/subscriptions/${subscriptionId}`, "error", "status_failed"));
  revalidateMemberships();
  redirect(resultPath(`/dashboard/clubr/memberships/subscriptions/${subscriptionId}`, "message", "status_updated"));
}

export async function previewMembershipPrice(input: {
  members: Array<{ member_role: string; profile_id: string; selected_plan_id: string }>;
  planId: string;
  pricingOptionId: string;
  startDate: string;
}): Promise<{ error: string | null; snapshot: ClubMembershipPriceSnapshot | null }> {
  const context = await getPermissionContext();
  if (context.kind !== "authenticated") return { error: "Sign in to calculate this membership.", snapshot: null };
  const { data, error } = await context.supabase.rpc("playr_calculate_public_membership_price", {
    p_members: input.members,
    p_plan_id: input.planId,
    p_pricing_option_id: input.pricingOptionId,
    p_start_date: input.startDate
  });
  if (error) {
    console.error("[clubr-memberships] member_price_preview_failed", { code: error.code });
    return { error: "This price could not be verified. Check the selected members and plan.", snapshot: null };
  }
  return { error: null, snapshot: data as ClubMembershipPriceSnapshot };
}

export async function submitMembershipApplication(formData: FormData) {
  const context = await getPermissionContext();
  if (context.kind !== "authenticated") redirect("/login");
  const members = parseMembers(text(formData, "members"));
  const { data, error } = await context.supabase.rpc("clubr_submit_membership_application", {
    p_applicant_profile_id: text(formData, "applicantProfileId"),
    p_members: members,
    p_notes: text(formData, "notes") || null,
    p_payer_profile_id: text(formData, "payerProfileId"),
    p_plan_id: text(formData, "planId"),
    p_pricing_option_id: text(formData, "pricingOptionId"),
    p_requested_start_date: text(formData, "startDate"),
    p_terms_accepted: checked(formData, "termsAccepted")
  });
  if (error || !data) {
    console.error("[clubr-memberships] application_submit_failed", { code: error?.code ?? null });
    redirect(resultPath(`/dashboard/memberships/join?venue=${text(formData, "venueId")}`, "error", error?.code === "23505" ? "duplicate" : "submit_failed"));
  }
  revalidateMemberships();
  redirect(resultPath(`/dashboard/memberships/applications/${data}`, "message", "application_submitted"));
}
