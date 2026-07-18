"use client";

import { useMemo, useState } from "react";
import { ChevronDownIcon } from "@/components/playr-icons";
import type { SessionAvailabilityOption } from "@/lib/coach-session-requests";
import { cancelCoachLesson } from "@/app/dashboard/coachr/actions";
import {
  cancelCoachSessionOccurrence,
  moveCoachSessionOccurrence
} from "@/app/dashboard/coachr/sessions/actions";

const TIME_ZONE = "Africa/Johannesburg";

function datePart(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: TIME_ZONE,
    year: "numeric"
  })
    .formatToParts(new Date(value))
    .reduce<Record<string, string>>((parts, part) => {
      parts[part.type] = part.value;
      return parts;
    }, {});
}

function dateInputValue(value: string) {
  const parts = datePart(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function timeInputValue(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: TIME_ZONE
  }).format(new Date(value));
}

function isoFor(date: string, time: string) {
  const parsed = new Date(`${date}T${time}:00+02:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function addMinutes(value: string, minutes: number) {
  return new Date(new Date(value).getTime() + minutes * 60_000).toISOString();
}

function sessionDate(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "full",
    timeZone: TIME_ZONE
  }).format(new Date(value));
}

function timeRange(start: string, end: string) {
  return `${timeInputValue(start)}-${timeInputValue(end)}`;
}

type CoachSessionOccurrenceActionsProps = {
  courtsLabel: string;
  durationMinutes: number;
  isRecurring: boolean;
  occurrenceId: string;
  participantCount: number;
  pendingRequest: boolean;
  currentBooked?: boolean;
  returnTo: string;
  sessionName: string;
  startTime: string;
  endTime: string;
  supersedesRequestId?: string | null;
};

export function CoachSessionOccurrenceActions({
  courtsLabel,
  durationMinutes,
  isRecurring,
  occurrenceId,
  participantCount,
  pendingRequest,
  currentBooked = true,
  returnTo,
  sessionName,
  startTime,
  endTime,
  supersedesRequestId = null
}: CoachSessionOccurrenceActionsProps) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelScope, setCancelScope] = useState<"single" | "future" | "through">("single");
  const [moveOpen, setMoveOpen] = useState(Boolean(supersedesRequestId));
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [proposedDate, setProposedDate] = useState(dateInputValue(startTime));
  const [proposedTime, setProposedTime] = useState(timeInputValue(startTime));
  const [duration, setDuration] = useState(durationMinutes);
  const [options, setOptions] = useState<SessionAvailabilityOption[]>([]);
  const [selectedOption, setSelectedOption] = useState<SessionAvailabilityOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const proposedStart = useMemo(() => isoFor(proposedDate, proposedTime), [proposedDate, proposedTime]);

  async function findCourts() {
    if (!proposedStart) {
      setAvailabilityError("Choose a valid date and start time.");
      return;
    }
    setLoading(true);
    setAvailabilityError(null);
    setSelectedOption(null);
    try {
      const params = new URLSearchParams({
        date: proposedDate,
        duration: String(duration),
        occurrenceId,
        startTime: proposedStart
      });
      const response = await fetch(`/api/session-reschedule-options?${params.toString()}`, { cache: "no-store" });
      const result = (await response.json()) as { options?: SessionAvailabilityOption[] };
      if (!response.ok) throw new Error("availability_failed");
      setOptions(result.options ?? []);
      setStep(2);
    } catch {
      setOptions([]);
      setAvailabilityError("Available times could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 grid gap-3">
      <section className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-black text-court-navy">Move Session</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{currentBooked ? "Propose a time. The current court stays booked until approval." : "Propose another time. A court is reserved only after approval."}</p>
          </div>
          {pendingRequest ? <span className="ui-chip ui-chip-warning">Request pending</span> : null}
        </div>
        {participantCount !== 1 ? (
          <p className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-600">
            Approval-based moves are currently available for one-player sessions. Multi-player consent remains unchanged in this phase.
          </p>
        ) : pendingRequest && !supersedesRequestId ? (
          <p className="mt-3 text-sm font-semibold text-slate-600">Resolve or supersede the current request before proposing another time.</p>
        ) : !moveOpen ? (
          <button className="btn-secondary mt-3 w-full" onClick={() => setMoveOpen(true)} type="button">Propose New Time</button>
        ) : (
          <div className="mt-3">
            {step === 1 ? (
              <div className="grid gap-3">
                <div className="rounded bg-slate-50 p-3 text-sm">
                  <p className="font-black text-court-navy">Current session</p>
                  <p className="mt-1 font-semibold text-slate-600">{sessionDate(startTime)} · {timeRange(startTime, endTime)}</p>
                  <p className="mt-1 text-slate-500">{courtsLabel}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-sm font-bold text-slate-700">Date<input className="mt-1 w-full rounded border border-slate-300 px-3 py-2 focus-ring" min={dateInputValue(new Date().toISOString())} onChange={(event) => setProposedDate(event.target.value)} type="date" value={proposedDate} /></label>
                  <label className="text-sm font-bold text-slate-700">Start time<input className="mt-1 w-full rounded border border-slate-300 px-3 py-2 focus-ring" onChange={(event) => setProposedTime(event.target.value)} type="time" value={proposedTime} /></label>
                  <label className="text-sm font-bold text-slate-700">Duration<select className="mt-1 w-full rounded border border-slate-300 px-3 py-2 focus-ring" onChange={(event) => setDuration(Number(event.target.value))} value={duration}>{Array.from(new Set([30, 45, 60, 90, durationMinutes])).sort((a, b) => a - b).map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}</select></label>
                </div>
                {availabilityError ? <p className="rounded border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{availabilityError}</p> : null}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button className="btn-primary flex-1" disabled={loading} onClick={findCourts} type="button">{loading ? "Finding Courts..." : "Find Available Courts"}</button>
                  <button className="btn-secondary" onClick={() => setMoveOpen(false)} type="button">Close</button>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="grid gap-3">
                <div><p className="font-black text-court-navy">Available Options</p><p className="mt-1 text-xs font-semibold text-slate-500">Only conflict-free courts are shown.</p></div>
                {options.length > 0 ? options.map((option) => (
                  <button className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-court-teal/35 bg-court-mist p-3 text-left transition hover:border-court-teal" key={`${option.court_id}:${option.start_time}`} onClick={() => { setSelectedOption(option); setStep(3); }} type="button">
                    <span><span className="block font-black text-court-navy">{timeRange(option.start_time, option.end_time)} · {option.court_name}</span><span className="mt-1 block text-xs font-semibold text-slate-500">{option.venue_name}</span></span>
                    <span className="ui-chip ui-chip-success">Available</span>
                  </button>
                )) : (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-600">No courts are available at this time. Choose another time.</div>
                )}
                <button className="btn-secondary" onClick={() => setStep(1)} type="button">Change Time</button>
              </div>
            ) : null}

            {step === 3 && selectedOption ? (
              <form action={moveCoachSessionOccurrence} className="grid gap-3">
                <input name="occurrenceId" type="hidden" value={occurrenceId} />
                <input name="returnTo" type="hidden" value={returnTo} />
                <input name="startTime" type="hidden" value={selectedOption.start_time} />
                <input name="endTime" type="hidden" value={selectedOption.end_time} />
                <input name="courtId" type="hidden" value={selectedOption.court_id} />
                {supersedesRequestId ? <input name="supersedesRequestId" type="hidden" value={supersedesRequestId} /> : null}
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded bg-slate-50 p-3"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Current</p><p className="mt-1 font-black text-court-navy">{sessionDate(startTime)}</p><p className="text-sm text-slate-600">{timeRange(startTime, endTime)} · {courtsLabel}</p></div>
                  <div className="rounded border border-court-teal/30 bg-court-mist p-3"><p className="text-xs font-black uppercase tracking-wide text-court-teal">Proposed</p><p className="mt-1 font-black text-court-navy">{sessionDate(selectedOption.start_time)}</p><p className="text-sm text-slate-600">{timeRange(selectedOption.start_time, selectedOption.end_time)} · {selectedOption.court_name}</p></div>
                </div>
                <details className="ui-collapsible rounded border border-slate-200 p-3"><summary className="flex cursor-pointer items-center justify-between text-sm font-black text-court-navy"><span>Add message</span><ChevronDownIcon className="ui-collapsible-chevron" size={16} /></summary><textarea className="mt-3 min-h-20 w-full rounded border border-slate-300 px-3 py-2 text-sm focus-ring" maxLength={1000} name="message" /></details>
                <p className="rounded border border-court-teal/25 bg-court-mist p-3 text-xs font-semibold leading-5 text-court-navy">{currentBooked ? "The current session remains booked until the parent or adult accepts." : "No court is held while this proposal is pending."} Availability is checked again at confirmation.</p>
                <div className="flex flex-col gap-2 sm:flex-row"><button className="btn-primary flex-1" type="submit">Send Move Request</button><button className="btn-secondary" onClick={() => setStep(2)} type="button">Back</button></div>
              </form>
            ) : null}
          </div>
        )}
      </section>

      {currentBooked ? <section className="rounded-lg border border-amber-200 bg-amber-50 p-3">
        {!cancelOpen ? (
          <button className="w-full rounded bg-amber-700 px-3 py-3 text-sm font-black text-white" onClick={() => setCancelOpen(true)} type="button">Cancel Session</button>
        ) : (
          <form action={cancelCoachSessionOccurrence} className="grid gap-3">
            <input name="confirmCancellation" type="hidden" value="confirmed" />
            <input name="occurrenceId" type="hidden" value={occurrenceId} />
            <input name="returnTo" type="hidden" value={returnTo} />
            <div><p className="font-black text-amber-950">Cancel this session?</p><p className="mt-1 text-sm font-semibold text-amber-900">{sessionName} · {sessionDate(startTime)} · {timeRange(startTime, endTime)}</p><p className="mt-2 text-sm text-amber-900">Cancelling releases {courtsLabel} for other bookings. Session history is preserved.</p></div>
            {isRecurring ? (
              <fieldset className="grid gap-2"><legend className="text-sm font-black text-amber-950">Apply to</legend>{([
                ["single", "This session only", "Future sessions stay booked."],
                ["future", "This and future sessions", "Ends the series from this occurrence."],
                ["through", "End series on a chosen date", "Keeps sessions through the selected date."]
              ] as const).map(([scope, label, helper]) => <label className={`cursor-pointer rounded border p-3 ${cancelScope === scope ? "border-amber-600 bg-white" : "border-amber-200 bg-amber-50"}`} key={scope}><span className="flex gap-2"><input checked={cancelScope === scope} name="scope" onChange={() => setCancelScope(scope)} type="radio" value={scope} /><span><span className="block text-sm font-black text-amber-950">{label}</span><span className="mt-1 block text-xs font-semibold text-amber-800">{helper}</span></span></span></label>)}</fieldset>
            ) : <input name="scope" type="hidden" value="single" />}
            {cancelScope === "through" ? <label className="text-sm font-bold text-amber-950">Final lesson date<input className="mt-1 w-full rounded border border-amber-300 bg-white px-3 py-2 focus-ring" name="endDate" required type="date" /></label> : null}
            <details className="ui-collapsible rounded border border-amber-200 bg-white p-3"><summary className="flex cursor-pointer items-center justify-between text-sm font-black text-amber-950"><span>Add cancellation message</span><ChevronDownIcon className="ui-collapsible-chevron" size={16} /></summary><textarea className="mt-3 min-h-20 w-full rounded border border-amber-300 px-3 py-2 text-sm focus-ring" maxLength={1000} name="reason" /></details>
            <div className="flex flex-col gap-2 sm:flex-row"><button className="rounded bg-amber-700 px-3 py-3 text-sm font-black text-white sm:flex-1" type="submit">Confirm Cancellation</button><button className="rounded border border-amber-300 bg-white px-3 py-3 text-sm font-black text-amber-900" onClick={() => setCancelOpen(false)} type="button">Keep Session</button></div>
          </form>
        )}
      </section> : null}
    </div>
  );
}

export function LegacyLessonCancellationCard({
  courtLabel,
  endTime,
  isRecurring,
  lessonId,
  returnTo,
  startTime,
  title
}: {
  courtLabel: string;
  endTime: string;
  isRecurring: boolean;
  lessonId: string;
  returnTo: string;
  startTime: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"single" | "future">("single");

  return (
    <section className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
      {!open ? <button className="w-full rounded bg-amber-700 px-3 py-3 text-sm font-black text-white" onClick={() => setOpen(true)} type="button">Cancel Lesson</button> : (
        <form action={cancelCoachLesson} className="grid gap-3">
          <input name="confirmCancellation" type="hidden" value="confirmed" />
          <input name="lessonId" type="hidden" value={lessonId} />
          <input name="returnTo" type="hidden" value={returnTo} />
          <div><p className="font-black text-amber-950">Cancel this lesson?</p><p className="mt-1 text-sm font-semibold text-amber-900">{title} · {sessionDate(startTime)} · {timeRange(startTime, endTime)}</p><p className="mt-2 text-sm text-amber-900">The linked {courtLabel} will be released. Lesson history remains available.</p></div>
          {isRecurring ? <label className="text-sm font-bold text-amber-950">Apply to<select className="mt-1 w-full rounded border border-amber-300 bg-white px-3 py-2 focus-ring" name="cancelScope" onChange={(event) => setScope(event.target.value as "single" | "future")} value={scope}><option value="single">This lesson only</option><option value="future">This and future lessons</option></select></label> : <input name="cancelScope" type="hidden" value="single" />}
          <label className="text-sm font-bold text-amber-950">Reason<select className="mt-1 w-full rounded border border-amber-300 bg-white px-3 py-2 focus-ring" name="cancelStatus"><option value="cancelled">Cancelled</option><option value="rain">Rain</option><option value="sick">Sick</option></select></label>
          {isRecurring && scope === "future" ? <label className="text-sm font-bold text-amber-950">Optional final lesson date<input className="mt-1 w-full rounded border border-amber-300 bg-white px-3 py-2 focus-ring" name="effectiveEndDate" type="date" /></label> : null}
          <div className="flex flex-col gap-2 sm:flex-row"><button className="rounded bg-amber-700 px-3 py-3 text-sm font-black text-white sm:flex-1" type="submit">Confirm Cancellation</button><button className="rounded border border-amber-300 bg-white px-3 py-3 text-sm font-black text-amber-900" onClick={() => setOpen(false)} type="button">Keep Lesson</button></div>
        </form>
      )}
    </section>
  );
}
