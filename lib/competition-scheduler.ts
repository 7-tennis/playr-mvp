export type CompetitionScheduleMode = "timed" | "queue";

export type ScheduleCourt = { id: string; label: string; order: number };

export type ScheduleMatch = {
  id: string;
  stageOrder: number;
  groupOrder: number | null;
  roundNumber: number;
  sequence: number;
  playerIds: string[];
  sourceMatchIds: string[];
  hasGroupPlacementSource: boolean;
  staffUserIds: string[];
};

export type ScheduleSettings = {
  mode: CompetitionScheduleMode;
  startAt: string | null;
  eventEndAt: string | null;
  matchDurationMinutes: number | null;
  minimumRestMinutes: number;
};

export type PlannedOperation = {
  match_id: string;
  event_court_id: string;
  queue_position: number;
  wave: number;
  scheduled_at: string | null;
};

export type CompetitionSchedulePlan = {
  operations: PlannedOperation[];
  estimatedFinish: string | null;
  courtUsage: Array<{ courtId: string; label: string; matches: number }>;
  waveCount: number;
};

export class CompetitionScheduleError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "CompetitionScheduleError";
  }
}

function validDate(value: string | null) {
  if (!value) return null;
  const milliseconds = new Date(value).getTime();
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function ordered(matches: ScheduleMatch[]) {
  return [...matches].sort((left, right) =>
    left.stageOrder - right.stageOrder ||
    left.roundNumber - right.roundNumber ||
    (left.groupOrder ?? Number.MAX_SAFE_INTEGER) - (right.groupOrder ?? Number.MAX_SAFE_INTEGER) ||
    left.sequence - right.sequence ||
    left.id.localeCompare(right.id)
  );
}

/**
 * Bounded deterministic list scheduler. Each loop creates one logical wave.
 * A wave contains at most one match per court and never repeats a known player
 * or assigned staff user. Feeder and stage barriers are checked before selection.
 */
export function buildCompetitionSchedule(
  matches: ScheduleMatch[],
  courts: ScheduleCourt[],
  settings: ScheduleSettings
): CompetitionSchedulePlan {
  if (!matches.length) throw new CompetitionScheduleError("competition_schedule_matches_required", "No structural matches are available.");
  const activeCourts = [...courts].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  if (!activeCourts.length) throw new CompetitionScheduleError("competition_courts_required", "At least one active court is required.");
  if (settings.minimumRestMinutes < 0 || !Number.isInteger(settings.minimumRestMinutes)) {
    throw new CompetitionScheduleError("competition_schedule_settings_invalid", "Minimum rest must be a whole number of minutes.");
  }

  const start = settings.mode === "timed" ? validDate(settings.startAt) : null;
  const eventEnd = validDate(settings.eventEndAt);
  const duration = settings.matchDurationMinutes;
  if (settings.mode === "timed" && (start === null || duration === null || !Number.isInteger(duration) || duration < 5 || duration > 180)) {
    throw new CompetitionScheduleError("competition_schedule_settings_invalid", "Timed schedules require a valid start and 5–180 minute duration.");
  }

  const sourceIds = new Set(matches.map((match) => match.id));
  if (matches.some((match) => match.sourceMatchIds.some((source) => !sourceIds.has(source)))) {
    throw new CompetitionScheduleError("competition_schedule_structure_invalid", "A feeder match is missing from the competition structure.");
  }

  const remaining = ordered(matches);
  const scheduledWave = new Map<string, number>();
  const playerAvailableAt = new Map<string, number>();
  const queueByCourt = new Map(activeCourts.map((court) => [court.id, 0]));
  const usageByCourt = new Map(activeCourts.map((court) => [court.id, 0]));
  const operations: PlannedOperation[] = [];
  const dependencyWaveGap = settings.mode === "timed"
    ? 1 + Math.ceil(settings.minimumRestMinutes / (duration as number))
    : 1;
  const maxWaves = matches.length * (dependencyWaveGap + 1) + 1;
  let wave = 0;

  while (remaining.length) {
    if (wave >= maxWaves) {
      throw new CompetitionScheduleError("competition_schedule_unfeasible", "The structural dependency graph could not be scheduled.");
    }
    const waveStart = start === null ? null : start + wave * (duration as number) * 60_000;
    const waveEnd = waveStart === null ? null : waveStart + (duration as number) * 60_000;
    if (eventEnd !== null && waveEnd !== null && waveEnd > eventEnd) {
      throw new CompetitionScheduleError(
        "competition_schedule_event_window_conflict",
        "The complete schedule does not fit inside the event window. Add courts, shorten matches, extend the event, or reduce rest."
      );
    }

    const playersInWave = new Set<string>();
    const staffInWave = new Set<string>();
    const groupsInWave = new Set<number>();
    let placed = 0;
    const courtOffset = wave % activeCourts.length;
    const courtOrder = activeCourts.map((_, index) => activeCourts[(index + courtOffset) % activeCourts.length]);

    for (const court of courtOrder) {
      const canPlace = (match: ScheduleMatch) => {
        if (match.sourceMatchIds.some((source) => !scheduledWave.has(source) || (scheduledWave.get(source) as number) + dependencyWaveGap > wave)) return false;
        if (match.hasGroupPlacementSource && remaining.some((other) => other.stageOrder < match.stageOrder)) return false;
        if (match.hasGroupPlacementSource && matches.some((other) => other.stageOrder < match.stageOrder
          && (scheduledWave.get(other.id) ?? Number.MAX_SAFE_INTEGER) + dependencyWaveGap > wave)) return false;
        if (match.playerIds.some((player) => playersInWave.has(player))) return false;
        if (match.staffUserIds.some((staff) => staffInWave.has(staff))) return false;
        if (waveStart !== null && match.playerIds.some((player) => (playerAvailableAt.get(player) ?? -Infinity) > waveStart)) return false;
        return true;
      };
      // Prefer another group in the same wave, then fall back to any safe
      // match. This lets multiple festival groups share parallel courts.
      let candidateIndex = remaining.findIndex((match) => match.groupOrder !== null && !groupsInWave.has(match.groupOrder) && canPlace(match));
      if (candidateIndex < 0) candidateIndex = remaining.findIndex(canPlace);
      if (candidateIndex < 0) continue;

      const [match] = remaining.splice(candidateIndex, 1);
      const queuePosition = (queueByCourt.get(court.id) ?? 0) + 1;
      queueByCourt.set(court.id, queuePosition);
      usageByCourt.set(court.id, (usageByCourt.get(court.id) ?? 0) + 1);
      match.playerIds.forEach((player) => playersInWave.add(player));
      match.staffUserIds.forEach((staff) => staffInWave.add(staff));
      if (match.groupOrder !== null) groupsInWave.add(match.groupOrder);
      if (waveEnd !== null) {
        const nextAt = waveEnd + settings.minimumRestMinutes * 60_000;
        match.playerIds.forEach((player) => playerAvailableAt.set(player, nextAt));
      }
      scheduledWave.set(match.id, wave);
      operations.push({
        event_court_id: court.id,
        match_id: match.id,
        queue_position: queuePosition,
        scheduled_at: waveStart === null ? null : new Date(waveStart).toISOString(),
        wave: wave + 1
      });
      placed += 1;
    }

    // An empty timed wave can be required solely by rest. In queue mode it means
    // the dependency graph cannot progress, so fail rather than spin.
    if (placed === 0 && settings.mode === "queue") {
      throw new CompetitionScheduleError("competition_schedule_unfeasible", "The competition dependencies cannot form a safe running order.");
    }
    wave += 1;
  }

  const estimatedFinish = start === null ? null : new Date(start + wave * (duration as number) * 60_000).toISOString();
  return {
    courtUsage: activeCourts.map((court) => ({ courtId: court.id, label: court.label, matches: usageByCourt.get(court.id) ?? 0 })),
    estimatedFinish,
    operations,
    waveCount: wave
  };
}
