"use client";

import { useMemo, useState } from "react";
import { createCoachSession } from "@/app/dashboard/coachr/sessions/actions";
import { ArrowRightIcon, BookingIcon, EntriesIcon, LocationIcon, MatchIcon, StatusIcon, TimeIcon } from "@/components/playr-icons";
import type { CoachLessonLocationType, CoachSessionType } from "@/types/courtside";

type PersonOption = {
  id: string;
  name: string;
  meta: string;
};

type CourtOption = {
  id: string;
  name: string;
  ownerName: string | null;
};

type ExternalVenueOption = {
  id: string;
  name: string;
};

type CoachRSessionBuilderProps = {
  coaches: PersonOption[];
  courts: CourtOption[];
  defaultCoachId: string | null;
  externalVenues: ExternalVenueOption[];
  students: PersonOption[];
  venueId: string;
  venueName: string;
};

const typeOptions: { value: CoachSessionType; title: string; text: string; expectation: string; icon: typeof MatchIcon }[] = [
  { value: "private", title: "Private", text: "One player with focused coaching.", expectation: "1 participant", icon: MatchIcon },
  { value: "semi_private", title: "Semi-private", text: "A small shared lesson.", expectation: "2+ participants", icon: EntriesIcon },
  { value: "squad", title: "Squad", text: "A named recurring training group.", expectation: "Roster and capacity", icon: StatusIcon }
];

const steps = ["Type", "Players", "Coach", "Schedule", "Courts", "Review"];

function dateTimeDefault(hoursAhead: number) {
  const date = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Johannesburg",
    year: "numeric"
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function dateDefault() {
  return dateTimeDefault(24).slice(0, 10);
}

function selectionClass(selected: boolean) {
  return selected
    ? "border-court-teal bg-court-mist ring-2 ring-court-teal/20"
    : "border-slate-200 bg-white hover:border-court-teal hover:bg-court-mist/50";
}

export function CoachRSessionBuilder({ coaches, courts, defaultCoachId, externalVenues, students, venueId, venueName }: CoachRSessionBuilderProps) {
  const [step, setStep] = useState(0);
  const [sessionType, setSessionType] = useState<CoachSessionType>("private");
  const [sessionName, setSessionName] = useState("Private lesson");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [primaryCoachId, setPrimaryCoachId] = useState(defaultCoachId ?? coaches[0]?.id ?? "");
  const [assistantCoachIds, setAssistantCoachIds] = useState<string[]>([]);
  const [repeatMode, setRepeatMode] = useState<"none" | "weekly">("none");
  const [locationType, setLocationType] = useState<CoachLessonLocationType>(courts.length > 0 ? "managed_court" : "custom");
  const [courtIds, setCourtIds] = useState<string[]>(courts[0] ? [courts[0].id] : []);
  const [search, setSearch] = useState("");
  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? students.filter((student) => `${student.name} ${student.meta}`.toLowerCase().includes(query)) : students;
  }, [search, students]);
  const selectedStudents = students.filter((student) => participantIds.includes(student.id));
  const selectedCoach = coaches.find((coach) => coach.id === primaryCoachId);
  const selectedCourts = courts.filter((court) => courtIds.includes(court.id));

  function chooseType(nextType: CoachSessionType) {
    setSessionType(nextType);
    setParticipantIds((current) => nextType === "private" ? current.slice(0, 1) : current);
    setCourtIds((current) => nextType === "squad" ? current : current.slice(0, 1));
    setSessionName(nextType === "private" ? "Private lesson" : nextType === "semi_private" ? "Semi-private lesson" : "New squad");
  }

  function toggleParticipant(id: string) {
    setParticipantIds((current) => {
      if (sessionType === "private") return current.includes(id) ? [] : [id];
      return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    });
  }

  function toggleCourt(id: string) {
    setCourtIds((current) => {
      if (sessionType !== "squad") return current.includes(id) ? [] : [id];
      return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    });
  }

  function canContinue() {
    if (step === 0) return sessionName.trim().length > 0;
    if (step === 1) return sessionType === "private" ? participantIds.length === 1 : sessionType === "semi_private" ? participantIds.length >= 2 : participantIds.length >= 1;
    if (step === 2) return Boolean(primaryCoachId);
    if (step === 4) return locationType !== "managed_court" || courtIds.length > 0;
    return true;
  }

  return (
    <form action={createCoachSession} className="surface-card overflow-hidden" id="create-session-form">
      <input name="venueId" type="hidden" value={venueId} />
      <input name="sessionType" type="hidden" value={sessionType} />
      <input name="returnTo" type="hidden" value="/dashboard/coachr/sessions/new" />
      {participantIds.map((id) => <input key={id} name="participantIds" type="hidden" value={id} />)}
      {assistantCoachIds.map((id) => <input key={id} name="additionalCoachIds" type="hidden" value={id} />)}
      {courtIds.map((id) => <input key={id} name="courtIds" type="hidden" value={id} />)}

      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="section-kicker">Create Session</p>
            <h2 className="mt-1 text-lg font-black text-court-navy">{steps[step]}</h2>
          </div>
          <span className="ui-chip ui-chip-brand">{step + 1} / {steps.length}</span>
        </div>
        <div className="mt-3 grid grid-cols-6 gap-1" aria-label="Session setup progress">
          {steps.map((label, index) => (
            <span className={`h-1.5 rounded ${index <= step ? "bg-court-teal" : "bg-slate-200"}`} key={label} />
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <section hidden={step !== 0}>
          <div className="grid gap-3 md:grid-cols-3">
            {typeOptions.map((option) => {
              const Icon = option.icon;
              const selected = sessionType === option.value;
              return (
                <button className={`rounded-lg border p-4 text-left transition ${selectionClass(selected)}`} key={option.value} onClick={() => chooseType(option.value)} type="button">
                  <span className={`grid h-10 w-10 place-items-center rounded ${selected ? "bg-court-navy text-white" : "bg-court-mist text-court-teal"}`}><Icon size={19} /></span>
                  <span className="mt-3 block text-lg font-black text-court-navy">{option.title}</span>
                  <span className="mt-1 block text-sm text-slate-600">{option.text}</span>
                  <span className="mt-3 block text-xs font-black uppercase tracking-wide text-court-teal">{option.expectation}</span>
                </button>
              );
            })}
          </div>
          <label className="mt-5 block text-sm font-bold text-slate-700">
            Session name
            <input className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" maxLength={100} name="name" onChange={(event) => setSessionName(event.target.value)} required value={sessionName} />
          </label>
          <details className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
            <summary className="cursor-pointer text-sm font-black text-court-navy">Optional description</summary>
            <textarea className="mt-3 min-h-20 w-full rounded border border-slate-300 px-3 py-2 focus-ring" maxLength={500} name="description" placeholder="Short internal context for coaches." />
          </details>
        </section>

        <section hidden={step !== 1}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h3 className="text-lg font-black text-court-navy">Choose players</h3><p className="mt-1 text-sm text-slate-600">{sessionType === "private" ? "Choose one active academy student." : "Choose the shared session roster."}</p></div>
            <span className="ui-chip ui-chip-brand">{participantIds.length} selected</span>
          </div>
          <input className="mt-4 w-full rounded border border-slate-300 px-3 py-3 focus-ring" onChange={(event) => setSearch(event.target.value)} placeholder="Search players" type="search" value={search} />
          <div className="mt-3 grid max-h-[390px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {filteredStudents.map((student) => {
              const selected = participantIds.includes(student.id);
              return (
                <button className={`flex min-h-16 items-center justify-between gap-3 rounded-lg border p-3 text-left transition ${selectionClass(selected)}`} key={student.id} onClick={() => toggleParticipant(student.id)} type="button">
                  <span className="min-w-0"><span className="block truncate font-black text-court-navy">{student.name}</span><span className="mt-1 block truncate text-xs font-semibold text-slate-500">{student.meta}</span></span>
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-black ${selected ? "border-court-teal bg-court-teal text-white" : "border-slate-300 text-transparent"}`}>✓</span>
                </button>
              );
            })}
          </div>
          {filteredStudents.length === 0 ? <p className="ui-empty-card mt-3">No active academy students match that search.</p> : null}
        </section>

        <section hidden={step !== 2}>
          <h3 className="text-lg font-black text-court-navy">Assign coach</h3>
          <p className="mt-1 text-sm text-slate-600">Only coaches active in {venueName} are shown.</p>
          <label className="mt-4 block text-sm font-bold text-slate-700">
            Primary coach
            <select className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" name="primaryCoachId" onChange={(event) => setPrimaryCoachId(event.target.value)} required value={primaryCoachId}>
              <option value="">Choose coach</option>
              {coaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.name}</option>)}
            </select>
          </label>
          {sessionType === "squad" && coaches.length > 1 ? (
            <details className="mt-4 rounded-lg border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-black text-court-navy">Assistant coaches</summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {coaches.filter((coach) => coach.id !== primaryCoachId).map((coach) => (
                  <label className="flex items-center gap-3 rounded border border-slate-200 p-3 text-sm font-bold text-slate-700" key={coach.id}>
                    <input checked={assistantCoachIds.includes(coach.id)} onChange={(event) => setAssistantCoachIds((current) => event.target.checked ? [...current, coach.id] : current.filter((id) => id !== coach.id))} type="checkbox" />
                    {coach.name}
                  </label>
                ))}
              </div>
            </details>
          ) : null}
          {sessionType !== "private" ? (
            <label className="mt-4 block text-sm font-bold text-slate-700">Capacity<input className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" defaultValue={Math.max(sessionType === "squad" ? 12 : 2, participantIds.length)} key={`${sessionType}-${participantIds.length}`} max={80} min={participantIds.length} name="capacity" type="number" /></label>
          ) : <input name="capacity" type="hidden" value="1" />}
        </section>

        <section hidden={step !== 3}>
          <h3 className="text-lg font-black text-court-navy">Set schedule</h3>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button className={`rounded-lg border p-3 text-left font-black ${selectionClass(repeatMode === "none")}`} onClick={() => setRepeatMode("none")} type="button"><TimeIcon className="mr-2" size={17} />Once</button>
            <button className={`rounded-lg border p-3 text-left font-black ${selectionClass(repeatMode === "weekly")}`} onClick={() => setRepeatMode("weekly")} type="button"><BookingIcon className="mr-2" size={17} />Weekly</button>
          </div>
          <input name="repeatMode" type="hidden" value={repeatMode} />
          <div className="mt-4 grid gap-3 sm:grid-cols-2" hidden={repeatMode !== "none"}>
            <label className="text-sm font-bold text-slate-700">Starts<input className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" defaultValue={dateTimeDefault(24)} name="startTime" type="datetime-local" /></label>
            <label className="text-sm font-bold text-slate-700">Ends<input className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" defaultValue={dateTimeDefault(25)} name="endTime" type="datetime-local" /></label>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2" hidden={repeatMode !== "weekly"}>
            <label className="text-sm font-bold text-slate-700">First week<input className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" defaultValue={dateDefault()} name="recurrenceStartDate" type="date" /></label>
            <label className="text-sm font-bold text-slate-700">Day<select className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" defaultValue="2" name="dayOfWeek"><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option><option value="7">Sunday</option></select></label>
            <label className="text-sm font-bold text-slate-700">Starts<input className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" defaultValue="15:00" name="recurrenceStartTime" type="time" /></label>
            <label className="text-sm font-bold text-slate-700">Ends<input className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" defaultValue="16:00" name="recurrenceEndTime" type="time" /></label>
            <label className="text-sm font-bold text-slate-700 sm:col-span-2">Ends<select className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" defaultValue="until_cancelled" name="recurrenceEndMode"><option value="until_cancelled">Until cancelled</option><option value="until_date">On selected date</option><option value="occurrence_count">After a number of sessions</option></select></label>
            <label className="text-sm font-bold text-slate-700">End date<input className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" name="recurrenceEndDate" type="date" /></label>
            <label className="text-sm font-bold text-slate-700">Session count<input className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" max={104} min={1} name="recurrenceOccurrenceCount" placeholder="12" type="number" /></label>
          </div>
        </section>

        <section hidden={step !== 4}>
          <h3 className="text-lg font-black text-court-navy">Venue and courts</h3>
          <p className="mt-1 text-sm text-slate-600">A managed court is reserved once for each session occurrence.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {(["managed_court", "custom", "none"] as CoachLessonLocationType[]).map((type) => (
              <button className={`rounded-lg border p-3 text-left text-sm font-black ${selectionClass(locationType === type)}`} key={type} onClick={() => setLocationType(type)} type="button">{type === "managed_court" ? "Managed court" : type === "custom" ? "Off-site" : "No court"}</button>
            ))}
          </div>
          <input name="locationType" type="hidden" value={locationType} />
          <div className="mt-4 grid gap-2 sm:grid-cols-2" hidden={locationType !== "managed_court"}>
            {courts.map((court) => {
              const selected = courtIds.includes(court.id);
              return <button className={`rounded-lg border p-3 text-left ${selectionClass(selected)}`} key={court.id} onClick={() => toggleCourt(court.id)} type="button"><span className="block font-black text-court-navy">{court.name}</span><span className="mt-1 block text-xs font-semibold text-slate-500">{court.ownerName ?? venueName}</span></button>;
            })}
          </div>
          {locationType === "managed_court" && courts.length === 0 ? <p className="ui-empty-card mt-4">No authorised courts are available. Choose an off-site location.</p> : null}
          <div className="mt-4 grid gap-3" hidden={locationType !== "custom"}>
            {externalVenues.length > 0 ? <label className="text-sm font-bold text-slate-700">Saved venue<select className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" name="externalVenueId"><option value="">Enter another location</option>{externalVenues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select></label> : null}
            <label className="text-sm font-bold text-slate-700">Location<input className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" name="customLocation" placeholder="Venue or court name" /></label>
          </div>
        </section>

        <section hidden={step !== 5}>
          <h3 className="text-lg font-black text-court-navy">Review session</h3>
          <div className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200">
            <p className="flex items-center justify-between gap-3 p-3 text-sm"><span className="font-semibold text-slate-500">Session</span><strong className="text-right text-court-navy">{sessionName} · {typeOptions.find((item) => item.value === sessionType)?.title}</strong></p>
            <p className="flex items-center justify-between gap-3 p-3 text-sm"><span className="font-semibold text-slate-500">Players</span><strong className="text-right text-court-navy">{selectedStudents.map((student) => student.name).join(", ")}</strong></p>
            <p className="flex items-center justify-between gap-3 p-3 text-sm"><span className="font-semibold text-slate-500">Coach</span><strong className="text-right text-court-navy">{selectedCoach?.name ?? "Choose coach"}</strong></p>
            <p className="flex items-center justify-between gap-3 p-3 text-sm"><span className="font-semibold text-slate-500">Schedule</span><strong className="text-right text-court-navy">{repeatMode === "weekly" ? "Weekly" : "Once"}</strong></p>
            <p className="flex items-center justify-between gap-3 p-3 text-sm"><span className="font-semibold text-slate-500">Location</span><strong className="text-right text-court-navy">{locationType === "managed_court" ? selectedCourts.map((court) => court.name).join(", ") : locationType === "custom" ? "Off-site" : "No court"}</strong></p>
          </div>
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-court-teal/30 bg-court-mist p-4 text-sm font-semibold text-court-navy"><LocationIcon className="mt-0.5 text-court-teal" size={18} /><p>{locationType === "managed_court" ? `${selectedCourts.length} court${selectedCourts.length === 1 ? "" : "s"} will be reserved for each occurrence. Players do not create separate bookings.` : "No managed court booking will be created."}</p></div>
          <details className="mt-4 rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-black text-court-navy">Notes</summary><textarea className="mt-3 min-h-20 w-full rounded border border-slate-300 px-3 py-2 focus-ring" maxLength={1000} name="notes" placeholder="Private coaching notes" /></details>
        </section>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
        <button className="btn-secondary" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))} type="button">Back</button>
        {step < steps.length - 1 ? (
          <button className="btn-primary" disabled={!canContinue()} onClick={() => setStep((current) => Math.min(steps.length - 1, current + 1))} type="button">Continue <ArrowRightIcon size={16} /></button>
        ) : (
          <button className="btn-primary" type="submit">Create Session <ArrowRightIcon size={16} /></button>
        )}
      </div>
    </form>
  );
}
