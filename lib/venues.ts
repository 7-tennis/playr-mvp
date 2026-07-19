import "server-only";
import type { createServerSupabaseClient } from "@/utils/supabase/server";
import type { Profile, VenueRelationshipType } from "@/types/courtside";

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export type VenueDataError = {
  code: string | null;
  message: string;
  kind: "access_denied" | "not_found" | "query_failed";
};

export type VenueDataResult<T> = {
  data: T;
  error: VenueDataError | null;
};

export type ManagedVenueProfile = Pick<Profile, "id" | "first_name" | "last_name" | "is_junior" | "email" | "phone">;

export type VenueRelationship = {
  relationshipType: VenueRelationshipType;
  membershipStatus: string | null;
  subscriptionId: string | null;
  applicationId: string | null;
  bookingEntitlement: Record<string, unknown>;
  isLinkedJunior: boolean;
  isAuthorisedManager: boolean;
  hasOrganisationAccess?: boolean;
  hasBookingAccess?: boolean;
};

export type VenueCardData = {
  venueId: string;
  venueName: string;
  venueSlug: string;
  relationship: VenueRelationship;
  locationSummary: string | null;
  courtCount: number;
  guestBookingAvailable: boolean;
  publishedMembershipsAvailable: boolean;
  discoveryVisibility: "public" | "members_only" | "hidden";
  publicDescription: string | null;
  logoUrl: string | null;
};

export type VenuePageData = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  imageUrl: string | null;
  description: string | null;
  address: string | null;
  suburb: string | null;
  town: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  websiteUrl: string | null;
  openingHours: string | null;
  surfaceTypes: string[];
  facilities: string[];
  visitorInformation: string | null;
  parkingInformation: string | null;
  bookingNotes: string | null;
  membershipContact: string | null;
  courtCount: number;
  visibility: "public" | "members_only" | "hidden";
  relationship: VenueRelationship;
  guestBookingAvailable: boolean;
  publicAvailabilityVisibility: "full" | "guest_eligible" | "sign_in_required" | "after_approval";
  membershipsAvailable: boolean;
  leaderboardVisibility: {
    competition: "public" | "members_only" | "hidden";
    participation: "public" | "members_only" | "hidden";
    development: "public" | "members_only" | "hidden";
  };
};

export type PublicMembershipPricingOption = {
  id: string;
  label: string;
  commitmentMonths: number | null;
  noFixedTerm: boolean;
  paymentFrequency: string;
  discountType: string;
  discountValue: number;
  displayedPriceCents: number | null;
};

export type PublicMembershipPlan = {
  planId: string;
  categoryId: string;
  planVersion: number;
  planName: string;
  categoryName: string;
  categoryEligibility: string;
  minimumAge: number | null;
  maximumAge: number | null;
  description: string | null;
  basePriceCents: number;
  currency: string;
  joiningFeeCents: number;
  joiningFeeScope: string;
  durationMonths: number | null;
  noFixedTerm: boolean;
  maximumCoveredMembers: number;
  adultPrimaryRequired: boolean;
  bookingEntitlement: Record<string, unknown>;
  benefitsText: string | null;
  publicBenefits: string[];
  termsText: string | null;
  pricingOptions: PublicMembershipPricingOption[];
  addonRules: Array<Record<string, unknown>>;
};

export type PublicVenueNotice = {
  noticeId: string;
  title: string;
  message: string;
  category: string;
  startsAt: string | null;
  endsAt: string | null;
};

export type VenueBookingEligibility = {
  allowed: boolean;
  reason: string;
  relationshipType?: VenueRelationshipType;
  bookingType?: "member_booking" | "guest_booking";
  advanceDays?: number;
  maxActiveBookings?: number;
  bookingPeriodDays?: number;
  maxDurationMinutes?: number;
  slotMinutes?: number;
  openingTime?: string;
  closingTime?: string;
  priceCents?: number;
  currency?: string;
  eligibleCourtIds?: string[];
  requiresApproval?: boolean;
  requiresName?: boolean;
  requiresEmail?: boolean;
  requiresPhone?: boolean;
  futurePaymentRequired?: boolean;
  availabilityVisibility?: string;
};

type VenueRpcRow = {
  venue_id: string;
  venue_name: string;
  venue_slug: string;
  relationship_type: VenueRelationshipType;
  membership_status: string | null;
  subscription_id: string | null;
  application_id: string | null;
  booking_entitlement: Record<string, unknown> | null;
  is_linked_junior: boolean;
  is_authorised_manager: boolean;
  location_summary: string | null;
  court_count: number;
  guest_booking_available: boolean;
  published_memberships_available: boolean;
  discovery_visibility: VenueCardData["discoveryVisibility"];
  public_description: string | null;
  logo_url: string | null;
};

type PublicMembershipRpcRow = {
  plan_id: string;
  category_id: string;
  plan_version: number;
  plan_name: string;
  category_name: string;
  category_eligibility: string;
  minimum_age: number | null;
  maximum_age: number | null;
  description: string | null;
  base_price_cents: number;
  currency: string;
  joining_fee_cents: number;
  joining_fee_scope: string;
  duration_months: number | null;
  no_fixed_term: boolean;
  maximum_covered_members: number;
  adult_primary_required: boolean;
  booking_entitlement: Record<string, unknown> | null;
  benefits_text: string | null;
  public_benefits: string[] | null;
  terms_text: string | null;
  pricing_options: PublicMembershipPricingOption[] | null;
  addon_rules: Array<Record<string, unknown>> | null;
};

function success<T>(data: T): VenueDataResult<T> {
  return { data, error: null };
}

function failure<T>(fallback: T, event: string, error: { code?: string; message?: string } | null): VenueDataResult<T> {
  const accessDenied = error?.message?.includes("access_denied") || error?.message?.includes("profile_access_denied");
  const notFound = error?.message?.includes("not_found");
  console.error(`[venues] ${event}`, { code: error?.code ?? null });
  return {
    data: fallback,
    error: {
      code: error?.code ?? null,
      kind: accessDenied ? "access_denied" : notFound ? "not_found" : "query_failed",
      message: accessDenied
        ? "You do not have access to this club for the selected profile."
        : notFound
          ? "This club could not be found."
          : "Club information could not be loaded right now."
    }
  };
}

function mapVenueRow(row: VenueRpcRow): VenueCardData {
  return {
    courtCount: row.court_count,
    discoveryVisibility: row.discovery_visibility,
    guestBookingAvailable: row.guest_booking_available,
    locationSummary: row.location_summary,
    logoUrl: row.logo_url,
    publicDescription: row.public_description,
    publishedMembershipsAvailable: row.published_memberships_available,
    relationship: {
      applicationId: row.application_id,
      bookingEntitlement: row.booking_entitlement ?? {},
      isAuthorisedManager: row.is_authorised_manager,
      isLinkedJunior: row.is_linked_junior,
      membershipStatus: row.membership_status,
      relationshipType: row.relationship_type,
      subscriptionId: row.subscription_id
    },
    venueId: row.venue_id,
    venueName: row.venue_name,
    venueSlug: row.venue_slug
  };
}

export function profileDisplayName(profile: Pick<Profile, "first_name" | "last_name">) {
  return `${profile.first_name} ${profile.last_name}`;
}

export function venueRelationshipLabel(type: VenueRelationshipType) {
  const labels: Record<VenueRelationshipType, string> = {
    former_member: "Former Member",
    guest: "Guest",
    member: "Member",
    pending: "Application Pending"
  };
  return labels[type];
}

export function venueRelationshipChip(type: VenueRelationshipType) {
  if (type === "member") return "ui-chip-success";
  if (type === "pending") return "ui-chip-warning";
  if (type === "former_member") return "ui-chip-muted";
  return "ui-chip-brand";
}

export function bookingEligibilityMessage(reason: string) {
  const messages: Record<string, string> = {
    availability_after_approval: "Court availability is shown after the club approves guest access.",
    booking_rules_invalid: "The club's booking rules need attention before bookings can open.",
    booking_rules_unavailable: "Court booking rules have not been configured yet.",
    guest_approval_required: "Guest bookings require club approval before a court can be reserved.",
    guest_booking_disabled: "Guest bookings are not available at this club.",
    member_booking_disabled: "Member court bookings are currently paused at this club.",
    venue_access_denied: "This club is not available for the selected profile."
  };
  return messages[reason] ?? "Court booking is not available for the selected profile right now.";
}

export async function loadManagedVenueProfiles(supabase: ServerSupabase, userId: string): Promise<VenueDataResult<ManagedVenueProfile[]>> {
  const { data: adultData, error: adultError } = await supabase
    .from("profiles")
    .select("id,first_name,last_name,is_junior,email,phone")
    .eq("user_id", userId)
    .eq("is_junior", false)
    .maybeSingle();
  if (adultError) return failure([], "profiles_load_failed", adultError);
  const adult = adultData as ManagedVenueProfile | null;
  if (!adult) return success([]);
  const { data: juniorData, error: juniorError } = await supabase
    .from("profiles")
    .select("id,first_name,last_name,is_junior,email,phone")
    .eq("parent_profile_id", adult.id)
    .eq("is_junior", true)
    .order("first_name");
  if (juniorError) return failure([adult], "junior_profiles_load_failed", juniorError);
  return success([adult, ...((juniorData ?? []) as ManagedVenueProfile[])]);
}

export function selectManagedVenueProfile(profiles: ManagedVenueProfile[], requestedProfileId?: string | null) {
  return profiles.find((profile) => profile.id === requestedProfileId) ?? profiles[0] ?? null;
}

export async function loadMyVenues(supabase: ServerSupabase, profileId: string): Promise<VenueDataResult<VenueCardData[]>> {
  const { data, error } = await supabase.rpc("playr_profile_venues", { p_profile_id: profileId });
  return error ? failure([], "my_venues_load_failed", error) : success(((data ?? []) as VenueRpcRow[]).map(mapVenueRow));
}

export async function discoverVenues(supabase: ServerSupabase, profileId: string, search?: string): Promise<VenueDataResult<VenueCardData[]>> {
  const { data, error } = await supabase.rpc("playr_discover_venues", {
    p_profile_id: profileId,
    p_search: search?.trim() || null
  });
  return error ? failure([], "venue_discovery_failed", error) : success(((data ?? []) as VenueRpcRow[]).map(mapVenueRow));
}

export async function loadVenuePage(supabase: ServerSupabase, venueId: string, profileId: string): Promise<VenueDataResult<VenuePageData | null>> {
  const { data, error } = await supabase.rpc("playr_venue_page", { p_profile_id: profileId, p_venue_id: venueId });
  return error ? failure(null, "venue_page_load_failed", error) : success((data ?? null) as VenuePageData | null);
}

export async function loadPublicMembershipPlans(supabase: ServerSupabase, venueId: string, profileId: string): Promise<VenueDataResult<PublicMembershipPlan[]>> {
  const { data, error } = await supabase.rpc("playr_public_membership_catalog", { p_profile_id: profileId, p_venue_id: venueId });
  if (error) return failure([], "public_membership_catalog_failed", error);
  return success(((data ?? []) as PublicMembershipRpcRow[]).map((row) => ({
    addonRules: row.addon_rules ?? [],
    adultPrimaryRequired: row.adult_primary_required,
    basePriceCents: row.base_price_cents,
    benefitsText: row.benefits_text,
    bookingEntitlement: row.booking_entitlement ?? {},
    categoryEligibility: row.category_eligibility,
    categoryId: row.category_id,
    categoryName: row.category_name,
    currency: row.currency,
    description: row.description,
    durationMonths: row.duration_months,
    joiningFeeCents: row.joining_fee_cents,
    joiningFeeScope: row.joining_fee_scope,
    maximumCoveredMembers: row.maximum_covered_members,
    maximumAge: row.maximum_age,
    minimumAge: row.minimum_age,
    noFixedTerm: row.no_fixed_term,
    planId: row.plan_id,
    planName: row.plan_name,
    planVersion: row.plan_version,
    pricingOptions: row.pricing_options ?? [],
    publicBenefits: row.public_benefits ?? [],
    termsText: row.terms_text
  })));
}

export async function loadPublicVenueNotices(supabase: ServerSupabase, venueId: string, profileId: string): Promise<VenueDataResult<PublicVenueNotice[]>> {
  const { data, error } = await supabase.rpc("playr_public_notices", { p_profile_id: profileId, p_venue_id: venueId });
  if (error) return failure([], "public_notices_load_failed", error);
  return success(((data ?? []) as Array<{ notice_id: string; title: string; message: string; category: string; starts_at: string | null; ends_at: string | null }>).map((notice) => ({
    category: notice.category,
    endsAt: notice.ends_at,
    message: notice.message,
    noticeId: notice.notice_id,
    startsAt: notice.starts_at,
    title: notice.title
  })));
}

export async function loadVenueBookingEligibility(supabase: ServerSupabase, venueId: string, profileId: string): Promise<VenueDataResult<VenueBookingEligibility | null>> {
  const { data, error } = await supabase.rpc("playr_venue_booking_eligibility", { p_profile_id: profileId, p_venue_id: venueId });
  return error ? failure(null, "booking_eligibility_failed", error) : success((data ?? null) as VenueBookingEligibility | null);
}
