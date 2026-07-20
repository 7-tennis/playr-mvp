export type PlayerActivityKind = "invite" | "lesson" | "match" | "booking" | "event";

export type PlayerActivitySummary = {
  playerId: string;
  actionRequiredCount: number;
  upcomingCount: number;
  totalCount: number;
  primaryKind: PlayerActivityKind;
  primaryLabel: string;
  primaryDate: string | null;
};

type ActivityCandidate = {
  date: string | null;
  kind: PlayerActivityKind;
  label: string;
  playerId: string;
  priority: number;
  requiresAction: boolean;
  upcoming: boolean;
};

type ActivityInputs = {
  bookings: { player_profile_id: string; start_time: string }[];
  events: { profile_id: string; start_time: string }[];
  invites: {
    booking_start_time: string | null;
    inviter_profile_id: string;
    opponent_profile_id: string;
    status: string;
  }[];
  lessonRequests: { player_profile_id: string; status: string }[];
};

function dateKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Johannesburg",
    year: "numeric"
  }).format(value);
}

export function formatPlayerActivityDate(value: string, now = new Date()) {
  const activityDate = new Date(value);
  const tomorrow = new Date(now.getTime() + 86_400_000);
  const time = new Intl.DateTimeFormat("en-ZA", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Africa/Johannesburg"
  }).format(activityDate);

  if (dateKey(activityDate) === dateKey(now)) return `Today · ${time}`;
  if (dateKey(activityDate) === dateKey(tomorrow)) return `Tomorrow · ${time}`;

  const day = new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Johannesburg",
    weekday: "short"
  }).format(activityDate);
  return `${day} · ${time}`;
}

export function buildPlayerActivitySummaries(playerIds: string[], inputs: ActivityInputs, now = new Date()) {
  const allowedPlayerIds = new Set(playerIds);
  const candidatesByPlayer = new Map<string, ActivityCandidate[]>(playerIds.map((playerId) => [playerId, []]));

  const add = (candidate: ActivityCandidate) => {
    if (!allowedPlayerIds.has(candidate.playerId)) return;
    candidatesByPlayer.get(candidate.playerId)?.push(candidate);
  };

  inputs.invites.forEach((invite) => {
    if (invite.status === "pending") {
      add({ date: null, kind: "invite", label: "New Match Invite", playerId: invite.opponent_profile_id, priority: 10, requiresAction: true, upcoming: false });
      add({ date: null, kind: "invite", label: "Match Invite Pending", playerId: invite.inviter_profile_id, priority: 30, requiresAction: false, upcoming: false });
    } else if (invite.status === "accepted" && invite.booking_start_time && new Date(invite.booking_start_time).getTime() >= now.getTime()) {
      [invite.inviter_profile_id, invite.opponent_profile_id].forEach((playerId) => add({ date: invite.booking_start_time, kind: "match", label: "Next: Match", playerId, priority: 40, requiresAction: false, upcoming: true }));
    }
  });

  inputs.lessonRequests.forEach((request) => {
    const requiresAction = request.status === "pending_parent" || request.status === "pending_player";
    if (requiresAction || request.status === "pending_coach") {
      add({ date: null, kind: "lesson", label: requiresAction ? "Lesson Change Pending" : "Lesson Change Sent", playerId: request.player_profile_id, priority: requiresAction ? 20 : 35, requiresAction, upcoming: false });
    }
  });

  inputs.bookings.forEach((booking) => add({ date: booking.start_time, kind: "booking", label: "Next: Court Booking", playerId: booking.player_profile_id, priority: 50, requiresAction: false, upcoming: true }));
  inputs.events.forEach((event) => add({ date: event.start_time, kind: "event", label: "Next: Event", playerId: event.profile_id, priority: 60, requiresAction: false, upcoming: true }));

  const summaries = new Map<string, PlayerActivitySummary>();
  candidatesByPlayer.forEach((candidates, playerId) => {
    if (!candidates.length) return;
    candidates.sort((left, right) => left.priority - right.priority || new Date(left.date ?? 0).getTime() - new Date(right.date ?? 0).getTime());
    const primary = candidates[0]!;
    summaries.set(playerId, {
      playerId,
      actionRequiredCount: candidates.filter((candidate) => candidate.requiresAction).length,
      upcomingCount: candidates.filter((candidate) => candidate.upcoming).length,
      totalCount: candidates.length,
      primaryKind: primary.kind,
      primaryLabel: primary.label,
      primaryDate: primary.date ? formatPlayerActivityDate(primary.date, now) : null
    });
  });

  return summaries;
}
