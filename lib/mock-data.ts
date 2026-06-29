import type { CourtSideEvent } from "@/types/courtside";
export { formatDate, formatDateTime, formatLabel, formatPrice } from "@/lib/courtside-format";

export const featuredEvents: CourtSideEvent[] = [
  {
    id: "event_sunday_tennis",
    title: "Sunday Showdown Tennis Open",
    slug: "sunday-showdown-tennis-open",
    description: "A weekly competitive tennis event for players ready for match play.",
    event_type: "competitive",
    sport: "tennis",
    category: "competitive",
    age_group: "open",
    starts_at: "2026-06-07T07:00:00+02:00",
    ends_at: "2026-06-07T10:30:00+02:00",
    start_datetime: "2026-06-07T07:00:00+02:00",
    end_datetime: "2026-06-07T10:30:00+02:00",
    location: "PlayR pilot club",
    capacity: 32,
    entry_fee: 120,
    member_price: 80,
    non_member_price: 120,
    max_entries: 32,
    status: "published",
    created_by: null,
    created_at: "2026-05-19T00:00:00+02:00",
    updated_at: "2026-05-19T00:00:00+02:00"
  },
  {
    id: "event_pickleball_open",
    title: "Sunday Showdown Pickleball Open Mixed",
    slug: "sunday-showdown-pickleball-open-mixed",
    description: "Open mixed pickleball play with simple pools and friendly finals.",
    event_type: "social",
    sport: "pickleball",
    category: "social",
    age_group: "open",
    starts_at: "2026-06-14T08:00:00+02:00",
    ends_at: "2026-06-14T11:00:00+02:00",
    start_datetime: "2026-06-14T08:00:00+02:00",
    end_datetime: "2026-06-14T11:00:00+02:00",
    location: "PlayR pilot club",
    capacity: 24,
    entry_fee: 110,
    member_price: 70,
    non_member_price: 110,
    max_entries: 24,
    status: "published",
    created_by: null,
    created_at: "2026-05-19T00:00:00+02:00",
    updated_at: "2026-05-19T00:00:00+02:00"
  },
  {
    id: "event_green_ball",
    title: "Green Ball Primary School Event",
    slug: "green-ball-primary-school-event",
    description: "A junior-friendly green ball event for primary school players.",
    event_type: "junior",
    sport: "tennis",
    category: "junior",
    age_group: "green_ball",
    starts_at: "2026-06-21T07:30:00+02:00",
    ends_at: "2026-06-21T10:00:00+02:00",
    start_datetime: "2026-06-21T07:30:00+02:00",
    end_datetime: "2026-06-21T10:00:00+02:00",
    location: "PlayR pilot club",
    capacity: 20,
    entry_fee: 90,
    member_price: 60,
    non_member_price: 90,
    max_entries: 20,
    status: "published",
    created_by: null,
    created_at: "2026-05-19T00:00:00+02:00",
    updated_at: "2026-05-19T00:00:00+02:00"
  }
];

export function getEventBySlug(slug: string) {
  return featuredEvents.find((event) => event.slug === slug);
}
