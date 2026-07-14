"use client";

import { useState, useTransition } from "react";
import type { AcademyConnectionCandidate } from "@/types/courtside";
import {
  requestExistingPlayerLink,
  searchExistingPlayerConnections
} from "@/app/dashboard/coachr/students/actions";

type CoachOption = {
  id: string;
  name: string;
};

type SearchState = {
  candidates: AcademyConnectionCandidate[];
  error: "search_failed" | "search_too_broad" | null;
  searched: boolean;
};

export function CoachRPlayerConnectionSearch({ coaches }: { coaches: CoachOption[] }) {
  const [coachId, setCoachId] = useState("");
  const [state, setState] = useState<SearchState>({ candidates: [], error: null, searched: false });
  const [pending, startTransition] = useTransition();

  function submitSearch(formData: FormData) {
    startTransition(async () => {
      const result = await searchExistingPlayerConnections(formData);
      setState({ candidates: result.candidates, error: result.error, searched: true });
    });
  }

  return (
    <section className="mb-5 rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm font-black text-court-navy">Find an existing PlayR profile</p>
      <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">Search an exact parent email or a closely matching player or parent name. Results are limited and contact details stay masked.</p>
      <form action={submitSearch} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="text-sm font-semibold text-slate-700">
          Player or parent
          <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" minLength={3} name="query" placeholder="Name or exact parent email" required />
        </label>
        <button className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50" disabled={pending} type="submit">{pending ? "Searching..." : "Search PlayR"}</button>
      </form>

      {coaches.length > 0 ? (
        <label className="mt-3 block text-sm font-semibold text-slate-700">
          Proposed coach
          <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" onChange={(event) => setCoachId(event.target.value)} value={coachId}>
            <option value="">Assign after acceptance</option>
            {coaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.name}</option>)}
          </select>
        </label>
      ) : null}

      {state.error ? (
        <div className="ui-empty-card mt-3">Profiles could not be searched. Check the active organisation and try again.</div>
      ) : state.searched && state.candidates.length === 0 ? (
        <div className="ui-empty-card mt-3">No close match found. Use the invitation forms below with the player or parent email.</div>
      ) : state.candidates.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {state.candidates.map((candidate) => {
            const connected = candidate.relationshipStatus === "active";
            const connectionPending = candidate.relationshipStatus === "pending";

            return (
              <article className="rounded-lg border border-slate-200 bg-court-mist p-3" key={candidate.playerProfileId}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black text-court-navy">{candidate.playerName}</p>
                      <span className="ui-chip ui-chip-muted">{candidate.isJunior ? "Junior" : "Adult"}</span>
                      <span className={`ui-chip ${connected ? "ui-chip-success" : connectionPending ? "ui-chip-warning" : "ui-chip-muted"}`}>
                        {connected ? "Connected" : connectionPending ? "Approval pending" : "Not connected"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-600">
                      {candidate.isJunior && candidate.parentName ? `Parent: ${candidate.parentName}` : "PlayR player"}
                      {candidate.maskedEmail ? ` · ${candidate.maskedEmail}` : ""}
                    </p>
                  </div>
                  {connected ? (
                    <a className="btn-secondary px-3 py-2 text-center" href={`/dashboard/coachr/schedule?new=1&player=${candidate.playerProfileId}#new-lesson`}>Select Student</a>
                  ) : connectionPending ? (
                    <a className="btn-secondary px-3 py-2 text-center" href="#pending-links">View Request</a>
                  ) : (
                    <form action={requestExistingPlayerLink}>
                      <input name="playerProfileId" type="hidden" value={candidate.playerProfileId} />
                      <input name="coachProfileId" type="hidden" value={coachId} />
                      <button className="btn-primary px-3 py-2" type="submit">Send Connection Request</button>
                    </form>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
