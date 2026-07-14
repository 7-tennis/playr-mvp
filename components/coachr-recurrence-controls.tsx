"use client";

import { useMemo, useState } from "react";
import { EventIcon, TimeIcon } from "@/components/playr-icons";

type RepeatMode = "none" | "weekly";
type EndMode = "until_cancelled" | "until_date" | "occurrence_count";

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function CoachRRecurrenceControls({
  defaultDayOfWeek,
  defaultOneOffEnd,
  defaultOneOffStart,
  defaultRecurrenceEndDate,
  defaultRecurrenceStartDate,
  defaultRepeatMode,
  defaultWeeklyEndTime,
  defaultWeeklyStartTime
}: {
  defaultDayOfWeek: number;
  defaultOneOffEnd: string;
  defaultOneOffStart: string;
  defaultRecurrenceEndDate: string;
  defaultRecurrenceStartDate: string;
  defaultRepeatMode: RepeatMode;
  defaultWeeklyEndTime: string;
  defaultWeeklyStartTime: string;
}) {
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(defaultRepeatMode);
  const [endMode, setEndMode] = useState<EndMode>("until_cancelled");
  const [startDate, setStartDate] = useState(defaultRecurrenceStartDate);
  const [dayOfWeek, setDayOfWeek] = useState(defaultDayOfWeek);
  const [startTime, setStartTime] = useState(defaultWeeklyStartTime);
  const [endTime, setEndTime] = useState(defaultWeeklyEndTime);

  const summary = useMemo(() => {
    if (repeatMode === "none") return "One lesson on the selected date and time.";
    const continuation = endMode === "until_cancelled"
      ? "Continues until cancelled"
      : endMode === "until_date"
        ? "Continues until the selected date"
        : "Continues for the selected number of lessons";
    return `Every ${weekdays[dayOfWeek - 1] ?? "week"} at ${startTime}-${endTime}. Starts ${startDate}. ${continuation}.`;
  }, [dayOfWeek, endMode, endTime, repeatMode, startDate, startTime]);

  return (
    <div className="grid gap-3">
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-black text-court-navy">Lesson plan</legend>
        <label className={`rounded-lg border p-3 text-sm font-semibold text-court-navy ${repeatMode === "none" ? "border-court-teal bg-court-mist" : "border-slate-200 bg-white"}`}>
          <input checked={repeatMode === "none"} className="mr-2" name="repeatMode" onChange={() => setRepeatMode("none")} type="radio" value="none" />
          Once-off lesson
          <span className="mt-1 block text-xs font-normal leading-5 text-slate-600">Choose one date and time.</span>
        </label>
        <label className={`rounded-lg border p-3 text-sm font-semibold text-court-navy ${repeatMode === "weekly" ? "border-court-teal bg-court-mist" : "border-slate-200 bg-white"}`}>
          <input checked={repeatMode === "weekly"} className="mr-2" name="repeatMode" onChange={() => setRepeatMode("weekly")} type="radio" value="weekly" />
          Weekly lesson
          <span className="mt-1 block text-xs font-normal leading-5 text-slate-600">Ongoing by default, with a rolling schedule.</span>
        </label>
      </fieldset>

      {repeatMode === "none" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">
            Start
            <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={defaultOneOffStart} name="startTime" required type="datetime-local" />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            End
            <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={defaultOneOffEnd} name="endTime" required type="datetime-local" />
          </label>
        </div>
      ) : (
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-court-mist text-court-teal"><EventIcon size={17} /></span>
            <div>
              <p className="text-sm font-black text-court-navy">Weekly schedule</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">PlayR reserves each generated managed-court occurrence. The rolling window stays bounded.</p>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-semibold text-slate-700">
              Starts
              <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="recurrenceStartDate" onChange={(event) => setStartDate(event.target.value)} required type="date" value={startDate} />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Day
              <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="dayOfWeek" onChange={(event) => setDayOfWeek(Number(event.target.value))} value={dayOfWeek}>
                {weekdays.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Start time
              <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="lessonStartTime" onChange={(event) => setStartTime(event.target.value)} required type="time" value={startTime} />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              End time
              <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="lessonEndTime" onChange={(event) => setEndTime(event.target.value)} required type="time" value={endTime} />
            </label>
          </div>

          <fieldset className="mt-4 grid gap-2 sm:grid-cols-3">
            <legend className="mb-2 text-sm font-black text-court-navy">Continues</legend>
            <label className={`rounded-lg border p-3 text-sm font-bold ${endMode === "until_cancelled" ? "border-court-teal bg-white text-court-navy" : "border-slate-200 bg-white text-slate-700"}`}>
              <input checked={endMode === "until_cancelled"} className="mr-2" name="recurrenceEndMode" onChange={() => setEndMode("until_cancelled")} type="radio" value="until_cancelled" />
              Until cancelled
            </label>
            <label className={`rounded-lg border p-3 text-sm font-bold ${endMode === "until_date" ? "border-court-teal bg-white text-court-navy" : "border-slate-200 bg-white text-slate-700"}`}>
              <input checked={endMode === "until_date"} className="mr-2" name="recurrenceEndMode" onChange={() => setEndMode("until_date")} type="radio" value="until_date" />
              Until a date
            </label>
            <label className={`rounded-lg border p-3 text-sm font-bold ${endMode === "occurrence_count" ? "border-court-teal bg-white text-court-navy" : "border-slate-200 bg-white text-slate-700"}`}>
              <input checked={endMode === "occurrence_count"} className="mr-2" name="recurrenceEndMode" onChange={() => setEndMode("occurrence_count")} type="radio" value="occurrence_count" />
              Number of lessons
            </label>
          </fieldset>

          {endMode === "until_date" ? (
            <label className="mt-3 block max-w-sm text-sm font-semibold text-slate-700">
              Last lesson date
              <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={defaultRecurrenceEndDate} name="recurrenceEndDate" required type="date" />
            </label>
          ) : null}

          {endMode === "occurrence_count" ? (
            <label className="mt-3 block max-w-sm text-sm font-semibold text-slate-700">
              Lessons
              <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue="10" max="104" min="1" name="recurrenceOccurrenceCount" required type="number" />
            </label>
          ) : null}
        </section>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-court-teal/20 bg-court-mist p-3 text-sm font-semibold leading-6 text-court-navy">
        <TimeIcon className="mt-1 shrink-0" size={15} />
        <span>{summary}</span>
      </div>
    </div>
  );
}
