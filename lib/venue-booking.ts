export function zaDateInput(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Johannesburg",
    year: "numeric"
  }).format(date);
}

export function dateWithSaOffset(date: string, hour: number, minute = 0) {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+02:00`);
}

export function clampVenueBookingDate(value: string | undefined, advanceBookingDays: number) {
  const today = zaDateInput();
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return today;
  const selected = dateWithSaOffset(value, 0).getTime();
  const start = dateWithSaOffset(today, 0).getTime();
  const latest = start + Math.max(0, Math.min(365, advanceBookingDays)) * 24 * 60 * 60 * 1000;
  return selected >= start && selected <= latest ? value : today;
}

export function dateInputFromSerial(serial: number) {
  return new Date(serial).toISOString().slice(0, 10);
}

export function venueBookingWeekRange(date: string) {
  const serial = Date.parse(`${date}T00:00:00Z`);
  const day = new Date(serial).getUTCDay();
  const start = serial - ((day + 6) % 7) * 24 * 60 * 60 * 1000;
  return { end: start + 7 * 24 * 60 * 60 * 1000, start };
}

export function venueBookingWeekLabel(start: number, end: number) {
  const formatter = new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", timeZone: "UTC" });
  const year = new Intl.DateTimeFormat("en-ZA", { timeZone: "UTC", year: "numeric" }).format(new Date(end - 1));
  return `${formatter.format(new Date(start))} - ${formatter.format(new Date(end - 1))} ${year}`;
}

export function venueBookingSlots(date: string, openingTime: string, closingTime: string, slotMinutes: number) {
  const [openingHour, openingMinute] = openingTime.slice(0, 5).split(":").map(Number);
  const [closingHour, closingMinute] = closingTime.slice(0, 5).split(":").map(Number);
  const opening = dateWithSaOffset(date, openingHour, openingMinute);
  const closing = dateWithSaOffset(date, closingHour, closingMinute);
  const slotCount = Math.max(0, Math.floor((closing.getTime() - opening.getTime()) / (slotMinutes * 60 * 1000)));
  return Array.from({ length: slotCount }, (_, index) => {
    const start = new Date(opening.getTime() + index * slotMinutes * 60 * 1000);
    const end = new Date(start.getTime() + slotMinutes * 60 * 1000);
    const formatter = new Intl.DateTimeFormat("en-ZA", { hour: "2-digit", hour12: false, minute: "2-digit", timeZone: "Africa/Johannesburg" });
    return { endTime: end.toISOString(), startTime: start.toISOString(), timeLabel: `${formatter.format(start)} - ${formatter.format(end)}` };
  });
}
