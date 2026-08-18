"use client";

import { useState } from "react";
import {
  initialRolesByApplication,
  organisationAccessApplications,
  type OrganisationAccessApplication
} from "@/lib/organisation-access-options";
import { organisationRoleLabel } from "@/lib/organisations";
import type { OrganisationRole } from "@/types/courtside";

export function OrganisationAccessFields() {
  const [application, setApplication] = useState<OrganisationAccessApplication>("clubr");
  const [role, setRole] = useState<OrganisationRole>(initialRolesByApplication.clubr[0]);
  const roles = initialRolesByApplication[application];

  return (
    <>
      <label className="text-sm font-bold text-slate-700">Application
        <select
          className="mt-2 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring"
          name="application"
          onChange={(event) => {
            const nextApplication = event.target.value as OrganisationAccessApplication;
            setApplication(nextApplication);
            setRole(initialRolesByApplication[nextApplication][0]);
          }}
          value={application}
        >
          {organisationAccessApplications.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label className="text-sm font-bold text-slate-700">Role
        <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" name="leaderRole" onChange={(event) => setRole(event.target.value as OrganisationRole)} value={role}>
          {roles.map((item) => <option key={item} value={item}>{organisationRoleLabel(item)}</option>)}
        </select>
        <span className="mt-1 block text-xs font-semibold text-slate-500">The application filters the canonical roles; only the selected role is saved.</span>
      </label>
    </>
  );
}
