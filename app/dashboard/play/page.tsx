import Link from "next/link";
import { redirect } from "next/navigation";
import { cancelMatchInvite, createMatchInvite, respondToMatchInvite, respondToMatchResult, submitMatchResult } from "@/app/dashboard/play/actions";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { SubmitButton } from "@/components/submit-button";
import { formatDate, formatDateTime, formatLabel } from "@/lib/courtside-format";
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
  Sport
} from "@/types/courtside";

export const dynamic = "force-dynamic";

type ProfileOption = Pick<Profile, "id" | "first_name" | "last_name" | "is_junior" | "primary_sport" | "player_level" | "junior_stage">;

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
    .select("id,first_name,last_name,is_junior,primary_sport,player_level,junior_stage")
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
    .select("id,first_name,last_name,is_junior,primary_sport,player_level,junior_stage")
    .eq("parent_profile_id", adultProfile.id)
    .eq("is_junior", true)
    .order("first_name", { ascending: true });

  const ownProfiles = [adultProfile, ...((juniorData ?? []) as ProfileOption[])];
  const ownProfileIds = ownProfiles.map((profile) => profile.id);
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
    { data: slotBookingData, error: slotBookingError }
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
      : { data: [], error: null }
  ]);

  const candidates = ((candidateData ?? []) as MatchCandidate[]).filter((profile) => !ownProfileIds.includes(profile.id)).slice(0, 12);
  const invites = (inviteData ?? []) as MatchInviteDetail[];
  const matches = (matchData ?? []) as MatchDetail[];
  const matchInviteIds = new Set(matches.map((match) => match.match_invite_id));
  const sentInvites = invites.filter((invite) => ownProfileIds.includes(invite.inviter_profile_id));
  const receivedInvites = invites.filter((invite) => ownProfileIds.includes(invite.opponent_profile_id));
  const acceptedInvitesWithoutResult = invites.filter(
    (invite) => invite.status === "accepted" && (ownProfileIds.includes(invite.inviter_profile_id) || ownProfileIds.includes(invite.opponent_profile_id)) && !matchInviteIds.has(invite.id)
  );
  const pendingConfirmations = matches.filter((match) => match.verification_status === "pending_confirmation" && match.submitted_by_user_id !== user.id);
  const awaitingOpponentConfirmations = matches.filter((match) => match.verification_status === "pending_confirmation" && match.submitted_by_user_id === user.id);
  const bookings = (bookingData ?? []) as unknown as BookingOption[];
  const bookedSlotTimes = new Set(((slotBookingData ?? []) as Pick<CourtBooking, "start_time">[]).map((booking) => new Date(booking.start_time).toISOString()));
  const availableSlots = slotsForDate(selectedDate).filter((slot) => new Date(slot.startTime).getTime() > Date.now() && !bookedSlotTimes.has(new Date(slot.startTime).toISOString()));

  return (
    <PageShell eyebrow="Play" title="Play">
      <StatusAlert className="mb-5" message={inviteMessage(searchParams?.invite)} tone="success" />
      <StatusAlert className="mb-5" message={resultMessage(searchParams?.result)} tone="success" />
      <StatusAlert className="mb-5" message={errorMessage(searchParams?.error)} tone="error" />

      <section className="mb-6 rounded-lg border border-court-teal/30 bg-court-mist p-5">
        <p className="section-kicker">Play V1</p>
        <h2 className="mt-2 text-2xl font-black text-court-navy">Simple match invites</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-court-ink">
          Invite another PlayR player, optionally attach a court time, and submit the score after an accepted match. Casual matches are social; verified matches can affect PlayR Rating once the other side confirms the result.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="surface-card p-5">
          <h2 className="section-title">Invite to Play</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">One quick flow: choose who is playing, find an opponent, pick casual or verified, add a court/time, then send.</p>

          <form className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
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

          <form className="soft-card mt-5 p-4">
            <input name="q" type="hidden" value={search} />
            <h3 className="font-black text-court-navy">New court booking options</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">Only needed if you want this invite to reserve a fresh court slot. Existing bookings can still be linked below.</p>
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

          {candidateError || bookingError || courtsError || slotBookingError ? (
            <StatusAlert className="mt-4" message="Some match invite or court availability options could not be loaded right now." tone="error" />
          ) : null}

          <form action={createMatchInvite} className="mt-5 grid gap-4">
            <label className="text-sm font-semibold text-slate-700">
              Invite from
              <select className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" name="inviter_profile_id" required>
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
                Showing up to 12 player profiles. Search by name to narrow the list before sending.
              </span>
            </label>

            <div className="rounded-lg border border-slate-200 p-4">
              <h3 className="font-black text-court-navy">Court/time</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Link this invite to one of your existing bookings, or book a new 60-minute slot as part of the invite.
              </p>
              <div className="mt-4 grid gap-3">
                <label className="flex gap-3 rounded border border-court-teal/30 bg-court-mist p-3 text-sm font-semibold text-court-navy">
                  <input className="mt-1" defaultChecked name="booking_mode" type="radio" value="existing" />
                  <span>Use an existing future booking</span>
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

          <div className="surface-card p-5">
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

          <div className="surface-card p-5">
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

          <div className="surface-card p-5">
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
