"use client";

import { useMemo, useState } from "react";

export type PlayerSearchOption = {
  id: string;
  name: string;
  label: string;
  detail: string;
  meta: string;
  searchText: string;
};

export function PlayerSearchPicker({
  emptyText = "No players found.",
  name = "opponent_profile_id",
  options
}: {
  emptyText?: string;
  name?: string;
  options: PlayerSearchOption[];
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(options[0]?.id ?? "");
  const filteredOptions = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return options;
    }

    return options.filter((option) => option.searchText.includes(term));
  }, [options, query]);
  const selected = options.find((option) => option.id === selectedId);

  return (
    <div className="grid gap-3">
      <input name={name} type="hidden" value={selectedId} />
      <label className="text-sm font-semibold text-slate-700">
        Search player
        <input
          className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Type a player name"
          type="search"
          value={query}
        />
      </label>

      {selected ? (
        <div className="rounded border border-court-teal/25 bg-court-mist p-3 text-sm text-court-navy">
          <span className="font-black">Selected:</span> {selected.name} · {selected.detail}
        </div>
      ) : null}

      {filteredOptions.length > 0 ? (
        <div className="grid max-h-96 gap-2 overflow-y-auto pr-1">
          {filteredOptions.map((option) => {
            const active = option.id === selectedId;

            return (
              <button
                className={`rounded-lg border p-3 text-left transition ${
                  active ? "border-court-teal bg-court-mist text-court-navy shadow-sm" : "border-slate-200 bg-white text-court-navy hover:border-court-teal"
                }`}
                key={option.id}
                onClick={() => setSelectedId(option.id)}
                type="button"
              >
                <span className="flex flex-wrap items-start justify-between gap-2">
                  <span>
                    <span className="block font-black">{option.name}</span>
                    <span className="mt-1 block text-sm font-semibold text-slate-600">{option.detail}</span>
                  </span>
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs font-black uppercase tracking-wide text-slate-600">{option.label}</span>
                </span>
                <span className="mt-2 block text-xs font-bold uppercase tracking-wide text-slate-500">{option.meta}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="ui-empty-card">{emptyText}</div>
      )}
    </div>
  );
}
