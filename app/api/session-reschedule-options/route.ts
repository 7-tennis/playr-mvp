import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const occurrenceId = url.searchParams.get("occurrenceId") ?? "";
  const date = url.searchParams.get("date") ?? "";
  const startTimeValue = url.searchParams.get("startTime");
  const durationValue = Number.parseInt(url.searchParams.get("duration") ?? "", 10);

  if (!uuidPattern.test(occurrenceId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "invalid_request", options: [] }, { status: 400 });
  }
  if (!Number.isInteger(durationValue) || durationValue < 5 || durationValue > 480) {
    return NextResponse.json({ error: "invalid_duration", options: [] }, { status: 400 });
  }

  const startTime = startTimeValue ? new Date(startTimeValue) : null;
  if (startTimeValue && (!startTime || Number.isNaN(startTime.getTime()))) {
    return NextResponse.json({ error: "invalid_time", options: [] }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "access", options: [] }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("coachr_session_available_options", {
    p_date: date,
    p_duration_minutes: durationValue,
    p_occurrence_id: occurrenceId,
    p_start_time: startTime?.toISOString() ?? null
  });

  if (error) {
    console.error("Session reschedule availability failed", {
      code: error.code,
      occurrenceId,
      userId: user.id
    });
    return NextResponse.json({ error: "availability_failed", options: [] }, { status: error.message === "access" ? 403 : 400 });
  }

  return NextResponse.json({ options: data ?? [] });
}
