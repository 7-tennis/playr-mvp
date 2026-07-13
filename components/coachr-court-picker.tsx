"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookingIcon, ClubIcon, LocationIcon, StatusIcon } from "@/components/playr-icons";
import type { CoachLessonLocationType } from "@/types/courtside";

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
  defaultLocationType = "managed_court",
  excludeLessonId = null,
  organisationId
}: {
  canManageAccess?: boolean;
  courts: CourtOption[];
  defaultCourtId?: string;
  defaultCustomLocation?: string;
  defaultLocationType?: CoachLessonLocationType;
  excludeLessonId?: string | null;
  organisationId: string;
}) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const [locationType, setLocationType] = useState<CoachLessonLocationType>(defaultLocationType);
  const [availability, setAvailability] = useState<Map<string, boolean> | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const refreshAvailability = useCallback(async () => {
    const form = selectRef.current?.form;
    const startInput = form?.elements.namedItem("startTime") as HTMLInputElement | null;
    const endInput = form?.elements.namedItem("endTime") as HTMLInputElement | null;
    const venueInput = form?.elements.namedItem("venueId") as HTMLInputElement | HTMLSelectElement | null;
    const repeatInput = form?.querySelector<HTMLInputElement>('input[name="repeatMode"]:checked');

    if (!form || locationType !== "managed_court" || repeatInput?.value === "weekly") {
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
  }, [excludeLessonId, locationType, organisationId]);

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
        {(["managed_court", "custom", "none"] as CoachLessonLocationType[]).map((type) => (
          <label className={`rounded-lg border p-3 text-sm font-bold ${locationType === type ? "border-court-teal bg-court-mist text-court-navy" : "border-slate-200 bg-white text-slate-700"}`} key={type}>
            <input checked={locationType === type} className="mr-2" name="locationType" onChange={() => setLocationType(type)} type="radio" value={type} />
            {type === "managed_court" ? "PlayR court" : type === "custom" ? "Off-site" : "No court"}
          </label>
        ))}
      </div>

      {locationType === "managed_court" ? (
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
              No courts are configured or shared with this organisation. {canManageAccess ? <a className="font-black underline" href="/dashboard/coachr/courts">Manage court access</a> : "Contact your organisation administrator or head coach to configure court access."}
            </div>
          ) : availability && availableCount === 0 ? (
            <p className="mt-2 flex items-center gap-2 text-xs font-bold text-amber-800"><StatusIcon size={14} /> No courts are available for the selected time.</p>
          ) : (
            <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-600"><BookingIcon size={14} /> {loading ? "Checking live availability..." : "The selected court will be reserved for this lesson."}</p>
          )}
          {loadError ? <p className="mt-2 text-xs font-semibold text-amber-800">Live availability could not be refreshed. The server will check again before saving.</p> : null}
        </div>
      ) : locationType === "custom" ? (
        <label className="mt-3 block text-sm font-semibold text-slate-700">Off-site location<input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={defaultCustomLocation} name="customLocation" placeholder="Away venue or school event" required /></label>
      ) : (
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-600"><ClubIcon size={15} /> No court reservation will be created.</p>
      )}
    </div>
  );
}
