import type { CourtAccessReadinessStatus } from "@/types/courtside";
import type { createServerSupabaseClient } from "@/utils/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export type CourtReadinessCourt = {
  available: boolean;
  court_id: string;
  court_name: string;
  owner_venue_id: string;
  owner_venue_name: string;
};

export type CourtReadinessResult = {
  status: CourtAccessReadinessStatus;
  reason: string;
  next_action: string;
  available_courts: CourtReadinessCourt[];
};

export async function resolveCourtReadiness({
  academyVenueId,
  endTime = null,
  excludeLessonId = null,
  ownerVenueId,
  startTime = null,
  supabase
}: {
  academyVenueId: string;
  endTime?: string | null;
  excludeLessonId?: string | null;
  ownerVenueId: string;
  startTime?: string | null;
  supabase: ServerSupabaseClient;
}): Promise<CourtReadinessResult> {
  const { data, error } = await supabase.rpc("coachr_resolve_court_readiness", {
    p_academy_venue_id: academyVenueId,
    p_end_time: endTime,
    p_exclude_lesson_id: excludeLessonId,
    p_owner_venue_id: ownerVenueId,
    p_start_time: startTime
  });

  if (error) {
    console.warn("[coachr-court-readiness]", { code: error.code, academyVenueId, ownerVenueId });
    return {
      available_courts: [],
      next_action: "Review coaching venues",
      reason: "Court readiness could not be checked.",
      status: "invalid_context"
    };
  }

  const row = (data?.[0] ?? null) as {
    available_courts?: CourtReadinessCourt[];
    next_action?: string;
    reason?: string;
    status?: CourtAccessReadinessStatus;
  } | null;

  return {
    available_courts: row?.available_courts ?? [],
    next_action: row?.next_action ?? "Review coaching venues",
    reason: row?.reason ?? "Court access has not been configured.",
    status: row?.status ?? "invalid_context"
  };
}
