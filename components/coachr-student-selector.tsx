"use client";

import { useMemo, useState } from "react";

export type CoachRStudentSelectOption = {
  id: string;
  name: string;
  context: string;
  searchText: string;
};

type CoachRStudentSelectorProps = {
  defaultValue?: string;
  label?: string;
  name?: string;
  options: CoachRStudentSelectOption[];
};

export function CoachRStudentSelector({
  defaultValue = "",
  label = "Select student",
  name = "playerId",
  options
}: CoachRStudentSelectorProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(
    () => options.filter((option) => !normalizedQuery || `${option.name} ${option.context} ${option.searchText}`.toLowerCase().includes(normalizedQuery)),
    [normalizedQuery, options]
  );

  return (
    <fieldset className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <legend className="px-1 text-sm font-black text-court-navy">{label}</legend>
      <label className="block text-xs font-semibold text-slate-600">
        Find student
        <input
          className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus-ring"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search player, parent or coach"
          type="search"
          value={query}
        />
      </label>
      <label className="mt-3 block text-xs font-semibold text-slate-600">
        Active academy students
        <select className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus-ring" defaultValue={defaultValue} name={name} required>
          <option value="">Choose student</option>
          {filteredOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name} · {option.context}
            </option>
          ))}
        </select>
      </label>
      {normalizedQuery && filteredOptions.length === 0 ? (
        <p className="mt-2 text-xs font-semibold text-amber-800">No active student matches this search.</p>
      ) : null}
    </fieldset>
  );
}
