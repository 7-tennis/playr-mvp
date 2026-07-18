"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { productForOrganisationMembership } from "@/lib/organisations";
import { nextSetupStep, productDashboardPath, productSetupPath } from "@/lib/organisation-setup";
import { getPermissionContext } from "@/lib/permissions";
import type { CoachLessonType, OrganisationRole, OrganisationSetupProduct } from "@/types/courtside";
import type { createServerSupabaseClient } from "@/utils/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

const products: OrganisationSetupProduct[] = ["clubr", "coachr", "teamr"];
const clubManagerRoles: OrganisationRole[] = ["organisation_admin", "club_manager", "sports_coordinator"];
const coachManagerRoles: OrganisationRole[] = ["organisation_admin", "club_manager", "head_coach"];
const lessonTypes: CoachLessonType[] = ["private", "group", "squad", "matchplay", "assessment", "other"];

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function integer(formData: FormData, key: string, fallback: number) {
  const value = Number.parseInt(text(formData, key), 10);
  return Number.isFinite(value) ? value : fallback;
}

function product(formData: FormData): OrganisationSetupProduct {
  const value = text(formData, "product") as OrganisationSetupProduct;
  return products.includes(value) ? value : "clubr";
}

function resultPath(productContext: OrganisationSetupProduct, step: string, key: "error" | "message", value: string) {
  return `${productSetupPath(productContext, step)}&${key}=${encodeURIComponent(value)}`;
}

async function requireSetupManager(formData: FormData) {
  const context = await getPermissionContext();
  const productContext = product(formData);

  if (context.kind !== "authenticated" || !context.activeOrganisationMembership) {
    redirect(resultPath(productContext, "details", "error", "access"));
  }

  const membership = context.activeOrganisationMembership;
  const allowedRoles = productContext === "clubr" ? clubManagerRoles : productContext === "coachr" ? coachManagerRoles : ["organisation_admin", "sports_coordinator", "team_manager"];

  if (!allowedRoles.includes(membership.role) || productForOrganisationMembership(membership) !== productContext) {
    redirect(resultPath(productContext, "details", "error", "access"));
  }

  return { context, productContext, venueId: membership.venue_id };
}

function revalidateSetup(productContext: OrganisationSetupProduct) {
  revalidatePath(productSetupPath(productContext));
  revalidatePath(productDashboardPath(productContext));
  revalidatePath(`/dashboard/${productContext}/settings`);
}

async function saveProgress({
  completedStep,
  currentStep,
  productContext,
  skippedStep,
  status,
  supabase,
  venueId
}: {
  completedStep?: string | null;
  currentStep: string;
  productContext: OrganisationSetupProduct;
  skippedStep?: string | null;
  status?: "in_progress" | "complete" | "needs_review";
  supabase: ServerSupabaseClient;
  venueId: string;
}) {
  return supabase.rpc("save_organisation_setup_progress", {
    p_completed_step: completedStep ?? null,
    p_current_step: currentStep,
    p_product_context: productContext,
    p_skipped_step: skippedStep ?? null,
    p_status: status ?? "in_progress",
    p_venue_id: venueId
  });
}

export async function saveOrganisationDetails(formData: FormData) {
  const { context, productContext, venueId } = await requireSetupManager(formData);
  const currentStep = "details";
  const name = text(formData, "name");

  if (!name) {
    redirect(resultPath(productContext, currentStep, "error", "details_required"));
  }

  const { error } = await context.supabase
    .from("venues")
    .update({
      address: text(formData, "address") || null,
      contact_email: text(formData, "contactEmail") || null,
      contact_phone: text(formData, "contactPhone") || null,
      description: text(formData, "description") || null,
      logo_url: text(formData, "logoUrl") || null,
      main_contact_name: text(formData, "mainContactName") || null,
      name
    })
    .eq("id", venueId);

  if (error) {
    console.error("Organisation setup details failed", { code: error.code, productContext, venueId });
    redirect(resultPath(productContext, currentStep, "error", "save_failed"));
  }

  const next = nextSetupStep(productContext, currentStep);
  const progress = await saveProgress({ completedStep: currentStep, currentStep: next.id, productContext, supabase: context.supabase, venueId });

  if (progress.error) {
    redirect(resultPath(productContext, currentStep, "error", "save_failed"));
  }

  revalidateSetup(productContext);
  redirect(productSetupPath(productContext, next.id));
}

export async function addOrganisationCourt(formData: FormData) {
  const { context, productContext, venueId } = await requireSetupManager(formData);
  const name = text(formData, "name");

  if (productContext !== "clubr" || !name) {
    redirect(resultPath(productContext, "courts", "error", "court_required"));
  }

  const { count } = await context.supabase.from("courts").select("id", { count: "exact", head: true }).eq("venue_id", venueId);
  const { error } = await context.supabase.from("courts").insert({
    closing_time: text(formData, "closingTime") || null,
    court_number: text(formData, "courtNumber") || null,
    lighting_available: checked(formData, "lightingAvailable"),
    name,
    notes: null,
    opening_time: text(formData, "openingTime") || null,
    operator_venue_id: venueId,
    sort_order: (count ?? 0) + 1,
    status: "active",
    surface: text(formData, "surface") || null,
    venue_id: venueId
  });

  if (error) {
    console.error("ClubR setup court creation failed", { code: error.code, venueId });
    redirect(resultPath(productContext, "courts", "error", "court_save_failed"));
  }

  revalidateSetup(productContext);
  redirect(resultPath(productContext, "courts", "message", "court_added"));
}

export async function updateOrganisationCourt(formData: FormData) {
  const { context, productContext, venueId } = await requireSetupManager(formData);
  const courtId = text(formData, "courtId");
  const name = text(formData, "name");

  if (productContext !== "clubr" || !courtId || !name) {
    redirect(resultPath(productContext, "courts", "error", "court_required"));
  }

  const { error } = await context.supabase
    .from("courts")
    .update({
      closing_time: text(formData, "closingTime") || null,
      court_number: text(formData, "courtNumber") || null,
      lighting_available: checked(formData, "lightingAvailable"),
      name,
      opening_time: text(formData, "openingTime") || null,
      status: text(formData, "status") === "inactive" ? "inactive" : "active",
      surface: text(formData, "surface") || null
    })
    .eq("id", courtId)
    .eq("venue_id", venueId);

  if (error) {
    redirect(resultPath(productContext, "courts", "error", "court_save_failed"));
  }

  revalidateSetup(productContext);
  redirect(resultPath(productContext, "courts", "message", "court_updated"));
}

export async function inviteSetupStaff(formData: FormData) {
  const { context, productContext, venueId } = await requireSetupManager(formData);
  const email = text(formData, "email").toLowerCase();
  const role = text(formData, "role") as OrganisationRole;
  const clubRoles: OrganisationRole[] = ["club_manager", "committee", "reception", "head_coach", "coach", "sports_coordinator", "viewer"];
  const coachRoles: OrganisationRole[] = ["head_coach", "coach", "assistant_coach"];
  const allowedRoles = productContext === "clubr" ? clubRoles : coachRoles;
  const step = productContext === "clubr" ? "staff" : "coaches";

  if (!email || !allowedRoles.includes(role)) {
    redirect(resultPath(productContext, step, "error", "staff_required"));
  }

  const { data: token, error } = await context.supabase.rpc("create_organisation_invitation", {
    p_invitation_kind: role === "head_coach" || role === "coach" || role === "assistant_coach" ? "coach" : "organisation_member",
    p_invited_email: email,
    p_invited_name: text(formData, "invitedName") || null,
    p_invited_phone: text(formData, "invitedPhone") || null,
    p_intended_role: role,
    p_metadata: { source: `${productContext}_setup` },
    p_parent_profile_id: null,
    p_target_junior_profile_id: null,
    p_target_profile_id: null,
    p_venue_id: venueId
  });

  if (error || !token) {
    redirect(resultPath(productContext, step, "error", error?.message === "duplicate_invitation" ? "duplicate_invitation" : "invite_failed"));
  }

  revalidateSetup(productContext);
  redirect(resultPath(productContext, step, "message", "staff_invited"));
}

export async function saveCourtsStep(formData: FormData) {
  const { context, productContext, venueId } = await requireSetupManager(formData);
  const noCourts = checked(formData, "noCourts");
  const { count } = await context.supabase.from("courts").select("id", { count: "exact", head: true }).eq("venue_id", venueId).eq("status", "active");

  if (productContext !== "clubr" || (!noCourts && (count ?? 0) === 0)) {
    redirect(resultPath(productContext, "courts", "error", "court_or_none"));
  }

  const existing = await context.supabase.from("organisation_booking_settings").select("venue_id").eq("venue_id", venueId).maybeSingle();
  const result = existing.data
    ? await context.supabase.from("organisation_booking_settings").update({ no_courts: noCourts, updated_by_user_id: context.user.id }).eq("venue_id", venueId)
    : await context.supabase.from("organisation_booking_settings").insert({ no_courts: noCourts, updated_by_user_id: context.user.id, venue_id: venueId });

  if (result.error) {
    redirect(resultPath(productContext, "courts", "error", "save_failed"));
  }

  const next = nextSetupStep(productContext, "courts");
  await saveProgress({ completedStep: "courts", currentStep: next.id, productContext, supabase: context.supabase, venueId });
  revalidateSetup(productContext);
  redirect(productSetupPath(productContext, next.id));
}

export async function saveBookingBasics(formData: FormData) {
  const { context, productContext, venueId } = await requireSetupManager(formData);
  const openingTime = text(formData, "openingTime") || "06:00";
  const closingTime = text(formData, "closingTime") || "21:00";

  if (productContext !== "clubr" || closingTime <= openingTime) {
    redirect(resultPath(productContext, "booking", "error", "time_order"));
  }

  const settings = {
    advance_booking_days: integer(formData, "advanceBookingDays", 7),
    closing_time: closingTime,
    max_active_bookings: integer(formData, "maxActiveBookings", 3),
    member_booking_enabled: checked(formData, "memberBookingEnabled"),
    non_member_booking_enabled: checked(formData, "nonMemberBookingEnabled"),
    non_member_price_cents: Math.max(0, Math.round(Number(text(formData, "nonMemberPrice") || "0") * 100)),
    opening_time: openingTime,
    slot_minutes: integer(formData, "slotMinutes", 60),
    updated_by_user_id: context.user.id,
    venue_id: venueId
  };
  const { error } = await context.supabase.from("organisation_booking_settings").upsert(settings, { onConflict: "venue_id" });

  if (error) {
    console.error("ClubR booking setup failed", { code: error.code, venueId });
    redirect(resultPath(productContext, "booking", "error", "save_failed"));
  }

  const next = nextSetupStep(productContext, "booking");
  await saveProgress({ completedStep: "booking", currentStep: next.id, productContext, supabase: context.supabase, venueId });
  revalidateSetup(productContext);
  redirect(productSetupPath(productContext, next.id));
}

export async function addExternalVenue(formData: FormData) {
  const { context, productContext, venueId } = await requireSetupManager(formData);
  const name = text(formData, "name");

  if (productContext !== "coachr" || !name) {
    redirect(resultPath(productContext, "venues", "error", "venue_required"));
  }

  const courtNames = text(formData, "courtNames").split(",").map((item) => item.trim()).filter(Boolean);
  const { error } = await context.supabase.from("organisation_external_venues").insert({
    address: text(formData, "address") || null,
    contact_email: text(formData, "contactEmail") || null,
    contact_name: text(formData, "contactName") || null,
    contact_phone: text(formData, "contactPhone") || null,
    court_count: text(formData, "courtCount") ? integer(formData, "courtCount", 0) : null,
    court_names: courtNames,
    created_by_user_id: context.user.id,
    name,
    notes: text(formData, "notes") || null,
    organisation_id: venueId,
    status: "active"
  });

  if (error) {
    console.error("CoachR external venue creation failed", { code: error.code, venueId });
    redirect(resultPath(productContext, "venues", "error", "venue_save_failed"));
  }

  revalidateSetup(productContext);
  redirect(resultPath(productContext, "venues", "message", "external_venue_added"));
}

export async function requestPlayRVenueAccess(formData: FormData) {
  const { context, productContext, venueId } = await requireSetupManager(formData);
  const ownerVenueId = text(formData, "ownerVenueId");

  if (productContext !== "coachr" || !ownerVenueId || ownerVenueId === venueId) {
    redirect(resultPath(productContext, "venues", "error", "venue_required"));
  }

  const { error } = await context.supabase.rpc("request_organisation_court_access", {
    p_notes: text(formData, "notes") || null,
    p_owner_venue_id: ownerVenueId,
    p_requester_venue_id: venueId
  });

  if (error) {
    redirect(resultPath(productContext, "venues", "error", error.message === "access_active" ? "access_active" : "request_failed"));
  }

  revalidateSetup(productContext);
  redirect(resultPath(productContext, "venues", "message", "access_requested"));
}

export async function saveCoachingVenuesStep(formData: FormData) {
  const { context, productContext, venueId } = await requireSetupManager(formData);
  const noDefaultVenue = checked(formData, "noDefaultVenue");
  const [externalResult, accessResult] = await Promise.all([
    context.supabase.from("organisation_external_venues").select("id", { count: "exact", head: true }).eq("organisation_id", venueId).eq("status", "active"),
    context.supabase.from("organisation_court_access").select("id", { count: "exact", head: true }).eq("approved_venue_id", venueId).eq("status", "active")
  ]);

  if (productContext !== "coachr" || (!noDefaultVenue && (externalResult.count ?? 0) === 0 && (accessResult.count ?? 0) === 0)) {
    redirect(resultPath(productContext, "venues", "error", "venue_or_none"));
  }

  const existing = await context.supabase.from("organisation_coaching_settings").select("venue_id").eq("venue_id", venueId).maybeSingle();
  const result = existing.data
    ? await context.supabase.from("organisation_coaching_settings").update({ no_default_venue: noDefaultVenue, updated_by_user_id: context.user.id }).eq("venue_id", venueId)
    : await context.supabase.from("organisation_coaching_settings").insert({ no_default_venue: noDefaultVenue, updated_by_user_id: context.user.id, venue_id: venueId });

  if (result.error) {
    redirect(resultPath(productContext, "venues", "error", "save_failed"));
  }

  const next = nextSetupStep(productContext, "venues");
  await saveProgress({ completedStep: "venues", currentStep: next.id, productContext, supabase: context.supabase, venueId });
  revalidateSetup(productContext);
  redirect(productSetupPath(productContext, next.id));
}

export async function saveCoachingDefaults(formData: FormData) {
  const { context, productContext, venueId } = await requireSetupManager(formData);
  const defaultLessonType = lessonTypes.includes(text(formData, "defaultLessonType") as CoachLessonType)
    ? (text(formData, "defaultLessonType") as CoachLessonType)
    : "private";
  const { error } = await context.supabase.from("organisation_coaching_settings").upsert({
    default_external_venue_id: text(formData, "defaultExternalVenueId") || null,
    default_lesson_duration_minutes: integer(formData, "defaultLessonDuration", 60),
    default_lesson_type: defaultLessonType,
    group_lessons_enabled: checked(formData, "groupLessonsEnabled"),
    private_lessons_enabled: checked(formData, "privateLessonsEnabled"),
    updated_by_user_id: context.user.id,
    venue_id: venueId
  }, { onConflict: "venue_id" });

  if (productContext !== "coachr" || error) {
    redirect(resultPath(productContext, "defaults", "error", "save_failed"));
  }

  const next = nextSetupStep(productContext, "defaults");
  await saveProgress({ completedStep: "defaults", currentStep: next.id, productContext, supabase: context.supabase, venueId });
  revalidateSetup(productContext);
  redirect(productSetupPath(productContext, next.id));
}

export async function grantSetupCourtAccess(formData: FormData) {
  const { context, productContext, venueId } = await requireSetupManager(formData);
  const approvedVenueId = text(formData, "approvedVenueId");
  const courtIds = formData.getAll("courtIds").filter((value): value is string => typeof value === "string" && Boolean(value));

  if (productContext !== "clubr" || !approvedVenueId || approvedVenueId === venueId) {
    redirect(resultPath(productContext, "sharing", "error", "share_required"));
  }

  const selections = courtIds.length > 0 ? courtIds : [null];
  for (const courtId of selections) {
    const { error } = await context.supabase.rpc("grant_organisation_court_access", {
      p_approved_venue_id: approvedVenueId,
      p_court_id: courtId,
      p_notes: text(formData, "notes") || null,
      p_owner_venue_id: venueId,
      p_valid_from: null,
      p_valid_until: null
    });

    if (error) {
      redirect(resultPath(productContext, "sharing", "error", "share_failed"));
    }
  }

  revalidateSetup(productContext);
  redirect(resultPath(productContext, "sharing", "message", "access_active"));
}

export async function respondToCourtAccessRequest(formData: FormData) {
  const { context, productContext } = await requireSetupManager(formData);
  const requestId = text(formData, "requestId");
  const decision = text(formData, "decision");
  const courtIds = formData.getAll("courtIds").filter((value): value is string => typeof value === "string" && Boolean(value));

  if (productContext !== "clubr" || !requestId || !["active", "declined"].includes(decision)) {
    redirect(resultPath(productContext, "sharing", "error", "request_failed"));
  }

  const { error } = await context.supabase.rpc("respond_to_court_access_request", {
    p_court_ids: courtIds,
    p_decision: decision,
    p_request_id: requestId,
    p_response_notes: text(formData, "notes") || null
  });

  if (error) {
    redirect(resultPath(productContext, "sharing", "error", "request_failed"));
  }

  revalidateSetup(productContext);
  redirect(resultPath(productContext, "sharing", "message", decision === "active" ? "access_active" : "request_declined"));
}

export async function saveSimpleSetupStep(formData: FormData) {
  const { context, productContext, venueId } = await requireSetupManager(formData);
  const step = text(formData, "step");
  const skip = text(formData, "intent") === "skip";
  const next = nextSetupStep(productContext, step);
  const { error } = await saveProgress({
    completedStep: skip ? null : step,
    currentStep: next.id,
    productContext,
    skippedStep: skip ? step : null,
    supabase: context.supabase,
    venueId
  });

  if (error) {
    redirect(resultPath(productContext, step, "error", "save_failed"));
  }

  revalidateSetup(productContext);
  redirect(productSetupPath(productContext, next.id));
}

export async function saveSetupPosition(formData: FormData) {
  const { context, productContext, venueId } = await requireSetupManager(formData);
  const step = text(formData, "step") || "details";
  const { error } = await saveProgress({ currentStep: step, productContext, supabase: context.supabase, venueId });

  if (error) {
    redirect(resultPath(productContext, step, "error", "save_failed"));
  }

  revalidateSetup(productContext);
  redirect(`${productDashboardPath(productContext)}?setup=saved`);
}

export async function completeOrganisationSetup(formData: FormData) {
  const { context, productContext, venueId } = await requireSetupManager(formData);
  let ready = false;

  if (productContext === "clubr") {
    const [courts, settings] = await Promise.all([
      context.supabase.from("courts").select("id", { count: "exact", head: true }).eq("venue_id", venueId).eq("status", "active"),
      context.supabase.from("organisation_booking_settings").select("no_courts").eq("venue_id", venueId).maybeSingle()
    ]);
    ready = Boolean(settings.data && (settings.data.no_courts || (courts.count ?? 0) > 0));
  } else if (productContext === "coachr") {
    const [external, access, settings] = await Promise.all([
      context.supabase.from("organisation_external_venues").select("id", { count: "exact", head: true }).eq("organisation_id", venueId).eq("status", "active"),
      context.supabase.from("organisation_court_access").select("id", { count: "exact", head: true }).eq("approved_venue_id", venueId).eq("status", "active"),
      context.supabase.from("organisation_coaching_settings").select("no_default_venue").eq("venue_id", venueId).maybeSingle()
    ]);
    ready = Boolean((external.count ?? 0) > 0 || (access.count ?? 0) > 0 || settings.data?.no_default_venue);
  }

  if (!ready) {
    redirect(resultPath(productContext, "review", "error", "essential_setup"));
  }

  const { error } = await saveProgress({
    completedStep: "review",
    currentStep: "review",
    productContext,
    status: "complete",
    supabase: context.supabase,
    venueId
  });

  if (error) {
    redirect(resultPath(productContext, "review", "error", "save_failed"));
  }

  revalidateSetup(productContext);
  redirect(`${productDashboardPath(productContext)}?setup=complete`);
}
