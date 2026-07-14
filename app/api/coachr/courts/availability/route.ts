import { NextResponse } from "next/server";
import { resolveCourtReadiness } from "@/lib/court-readiness";
import { getPermissionContext } from "@/lib/permissions";

function uuid(value: string | null) {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

export async function GET(request: Request) {
  const context = await getPermissionContext();
  if (context.kind !== "authenticated") return NextResponse.json({ error: "access" }, { status: 401 });

  const url = new URL(request.url);
  const organisationId = uuid(url.searchParams.get("organisation"));
  const lessonId = uuid(url.searchParams.get("lesson"));
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  if (!organisationId || !start || !end || new Date(end).getTime() <= new Date(start).getTime()) {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 });
  }
  if (context.role !== "platform_admin" && organisationId !== context.venueId) {
    return NextResponse.json({ error: "access" }, { status: 403 });
  }

  const { data: authorised, error } = await context.supabase.rpc("coachr_authorised_courts", { p_organisation_id: organisationId });
  if (error) return NextResponse.json({ error: "availability_failed" }, { status: 500 });

  const ownerIds = Array.from(new Set(((authorised ?? []) as { owner_venue_id: string }[]).map((court) => court.owner_venue_id)));
  const readiness = await Promise.all(ownerIds.map((ownerVenueId) => resolveCourtReadiness({
    academyVenueId: organisationId,
    endTime: end,
    excludeLessonId: lessonId,
    ownerVenueId,
    startTime: start,
    supabase: context.supabase
  })));
  const courts = readiness.flatMap((result) => result.available_courts);

  return NextResponse.json({
    courts,
    readiness: readiness.map((result) => ({ next_action: result.next_action, reason: result.reason, status: result.status }))
  });
}
