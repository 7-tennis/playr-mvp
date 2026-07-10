import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { cancelMatchInvite, createMatchInvite, respondToMatchInvite, respondToMatchResult, submitMatchResult } from "@/app/dashboard/play/actions";
import type { PlayerSearchOption } from "@/app/dashboard/play/player-search-picker";
import {
  BadgeIcon,
  BookingIcon,
  ChallengeIcon,
  CloseMatchIcon,
  ConfidenceIcon,
  InviteIcon,
  MatchIcon,
  ParticipationIcon,
  RatingIcon,
  ResultIcon,
  TimeIcon
} from "@/components/playr-icons";
import { SubmitButton } from "@/components/submit-button";
import { formatDate, formatDateTime, formatJuniorRating, formatLabel } from "@/lib/courtside-format";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type {
  Court,
  CourtBooking,
  JuniorStage,
  MatchInviteStatus,
  MatchInviteType,
  MatchVerificationStatus,
  PlayerLevel,
  Profile,
  Rating,
  Sport
} from "@/types/courtside";

export type ProfileOption = Pick<
  Profile,
  | "id"
  | "first_name"
  | "last_name"
  | "is_junior"
  | "primary_sport"
  | "player_level"
  | "junior_stage"
  | "junior_rating"
  | "junior_rating_confidence"
  | "participation_score"
  | "matches_played"
  | "wins"
  | "losses"
>;

export type MatchCandidate = {
  id: string;
  first_name: string;
  last_name: string;
  is_junior: boolean;
  primary_sport: Sport;
  player_level: PlayerLevel;
  junior_stage: JuniorStage | null;
  parent_first_name: string | null;
  parent_last_name: string | null;
};

export type BookingOption = Pick<CourtBooking, "id" | "start_time" | "end_time" | "player_profile_id"> & {
  courts: Pick<Court, "name"> | null;
  profiles: Pick<Profile, "first_name" | "last_name" | "is_junior"> | null;
};

export type CandidateProfileDetail = Pick<Profile, "id" | "junior_rating" | "junior_rating_confidence" | "participation_score" | "matches_played" | "wins" | "losses">;

export type MatchInviteDetail = {
  id: string;
  booking_id: string | null;
  invited_by_user_id: string;
  inviter_profile_id: string;
  inviter_first_name: string;
  inviter_last_name: string;
  inviter_is_junior: boolean;
  opponent_profile_id: string;
  opponent_first_name: string;
  opponent_last_name: string;
  opponent_is_junior: boolean;
  match_type: MatchInviteType;
  status: MatchInviteStatus;
  message: string | null;
  created_at: string;
  responded_at: string | null;
  booking_start_time: string | null;
  booking_end_time: string | null;
  booking_court_name: string | null;
};

export type MatchDetail = {
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
  inviter_profile_id: string;
  inviter_first_name: string;
  inviter_last_name: string;
  inviter_is_junior: boolean;
  opponent_profile_id: string;
  opponent_first_name: string;
  opponent_last_name: string;
  opponent_is_junior: boolean;
  booking_start_time: string | null;
  booking_court_name: string | null;
};

export type PlaySearchParams = {
  q?: string;
  date?: string;
  court?: string;
  player?: string;
  invite?: string;
  result?: string;
  error?: string;
};

export type ReadyPlayData = {
  acceptedInvitesWithoutResult: MatchInviteDetail[];
  adultProfile: ProfileOption;
  availableSlots: Array<{ startTime: string; timeLabel: string }>;
  awaitingOpponentConfirmations: MatchDetail[];
  bookings: BookingOption[];
  candidateDetailsByProfileId: Map<string, CandidateProfileDetail>;
  candidateError: unknown;
  candidateRatingsByProfileId: Map<string, Rating>;
  candidates: MatchCandidate[];
  closeSuggestions: MatchCandidate[];
  courts: Court[];
  courtsError: unknown;
  dayStart: Date;
  inviteError: unknown;
  invites: MatchInviteDetail[];
  matchError: unknown;
  matches: MatchDetail[];
  ownProfileIds: string[];
  ownProfiles: ProfileOption[];
  ownRatingsByProfileId: Map<string, Rating>;
  ownRatingError: unknown;
  pendingConfirmations: MatchDetail[];
  receivedInvites: MatchInviteDetail[];
  search: string;
  selectedCourtId: string;
  selectedDate: string;
  selectedProfile: ProfileOption;
  sentInvites: MatchInviteDetail[];
  slotBookingError: unknown;
  strongerSuggestions: MatchCandidate[];
  upcomingMatchInvites: MatchInviteDetail[];
  userId: string;
};

export type PlayData =
  | { kind: "no-config" }
  | { kind: "no-profile" }
  | {
      kind: "ready";
      data: ReadyPlayData;
    };

export function inviteMessage(value?: string) {
  switch (value) {
    case "created":
      return "Match invite sent. It will appear under Sent invites while you wait for a response.";
    case "accepted":
      return "Match invite accepted.";
    case "declined":
      return "Match invite declined.";
    case "cancelled":
      return "Match invite cancelled.";
    default:
      return null;
  }
}

export function resultMessage(value?: string) {
  switch (value) {
    case "submitted":
      return "Result submitted. The other player can now confirm or dispute it.";
    case "verified":
      return "Result confirmed. Verified matches can update PlayR Ratings.";
    case "disputed":
      return "Result disputed. An admin can review it.";
    default:
      return null;
  }
}

export function errorMessage(value?: string) {
  switch (value) {
    case "missing_fields":
      return "Choose who the invite is from and who it is going to.";
    case "profile_not_allowed":
      return "Choose your own profile or a linked junior as the inviter.";
    case "opponent_not_allowed":
      return "Choose another player profile as the opponent.";
    case "booking_not_allowed":
      return "Choose one of your own future court bookings, or send the invite without a booking.";
    case "missing_booking_slot":
      return "Choose an available court and time slot before booking through Play.";
    case "booking_window":
      return "Choose a court time in the next 7 days.";
    case "court_unavailable":
      return "That court is not available.";
    case "slot_unavailable":
      return "That slot has just been booked. Choose another available time.";
    case "booking_create_failed":
      return "We could not create the court booking. Please choose another slot.";
    case "invalid_invite":
      return "That match invite could not be found.";
    case "invite_update_failed":
      return "The match invite could not be updated. Please try again.";
    case "invite_failed":
      return "The match invite could not be sent. Please try again.";
    case "missing_result_fields":
      return "Choose a winner and enter the score before submitting.";
    case "result_invite_unavailable":
      return "Results can only be submitted for accepted match invites.";
    case "winner_not_allowed":
      return "The winner must be one of the two invited players.";
    case "result_exists":
      return "A result has already been submitted for that match invite.";
    case "result_failed":
      return "The result could not be submitted. Please try again.";
    case "invalid_result":
      return "That match result could not be found.";
    case "result_update_failed":
      return "The match result could not be updated. Please try again.";
    default:
      return null;
  }
}

export function playerName(firstName: string, lastName: string, isJunior: boolean) {
  return `${firstName} ${lastName}${isJunior ? " (junior)" : ""}`;
}

export function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function playerInitials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export function juniorStageLabel(stage: JuniorStage | string | null | undefined) {
  switch (stage) {
    case "red_ball":
      return "Red Ball";
    case "orange_ball":
      return "Orange Ball";
    case "green_ball":
      return "Green Ball";
    case "yellow_ball":
      return "Yellow Ball";
    case "not_sure":
      return "Ball stage pending";
    default:
      return "Junior";
  }
}

function playerLevelRating(level: PlayerLevel | null | undefined) {
  switch (level) {
    case "advanced":
      return 8;
    case "club_competitive":
      return 6.5;
    case "intermediate":
      return 5;
    case "social":
      return 3.5;
    case "beginner":
      return 2;
    default:
      return 3.5;
  }
}

export function profileRatingValue(profile: ProfileOption, ratingsByProfileId: Map<string, Rating>) {
  if (profile.is_junior) {
    return profile.junior_rating;
  }

  return ratingsByProfileId.get(profile.id)?.rating_value ?? playerLevelRating(profile.player_level);
}

export function profileRatingLabel(profile: ProfileOption, ratingsByProfileId: Map<string, Rating>) {
  if (profile.is_junior) {
    return formatJuniorRating(profile.junior_stage, profile.junior_rating);
  }

  const rating = ratingsByProfileId.get(profile.id);
  return rating ? rating.rating_value.toFixed(1) : `${playerLevelRating(profile.player_level).toFixed(1)} est.`;
}

export function candidateRatingValue(candidate: MatchCandidate, detailsByProfileId: Map<string, CandidateProfileDetail>, ratingsByProfileId: Map<string, Rating>) {
  if (candidate.is_junior) {
    return detailsByProfileId.get(candidate.id)?.junior_rating ?? null;
  }

  return ratingsByProfileId.get(candidate.id)?.rating_value ?? playerLevelRating(candidate.player_level);
}

export function candidateRatingLabel(candidate: MatchCandidate, detailsByProfileId: Map<string, CandidateProfileDetail>, ratingsByProfileId: Map<string, Rating>) {
  if (candidate.is_junior) {
    const detail = detailsByProfileId.get(candidate.id);
    return detail ? formatJuniorRating(candidate.junior_stage, detail.junior_rating) : `${juniorStageLabel(candidate.junior_stage)} rating pending`;
  }

  const rating = ratingsByProfileId.get(candidate.id);
  return rating ? rating.rating_value.toFixed(1) : `${playerLevelRating(candidate.player_level).toFixed(1)} est.`;
}

export function possibleUnlocks(profile: ProfileOption, stronger = false) {
  if (!profile.is_junior) {
    return stronger ? ["Upset Win", "Rating Climber", "Verified Result"] : ["Verified Result", "Match Practice"];
  }

  const unlocks: string[] = [];
  if (profile.matches_played === 0) {
    unlocks.push("First Match");
  }
  if (profile.wins === 0) {
    unlocks.push("First Win");
  }
  if (profile.matches_played === 4) {
    unlocks.push("5 Matches");
  }
  if (profile.matches_played === 9) {
    unlocks.push("10 Matches");
  }
  unlocks.push(stronger ? "Upset Win" : "Close Match Player");
  if (stronger) {
    unlocks.push("Rating Climber");
  }
  return unlocks.slice(0, 3);
}

export function zaDateInput(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function dateWithSaOffset(date: string, hour: number) {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:00:00+02:00`);
}

export function clampDate(value?: string) {
  const today = zaDateInput();
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return today;
  }

  const selected = dateWithSaOffset(value, 0).getTime();
  const start = dateWithSaOffset(today, 0).getTime();
  const end = start + 7 * 24 * 60 * 60 * 1000;
  return selected >= start && selected < end ? value : today;
}

export function bookingDates() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(dateWithSaOffset(zaDateInput(), 0).getTime() + index * 24 * 60 * 60 * 1000);
    const value = zaDateInput(date);
    return {
      value,
      label: index === 0 ? "Today" : formatDate(date.toISOString())
    };
  });
}

export function slotsForDate(date: string) {
  return Array.from({ length: 15 }, (_, index) => {
    const start = dateWithSaOffset(date, 6 + index);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return {
      startTime: start.toISOString(),
      timeLabel: `${String(start.getUTCHours() + 2).padStart(2, "0")}:00 - ${String(end.getUTCHours() + 2).padStart(2, "0")}:00`
    };
  });
}

export function formatCourtDateLabel(date: Date) {
  return formatDate(date.toISOString());
}

export function formatBookingLabel(booking: BookingOption) {
  const player = booking.profiles ? `${booking.profiles.first_name} ${booking.profiles.last_name}${booking.profiles.is_junior ? " (junior)" : ""}` : "Player";
  return `${booking.courts?.name ?? "Court"} / ${formatDateTime(booking.start_time)} / ${player}`;
}

function challengeStyle(type: "close" | "stronger") {
  return type === "stronger"
    ? {
        label: "Stronger Challenge",
        icon: <ChallengeIcon size={14} />,
        description: "Test yourself against a stronger player.",
        badge: "bg-court-navy text-white",
        tint: "bg-court-navy/5",
        border: "border-court-navy/20"
      }
    : {
        label: "Close Match",
        icon: <CloseMatchIcon size={14} />,
        description: "A balanced challenge near your level.",
        badge: "bg-emerald-50 text-emerald-700",
        tint: "bg-emerald-50/70",
        border: "border-emerald-200"
      };
}

function actionTone(tone: "teal" | "navy" | "green" | "blue") {
  switch (tone) {
    case "navy":
      return { icon: "bg-court-navy text-white", action: "bg-court-navy text-white", meta: "bg-court-navy/10 text-court-navy" };
    case "green":
      return { icon: "bg-emerald-50 text-emerald-700", action: "bg-emerald-600 text-white", meta: "bg-emerald-50 text-emerald-700" };
    case "blue":
      return { icon: "bg-sky-50 text-court-blue", action: "bg-court-blue text-white", meta: "bg-sky-50 text-court-blue" };
    default:
      return { icon: "bg-court-mist text-court-teal", action: "bg-court-teal text-white", meta: "bg-court-mist text-court-teal" };
  }
}

export function ActionCard({
  description,
  href,
  icon,
  title,
  action,
  meta,
  tone = "teal"
}: {
  description: string;
  href: string;
  icon: ReactNode;
  title: string;
  action: string;
  meta?: string;
  tone?: "teal" | "navy" | "green" | "blue";
}) {
  const styles = actionTone(tone);

  return (
    <Link className="group rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-court-teal hover:shadow-court" href={href}>
      <div className="flex items-start gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded ${styles.icon}`}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="text-lg font-black text-court-navy">{title}</h2>
            {meta ? <span className={`rounded px-2 py-1 text-xs font-black uppercase tracking-wide ${styles.meta}`}>{meta}</span> : null}
          </div>
          <p className="mt-1 text-sm leading-5 text-slate-600">{description}</p>
          <p className={`mt-3 inline-flex rounded px-3 py-2 text-sm font-bold transition group-hover:shadow-sm ${styles.action}`}>{action}</p>
        </div>
      </div>
    </Link>
  );
}

function ImpactChips({ type }: { type: "close" | "stronger" }) {
  const win = type === "stronger" ? "+0.25" : "+0.15";
  const loss = type === "stronger" ? "-0.05" : "-0.10";

  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <span className="ui-chip ui-chip-success">
        <RatingIcon size={14} /> Win {win}
      </span>
      <span className="ui-chip bg-rose-50 text-rose-700">
        <ResultIcon size={14} /> Loss {loss}
      </span>
    </div>
  );
}

export function SuggestionCard({
  candidate,
  detailsByProfileId,
  ratingsByProfileId,
  returnTo = "/dashboard/play/challenges",
  selectedProfile,
  type
}: {
  candidate: MatchCandidate;
  detailsByProfileId: Map<string, CandidateProfileDetail>;
  ratingsByProfileId: Map<string, Rating>;
  returnTo?: string;
  selectedProfile: ProfileOption;
  type: "close" | "stronger";
}) {
  const unlocks = possibleUnlocks(selectedProfile, type === "stronger");
  const detail = detailsByProfileId.get(candidate.id);
  const rating = ratingsByProfileId.get(candidate.id);
  const confidence = candidate.is_junior ? detail?.junior_rating_confidence : rating?.confidence;
  const matchCount = candidate.is_junior ? detail?.matches_played : rating?.verified_match_count;
  const challenge = challengeStyle(type);
  const playerType = candidate.is_junior ? "Junior" : "Adult";
  const ratingContext = candidate.is_junior ? `${juniorStageLabel(candidate.junior_stage)} · ${candidateRatingLabel(candidate, detailsByProfileId, ratingsByProfileId)}` : `Adult · ${candidateRatingLabel(candidate, detailsByProfileId, ratingsByProfileId)}`;

  return (
    <article className={`overflow-hidden rounded-lg border bg-white shadow-sm ${challenge.border}`}>
      <div className={`h-1.5 ${type === "stronger" ? "bg-court-navy" : "bg-court-teal"}`} />
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded bg-court-navy text-sm font-black text-white">
            {playerInitials(candidate.first_name, candidate.last_name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate font-black text-court-navy">
                  {candidate.first_name} {candidate.last_name}
                </h3>
                <p className="mt-1 text-sm font-semibold text-slate-600">{ratingContext}</p>
              </div>
              <span className="rounded bg-slate-100 px-2 py-1 text-xs font-black uppercase tracking-wide text-slate-600">{playerType}</span>
            </div>
            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">{candidate.is_junior ? juniorStageLabel(candidate.junior_stage) : formatLabel(candidate.player_level)}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-court-navy">
          {confidence ? (
            <span className="ui-chip ui-chip-brand">
              <ConfidenceIcon size={14} /> {formatLabel(confidence)}
            </span>
          ) : null}
          {typeof matchCount === "number" ? (
            <span className="ui-chip ui-chip-muted">
              <MatchIcon size={14} /> {countLabel(matchCount, "match", "matches")}
            </span>
          ) : null}
        </div>
        <div className={`mt-4 rounded border p-3 ${challenge.tint} ${challenge.border}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-2.5 py-1 text-xs font-black uppercase tracking-wide ${challenge.badge}`}>
              <span className="inline-flex items-center gap-1.5">
                {challenge.icon} {challenge.label}
              </span>
            </span>
            <span className="text-xs font-semibold text-slate-600">{challenge.description}</span>
          </div>
          <div className="mt-3 grid gap-3">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Estimated rating</p>
              <ImpactChips type={type} />
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-bold">
              <span className="inline-flex items-center gap-1.5 rounded bg-white px-2.5 py-1 text-court-navy shadow-sm">
                <ParticipationIcon size={14} /> Participation +15
              </span>
            </div>
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Possible unlocks</p>
              {unlocks.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {unlocks.map((unlock) => (
                    <span className="rounded bg-white px-2.5 py-1 text-xs font-bold text-court-navy shadow-sm" key={unlock}>
                      <span className="inline-flex items-center gap-1.5">
                        <BadgeIcon size={14} /> {unlock}
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs font-semibold text-slate-600">Keep playing to unlock badges.</p>
              )}
            </div>
          </div>
        </div>
        <form action={createMatchInvite} className="mt-4">
          <input name="return_to" type="hidden" value={returnTo} />
          <input name="inviter_profile_id" type="hidden" value={selectedProfile.id} />
          <input name="opponent_profile_id" type="hidden" value={candidate.id} />
          <input name="booking_mode" type="hidden" value="existing" />
          <input name="match_type" type="hidden" value="verified" />
          <input name="message" type="hidden" value={type === "stronger" ? "Challenge up from PlayR." : "Challenge from PlayR."} />
          <SubmitButton className="w-full rounded bg-court-teal px-3 py-2 text-sm font-bold text-white" pendingText="Sending...">
            {type === "stronger" ? "Challenge Up" : "Send Challenge"}
          </SubmitButton>
        </form>
      </div>
    </article>
  );
}

export function UpcomingMatchCard({ invite, ownProfileIds }: { invite: MatchInviteDetail; ownProfileIds: string[] }) {
  const sent = ownProfileIds.includes(invite.inviter_profile_id);
  const opponentName = sent
    ? playerName(invite.opponent_first_name, invite.opponent_last_name, invite.opponent_is_junior)
    : playerName(invite.inviter_first_name, invite.inviter_last_name, invite.inviter_is_junior);
  const actionHref = invite.status === "accepted" ? "/dashboard/play/matches#submit-result" : sent ? "/dashboard/play/matches#sent-invites" : "/dashboard/play/matches#received-invites";
  const actionText = invite.status === "accepted" ? "Submit Result" : sent ? "View Sent" : "Respond";

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded bg-court-mist px-2.5 py-1 text-xs font-black uppercase tracking-wide text-court-teal">
              <InviteIcon size={14} /> {formatLabel(invite.status)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded bg-slate-100 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-slate-600">
              <MatchIcon size={14} /> {formatLabel(invite.match_type)}
            </span>
          </div>
          <h3 className="mt-1 font-black text-court-navy">vs {opponentName}</h3>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-700">
            <span className="inline-flex items-center gap-1.5 rounded bg-slate-50 px-2.5 py-1">
              <TimeIcon size={14} /> {invite.booking_start_time ? formatDateTime(invite.booking_start_time) : "Time TBC"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded bg-slate-50 px-2.5 py-1">
              <BookingIcon size={14} /> {invite.booking_court_name ?? "Court TBC"}
            </span>
          </div>
        </div>
        <Link className="inline-flex shrink-0 justify-center rounded bg-court-teal px-3 py-2 text-sm font-bold text-white" href={actionHref}>
          {actionText}
        </Link>
      </div>
    </article>
  );
}

export function ResultCard({ match, currentUserId }: { match: MatchDetail; currentUserId: string }) {
  const submittedByCurrentUser = match.submitted_by_user_id === currentUserId;
  const winnerName =
    match.winner_profile_id === match.inviter_profile_id
      ? playerName(match.inviter_first_name, match.inviter_last_name, match.inviter_is_junior)
      : playerName(match.opponent_first_name, match.opponent_last_name, match.opponent_is_junior);
  const canRespond = match.verification_status === "pending_confirmation" && !submittedByCurrentUser;

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <span className="rounded bg-court-mist px-2.5 py-1 text-xs font-black uppercase tracking-wide text-court-teal">{formatLabel(match.verification_status)}</span>
            {match.booking_start_time ? (
              <span className="rounded bg-slate-100 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-slate-600">{formatDateTime(match.booking_start_time)}</span>
            ) : null}
          </div>
          <h3 className="text-lg font-black text-court-navy">
            {playerName(match.inviter_first_name, match.inviter_last_name, match.inviter_is_junior)} vs{" "}
            {playerName(match.opponent_first_name, match.opponent_last_name, match.opponent_is_junior)}
          </h3>
          <p className="mt-2 text-sm text-slate-700">
            Winner: <span className="font-bold text-court-navy">{winnerName}</span>
          </p>
          <p className="mt-1 text-sm text-slate-700">
            Score: <span className="font-bold text-court-navy">{match.score_text}</span>
          </p>
          {match.booking_court_name ? <p className="mt-2 text-sm text-slate-600">{match.booking_court_name}</p> : null}
        </div>

        {canRespond ? (
          <div className="flex shrink-0 gap-2">
            <form action={respondToMatchResult}>
              <input name="return_to" type="hidden" value="/dashboard/play/matches" />
              <input name="match_id" type="hidden" value={match.id} />
              <input name="verification_status" type="hidden" value="verified" />
              <SubmitButton className="rounded bg-court-teal px-3 py-2 text-sm font-bold text-white" pendingText="Saving...">
                Confirm
              </SubmitButton>
            </form>
            <form action={respondToMatchResult}>
              <input name="return_to" type="hidden" value="/dashboard/play/matches" />
              <input name="match_id" type="hidden" value={match.id} />
              <input name="verification_status" type="hidden" value="disputed" />
              <SubmitButton className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-court-navy" pendingText="Saving...">
                Dispute
              </SubmitButton>
            </form>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function InviteCard({
  invite,
  mode,
  currentProfileIds
}: {
  invite: MatchInviteDetail;
  mode: "sent" | "received";
  currentProfileIds: string[];
}) {
  const isPending = invite.status === "pending";
  const canRespond = mode === "received" && isPending && currentProfileIds.includes(invite.opponent_profile_id);
  const canCancel = mode === "sent" && isPending && currentProfileIds.includes(invite.inviter_profile_id);

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <span className="rounded bg-court-mist px-2.5 py-1 text-xs font-black uppercase tracking-wide text-court-teal">{formatLabel(invite.status)}</span>
            <span className="rounded bg-slate-100 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-slate-600">{formatLabel(invite.match_type)}</span>
          </div>
          <h3 className="text-lg font-black text-court-navy">
            {mode === "sent"
              ? `You invited ${playerName(invite.opponent_first_name, invite.opponent_last_name, invite.opponent_is_junior)}`
              : `${playerName(invite.inviter_first_name, invite.inviter_last_name, invite.inviter_is_junior)} invited you`}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            For {mode === "sent"
              ? playerName(invite.inviter_first_name, invite.inviter_last_name, invite.inviter_is_junior)
              : playerName(invite.opponent_first_name, invite.opponent_last_name, invite.opponent_is_junior)}
          </p>
          {invite.booking_start_time ? (
            <p className="mt-3 rounded bg-slate-50 p-3 text-sm text-slate-700">
              {invite.booking_court_name ?? "Court"} / {formatDateTime(invite.booking_start_time)}
            </p>
          ) : (
            <p className="mt-3 rounded bg-slate-50 p-3 text-sm text-slate-700">No court booking linked yet.</p>
          )}
          {invite.message ? <p className="mt-3 text-sm leading-6 text-slate-600">{invite.message}</p> : null}
        </div>

        {canRespond ? (
          <div className="flex shrink-0 gap-2">
            <form action={respondToMatchInvite}>
              <input name="return_to" type="hidden" value="/dashboard/play/matches" />
              <input name="invite_id" type="hidden" value={invite.id} />
              <input name="status" type="hidden" value="accepted" />
              <SubmitButton className="rounded bg-court-teal px-3 py-2 text-sm font-bold text-white" pendingText="Saving...">
                Accept
              </SubmitButton>
            </form>
            <form action={respondToMatchInvite}>
              <input name="return_to" type="hidden" value="/dashboard/play/matches" />
              <input name="invite_id" type="hidden" value={invite.id} />
              <input name="status" type="hidden" value="declined" />
              <SubmitButton className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-court-navy" pendingText="Saving...">
                Decline
              </SubmitButton>
            </form>
          </div>
        ) : null}

        {canCancel ? (
          <form action={cancelMatchInvite} className="shrink-0">
            <input name="return_to" type="hidden" value="/dashboard/play/matches" />
            <input name="invite_id" type="hidden" value={invite.id} />
            <SubmitButton className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-court-navy" pendingText="Cancelling...">
              Cancel
            </SubmitButton>
          </form>
        ) : null}
      </div>
    </article>
  );
}

export function candidateSearchOptions(candidates: MatchCandidate[], detailsByProfileId: Map<string, CandidateProfileDetail>, ratingsByProfileId: Map<string, Rating>): PlayerSearchOption[] {
  return candidates.map((candidate) => {
    const name = `${candidate.first_name} ${candidate.last_name}`;
    const detail = candidate.is_junior
      ? `${juniorStageLabel(candidate.junior_stage)} · ${candidateRatingLabel(candidate, detailsByProfileId, ratingsByProfileId)}`
      : `${formatLabel(candidate.player_level)} · ${candidateRatingLabel(candidate, detailsByProfileId, ratingsByProfileId)}`;
    const label = candidate.is_junior ? "Junior" : "Adult";
    const meta = candidate.is_junior ? "Junior player" : formatLabel(candidate.primary_sport);

    return {
      id: candidate.id,
      name,
      label,
      detail,
      meta,
      searchText: `${name} ${detail} ${label} ${meta}`.toLowerCase()
    };
  });
}

export async function loadPlayData(searchParams?: PlaySearchParams): Promise<PlayData> {
  if (!hasSupabaseConfig()) {
    return { kind: "no-config" };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: adultProfileData } = await supabase
    .from("profiles")
    .select("id,first_name,last_name,is_junior,primary_sport,player_level,junior_stage,junior_rating,junior_rating_confidence,participation_score,matches_played,wins,losses")
    .eq("user_id", user.id)
    .eq("is_junior", false)
    .maybeSingle();

  const adultProfile = adultProfileData as ProfileOption | null;

  if (!adultProfile) {
    return { kind: "no-profile" };
  }

  const { data: juniorData } = await supabase
    .from("profiles")
    .select("id,first_name,last_name,is_junior,primary_sport,player_level,junior_stage,junior_rating,junior_rating_confidence,participation_score,matches_played,wins,losses")
    .eq("parent_profile_id", adultProfile.id)
    .eq("is_junior", true)
    .order("first_name", { ascending: true });

  const ownProfiles = [adultProfile, ...((juniorData ?? []) as ProfileOption[])];
  const ownProfileIds = ownProfiles.map((profile) => profile.id);
  const selectedProfile = ownProfiles.find((profile) => profile.id === searchParams?.player) ?? ownProfiles[0];
  const search = searchParams?.q?.trim() ?? "";
  const selectedDate = clampDate(searchParams?.date);
  const dayStart = dateWithSaOffset(selectedDate, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const { data: courtData, error: courtsError } = await supabase
    .from("courts")
    .select("*")
    .eq("status", "active")
    .order("sort_order", { ascending: true });
  const courts = (courtData ?? []) as Court[];
  const selectedCourtId = courts.some((court) => court.id === searchParams?.court) ? String(searchParams?.court) : courts[0]?.id ?? "";

  const [
    { data: candidateData, error: candidateError },
    { data: inviteData, error: inviteError },
    { data: bookingData, error: bookingError },
    { data: matchData, error: matchError },
    { data: slotBookingData, error: slotBookingError },
    { data: ownRatingData, error: ownRatingError }
  ] = await Promise.all([
    supabase.rpc("match_profile_options", { search_text: null }),
    supabase.rpc("match_invites_for_user"),
    supabase
      .from("court_bookings")
      .select("id,start_time,end_time,player_profile_id,courts:court_id(name),profiles:player_profile_id(first_name,last_name,is_junior)")
      .eq("status", "confirmed")
      .gt("start_time", new Date().toISOString())
      .in("player_profile_id", ownProfileIds)
      .order("start_time", { ascending: true })
      .limit(20),
    supabase.rpc("matches_for_user"),
    selectedCourtId
      ? supabase.rpc("coachr_court_booking_blocks_for_range", {
          check_end_time: dayEnd.toISOString(),
          check_start_time: dayStart.toISOString()
        })
      : { data: [], error: null },
    supabase.from("ratings").select("*").in("profile_id", ownProfileIds)
  ]);

  const loadedCandidates = ((candidateData ?? []) as MatchCandidate[]).filter((profile) => !ownProfileIds.includes(profile.id));
  const candidates = (search
    ? loadedCandidates.filter((candidate) => `${candidate.first_name} ${candidate.last_name}`.toLowerCase().includes(search.toLowerCase()))
    : loadedCandidates
  ).slice(0, 60);
  const candidateIds = candidates.map((candidate) => candidate.id);
  const [{ data: candidateProfileData }, { data: candidateRatingData }] =
    candidateIds.length > 0
      ? await Promise.all([
          supabase
            .from("profiles")
            .select("id,junior_rating,junior_rating_confidence,participation_score,matches_played,wins,losses")
            .in("id", candidateIds),
          supabase.from("ratings").select("*").in("profile_id", candidateIds)
        ])
      : [{ data: [] }, { data: [] }];
  const ownRatingsByProfileId = new Map(((ownRatingData ?? []) as Rating[]).map((rating) => [rating.profile_id, rating]));
  const candidateDetailsByProfileId = new Map(((candidateProfileData ?? []) as CandidateProfileDetail[]).map((profile) => [profile.id, profile]));
  const candidateRatingsByProfileId = new Map(((candidateRatingData ?? []) as Rating[]).map((rating) => [rating.profile_id, rating]));
  const selectedRatingValue = profileRatingValue(selectedProfile, ownRatingsByProfileId);
  const compatibleCandidates = candidates.filter((candidate) => {
    if (selectedProfile.is_junior || candidate.is_junior) {
      return selectedProfile.is_junior && candidate.is_junior && selectedProfile.junior_stage === candidate.junior_stage && selectedProfile.junior_stage !== "not_sure";
    }

    return candidate.primary_sport === selectedProfile.primary_sport;
  });
  const closeSuggestions = compatibleCandidates
    .filter((candidate) => {
      const ratingValue = candidateRatingValue(candidate, candidateDetailsByProfileId, candidateRatingsByProfileId);
      if (ratingValue === null) {
        return candidate.is_junior && selectedProfile.is_junior && candidate.junior_stage === selectedProfile.junior_stage;
      }

      return Math.abs(ratingValue - selectedRatingValue) <= 0.5;
    })
    .slice(0, 4);
  const strongerSuggestions = compatibleCandidates
    .filter((candidate) => {
      const ratingValue = candidateRatingValue(candidate, candidateDetailsByProfileId, candidateRatingsByProfileId);
      if (ratingValue === null) {
        return false;
      }

      const difference = ratingValue - selectedRatingValue;
      return difference > 0.5 && difference <= 1.0;
    })
    .slice(0, 4);
  const invites = (inviteData ?? []) as MatchInviteDetail[];
  const matches = (matchData ?? []) as MatchDetail[];
  const matchInviteIds = new Set(matches.map((match) => match.match_invite_id));
  const sentInvites = invites.filter((invite) => ownProfileIds.includes(invite.inviter_profile_id));
  const receivedInvites = invites.filter((invite) => ownProfileIds.includes(invite.opponent_profile_id));
  const acceptedInvitesWithoutResult = invites.filter(
    (invite) => invite.status === "accepted" && (ownProfileIds.includes(invite.inviter_profile_id) || ownProfileIds.includes(invite.opponent_profile_id)) && !matchInviteIds.has(invite.id)
  );
  const upcomingMatchInvites = invites
    .filter((invite) => ["pending", "accepted"].includes(invite.status) && (ownProfileIds.includes(invite.inviter_profile_id) || ownProfileIds.includes(invite.opponent_profile_id)) && !matchInviteIds.has(invite.id))
    .slice(0, 6);
  const pendingConfirmations = matches.filter((match) => match.verification_status === "pending_confirmation" && match.submitted_by_user_id !== user.id);
  const awaitingOpponentConfirmations = matches.filter((match) => match.verification_status === "pending_confirmation" && match.submitted_by_user_id === user.id);
  const bookings = bookingError ? [] : ((bookingData ?? []) as unknown as BookingOption[]);
  const bookedSlotTimes = new Set(
    ((slotBookingData ?? []) as Pick<CourtBooking, "court_id" | "start_time">[])
      .filter((booking) => booking.court_id === selectedCourtId)
      .map((booking) => new Date(booking.start_time).toISOString())
  );
  const availableSlots = slotsForDate(selectedDate).filter((slot) => new Date(slot.startTime).getTime() > Date.now() && !bookedSlotTimes.has(new Date(slot.startTime).toISOString()));

  return {
    kind: "ready",
    data: {
      acceptedInvitesWithoutResult,
      adultProfile,
      availableSlots,
      awaitingOpponentConfirmations,
      bookings,
      candidateDetailsByProfileId,
      candidateError,
      candidateRatingsByProfileId,
      candidates,
      closeSuggestions,
      courts,
      courtsError,
      dayStart,
      inviteError,
      invites,
      matchError,
      matches,
      ownProfileIds,
      ownProfiles,
      ownRatingError,
      ownRatingsByProfileId,
      pendingConfirmations,
      receivedInvites,
      search,
      selectedCourtId,
      selectedDate,
      selectedProfile,
      sentInvites,
      slotBookingError,
      strongerSuggestions,
      upcomingMatchInvites,
      userId: user.id
    }
  };
}
