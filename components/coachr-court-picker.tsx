"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookingIcon, ClubIcon, LocationIcon, StatusIcon } from "@/components/playr-icons";
import type { CoachLessonExternalVenue } from "@/lib/coach-lessons";
import type { CoachLessonLocationType } from "@/types/courtside";

type CoachLessonLocationMode = CoachLessonLocationType | "external";

type CourtOption = {
  access_kind?: "owned" | "shared";
  id: string;
  name: string;
  owner_name?: string | null;
  venue_id: string | null;
};

type AvailabilityRow = {
  available: boolean;
  court_id: string;
};

function localDateTimeIso(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? new Date(`${value}:00+02:00`).toISOString() : "";
}

export function CoachRCourtPicker({
  canManageAccess = false,
  courts,
  defaultCourtId = "",
  defaultCustomLocation = "",
  defaultExternalVenueId = "",
  defaultLocationType = "managed_court",
  excludeLessonId = null,
  externalVenues = [],
  organisationId
}: {
  canManageAccess?: boolean;
  courts: CourtOption[];
  defaultCourtId?: string;
  defaultCustomLocation?: string;
  defaultExternalVenueId?: string;
  defaultLocationType?: CoachLessonLocationType;
  excludeLessonId?: string | null;
  externalVenues?: CoachLessonExternalVenue[];
  organisationId: string;
}) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const [locationMode, setLocationMode] = useState<CoachLessonLocationMode>(defaultExternalVenueId ? "external" : defaultLocationType);
  const [availability, setAvailability] = useState<Map<string, boolean> | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const refreshAvailability = useCallback(async () => {
    const form = selectRef.current?.form;
    const startInput = form?.elements.namedItem("startTime") as HTMLInputElement | null;
    const endInput = form?.elements.namedItem("endTime") as HTMLInputElement | null;
    const venueInput = form?.elements.namedItem("venueId") as HTMLInputElement | HTMLSelectElement | null;
    const repeatInput = form?.querySelector<HTMLInputElement>('input[name="repeatMode"]:checked');

    if (!form || locationMode !== "managed_court" || repeatInput?.value === "weekly") {
      setAvailability(null);
      return;
    }

    const start = localDateTimeIso(startInput?.value ?? "");
    const end = localDateTimeIso(endInput?.value ?? "");
    if (!start || !end || end <= start) {
      setAvailability(null);
      return;
    }

    setLoading(true);
    setLoadError(false);
    const params = new URLSearchParams({ organisation: venueInput?.value || organisationId, start, end });
    if (excludeLessonId) params.set("lesson", excludeLessonId);

    try {
      const response = await fetch(`/api/coachr/courts/availability?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("availability_failed");
      const body = (await response.json()) as { courts?: AvailabilityRow[] };
      setAvailability(new Map((body.courts ?? []).map((court) => [court.court_id, court.available])));
    } catch {
      setLoadError(true);
      setAvailability(null);
    } finally {
      setLoading(false);
    }
  }, [excludeLessonId, locationMode, organisationId]);

  useEffect(() => {
    const form = selectRef.current?.form;
    if (!form) return;
    const inputs = ["startTime", "endTime", "repeatMode"].flatMap((name) => Array.from(form.querySelectorAll<HTMLElement>(`[name="${name}"]`)));
    const handleChange = () => void refreshAvailability();
    inputs.forEach((input) => input.addEventListener("change", handleChange));
    void refreshAvailability();
    return () => inputs.forEach((input) => input.removeEventListener("change", handleChange));
  }, [refreshAvailability]);

  const availableCount = availability ? courts.filter((court) => availability.get(court.id) !== false).length : courts.length;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-court-mist text-court-teal"><LocationIcon size={17} /></span>
        <div><p className="text-sm font-black text-court-navy">Lesson location</p><p className="text-xs leading-5 text-slate-600">Managed courts reserve live availability. Off-site locations do not create court bookings.</p></div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {(["managed_court", "external", "custom", "none"] as CoachLessonLocationMode[]).map((type) => (
          <label className={`rounded-lg border p-3 text-sm font-bold ${locationMode === type ? "border-court-teal bg-court-mist text-court-navy" : "border-slate-200 bg-white text-slate-700"}`} key={type}>
            <input checked={locationMode === type} className="mr-2" name="locationMode" onChange={() => setLocationMode(type)} type="radio" value={type} />
            {type === "managed_court" ? "PlayR court" : type === "external" ? "External venue" : type === "custom" ? "Other location" : "No court"}
          </label>
        ))}
      </div>

      <input name="locationType" type="hidden" value={locationMode === "external" ? "custom" : locationMode} />

      {locationMode === "managed_court" ? (
        <div className="mt-3">
          <label className="text-sm font-semibold text-slate-700">Court
            <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={defaultCourtId} name="courtId" ref={selectRef} required>
              <option value="">Choose court</option>
              {courts.map((court) => {
                const unavailable = availability?.get(court.id) === false;
                return <option disabled={unavailable} key={court.id} value={court.id}>{court.owner_name ? `${court.owner_name} — ` : ""}{court.name}{court.access_kind === "shared" ? " (shared)" : ""}{unavailable ? " — booked" : ""}</option>;
              })}
            </select>
          </label>
          {courts.length === 0 ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
              Your academy has not connected an available PlayR court yet. {canManageAccess ? <a className="font-black underline" href="/dashboard/coachr/settings">Manage coaching venues</a> : "Contact your academy leader to configure coaching venues."}
            </div>
          ) : availability && availableCount === 0 ? (
            <p className="mt-2 flex items-center gap-2 text-xs font-bold text-amber-800"><StatusIcon size={14} /> No courts are available for the selected time.</p>
          ) : (
            <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-600"><BookingIcon size={14} /> {loading ? "Checking live availability..." : "The selected court will be reserved for this lesson."}</p>
          )}
          {loadError ? <p className="mt-2 text-xs font-semibold text-amber-800">Live availability could not be refreshed. The server will check again before saving.</p> : null}
        </div>
      ) : locationMode === "external" ? (
        <div className="mt-3">
          <label className="block text-sm font-semibold text-slate-700">External venue
            <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={defaultExternalVenueId} name="externalVenueId" required>
              <option value="">Choose external venue</option>
              {externalVenues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}{venue.address ? ` — ${venue.address}` : ""}</option>)}
            </select>
          </label>
          {externalVenues.length === 0 ? <p className="mt-2 text-xs font-semibold text-amber-800">No external venues saved yet. <a className="font-black underline" href="/dashboard/coachr/settings">Add one in Academy Settings</a>.</p> : <p className="mt-2 text-xs font-semibold text-slate-600">Availability is managed outside PlayR. No court booking will be created.</p>}
        </div>
      ) : locationMode === "custom" ? (
        <label className="mt-3 block text-sm font-semibold text-slate-700">Other location<input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={defaultCustomLocation} name="customLocation" placeholder="Player home court or municipal venue" required /></label>
      ) : (
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-600"><ClubIcon size={15} /> No court reservation will be created.</p>
      )}
    </div>
  );
}
