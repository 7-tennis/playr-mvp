import Link from "next/link";
import { redirect } from "next/navigation";
import { cancelMatchInvite, createMatchInvite, respondToMatchInvite, respondToMatchResult, submitMatchResult } from "@/app/dashboard/play/actions";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
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

export const dynamic = "force-dynamic";

type ProfileOption = Pick<
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

type MatchCandidate = {
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

type BookingOption = Pick<CourtBooking, "id" | "start_time" | "end_time" | "player_profile_id"> & {
  courts: Pick<Court, "name"> | null;
  profiles: Pick<Profile, "first_name" | "last_name" | "is_junior"> | null;
};

type CandidateProfileDetail = Pick<Profile, "id" | "junior_rating" | "junior_rating_confidence" | "participation_score" | "matches_played" | "wins" | "losses">;

type MatchInviteDetail = {
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

type MatchDetail = {
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

type DashboardPlayPageProps = {
  searchParams?: {
    q?: string;
    date?: string;
    court?: string;
    player?: string;
    invite?: string;
    result?: string;
    error?: string;
  };
};

function inviteMessage(value?: string) {
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

function resultMessage(value?: string) {
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

function errorMessage(value?: string) {
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

function playerName(firstName: string, lastName: string, isJunior: boolean) {
  return `${firstName} ${lastName}${isJunior ? " (junior)" : ""}`;
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function playerInitials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function juniorStageLabel(stage: JuniorStage | string | null | undefined) {
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

function profileRatingValue(profile: ProfileOption, ratingsByProfileId: Map<string, Rating>) {
  if (profile.is_junior) {
    return profile.junior_rating;
  }

  return ratingsByProfileId.get(profile.id)?.rating_value ?? playerLevelRating(profile.player_level);
}

function profileRatingLabel(profile: ProfileOption, ratingsByProfileId: Map<string, Rating>) {
  if (profile.is_junior) {
    return formatJuniorRating(profile.junior_stage, profile.junior_rating);
  }

  const rating = ratingsByProfileId.get(profile.id);
  return rating ? rating.rating_value.toFixed(1) : `${playerLevelRating(profile.player_level).toFixed(1)} est.`;
}

function candidateRatingValue(candidate: MatchCandidate, detailsByProfileId: Map<string, CandidateProfileDetail>, ratingsByProfileId: Map<string, Rating>) {
  if (candidate.is_junior) {
    return detailsByProfileId.get(candidate.id)?.junior_rating ?? null;
  }

  return ratingsByProfileId.get(candidate.id)?.rating_value ?? playerLevelRating(candidate.player_level);
}

function candidateRatingLabel(candidate: MatchCandidate, detailsByProfileId: Map<string, CandidateProfileDetail>, ratingsByProfileId: Map<string, Rating>) {
  if (candidate.is_junior) {
    const detail = detailsByProfileId.get(candidate.id);
    return detail ? formatJuniorRating(candidate.junior_stage, detail.junior_rating) : `${juniorStageLabel(candidate.junior_stage)} rating pending`;
  }

  const rating = ratingsByProfileId.get(candidate.id);
  return rating ? rating.rating_value.toFixed(1) : `${playerLevelRating(candidate.player_level).toFixed(1)} est.`;
}

function possibleUnlocks(profile: ProfileOption, stronger = false) {
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

function challengeStyle(type: "close" | "stronger") {
  return type === "stronger"
    ? {
        label: "Stronger Challenge",
        icon: "🔵",
        description: "Test yourself against a stronger player.",
        badge: "bg-court-navy text-white",
        tint: "bg-court-navy/5",
        border: "border-court-navy/20"
      }
    : {
        label: "Close Match",
        icon: "🟢",
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

function ActionCard({
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
  icon: string;
  title: string;
  action: string;
  meta?: string;
  tone?: "teal" | "navy" | "green" | "blue";
}) {
  const styles = actionTone(tone);

  return (
    <Link className="group rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-court-teal hover:shadow-court" href={href}>
      <div className="flex items-start gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded text-xl ${styles.icon}`} aria-hidden="true">
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
      <span className="ui-chip ui-chip-success">⭐ Win {win}</span>
      <span className="ui-chip bg-rose-50 text-rose-700">↘ Loss {loss}</span>
    </div>
  );
}

function SuggestionCard({
  candidate,
  detailsByProfileId,
  ratingsByProfileId,
  selectedProfile,
  type
}: {
  candidate: MatchCandidate;
  detailsByProfileId: Map<string, CandidateProfileDetail>;
  ratingsByProfileId: Map<string, Rating>;
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
          {confidence ? <span className="ui-chip ui-chip-brand">🛡️ {formatLabel(confidence)}</span> : null}
          {typeof matchCount === "number" ? <span className="ui-chip ui-chip-muted">🎾 {countLabel(matchCount, "match", "matches")}</span> : null}
        </div>
        <div className={`mt-4 rounded border p-3 ${challenge.tint} ${challenge.border}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-2.5 py-1 text-xs font-black uppercase tracking-wide ${challenge.badge}`}>
              {challenge.icon} {challenge.label}
            </span>
            <span className="text-xs font-semibold text-slate-600">{challenge.description}</span>
          </div>
          <div className="mt-3 grid gap-3">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Estimated rating</p>
              <ImpactChips type={type} />
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-bold">
              <span className="rounded bg-white px-2.5 py-1 text-court-navy shadow-sm">⚡ Participation +15</span>
            </div>
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Possible unlocks</p>
              {unlocks.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {unlocks.map((unlock) => (
                    <span className="rounded bg-white px-2.5 py-1 text-xs font-bold text-court-navy shadow-sm" key={unlock}>
                      🏅 {unlock}
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

function UpcomingMatchCard({ invite, ownProfileIds }: { invite: MatchInviteDetail; ownProfileIds: string[] }) {
  const sent = ownProfileIds.includes(invite.inviter_profile_id);
  const opponentName = sent
    ? playerName(invite.opponent_first_name, invite.opponent_last_name, invite.opponent_is_junior)
    : playerName(invite.inviter_first_name, invite.inviter_last_name, invite.inviter_is_junior);
  const actionHref = invite.status === "accepted" ? "#submit-result" : sent ? "#sent-invites" : "#received-invites";
  const actionText = invite.status === "accepted" ? "Submit Result" : sent ? "View Sent" : "Respond";

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded bg-court-mist px-2.5 py-1 text-xs font-black uppercase tracking-wide text-court-teal">📩 {formatLabel(invite.status)}</span>
            <span className="rounded bg-slate-100 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-slate-600">🎾 {formatLabel(invite.match_type)}</span>
          </div>
          <h3 className="mt-1 font-black text-court-navy">vs {opponentName}</h3>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-700">
            <span className="rounded bg-slate-50 px-2.5 py-1">📅 {invite.booking_start_time ? formatDateTime(invite.booking_start_time) : "Time TBC"}</span>
            <span className="rounded bg-slate-50 px-2.5 py-1">🏟️ {invite.booking_court_name ?? "Court TBC"}</span>
          </div>
        </div>
        <Link className="inline-flex shrink-0 justify-center rounded bg-court-teal px-3 py-2 text-sm font-bold text-white" href={actionHref}>
          {actionText}
        </Link>
      </div>
    </article>
  );
}

function zaDateInput(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function dateWithSaOffset(date: string, hour: number) {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:00:00+02:00`);
}

function clampDate(value?: string) {
  const today = zaDateInput();
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return today;
  }

  const selected = dateWithSaOffset(value, 0).getTime();
  const start = dateWithSaOffset(today, 0).getTime();
  const end = start + 7 * 24 * 60 * 60 * 1000;
  return selected >= start && selected < end ? value : today;
}

function bookingDates() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(dateWithSaOffset(zaDateInput(), 0).getTime() + index * 24 * 60 * 60 * 1000);
    const value = zaDateInput(date);
    return {
      value,
      label: index === 0 ? "Today" : formatDate(date.toISOString())
    };
  });
}

function slotsForDate(date: string) {
  return Array.from({ length: 15 }, (_, index) => {
    const start = dateWithSaOffset(date, 6 + index);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return {
      startTime: start.toISOString(),
      timeLabel: `${String(start.getUTCHours() + 2).padStart(2, "0")}:00 - ${String(end.getUTCHours() + 2).padStart(2, "0")}:00`
    };
  });
}

function ResultCard({ match, currentUserId }: { match: MatchDetail; currentUserId: string }) {
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
              <input name="match_id" type="hidden" value={match.id} />
              <input name="verification_status" type="hidden" value="verified" />
              <SubmitButton className="rounded bg-court-teal px-3 py-2 text-sm font-bold text-white" pendingText="Saving...">
                Confirm
              </SubmitButton>
            </form>
            <form action={respondToMatchResult}>
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

function InviteCard({
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
              <input name="invite_id" type="hidden" value={invite.id} />
              <input name="status" type="hidden" value="accepted" />
              <SubmitButton className="rounded bg-court-teal px-3 py-2 text-sm font-bold text-white" pendingText="Saving...">
                Accept
              </SubmitButton>
            </form>
            <form action={respondToMatchInvite}>
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

export default async function DashboardPlayPage({ searchParams }: DashboardPlayPageProps) {
  if (!hasSupabaseConfig()) {
    return (
      <PageShell eyebrow="Play" title="Supabase is not configured.">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <p className="text-slate-700">Add Supabase environment variables to use player features.</p>
        </div>
      </PageShell>
    );
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
    return (
      <PageShell eyebrow="Play" title="Create your Player Profile first.">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <p className="text-slate-700">You need an adult player profile before sending match invites for yourself or a linked junior.</p>
          <Link className="mt-5 inline-flex rounded bg-court-blue px-4 py-3 font-bold text-white" href="/dashboard/profile">
            Create my profile
          </Link>
        </div>
      </PageShell>
    );
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
    supabase.rpc("match_profile_options", { search_text: search || null }),
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
      ? supabase
          .from("court_bookings")
          .select("court_id,start_time,end_time")
          .eq("court_id", selectedCourtId)
          .eq("status", "confirmed")
          .gte("start_time", dayStart.toISOString())
          .lt("start_time", dayEnd.toISOString())
      : { data: [], error: null },
    supabase.from("ratings").select("*").in("profile_id", ownProfileIds)
  ]);

  const candidates = ((candidateData ?? []) as MatchCandidate[]).filter((profile) => !ownProfileIds.includes(profile.id)).slice(0, 30);
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
  const bookings = (bookingData ?? []) as unknown as BookingOption[];
  const bookedSlotTimes = new Set(((slotBookingData ?? []) as Pick<CourtBooking, "start_time">[]).map((booking) => new Date(booking.start_time).toISOString()));
  const availableSlots = slotsForDate(selectedDate).filter((slot) => new Date(slot.startTime).getTime() > Date.now() && !bookedSlotTimes.has(new Date(slot.startTime).toISOString()));

  return (
    <PageShell eyebrow="Play" subtitle="Challenge players, send invites and track upcoming matches." title="Play">
      <StatusAlert className="mb-5" message={inviteMessage(searchParams?.invite)} tone="success" />
      <StatusAlert className="mb-5" message={resultMessage(searchParams?.result)} tone="success" />
      <StatusAlert className="mb-5" message={errorMessage(searchParams?.error)} tone="error" />

      <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ActionCard action="Send Invite" description="Already booked? Invite someone to play." href="#new-invite" icon="📩" meta={countLabel(bookings.length, "booking")} title="New Invite" tone="teal" />
        <ActionCard
          action="Start Match Request"
          description="Challenge first. Agree on time and court after they accept."
          href="#match-request"
          icon="🏟️"
          meta="Booking optional"
          title="Match Invite + Court Booking"
          tone="blue"
        />
        <ActionCard
          action="View Challenges"
          description="Find players near your level."
          href="#challenge-players"
          icon="⚡"
          meta={countLabel(closeSuggestions.length + strongerSuggestions.length, "suggestion")}
          title="Challenge Players"
          tone="green"
        />
        <ActionCard action="View Matches" description="See pending and accepted matches." href="#upcoming-matches" icon="📅" meta={countLabel(upcomingMatchInvites.length, "match", "matches")} title="Upcoming Matches" tone="navy" />
      </section>

      <section className="surface-card mb-6 p-5" id="challenge-players">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="section-kicker">Challenge Players</p>
            <h2 className="mt-2 text-2xl font-black text-court-navy">Find a good match</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Pick a balanced match or test yourself against a stronger player. Rating movement is estimated.
            </p>
          </div>
          <form className="grid gap-3 sm:grid-cols-[1fr_auto] lg:min-w-96">
            <input name="q" type="hidden" value={search} />
            <input name="date" type="hidden" value={selectedDate} />
            <input name="court" type="hidden" value={selectedCourtId} />
            <label className="text-sm font-semibold text-slate-700">
              Challenge as
              <select className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-3 focus-ring" defaultValue={selectedProfile.id} name="player">
                {ownProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.first_name} {profile.last_name} · {profileRatingLabel(profile, ownRatingsByProfileId)}
                  </option>
                ))}
              </select>
            </label>
            <button className="self-end rounded bg-court-blue px-4 py-3 font-bold text-white transition hover:bg-blue-700" type="submit">
              Update
            </button>
          </form>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-court-navy">Close Match</h3>
                <p className="mt-1 text-sm text-slate-600">A balanced challenge near your level.</p>
              </div>
              <span className="ui-chip ui-chip-success">🟢 Balanced</span>
            </div>
            {closeSuggestions.length > 0 ? (
              <div className="mt-3 grid gap-3">
                {closeSuggestions.map((candidate) => (
                  <SuggestionCard candidate={candidate} detailsByProfileId={candidateDetailsByProfileId} key={candidate.id} ratingsByProfileId={candidateRatingsByProfileId} selectedProfile={selectedProfile} type="close" />
                ))}
              </div>
            ) : (
              <div className="ui-empty-card mt-3">
                No close matches found yet. Try searching by name or choose another linked player.
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-court-navy">Stronger Challenge</h3>
                <p className="mt-1 text-sm text-slate-600">Test yourself against a stronger player.</p>
              </div>
              <span className="ui-chip ui-chip-navy">🔵 Higher reward</span>
            </div>
            {strongerSuggestions.length > 0 ? (
              <div className="mt-3 grid gap-3">
                {strongerSuggestions.map((candidate) => (
                  <SuggestionCard candidate={candidate} detailsByProfileId={candidateDetailsByProfileId} key={candidate.id} ratingsByProfileId={candidateRatingsByProfileId} selectedProfile={selectedProfile} type="stronger" />
                ))}
              </div>
            ) : (
              <div className="ui-empty-card mt-3">
                No stronger challenges available right now. Check back later or search for a player by name.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="surface-card mb-6 p-5" id="upcoming-matches">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="section-kicker">Upcoming Matches</p>
            <h2 className="mt-2 text-2xl font-black text-court-navy">Match queue</h2>
            <p className="mt-2 text-sm text-slate-600">Pending and accepted matches in one scan.</p>
          </div>
          <Link className="btn-secondary" href="#new-invite">
            Send Invite
          </Link>
        </div>
        {upcomingMatchInvites.length > 0 ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {upcomingMatchInvites.map((invite) => (
              <UpcomingMatchCard invite={invite} key={invite.id} ownProfileIds={ownProfileIds} />
            ))}
          </div>
        ) : (
          <div className="ui-empty-card mt-5">
            No upcoming matches yet. Send a challenge or accept an invite to get started.
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="surface-card p-5" id="new-invite">
          <p className="section-kicker">New Invite</p>
          <h2 className="section-title mt-2">Send a match invite</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Choose who is playing, pick an opponent, and send the request.</p>

          <div className="mt-4 rounded-lg border border-court-teal/25 bg-court-mist p-4" id="match-request">
            <p className="text-sm font-black text-court-navy">Challenge first, book later</p>
            <p className="mt-1 text-sm leading-6 text-court-ink">Send the match request without a court booking. Once accepted, choose a court and time together.</p>
          </div>

          <form className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input name="player" type="hidden" value={selectedProfile.id} />
            <input name="date" type="hidden" value={selectedDate} />
            <input name="court" type="hidden" value={selectedCourtId} />
            <label className="text-sm font-semibold text-slate-700">
              Search opponent
              <input className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" defaultValue={search} name="q" placeholder="Search by player name" />
            </label>
            <button className="self-end rounded bg-court-blue px-4 py-3 font-bold text-white transition hover:bg-blue-700" type="submit">
              Search
            </button>
          </form>

          <form className="soft-card mt-5 p-4" id="invite-booking">
            <input name="q" type="hidden" value={search} />
            <input name="player" type="hidden" value={selectedProfile.id} />
            <h3 className="font-black text-court-navy">Court booking options</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">Optional: reserve a fresh court slot now, or send the invite and arrange the booking after acceptance.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="text-sm font-semibold text-slate-700">
                Date
                <select className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-3 focus-ring" defaultValue={selectedDate} name="date">
                  {bookingDates().map((date) => (
                    <option key={date.value} value={date.value}>
                      {date.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Court
                <select className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-3 focus-ring" defaultValue={selectedCourtId} disabled={courts.length === 0} name="court">
                  {courts.length > 0 ? (
                    courts.map((court) => (
                      <option key={court.id} value={court.id}>
                        {court.name}
                      </option>
                    ))
                  ) : (
                    <option value="">No active courts</option>
                  )}
                </select>
              </label>
              <button className="rounded bg-court-blue px-4 py-3 font-bold text-white" type="submit">
                Show slots
              </button>
            </div>
          </form>

          {candidateError || bookingError || courtsError || slotBookingError || ownRatingError ? (
            <StatusAlert className="mt-4" message="Some match invite or court availability options could not be loaded right now." tone="error" />
          ) : null}

          <form action={createMatchInvite} className="mt-5 grid gap-4">
            <label className="text-sm font-semibold text-slate-700">
              Invite from
              <select className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" defaultValue={selectedProfile.id} name="inviter_profile_id" required>
                {ownProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.first_name} {profile.last_name}
                    {profile.is_junior ? " (linked junior)" : " (myself)"}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-semibold text-slate-700">
              Opponent
              <select className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" disabled={candidates.length === 0} name="opponent_profile_id" required size={Math.min(Math.max(candidates.length, 1), 4)}>
                {candidates.length > 0 ? (
                  candidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.first_name} {candidate.last_name}
                      {candidate.is_junior ? " (junior)" : ""} - {formatLabel(candidate.primary_sport)}
                    </option>
                  ))
                ) : (
                  <option value="">No players found</option>
                )}
              </select>
              <span className="mt-2 block text-xs font-normal leading-5 text-slate-600">
                Showing up to 30 player profiles. Search by name to narrow the list before sending.
              </span>
            </label>

            <div className="rounded-lg border border-slate-200 p-4">
              <h3 className="font-black text-court-navy">Court/time</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Link an existing booking, create a 60-minute slot, or leave it unlinked and agree on a court after acceptance.
              </p>
              <div className="mt-4 grid gap-3">
                <label className="flex gap-3 rounded border border-court-teal/30 bg-court-mist p-3 text-sm font-semibold text-court-navy">
                  <input className="mt-1" defaultChecked name="booking_mode" type="radio" value="existing" />
                  <span>Use an existing booking or leave unlinked</span>
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Existing booking <span className="font-normal text-slate-500">(optional)</span>
                  <select className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" name="booking_id">
                    <option value="">No booking linked yet</option>
                    {bookings.map((booking) => (
                      <option key={booking.id} value={booking.id}>
                        {booking.courts?.name ?? "Court"} / {formatDateTime(booking.start_time)} /{" "}
                        {booking.profiles ? `${booking.profiles.first_name} ${booking.profiles.last_name}${booking.profiles.is_junior ? " (junior)" : ""}` : "Player"}
                      </option>
                    ))}
                  </select>
                  {bookings.length === 0 ? (
                    <span className="mt-2 block text-xs font-normal leading-5 text-slate-600">
                      No future court bookings yet. Choose “Book a new court/time” below to create one now.
                    </span>
                  ) : null}
                </label>
                <label className="flex gap-3 rounded border border-court-teal/30 bg-court-mist p-3 text-sm font-semibold text-court-navy">
                  <input className="mt-1" name="booking_mode" type="radio" value="new" />
                  <span>Book a new court/time for this invite</span>
                </label>
                <input name="new_court_id" type="hidden" value={selectedCourtId} />
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    Available slots for {courts.find((court) => court.id === selectedCourtId)?.name ?? "selected court"} on {formatDate(dayStart.toISOString())}
                  </p>
                  {availableSlots.length > 0 ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {availableSlots.map((slot) => (
                        <label className="rounded border border-emerald-200 bg-white p-3 text-sm font-bold text-court-navy" key={slot.startTime}>
                          <input className="mr-2" name="new_start_time" type="radio" value={slot.startTime} />
                          {slot.timeLabel}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 rounded border border-slate-200 bg-white p-3 text-sm text-slate-600">
                      No open slots for this court/date. Try another date or court.
                    </p>
                  )}
                </div>
                <label className="text-sm font-semibold text-slate-700">
                  Booking note <span className="font-normal text-slate-500">(optional)</span>
                  <input className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" name="booking_notes" placeholder="Created for a match invite" />
                </label>
              </div>
            </div>

            <label className="text-sm font-semibold text-slate-700">
              Match type
              <select className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" name="match_type">
                <option value="casual">Casual</option>
                <option value="verified">Verified</option>
              </select>
              <span className="mt-2 block text-xs font-normal leading-5 text-slate-600">
                Choose verified only when both players expect to submit and confirm the score. Casual matches do not move ratings.
              </span>
            </label>

            <label className="text-sm font-semibold text-slate-700">
              Message <span className="font-normal text-slate-500">(optional)</span>
              <textarea className="mt-2 min-h-24 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="message" placeholder="Want to play singles after work on Thursday?" />
            </label>

            <SubmitButton className="rounded bg-court-teal px-4 py-3 font-bold text-white" pendingText="Sending invite...">
              Send match invite
            </SubmitButton>
          </form>

          {candidates.length === 0 ? (
            <div className="mt-5 rounded border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              No opponent profiles found. Try a different name, or invite players once more profiles have been created.
            </div>
          ) : null}
        </section>

        <section className="grid gap-6">
          <div className="surface-card p-5">
            <h2 className="section-title">Pending result confirmations</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Confirm only when the winner and score are correct. Dispute sends the result to admin review.
            </p>
            {matchError ? <StatusAlert className="mt-4" message="Match results could not be loaded right now." tone="error" /> : null}
            {pendingConfirmations.length > 0 ? (
              <div className="mt-4 grid gap-3">
                {pendingConfirmations.map((match) => (
                  <ResultCard currentUserId={user.id} key={match.id} match={match} />
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                No match results need your confirmation right now.
              </div>
            )}
          </div>

          <div className="surface-card p-5">
            <h2 className="section-title">Submitted results waiting</h2>
            {awaitingOpponentConfirmations.length > 0 ? (
              <div className="mt-4 grid gap-3">
                {awaitingOpponentConfirmations.map((match) => (
                  <ResultCard currentUserId={user.id} key={match.id} match={match} />
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                Results you submit will sit here until the other side confirms or disputes them.
              </div>
            )}
          </div>

          <div className="surface-card p-5" id="submit-result">
            <h2 className="section-title">Submit a result</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Results can be submitted only after an invite is accepted. Verified match results wait for confirmation before ratings move.
            </p>
            {acceptedInvitesWithoutResult.length > 0 ? (
              <div className="mt-4 grid gap-4">
                {acceptedInvitesWithoutResult.map((invite) => (
                  <form action={submitMatchResult} className="grid gap-3 rounded border border-slate-200 bg-slate-50 p-4" key={invite.id}>
                    <input name="match_invite_id" type="hidden" value={invite.id} />
                    <div>
                      <p className="font-black text-court-navy">
                        {playerName(invite.inviter_first_name, invite.inviter_last_name, invite.inviter_is_junior)} vs{" "}
                        {playerName(invite.opponent_first_name, invite.opponent_last_name, invite.opponent_is_junior)}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {invite.booking_start_time ? `${invite.booking_court_name ?? "Court"} / ${formatDateTime(invite.booking_start_time)}` : "No booking linked"}
                      </p>
                    </div>
                    <label className="text-sm font-semibold text-slate-700">
                      Winner
                      <select className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" name="winner_profile_id" required>
                        <option value={invite.inviter_profile_id}>
                          {playerName(invite.inviter_first_name, invite.inviter_last_name, invite.inviter_is_junior)}
                        </option>
                        <option value={invite.opponent_profile_id}>
                          {playerName(invite.opponent_first_name, invite.opponent_last_name, invite.opponent_is_junior)}
                        </option>
                      </select>
                    </label>
                    <label className="text-sm font-semibold text-slate-700">
                      Score
                      <input className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" name="score_text" placeholder="6-4 6-3" required />
                    </label>
                    <SubmitButton className="rounded bg-court-teal px-4 py-3 font-bold text-white" pendingText="Submitting result...">
                      Submit result
                    </SubmitButton>
                  </form>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                Accepted match invites without results will appear here.
              </div>
            )}
          </div>

          <div className="surface-card p-5" id="received-invites">
            <h2 className="section-title">Received invites</h2>
            {inviteError ? <StatusAlert className="mt-4" message="Match invites could not be loaded right now." tone="error" /> : null}
            {receivedInvites.length > 0 ? (
              <div className="mt-4 grid gap-3">
                {receivedInvites.map((invite) => (
                  <InviteCard currentProfileIds={ownProfileIds} invite={invite} key={invite.id} mode="received" />
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                No match invites received yet. When another player invites you or a linked junior, it will appear here.
              </div>
            )}
          </div>

          <div className="surface-card p-5" id="sent-invites">
            <h2 className="section-title">Sent invites</h2>
            {sentInvites.length > 0 ? (
              <div className="mt-4 grid gap-3">
                {sentInvites.map((invite) => (
                  <InviteCard currentProfileIds={ownProfileIds} invite={invite} key={invite.id} mode="sent" />
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                No match invites sent yet. Send a casual invite to get a match on the calendar.
              </div>
            )}
          </div>

          <div className="surface-card p-5">
            <h2 className="section-title">Need a court?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Book a court first if you want the invite to include a time and place.</p>
            <Link className="mt-4 inline-flex rounded bg-court-blue px-4 py-3 font-bold text-white" href="/dashboard/book-court">
              Book court
            </Link>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
