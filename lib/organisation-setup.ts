import type { OrganisationProductSetup, OrganisationSetupProduct, OrganisationSetupStatus } from "@/types/courtside";
import type { createServerSupabaseClient } from "@/utils/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export type OrganisationSetupStep = {
  id: string;
  title: string;
  summary: string;
  essential: boolean;
};

export type OrganisationSetupSnapshot = {
  migrationReady: boolean;
  setup: OrganisationProductSetup;
  steps: OrganisationSetupStep[];
};

export const organisationSetupSteps: Record<OrganisationSetupProduct, OrganisationSetupStep[]> = {
  clubr: [
    { id: "details", title: "Club details", summary: "Name, contact details and club information", essential: true },
    { id: "courts", title: "Courts", summary: "Add courts or confirm that the club has none", essential: true },
    { id: "booking", title: "Booking basics", summary: "Set opening hours and simple booking rules", essential: true },
    { id: "staff", title: "Staff and access", summary: "Invite managers, coaches or committee members", essential: false },
    { id: "sharing", title: "Share courts", summary: "Give an academy or school access to selected courts", essential: false },
    { id: "members", title: "Members", summary: "Invite members now or add them later", essential: false },
    { id: "review", title: "Review", summary: "Check the essentials and open ClubR", essential: true }
  ],
  coachr: [
    { id: "details", title: "Academy details", summary: "Name, contact details and academy information", essential: true },
    { id: "coaches", title: "Coaches", summary: "Invite coaches or add them later", essential: false },
    { id: "venues", title: "Coaching venues", summary: "Connect PlayR courts or add an external venue", essential: true },
    { id: "students", title: "Students", summary: "Invite students or request a junior link", essential: false },
    { id: "defaults", title: "Lesson defaults", summary: "Choose simple defaults for new lessons", essential: false },
    { id: "review", title: "Review", summary: "Check the essentials and open CoachR", essential: true }
  ],
  teamr: [
    { id: "details", title: "School details", summary: "School and sports contact information", essential: true },
    { id: "coordinator", title: "Sports coordinator", summary: "Confirm the first authorised leader", essential: true },
    { id: "coaches", title: "Coaches", summary: "Invite school or academy coaches", essential: false },
    { id: "courts", title: "Courts", summary: "Add school courts or confirm that there are none", essential: true },
    { id: "academy", title: "Academy access", summary: "Choose which academies may use school facilities", essential: false },
    { id: "teams", title: "Teams", summary: "Prepare the future team structure", essential: false },
    { id: "review", title: "Review", summary: "Review setup before opening TeamR", essential: true }
  ]
};

export function productSetupLabel(product: OrganisationSetupProduct) {
  return product === "clubr" ? "ClubR" : product === "coachr" ? "CoachR" : "TeamR";
}

export function productSetupPath(product: OrganisationSetupProduct, step?: string) {
  const path = `/dashboard/setup/${product}`;
  return step ? `${path}?step=${encodeURIComponent(step)}` : path;
}

export function productDashboardPath(product: OrganisationSetupProduct) {
  return product === "clubr" ? "/dashboard/clubr" : product === "coachr" ? "/dashboard/coachr" : "/dashboard";
}

export function productSettingsPath(product: OrganisationSetupProduct) {
  return product === "clubr" ? "/dashboard/clubr/settings" : product === "coachr" ? "/dashboard/coachr/settings" : "/dashboard";
}

export function setupStep(product: OrganisationSetupProduct, requestedStep: string | null | undefined, fallbackStep = "details") {
  const steps = organisationSetupSteps[product];
  return steps.find((step) => step.id === requestedStep) ?? steps.find((step) => step.id === fallbackStep) ?? steps[0];
}

export function nextSetupStep(product: OrganisationSetupProduct, currentStep: string) {
  const steps = organisationSetupSteps[product];
  const index = steps.findIndex((step) => step.id === currentStep);
  return steps[Math.min(Math.max(index + 1, 0), steps.length - 1)];
}

export function previousSetupStep(product: OrganisationSetupProduct, currentStep: string) {
  const steps = organisationSetupSteps[product];
  const index = steps.findIndex((step) => step.id === currentStep);
  return index > 0 ? steps[index - 1] : null;
}

export function setupProgress(snapshot: OrganisationSetupSnapshot) {
  const completed = new Set([...snapshot.setup.completed_steps, ...snapshot.setup.skipped_steps]);
  const completeCount = snapshot.steps.filter((step) => completed.has(step.id)).length;
  return {
    completeCount,
    percent: Math.round((completeCount / snapshot.steps.length) * 100),
    totalCount: snapshot.steps.length
  };
}

export function setupIsComplete(snapshot: OrganisationSetupSnapshot | null) {
  return snapshot?.setup.status === "complete";
}

function defaultSetup(venueId: string, product: OrganisationSetupProduct, status: OrganisationSetupStatus = "not_started"): OrganisationProductSetup {
  const epoch = new Date(0).toISOString();
  return {
    id: `${venueId}:${product}`,
    venue_id: venueId,
    product_context: product,
    status,
    current_step: "details",
    completed_steps: [],
    skipped_steps: [],
    metadata: {},
    completed_by_user_id: null,
    completed_at: null,
    created_at: epoch,
    updated_at: epoch
  };
}

function isMissingSetupMigration(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || error?.code === "42703" || message.includes("organisation_product_setups");
}

export async function loadOrganisationSetup(
  supabase: ServerSupabaseClient,
  venueId: string,
  product: OrganisationSetupProduct
): Promise<OrganisationSetupSnapshot> {
  const { data, error } = await supabase
    .from("organisation_product_setups")
    .select("*")
    .eq("venue_id", venueId)
    .eq("product_context", product)
    .maybeSingle();

  if (error) {
    if (!isMissingSetupMigration(error)) {
      console.warn("[playr-setup]", { event: "setup_load_failed", code: error.code, venueId, product });
    }

    return {
      migrationReady: !isMissingSetupMigration(error),
      setup: defaultSetup(venueId, product, isMissingSetupMigration(error) ? "complete" : "needs_review"),
      steps: organisationSetupSteps[product]
    };
  }

  return {
    migrationReady: true,
    setup: (data as OrganisationProductSetup | null) ?? defaultSetup(venueId, product),
    steps: organisationSetupSteps[product]
  };
}
