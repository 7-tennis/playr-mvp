"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { MemberStatus } from "@/types/courtside";
import { formatLabel, formatPrice } from "@/lib/courtside-format";
import type { EntryActionState } from "@/app/events/[slug]/actions";
import { createEventEntry } from "@/app/events/[slug]/actions";

export type EntryProfileOption = {
  id: string;
  first_name: string;
  last_name: string;
  member_status: MemberStatus;
  is_junior: boolean;
};

type EventEntryFormProps = {
  eventId: string;
  eventSlug: string;
  memberPrice: number;
  nonMemberPrice: number;
  isFull: boolean;
  profiles: EntryProfileOption[];
  existingEntryProfileIds: string[];
};

const initialState: EntryActionState = {
  status: "idle",
  message: ""
};

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="w-full rounded bg-court-teal px-5 py-3 font-bold text-white transition hover:bg-court-blue disabled:cursor-not-allowed disabled:bg-slate-300"
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? "Submitting entry..." : "Enter event"}
    </button>
  );
}

export function EventEntryForm({
  eventId,
  eventSlug,
  memberPrice,
  nonMemberPrice,
  isFull,
  profiles,
  existingEntryProfileIds
}: EventEntryFormProps) {
  const availableProfiles = profiles.filter((profile) => !existingEntryProfileIds.includes(profile.id));
  const [selectedProfileId, setSelectedProfileId] = useState(availableProfiles[0]?.id ?? "");
  const [state, formAction] = useFormState(createEventEntry, initialState);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId]
  );

  const selectedPrice = selectedProfile?.member_status === "member" ? memberPrice : nonMemberPrice;

  if (isFull) {
    return <p className="rounded bg-white/10 p-4 text-sm text-blue-50">Event full. Entries are closed for this event.</p>;
  }

  if (profiles.length === 0) {
    return (
      <div className="rounded bg-white/10 p-4 text-sm leading-6 text-blue-50">
        Create your player profile before entering an event. Linked junior profiles will also appear here.
      </div>
    );
  }

  if (availableProfiles.length === 0) {
    return (
      <div className="rounded bg-white/10 p-4 text-sm leading-6 text-blue-50">
        Every available profile on your account has already been entered for this event.
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input name="eventId" type="hidden" value={eventId} />
      <input name="eventSlug" type="hidden" value={eventSlug} />
      <label className="block text-sm font-semibold text-blue-50" htmlFor="profileId">
        Player profile
      </label>
      <select
        className="w-full rounded border border-white/20 bg-white px-3 py-3 text-court-ink"
        id="profileId"
        name="profileId"
        onChange={(event) => setSelectedProfileId(event.target.value)}
        value={selectedProfileId}
      >
        {availableProfiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.first_name} {profile.last_name}
            {profile.is_junior ? " (junior)" : ""} - {formatLabel(profile.member_status)}
          </option>
        ))}
      </select>

      <div className="rounded bg-white/10 p-4 text-sm text-blue-50">
        Entry price for this profile: <span className="font-black text-white">{formatPrice(selectedPrice)}</span>
      </div>

      <SubmitButton disabled={!selectedProfileId} />

      {state.message ? (
        <p
          className={`rounded p-4 text-sm leading-6 ${
            state.status === "success" ? "bg-emerald-50 text-emerald-950" : "bg-amber-50 text-amber-950"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <p className="text-xs leading-5 text-blue-100">
        Manual payment only for now. Your club will mark your payment status after payment is received.
      </p>
    </form>
  );
}
