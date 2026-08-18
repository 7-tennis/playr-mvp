"use client";

import { useState } from "react";
import type { PublicRankingOrganisation } from "@/lib/public-rankings";
import {
  rankingOrganisationsForScope,
  rankingScopeSelectorLabel,
  rankingScopes,
  type RankingScope
} from "@/lib/ranking-scope";

export function RankingScopeFilter({
  organisations,
  selectedOrganisationId,
  selectedScope
}: {
  organisations: PublicRankingOrganisation[];
  selectedOrganisationId: string | null;
  selectedScope: RankingScope;
}) {
  const [scope, setScope] = useState<RankingScope>(selectedScope);
  const [organisationId, setOrganisationId] = useState(selectedOrganisationId ?? "");
  const scopedOrganisations = rankingOrganisationsForScope(organisations, scope);

  return (
    <>
      <label className="text-sm font-black text-court-navy">Ranking scope
        <select
          className="mt-1.5 min-h-11 w-full rounded-playr-md border border-slate-300 px-3 focus-ring"
          name="scope"
          onChange={(event) => {
            setScope(event.target.value as RankingScope);
            setOrganisationId("");
          }}
          value={scope}
        >
          {rankingScopes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      {scope !== "overall" ? (
        <label className="text-sm font-black text-court-navy">{rankingScopeSelectorLabel(scope)}
          <select
            className="mt-1.5 min-h-11 w-full rounded-playr-md border border-slate-300 px-3 focus-ring"
            name="organisation"
            onChange={(event) => setOrganisationId(event.target.value)}
            required
            value={organisationId}
          >
            <option value="">{rankingScopeSelectorLabel(scope)}</option>
            {scopedOrganisations.map((item) => <option key={item.organisation_id} value={item.organisation_id}>{item.organisation_name}</option>)}
          </select>
        </label>
      ) : null}
    </>
  );
}
