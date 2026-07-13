import { NextResponse } from "next/server";
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

  const { data, error } = await context.supabase.rpc("coachr_available_courts", {
    p_end_time: end,
    p_exclude_lesson_id: lessonId,
    p_organisation_id: organisationId,
    p_start_time: start
  });

  if (error) {
    console.error("CoachR court availability failed", { code: error.code, organisationId });
    return NextResponse.json({ error: "availability_failed" }, { status: 500 });
  }

  return NextResponse.json({ courts: data ?? [] });
}
