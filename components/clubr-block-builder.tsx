"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ClubRBlockBuilder({ courtId, defaultDate }: { courtId: string; defaultDate: string }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [reason, setReason] = useState("maintenance");
  const [startTime, setStartTime] = useState(`${defaultDate}T08:00`);
  const [endTime, setEndTime] = useState(`${defaultDate}T09:00`);
  const [note, setNote] = useState("");

  function review() {
    const params = new URLSearchParams({ date: defaultDate, end: endTime, note, reason, review: "true", start: startTime });
    router.push(`/dashboard/clubr/courts/${courtId}?${params.toString()}`);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="mb-4 flex gap-2" aria-label={`Step ${step} of 3`}>
        {[1, 2, 3].map((item) => <span className={`h-1.5 flex-1 rounded ${item <= step ? "bg-court-teal" : "bg-slate-200"}`} key={item} />)}
      </div>
      {step === 1 ? (
        <label className="text-sm font-bold text-slate-700">Reason<select className="mt-2 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" onChange={(event) => setReason(event.target.value)} value={reason}><option value="maintenance">Maintenance</option><option value="weather">Weather</option><option value="private_club_use">Private club use</option><option value="safety">Safety</option><option value="committee_use">Committee use</option><option value="club_operations">Club operations</option><option value="court_preparation">Court preparation</option><option value="other">Other</option></select></label>
      ) : null}
      {step === 2 ? (
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold text-slate-700">Starts<input className="mt-2 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" onChange={(event) => setStartTime(event.target.value)} type="datetime-local" value={startTime} /></label><label className="text-sm font-bold text-slate-700">Ends<input className="mt-2 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" min={startTime} onChange={(event) => setEndTime(event.target.value)} type="datetime-local" value={endTime} /></label></div>
      ) : null}
      {step === 3 ? <label className="text-sm font-bold text-slate-700">Optional note<textarea className="mt-2 min-h-24 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" onChange={(event) => setNote(event.target.value)} placeholder="What should staff know?" value={note} /></label> : null}
      <div className="mt-4 flex justify-between gap-2">
        {step > 1 ? <button className="btn-secondary" onClick={() => setStep((value) => value - 1)} type="button">Back</button> : <span />}
        {step < 3 ? <button className="btn-primary" onClick={() => setStep((value) => value + 1)} type="button">Next</button> : <button className="btn-primary" disabled={!startTime || !endTime || endTime <= startTime} onClick={review} type="button">Review Closure</button>}
      </div>
    </div>
  );
}
