"use client";

import { useMemo, useState } from "react";
import type { CourtSideEvent, EventStatus, Sport } from "@/types/courtside";

type AdminEventFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  event?: CourtSideEvent;
  submitLabel: string;
};

const sportOptions: { value: Sport; label: string }[] = [
  { value: "tennis", label: "Tennis" },
  { value: "pickleball", label: "Pickleball" },
  { value: "futsal", label: "Futsal" },
  { value: "multi_sport", label: "Multi-sport" }
];

const statusOptions: { value: EventStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "cancelled", label: "Cancelled" },
  { value: "completed", label: "Completed" }
];

function toInputDateTime(value?: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 16);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function AdminEventForm({ action, event, submitLabel }: AdminEventFormProps) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [slug, setSlug] = useState(event?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(event?.slug));

  const suggestedSlug = useMemo(() => slugify(title), [title]);

  function updateTitle(value: string) {
    setTitle(value);
    if (!slugEdited) {
      setSlug(slugify(value));
    }
  }

  return (
    <form action={action} className="grid max-w-4xl gap-4 rounded-lg border border-slate-200 bg-white p-6 md:grid-cols-2">
      {event ? <input name="eventId" type="hidden" value={event.id} /> : null}

      <label className="text-sm font-semibold text-slate-700">
        Title
        <input
          className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring"
          name="title"
          onChange={(input) => updateTitle(input.target.value)}
          required
          type="text"
          value={title}
        />
      </label>

      <label className="text-sm font-semibold text-slate-700">
        Slug
        <input
          className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring"
          name="slug"
          onChange={(input) => {
            setSlugEdited(true);
            setSlug(slugify(input.target.value));
          }}
          placeholder={suggestedSlug}
          required
          type="text"
          value={slug}
        />
      </label>

      <label className="text-sm font-semibold text-slate-700">
        Sport
        <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={event?.sport ?? "tennis"} name="sport">
          {sportOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm font-semibold text-slate-700">
        Status
        <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={event?.status ?? "draft"} name="status">
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm font-semibold text-slate-700">
        Event type
        <input
          className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring"
          defaultValue={event?.event_type ?? event?.category ?? ""}
          name="event_type"
          placeholder="Open, club event, junior clinic"
          type="text"
        />
      </label>

      <label className="text-sm font-semibold text-slate-700">
        Category / format
        <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={event?.category ?? ""} name="category" type="text" />
      </label>

      <label className="text-sm font-semibold text-slate-700">
        Age group
        <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={event?.age_group ?? ""} name="age_group" type="text" />
      </label>

      <label className="text-sm font-semibold text-slate-700">
        Start date and time
        <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={toInputDateTime(event?.start_datetime)} name="start_datetime" required type="datetime-local" />
      </label>

      <label className="text-sm font-semibold text-slate-700">
        End date and time
        <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={toInputDateTime(event?.end_datetime)} name="end_datetime" required type="datetime-local" />
      </label>

      <label className="text-sm font-semibold text-slate-700">
        Location
        <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={event?.location ?? "PlayR pilot club"} name="location" type="text" />
      </label>

      <label className="text-sm font-semibold text-slate-700">
        Max entries
        <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={event?.max_entries ?? ""} min="1" name="max_entries" type="number" />
      </label>

      <label className="text-sm font-semibold text-slate-700">
        Member price
        <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={event?.member_price ?? 0} min="0" name="member_price" step="0.01" type="number" />
      </label>

      <label className="text-sm font-semibold text-slate-700">
        Non-member price
        <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={event?.non_member_price ?? 0} min="0" name="non_member_price" step="0.01" type="number" />
      </label>

      <label className="text-sm font-semibold text-slate-700 md:col-span-2">
        Description
        <textarea className="mt-2 min-h-28 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={event?.description ?? ""} name="description" />
      </label>

      <button className="rounded bg-court-blue px-4 py-3 font-bold text-white md:col-span-2" type="submit">
        {submitLabel}
      </button>
    </form>
  );
}
