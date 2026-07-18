"use client";

import { useState } from "react";
import { BookingIcon, ChevronDownIcon, StatusIcon, TimeIcon } from "@/components/playr-icons";
import {
  createMakeupSessionRequest,
  respondToSessionRequest
} from "@/app/dashboard/session-requests/actions";
import type {
  CoachSessionRequestWithRelations,
  PrivatePlayerSessionActivity,
  SessionAvailabilityOption
} from "@/lib/coach-session-requests";

const TIME_ZONE = "Africa/Johannesburg";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "full", timeZone: TIME_ZONE }).format(new Date(value));
}

function shortDateLabel(value: string) {
  return new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", weekday: "short", timeZone: TIME_ZONE }).format(new Date(value));
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("en-ZA", { hour: "2-digit", hourCycle: "h23", minute: "2-digit", timeZone: TIME_ZONE }).format(new Date(value));
}

function timeRange(start: string, end: string) {
  return `${timeLabel(start)}-${timeLabel(end)}`;
}

function dateInput(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: TIME_ZONE, year: "numeric" }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function requestTitle(request: CoachSessionRequestWithRelations, viewer: "coach" | "player") {
  if (request.status === "approved") return "Lesson Confirmed";
  if (request.status === "declined") return "Request Declined";
  if (request.status === "failed") return "Choose Another Time";
  if (request.request_origin === "coach_initiated") return "Move Requested";
  return viewer === "coach" ? "Lesson Time Requested" : "Time Requested";
}

function requestStatus(request: CoachSessionRequestWithRelations) {
  switch (request.status) {
    case "pending_parent": return "Awaiting parent approval";
    case "pending_player": return "Awaiting player approval";
    case "pending_coach": return "Awaiting coach approval";
    case "approved": return "Confirmed";
    case "declined": return "Declined";
    case "failed": return "Time no longer available";
    case "superseded": return "Replaced by a newer request";
    case "expired": return "Expired";
    default: return "Draft";
  }
}

function requestTone(request: CoachSessionRequestWithRelations) {
  if (request.status === "approved") return "ui-chip-success";
  if (request.status === "declined" || request.status === "failed") return "ui-chip-warning";
  if (request.status === "superseded" || request.status === "expired") return "ui-chip-muted";
  return "ui-chip-brand";
}

export function SessionRequestCard({
  compact = false,
  request,
  returnTo,
  viewer
}: {
  compact?: boolean;
  request: CoachSessionRequestWithRelations;
  returnTo: string;
  viewer: "coach" | "player";
}) {
  const [responseMode, setResponseMode] = useState<"approve" | "decline" | null>(null);
  const canRespond = viewer === "coach"
    ? request.status === "pending_coach"
    : request.status === "pending_parent" || request.status === "pending_player";
  const currentCourt = request.current_court_names.join(", ") || "Original court";
  const proposedCourt = request.proposed_court?.name ?? "Court to be confirmed";

  return (
    <article className="rounded-lg border border-court-teal/25 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-black text-court-navy">{requestTitle(request, viewer)}</p>
          <p className="mt-1 text-sm font-semibold text-slate-600">{request.player ? `${request.player.first_name} ${request.player.last_name}` : "Player"} · {request.occurrence?.session?.name ?? "Coaching session"}</p>
        </div>
        <span className={`ui-chip ${requestTone(request)}`}>{requestStatus(request)}</span>
      </div>

      <div className={`mt-3 grid gap-2 ${compact ? "" : "sm:grid-cols-2"}`}>
        {request.request_origin === "coach_initiated" ? (
          <div className="rounded bg-slate-50 p-3 text-sm"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Current</p><p className="mt-1 font-black text-court-navy">{shortDateLabel(request.current_start_time)} · {timeRange(request.current_start_time, request.current_end_time)}</p><p className="mt-1 text-slate-600">{currentCourt}</p></div>
        ) : null}
        <div className="rounded border border-court-teal/25 bg-court-mist p-3 text-sm"><p className="text-xs font-black uppercase tracking-wide text-court-teal">{request.status === "approved" ? "Confirmed" : "Proposed"}</p><p className="mt-1 font-black text-court-navy">{shortDateLabel(request.proposed_start_time)} · {timeRange(request.proposed_start_time, request.proposed_end_time)}</p><p className="mt-1 text-slate-600">{proposedCourt}{request.proposed_venue?.name ? ` · ${request.proposed_venue.name}` : ""}</p></div>
      </div>

      {request.message || request.response_message ? (
        <details className="ui-collapsible mt-3 rounded border border-slate-200 p-3"><summary className="flex cursor-pointer items-center justify-between text-sm font-black text-court-navy"><span>Details</span><ChevronDownIcon className="ui-collapsible-chevron" size={16} /></summary><div className="mt-3 grid gap-2 text-sm text-slate-600">{request.message ? <p><span className="font-black text-court-navy">Request:</span> {request.message}</p> : null}{request.response_message ? <p><span className="font-black text-court-navy">Response:</span> {request.response_message}</p> : null}</div></details>
      ) : null}

      {canRespond && !responseMode ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button className="btn-primary flex-1" onClick={() => setResponseMode("approve")} type="button">{viewer === "coach" ? "Approve" : "Accept"}</button>
          <button className="btn-secondary" onClick={() => setResponseMode("decline")} type="button">Decline</button>
        </div>
      ) : null}

      {canRespond && responseMode === "approve" ? (
        <form action={respondToSessionRequest} className="mt-3 grid gap-3 rounded-lg border border-court-teal/30 bg-court-mist p-3">
          <input name="confirmResponse" type="hidden" value="confirmed" /><input name="playerProfileId" type="hidden" value={request.player_profile_id} /><input name="requestId" type="hidden" value={request.id} /><input name="response" type="hidden" value="approve" /><input name="returnTo" type="hidden" value={returnTo} />
          <div><p className="font-black text-court-navy">Confirm new lesson time?</p><p className="mt-1 text-sm font-semibold text-slate-700">{dateLabel(request.proposed_start_time)}<br />{timeRange(request.proposed_start_time, request.proposed_end_time)} · {proposedCourt}</p><p className="mt-2 text-xs font-semibold leading-5 text-slate-600">The coach, player and court are checked again before the booking changes.</p></div>
          <div className="flex flex-col gap-2 sm:flex-row"><button className="btn-primary flex-1" type="submit">{viewer === "coach" ? "Confirm Lesson" : "Confirm Move"}</button><button className="btn-secondary" onClick={() => setResponseMode(null)} type="button">Back</button></div>
        </form>
      ) : null}

      {canRespond && responseMode === "decline" ? (
        <form action={respondToSessionRequest} className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <input name="confirmResponse" type="hidden" value="confirmed" /><input name="playerProfileId" type="hidden" value={request.player_profile_id} /><input name="requestId" type="hidden" value={request.id} /><input name="response" type="hidden" value="decline" /><input name="returnTo" type="hidden" value={returnTo} />
          <p className="font-black text-court-navy">Decline this request?</p>
          <details className="ui-collapsible rounded border border-slate-200 bg-white p-3"><summary className="flex cursor-pointer items-center justify-between text-sm font-black text-court-navy"><span>Add a short reason</span><ChevronDownIcon className="ui-collapsible-chevron" size={16} /></summary><textarea className="mt-3 min-h-20 w-full rounded border border-slate-300 px-3 py-2 text-sm focus-ring" maxLength={1000} name="message" /></details>
          <p className="text-xs font-semibold text-slate-600">{request.request_origin === "coach_initiated" ? "The original session remains booked." : "No court will be booked."}</p>
          <div className="flex flex-col gap-2 sm:flex-row"><button className="rounded bg-slate-700 px-3 py-3 text-sm font-black text-white sm:flex-1" type="submit">Confirm Decline</button><button className="btn-secondary" onClick={() => setResponseMode(null)} type="button">Back</button></div>
        </form>
      ) : null}
    </article>
  );
}

export function CancelledSessionCard({
  activity,
  existingRequest,
  playerProfileId,
  returnTo
}: {
  activity: PrivatePlayerSessionActivity;
  existingRequest: CoachSessionRequestWithRelations | null;
  playerProfileId: string;
  returnTo: string;
}) {
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(dateInput(new Date()));
  const [options, setOptions] = useState<SessionAvailabilityOption[]>([]);
  const [selectedOption, setSelectedOption] = useState<SessionAvailabilityOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const duration = Math.max(5, Math.round((new Date(activity.end_time).getTime() - new Date(activity.start_time).getTime()) / 60_000));
  const canRequest = !existingRequest || !["pending_coach", "approved"].includes(existingRequest.status);
  const nextDays = Array.from({ length: 5 }, (_, index) => new Date(Date.now() + index * 24 * 60 * 60 * 1000));

  async function loadOptions() {
    setLoading(true);
    setError(null);
    setSelectedOption(null);
    try {
      const params = new URLSearchParams({ date: selectedDate, duration: String(duration), occurrenceId: activity.occurrence_id });
      const response = await fetch(`/api/session-reschedule-options?${params.toString()}`, { cache: "no-store" });
      const result = (await response.json()) as { options?: SessionAvailabilityOption[] };
      if (!response.ok) throw new Error("availability_failed");
      setOptions(result.options ?? []);
      setLoaded(true);
    } catch {
      setError("Available times could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-black text-amber-950">Lesson Cancelled</p><p className="mt-1 text-sm font-semibold text-amber-900">{activity.session_name} · {shortDateLabel(activity.start_time)} · {timeRange(activity.start_time, activity.end_time)}</p></div><span className="ui-chip ui-chip-warning">Court released</span></div>
      <p className="mt-2 text-sm text-amber-900">{activity.court_names.join(", ") || activity.venue_name} is available to other bookings again.</p>
      {existingRequest ? <p className="mt-3 rounded border border-amber-200 bg-white p-3 text-sm font-semibold text-amber-900">{requestStatus(existingRequest)}</p> : null}
      {canRequest && !open ? <button className="mt-3 w-full rounded bg-amber-700 px-3 py-3 text-sm font-black text-white" onClick={() => setOpen(true)} type="button">Find Another Time</button> : null}
      {canRequest && open ? (
        <div className="mt-3 grid gap-3 rounded-lg border border-amber-200 bg-white p-3">
          <div><p className="font-black text-court-navy">Choose Day</p><p className="mt-1 text-xs font-semibold text-slate-500">Only privacy-safe bookable options will appear.</p></div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{nextDays.map((day) => { const value = dateInput(day); return <button className={`rounded border px-2 py-3 text-xs font-black ${selectedDate === value ? "border-court-teal bg-court-mist text-court-navy" : "border-slate-200 text-slate-600"}`} key={value} onClick={() => { setSelectedDate(value); setLoaded(false); setSelectedOption(null); }} type="button">{shortDateLabel(day.toISOString())}</button>; })}</div>
          <label className="text-sm font-bold text-slate-700">Date<input className="mt-1 w-full rounded border border-slate-300 px-3 py-2 focus-ring" min={dateInput(new Date())} onChange={(event) => { setSelectedDate(event.target.value); setLoaded(false); setSelectedOption(null); }} type="date" value={selectedDate} /></label>
          {!loaded ? <button className="btn-primary" disabled={loading} onClick={loadOptions} type="button">{loading ? "Loading Times..." : "Show Available Times"}</button> : null}
          {error ? <p className="rounded border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p> : null}
          {loaded && options.length === 0 ? <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-600">No courts are available on this day. Choose another day.</div> : null}
          {loaded && !selectedOption && options.length > 0 ? <div className="grid max-h-80 gap-2 overflow-y-auto pr-1"><p className="text-sm font-black text-court-navy">Available Times</p>{options.map((option) => <button className="flex min-h-14 items-center justify-between rounded border border-court-teal/30 bg-court-mist p-3 text-left" key={`${option.court_id}:${option.start_time}`} onClick={() => setSelectedOption(option)} type="button"><span><span className="block font-black text-court-navy">{timeRange(option.start_time, option.end_time)} · {option.court_name}</span><span className="mt-1 block text-xs font-semibold text-slate-500">{option.venue_name}</span></span><span className="ui-chip ui-chip-success">Available</span></button>)}</div> : null}
          {selectedOption ? <form action={createMakeupSessionRequest} className="grid gap-3"><input name="courtId" type="hidden" value={selectedOption.court_id} /><input name="endTime" type="hidden" value={selectedOption.end_time} /><input name="occurrenceId" type="hidden" value={activity.occurrence_id} /><input name="playerProfileId" type="hidden" value={playerProfileId} /><input name="returnTo" type="hidden" value={returnTo} /><input name="startTime" type="hidden" value={selectedOption.start_time} /><div className="rounded border border-court-teal/30 bg-court-mist p-3"><p className="text-xs font-black uppercase tracking-wide text-court-teal">Request Lesson Time</p><p className="mt-1 font-black text-court-navy">{dateLabel(selectedOption.start_time)}</p><p className="mt-1 text-sm font-semibold text-slate-700">{timeRange(selectedOption.start_time, selectedOption.end_time)} · {selectedOption.court_name}</p><p className="mt-2 text-xs font-semibold text-slate-600">The court is booked only after the coach approves.</p></div><details className="ui-collapsible rounded border border-slate-200 p-3"><summary className="flex cursor-pointer items-center justify-between text-sm font-black text-court-navy"><span>Add message</span><ChevronDownIcon className="ui-collapsible-chevron" size={16} /></summary><textarea className="mt-3 min-h-20 w-full rounded border border-slate-300 px-3 py-2 text-sm focus-ring" maxLength={1000} name="message" /></details><div className="flex flex-col gap-2 sm:flex-row"><button className="btn-primary flex-1" type="submit">Send Request</button><button className="btn-secondary" onClick={() => setSelectedOption(null)} type="button">Back</button></div></form> : null}
          <button className="text-sm font-black text-slate-600" onClick={() => setOpen(false)} type="button">Close</button>
        </div>
      ) : null}
      <details className="ui-collapsible mt-3 border-t border-amber-200 pt-3"><summary className="flex cursor-pointer items-center justify-between text-sm font-black text-amber-950"><span>Cancellation details</span><ChevronDownIcon className="ui-collapsible-chevron" size={16} /></summary><div className="mt-2 grid gap-1 text-sm text-amber-900"><p><TimeIcon className="mr-2 inline" size={14} />{dateLabel(activity.start_time)} · {timeRange(activity.start_time, activity.end_time)}</p><p><BookingIcon className="mr-2 inline" size={14} />{activity.court_names.join(", ") || "Court not recorded"}</p>{activity.cancellation_reason ? <p><StatusIcon className="mr-2 inline" size={14} />{activity.cancellation_reason}</p> : null}</div></details>
    </article>
  );
}
