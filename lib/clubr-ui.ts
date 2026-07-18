export function clubRMessage(value?: string) {
  switch (value) {
    case "member_activated": return "Member activated. Club booking access is available again.";
    case "member_deactivated": return "Member deactivated. Historical bookings remain available.";
    case "member_pending": return "Member moved to pending.";
    case "member_role_added": return "Club role added.";
    case "member_role_removed": return "Club role removed.";
    case "court_updated": return "Court details updated.";
    case "block_created": return "Court closure created. The shared schedule is now blocked.";
    case "block_released": return "Court reopened. The shared schedule is available again.";
    case "notice_published": return "Notice published.";
    case "notice_updated": return "Notice updated.";
    case "club_details_updated": return "Club details updated.";
    case "booking_settings_updated": return "Booking rules updated across ClubR and player booking.";
    default: return null;
  }
}

export function clubRError(value?: string) {
  switch (value) {
    case "member_status_invalid": return "Choose a valid member status.";
    case "member_status_failed": return "The member status could not be changed. No access changes were made.";
    case "member_role_invalid": return "Choose a permitted club role.";
    case "member_role_failed": return "The club role could not be changed.";
    case "court_invalid": return "Check the court name and operating hours.";
    case "court_save_failed": return "The court could not be updated.";
    case "block_time_invalid": return "Choose a valid closure start and end time.";
    case "block_conflict": return "This closure overlaps an existing booking. Review the schedule and choose another time.";
    case "block_create_failed": return "The court could not be closed. No booking or availability changes were made.";
    case "block_release_failed": return "The court closure could not be released.";
    case "notice_invalid": return "Add a title, message, category, and valid publication dates.";
    case "notice_save_failed": return "The notice could not be saved.";
    case "club_details_invalid": return "Add a club name before saving.";
    case "club_details_failed": return "Club details could not be updated.";
    case "booking_settings_invalid": return "Check the booking hours and slot duration.";
    case "booking_settings_failed": return "Booking rules could not be updated.";
    default: return value ? "That ClubR change could not be completed." : null;
  }
}
