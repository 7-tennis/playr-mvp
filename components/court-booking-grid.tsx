"use client";

import { useState } from "react";
import { createCourtBooking } from "@/app/dashboard/book-court/actions";
import type { CourtBookingType } from "@/types/courtside";

type CourtOption = {
  id: string;
  name: string;
};

type ProfileOption = {
  id: string;
  name: string;
  label: string;
};

type BookingBlock = {
  court_id: string;
  player_profile_id: string | null;
  start_time: string;
  end_time: string;
  booking_type: CourtBookingType;
  player_name: string | null;
};

type Slot = {
  startTime: string;
  endTime: string;
  timeLabel: string;
};

type CourtBookingGridProps = {
  courts: CourtOption[];
  selectedCourtId: string;
  selectedDate: string;
  slots: Slot[];
  profiles: ProfileOption[];
  bookings: BookingBlock[];
  userProfileIds: string[];
};

function bookingLabel(booking: BookingBlock) {
  if (booking.booking_type === "player_booking") {
    return booking.player_name ? `Booked: ${booking.player_name}` : "Booked";
  }
  if (booking.booking_type === "lesson") {
    return "Coach Lesson";
  }
  return booking.booking_type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function CourtBookingGrid({ courts, selectedCourtId, selectedDate, slots, profiles, bookings, userProfileIds }: CourtBookingGridProps) {
  const [activeSlot, setActiveSlot] = useState<Slot | null>(null);
  const selectedCourt = courts.find((court) => court.id === selectedCourtId) ?? courts[0];

  const bookingBySlot = new Map<string, BookingBlock>();
  bookings
    .filter((booking) => booking.court_id === selectedCourtId)
    .forEach((booking) => {
      bookingBySlot.set(new Date(booking.start_time).toISOString(), booking);
    });

  return (
    <div>
      <div className="mb-4 -mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
        {courts.map((court) => (
          <a
            className={`shrink-0 rounded border px-3 py-2 text-sm font-black transition ${
              court.id === selectedCourtId ? "border-court-navy bg-court-navy text-white" : "border-slate-200 bg-white text-court-navy hover:border-court-teal hover:bg-court-mist"
            }`}
            href={`/dashboard/book-court?date=${selectedDate}&court=${court.id}`}
            key={court.id}
          >
            {court.name}
          </a>
        ))}
      </div>

      <div className="surface-card p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-black text-court-navy">{selectedCourt?.name ?? "Court"}</h2>
            <p className="text-sm text-slate-600">Tap an available slot to confirm a 60-minute booking.</p>
          </div>
          <form className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <input name="court" type="hidden" value={selectedCourtId} />
            <label className="text-sm font-semibold text-slate-700">
              Choose date
              <input className="mt-1 w-full rounded border border-slate-300 px-3 py-3 focus-ring sm:py-2" name="date" type="date" defaultValue={selectedDate} />
            </label>
            <button className="rounded bg-court-blue px-4 py-3 font-bold text-white transition hover:bg-blue-700 sm:py-2" type="submit">
              Show slots
            </button>
          </form>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {slots.map((slot) => {
            const booking = bookingBySlot.get(new Date(slot.startTime).toISOString());
            const isPast = new Date(slot.startTime).getTime() <= Date.now();
            const isUserBooking = Boolean(booking?.player_profile_id && userProfileIds.includes(booking.player_profile_id));
            const isBlock = Boolean(booking && booking.booking_type !== "player_booking");
            const disabled = Boolean(booking) || isPast || profiles.length === 0;
            const stateLabel = booking
              ? isUserBooking
                ? "Your booking"
                : isBlock
                  ? "Club block"
                  : "Booked"
              : isPast
                ? "Past"
                : profiles.length === 0
                  ? "Create a profile first"
                  : "Available";
            const stateClass = booking
              ? isUserBooking
                ? "border-court-teal bg-court-mist text-court-navy"
                : isBlock
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-slate-200 bg-slate-50 text-slate-500"
              : isPast || profiles.length === 0
                ? "border-slate-200 bg-slate-50 text-slate-500"
                : "border-emerald-200 bg-white text-court-navy hover:border-court-teal hover:shadow-court";

            return (
              <button
                className={`min-h-[96px] rounded-lg border p-4 text-left transition ${stateClass}`}
                disabled={disabled}
                key={slot.startTime}
                onClick={() => setActiveSlot(slot)}
                type="button"
              >
                <span className="block text-lg font-black">{slot.timeLabel}</span>
                <span className="mt-2 inline-flex rounded-full bg-white/70 px-2 py-1 text-xs font-bold">{stateLabel}</span>
                {booking ? <span className="mt-2 block text-sm">{bookingLabel(booking)}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      {activeSlot ? (
        <div className="fixed inset-0 z-40 grid place-items-end bg-slate-950/50 p-0 sm:place-items-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-court-navy">Book {selectedCourt?.name}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {activeSlot.timeLabel} for 60 minutes. Choose whether this is for you or a linked junior before confirming.
                </p>
              </div>
              <button className="rounded border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50" onClick={() => setActiveSlot(null)} type="button">
                Close
              </button>
            </div>
            <form action={createCourtBooking} className="mt-5 grid gap-4">
              <input name="courtId" type="hidden" value={selectedCourtId} />
              <input name="startTime" type="hidden" value={activeSlot.startTime} />
              <label className="text-sm font-semibold text-slate-700">
                Booking for <span className="font-normal text-slate-500">(choose yourself or a linked junior)</span>
                <select className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" name="profileId" required>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name} ({profile.label})
                    </option>
                  ))}
                </select>
                <span className="mt-2 block text-xs font-normal leading-5 text-slate-600">
                  Parents and guardians can book for linked junior profiles from this list.
                </span>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Notes <span className="font-normal text-slate-500">(optional)</span>
                <textarea className="mt-2 min-h-20 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="notes" placeholder="Add anything the club should know." />
              </label>
              <button className="rounded bg-court-teal px-4 py-3 font-bold text-white transition hover:bg-teal-500" type="submit">
                Confirm booking
              </button>
              <p className="text-xs leading-5 text-slate-500">
                This reserves the court only. Any club fees, lessons, or programme payments are handled separately for now.
              </p>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
