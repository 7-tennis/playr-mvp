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
export type UserRole = "player" | "parent" | "coach" | "head_coach" | "club_admin" | "platform_admin";
export type AdminRole = UserRole | "admin" | "staff";
export type CourtStatus = "active" | "inactive";
export type CourtBookingStatus = "confirmed" | "cancelled";
export type CourtBookingType = "player_booking" | "lesson" | "maintenance" | "club_programme" | "competition" | "americano";
export type MatchInviteType = "casual" | "verified";
export type MatchInviteStatus = "pending" | "accepted" | "declined" | "cancelled";
export type MatchVerificationStatus = "pending_confirmation" | "verified" | "disputed" | "admin_verified" | "cancelled";
export type RatingConfidence = "low" | "medium" | "high";
export type CoachLessonType = "private" | "group" | "squad" | "matchplay" | "assessment" | "other";
export type CoachLessonStatus = "scheduled" | "completed" | "missed" | "cancelled" | "rain" | "sick";
export type CoachLessonAttendanceStatus = "not_marked" | "attended" | "partial" | "missed" | "excused";
export type CoachLessonAttendanceResult = "attended" | "missed" | "cancelled" | "rain" | "sick";
export type CoachLessonFeedbackStatus = "not_started" | "draft" | "shared" | "completed";
export type NotificationType =
  | "match_invite_received"
  | "match_invite_accepted"
  | "match_invite_declined"
  | "match_invite_reminder"
  | "court_booking_confirmed"
  | "upcoming_booking_reminder"
  | "event_entry_confirmed"
  | "event_reminder"
  | "rating_updated"
  | "badge_unlocked"
  | "leaderboard_changed"
  | "membership_renewal"
  | "shop_reservation_update";
export type OrganisationType = "academy" | "club" | "school" | "district" | "club_academy" | "school_district";
export type OrganisationRole =
  | "organisation_admin"
  | "head_coach"
  | "coach"
  | "assistant_coach"
  | "club_manager"
  | "sports_coordinator"
  | "team_manager"
  | "viewer";
export type OrganisationMembershipStatus = "pending" | "active" | "declined" | "suspended" | "removed";
export type OrganisationInvitationStatus = "pending" | "accepted" | "declined" | "expired" | "cancelled";
export type OrganisationInvitationKind = "organisation_member" | "coach" | "player_junior";
export type OrganisationLinkStatus = "pending" | "active" | "declined" | "suspended" | "removed";
export type OrganisationAssignmentStatus = "active" | "suspended" | "removed";
export type OrganisationProgramRole = "coach" | "assistant_coach" | "player" | "manager" | "viewer";
export type ProductContext = "playr" | "coachr" | "clubr" | "teamr";

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
  venue_id: string | null;
  created_by: string | null;
  assigned_by_user_id: string | null;
  assigned_at: string | null;
  updated_at: string | null;
  deactivated_at: string | null;
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
  organisation_type: OrganisationType;
  logo_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  description: string | null;
  primary_admin_profile_id: string | null;
  head_coach_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganisationMembership {
  id: string;
  venue_id: string;
  profile_id: string;
  user_id: string | null;
  role: OrganisationRole;
  status: OrganisationMembershipStatus;
  invited_by_user_id: string | null;
  accepted_at: string | null;
  suspended_at: string | null;
  removed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganisationInvitation {
  id: string;
  venue_id: string;
  invitation_kind: OrganisationInvitationKind;
  invited_email: string;
  invited_phone: string | null;
  invited_name: string | null;
  intended_role: OrganisationRole;
  status: OrganisationInvitationStatus;
  token: string;
  invited_by_user_id: string;
  accepted_profile_id: string | null;
  accepted_by_user_id: string | null;
  target_profile_id: string | null;
  target_junior_profile_id: string | null;
  parent_profile_id: string | null;
  metadata: Record<string, unknown>;
  expires_at: string;
  accepted_at: string | null;
  declined_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganisationPlayerLink {
  id: string;
  venue_id: string;
  player_profile_id: string;
  parent_profile_id: string | null;
  invitation_id: string | null;
  status: OrganisationLinkStatus;
  requested_by_user_id: string | null;
  approved_by_user_id: string | null;
  approved_at: string | null;
  declined_at: string | null;
  removed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CoachPlayerAssignment {
  id: string;
  venue_id: string;
  coach_profile_id: string;
  player_profile_id: string;
  organisation_player_link_id: string | null;
  status: OrganisationAssignmentStatus;
  assigned_by_user_id: string | null;
  assigned_at: string;
  removed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganisationProgram {
  id: string;
  venue_id: string;
  name: string;
  description: string | null;
  status: "active" | "inactive";
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganisationProgramAssignment {
  id: string;
  program_id: string;
  profile_id: string;
  role: OrganisationProgramRole;
  status: OrganisationAssignmentStatus;
  assigned_by_user_id: string | null;
  assigned_at: string;
  removed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserActiveOrganisation {
  user_id: string;
  venue_id: string;
  product_context: ProductContext;
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

export interface CoachLesson {
  id: string;
  venue_id: string;
  coach_id: string;
  player_id: string;
  junior_profile_id: string | null;
  parent_id: string | null;
  court_id: string | null;
  court_booking_id: string | null;
  lesson_type: CoachLessonType;
  title: string;
  start_time: string;
  end_time: string;
  repeat_rule: string | null;
  recurring_group_id: string | null;
  status: CoachLessonStatus;
  attendance_status: CoachLessonAttendanceStatus;
  feedback_status: CoachLessonFeedbackStatus;
  notes: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  cancelled_at: string | null;
  cancelled_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CoachLessonAttendance {
  id: string;
  lesson_id: string;
  player_profile_id: string;
  junior_profile_id: string | null;
  attendance_status: CoachLessonAttendanceResult;
  recorded_by_user_id: string;
  recorded_at: string;
  notes: string | null;
  created_at: string;
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

export interface Notification {
  id: string;
  user_id: string;
  actor_user_id: string | null;
  profile_id: string | null;
  junior_profile_id: string | null;
  type: NotificationType;
  title: string;
  message: string;
  href: string | null;
  metadata: Record<string, unknown>;
  dedupe_key: string | null;
  read_at: string | null;
  created_at: string;
}
