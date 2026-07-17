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
export type CoachLessonLocationType = "managed_court" | "custom" | "none";
export type CoachLessonSeriesEndMode = "until_cancelled" | "until_date" | "occurrence_count";
export type CoachLessonSeriesStatus = "active" | "ended" | "cancelled";
export type OrganisationCourtAccessStatus = "active" | "inactive" | "revoked";
export type MatchInviteType = "casual" | "verified";
export type MatchInviteStatus = "pending" | "accepted" | "declined" | "cancelled";
export type MatchVerificationStatus = "pending_confirmation" | "verified" | "disputed" | "admin_verified" | "cancelled";
export type RatingConfidence = "low" | "medium" | "high";
export type CoachLessonType = "private" | "group" | "squad" | "matchplay" | "assessment" | "other";
export type CoachLessonStatus = "scheduled" | "completed" | "missed" | "cancelled" | "rain" | "sick";
export type CoachLessonAttendanceStatus = "not_marked" | "attended" | "partial" | "missed" | "excused";
export type CoachLessonAttendanceResult = "attended" | "missed" | "cancelled" | "rain" | "sick";
export type CoachLessonFeedbackStatus = "not_started" | "draft" | "shared" | "completed";
export type CoachSessionType = "private" | "semi_private" | "squad";
export type CoachSessionStatus = "active" | "paused" | "ended" | "cancelled";
export type CoachSessionParticipantStatus = "active" | "pending" | "paused" | "removed";
export type CoachSessionOccurrenceStatus = "scheduled" | "completed" | "cancelled" | "rain" | "sick";
export type CoachSessionAttendanceStatus = "present" | "absent" | "excused" | "late" | "not_recorded";
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
  | "shop_reservation_update"
  | "coach_invitation"
  | "player_link_invitation"
  | "parent_approval_required"
  | "invitation_accepted"
  | "invitation_declined"
  | "lesson_created"
  | "lesson_updated"
  | "lesson_cancelled"
  | "new_message";
export type NotificationStatus = "unread" | "read" | "action_required" | "resolved" | "expired";
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
export type OrganisationInvitationKind = "organisation_member" | "coach" | "player" | "player_junior";
export type OrganisationLinkStatus = "pending" | "active" | "declined" | "suspended" | "removed";
export type OrganisationAssignmentStatus = "active" | "suspended" | "removed";
export type OrganisationProgramRole = "coach" | "assistant_coach" | "player" | "manager" | "viewer";
export type ProductContext = "playr" | "coachr" | "clubr" | "teamr";
export type OrganisationSetupProduct = "coachr" | "clubr" | "teamr";
export type OrganisationSetupStatus = "not_started" | "in_progress" | "complete" | "skipped" | "needs_review";
export type CourtAccessReadinessStatus = "active" | "pending" | "no_courts_shared" | "unavailable" | "expired" | "revoked" | "invalid_context";
export type CourtAccessRequestStatus = "pending" | "active" | "declined" | "cancelled" | "expired";
export type CoachingProposalStatus = "not_specified" | "proposed" | "confirmed" | "declined";

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
  operator_venue_id: string | null;
  court_number: string | null;
  surface: string | null;
  lighting_available: boolean;
  opening_time: string | null;
  closing_time: string | null;
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
  main_contact_name: string | null;
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
  accepted_by_profile_id: string | null;
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

export interface AcademyStudentCoachAssignment {
  assignmentId: string;
  coachProfileId: string;
  coachName: string;
  assignedAt: string;
}

export interface ActiveAcademyStudent {
  organisationPlayerLinkId: string;
  venueId: string;
  playerProfileId: string;
  firstName: string;
  lastName: string;
  isJunior: boolean;
  parentProfileId: string | null;
  parentName: string | null;
  juniorStage: JuniorStage | null;
  playerLevel: PlayerLevel | null;
  status: "active";
  proposalStatus: CoachingProposalStatus;
  connectionContext: Record<string, unknown>;
  approvedAt: string | null;
  assignedCoaches: AcademyStudentCoachAssignment[];
  assignedToCurrentUser: boolean;
}

export interface AcademyConnectionCandidate {
  playerProfileId: string;
  playerName: string;
  isJunior: boolean;
  parentProfileId: string | null;
  parentName: string | null;
  maskedEmail: string | null;
  relationshipStatus: OrganisationLinkStatus | "not_connected";
}

export interface PlayerConnectionAcceptanceResult {
  status: OrganisationInvitationStatus;
  alreadyAccepted: boolean;
  invitationId: string;
  acceptedProfileId?: string;
  acceptedByProfileId?: string;
  organisationPlayerLinkId?: string;
  coachAssignmentId?: string;
  coachAssignmentStatus?: "active" | "unassigned";
  proposalStatus?: CoachingProposalStatus;
  warning?: string;
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
  connection_context: Record<string, unknown>;
  proposal_status: CoachingProposalStatus;
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
  booking_organisation_id: string | null;
  owner_organisation_id: string | null;
  coach_lesson_id: string | null;
  booking_purpose: string | null;
  coach_profile_id: string | null;
  source_product: string | null;
  coach_session_occurrence_id: string | null;
}

export interface OrganisationCourtAccess {
  id: string;
  owner_venue_id: string;
  approved_venue_id: string;
  court_id: string | null;
  status: OrganisationCourtAccessStatus;
  valid_from: string | null;
  valid_until: string | null;
  notes: string | null;
  created_by_user_id: string;
  revoked_by_user_id: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganisationProductSetup {
  id: string;
  venue_id: string;
  product_context: OrganisationSetupProduct;
  status: OrganisationSetupStatus;
  current_step: string;
  completed_steps: string[];
  skipped_steps: string[];
  metadata: Record<string, unknown>;
  completed_by_user_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganisationBookingSettings {
  venue_id: string;
  slot_minutes: number;
  opening_time: string;
  closing_time: string;
  member_booking_enabled: boolean;
  non_member_booking_enabled: boolean;
  non_member_price_cents: number | null;
  advance_booking_days: number;
  max_active_bookings: number;
  no_courts: boolean;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganisationCoachingSettings {
  venue_id: string;
  default_lesson_duration_minutes: number;
  default_lesson_type: CoachLessonType;
  default_external_venue_id: string | null;
  private_lessons_enabled: boolean;
  group_lessons_enabled: boolean;
  no_default_venue: boolean;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganisationExternalVenue {
  id: string;
  organisation_id: string;
  name: string;
  address: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  court_count: number | null;
  court_names: string[];
  notes: string | null;
  status: "active" | "inactive";
  linked_venue_id: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface OrganisationCourtAccessRequest {
  id: string;
  requester_venue_id: string;
  owner_venue_id: string;
  requested_court_ids: string[];
  status: CourtAccessRequestStatus;
  request_notes: string | null;
  response_notes: string | null;
  requested_by_user_id: string;
  responded_by_user_id: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
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
  location_type: CoachLessonLocationType;
  custom_location: string | null;
  external_venue_id: string | null;
  lesson_type: CoachLessonType;
  title: string;
  start_time: string;
  end_time: string;
  repeat_rule: string | null;
  recurring_group_id: string | null;
  recurrence_date: string | null;
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

export interface CoachSession {
  id: string;
  venue_id: string;
  session_type: CoachSessionType;
  name: string;
  description: string | null;
  primary_coach_id: string;
  capacity: number;
  status: CoachSessionStatus;
  repeat_mode: "none" | "weekly";
  weekday: number | null;
  start_local_time: string;
  duration_minutes: number;
  start_date: string;
  end_mode: CoachLessonSeriesEndMode | null;
  end_date: string | null;
  occurrence_count: number | null;
  generated_through: string | null;
  location_type: CoachLessonLocationType;
  external_venue_id: string | null;
  custom_location: string | null;
  notes: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  ended_by_user_id: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CoachSessionCoach {
  id: string;
  session_id: string;
  coach_profile_id: string;
  role: "primary" | "assistant";
  status: "active" | "removed";
  added_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CoachSessionParticipant {
  id: string;
  session_id: string;
  player_profile_id: string;
  parent_profile_id: string | null;
  status: CoachSessionParticipantStatus;
  joined_on: string;
  ends_on: string | null;
  added_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CoachSessionOccurrence {
  id: string;
  session_id: string;
  occurrence_date: string;
  start_time: string;
  end_time: string;
  status: CoachSessionOccurrenceStatus;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  cancelled_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CoachSessionOccurrenceCoach {
  id: string;
  occurrence_id: string;
  coach_profile_id: string;
  role: "primary" | "assistant" | "replacement";
  status: "active" | "removed";
  assigned_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CoachSessionOccurrenceParticipant {
  id: string;
  occurrence_id: string;
  player_profile_id: string;
  parent_profile_id: string | null;
  status: "active" | "removed";
  created_at: string;
  updated_at: string;
}

export interface CoachSessionAttendance {
  id: string;
  occurrence_id: string;
  player_profile_id: string;
  attendance_status: CoachSessionAttendanceStatus;
  recorded_by_user_id: string | null;
  recorded_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CoachLessonSeries {
  id: string;
  venue_id: string;
  coach_id: string;
  player_id: string;
  junior_profile_id: string | null;
  parent_id: string | null;
  lesson_type: CoachLessonType;
  title: string;
  frequency: "weekly";
  weekday: number;
  start_local_time: string;
  duration_minutes: number;
  start_date: string;
  end_mode: CoachLessonSeriesEndMode;
  end_date: string | null;
  occurrence_count: number | null;
  generated_through: string | null;
  generated_occurrence_count: number;
  status: CoachLessonSeriesStatus;
  location_type: CoachLessonLocationType;
  court_id: string | null;
  external_venue_id: string | null;
  custom_location: string | null;
  notes: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  ended_by_user_id: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  exceptions?: CoachLessonSeriesException[] | null;
}

export interface CoachLessonSeriesException {
  id: string;
  series_id: string;
  occurrence_date: string;
  lesson_id: string | null;
  status: "conflict" | "cancelled" | "edited";
  reason: string | null;
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
  status: NotificationStatus;
  action_required: boolean;
  invitation_id: string | null;
  read_at: string | null;
  resolved_at: string | null;
  created_at: string;
}
