export type MemberStatus = "member" | "non_member" | "pending" | "inactive";
export type PlayerLevel = "beginner" | "social" | "intermediate" | "club_competitive" | "advanced" | "unknown";
export type JuniorStage = "red_ball" | "orange_ball" | "green_ball" | "yellow_ball" | "not_sure";
export type JuniorRatingConfidence = "new" | "building" | "active" | "established" | "needs_update";
export type JuniorRatingHistoryReason = "event_result" | "manual_adjustment" | "stage_transition" | "admin_correction";
export type JuniorAchievementCategory = "participation" | "match" | "rating" | "coach" | "stage";
export type JuniorAchievementType = "automatic" | "coach_approved" | "admin_approved";
export type Sport = "tennis" | "pickleball" | "futsal" | "multi_sport";
export type EventStatus = "draft" | "published" | "cancelled" | "completed";
export type PaymentStatus = "unpaid" | "pending" | "paid" | "refunded" | "cancelled";
export type EntryStatus = "active" | "cancelled" | "checked_in" | "no_show";
export type AdminRole = "admin" | "staff";
export type CourtStatus = "active" | "inactive";
export type CourtBookingStatus = "confirmed" | "cancelled";
export type CourtBookingType = "player_booking" | "lesson" | "maintenance" | "club_programme" | "competition" | "americano";
export type MatchInviteType = "casual" | "verified";
export type MatchInviteStatus = "pending" | "accepted" | "declined" | "cancelled";
export type MatchVerificationStatus = "pending_confirmation" | "verified" | "disputed" | "admin_verified" | "cancelled";
export type RatingConfidence = "low" | "medium" | "high";

export interface Profile {
  id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  is_junior: boolean;
  parent_profile_id: string | null;
  junior_stage: JuniorStage | null;
  junior_rating: number;
  junior_rating_confidence: JuniorRatingConfidence;
  participation_score: number;
  matches_played: number;
  wins: number;
  losses: number;
  events_played: number;
  close_matches: number;
  stage_readiness_score: number;
  last_rating_update: string | null;
  rating_locked: boolean;
  rating_notes: string | null;
  member_status: MemberStatus;
  player_level: PlayerLevel;
  primary_sport: Sport;
  marketing_consent: boolean;
  marketing_consent_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CourtSideEvent {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  event_type: string | null;
  sport: Sport;
  category: string | null;
  age_group: string | null;
  starts_at: string | null;
  ends_at: string | null;
  start_datetime: string;
  end_datetime: string;
  location: string | null;
  capacity: number | null;
  entry_fee: number | null;
  member_price: number;
  non_member_price: number;
  max_entries: number | null;
  status: EventStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventEntry {
  id: string;
  event_id: string;
  profile_id: string;
  entered_by_user_id: string;
  price_charged: number;
  payment_status: PaymentStatus;
  payment_received_at: string | null;
  payment_reference: string | null;
  payment_notes: string | null;
  entry_status: EntryStatus;
  status: EntryStatus | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventResult {
  id: string;
  event_id: string;
  profile_id: string;
  event_entry_id: string | null;
  placement: number | null;
  points: number | null;
  result_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminUser {
  id: string;
  user_id: string;
  role: AdminRole;
  created_by: string | null;
  created_at: string;
}

export interface Court {
  id: string;
  venue_id: string | null;
  name: string;
  status: CourtStatus;
  sort_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Venue {
  id: string;
  name: string;
  slug: string;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface CourtBooking {
  id: string;
  court_id: string;
  booked_by_user_id: string;
  player_profile_id: string | null;
  start_time: string;
  end_time: string;
  status: CourtBookingStatus;
  booking_type: CourtBookingType;
  is_public: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  cancelled_by_user_id: string | null;
}

export interface MatchInvite {
  id: string;
  booking_id: string | null;
  invited_by_user_id: string;
  inviter_profile_id: string;
  opponent_profile_id: string;
  match_type: MatchInviteType;
  status: MatchInviteStatus;
  message: string | null;
  created_at: string;
  responded_at: string | null;
  updated_at: string;
}

export interface Match {
  id: string;
  match_invite_id: string;
  booking_id: string | null;
  submitted_by_user_id: string;
  winner_profile_id: string;
  score_text: string;
  verification_status: MatchVerificationStatus;
  confirmed_by_user_id: string | null;
  submitted_at: string;
  confirmed_at: string | null;
  updated_at: string;
}

export interface Rating {
  profile_id: string;
  rating_value: number;
  starting_rating: number;
  confidence: RatingConfidence;
  verified_match_count: number;
  provisional: boolean;
  last_calculated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RatingChange {
  id: string;
  match_id: string;
  profile_id: string;
  rating_before: number;
  rating_after: number;
  rating_delta: number;
  reason: string;
  created_at: string;
}

export interface JuniorRatingHistory {
  id: string;
  player_id: string;
  previous_stage: string | null;
  previous_rating: number | null;
  new_stage: string | null;
  new_rating: number | null;
  change_amount: number;
  reason: JuniorRatingHistoryReason;
  event_id: string | null;
  match_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface JuniorAchievement {
  id: string;
  player_id: string;
  badge_key: string;
  badge_name: string;
  category: JuniorAchievementCategory;
  stage: string;
  badge_type: JuniorAchievementType;
  earned_at: string;
  approved_by: string | null;
  related_event_id: string | null;
  related_match_id: string | null;
  notes: string | null;
}
