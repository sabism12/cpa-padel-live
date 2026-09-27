/**
 * Authoritative scoring authority.
 *
 * The server — never the browser — owns the score. Clients submit immutable,
 * idempotent score events and this module derives match state by replaying
 * them through the EXISTING scoringEngine (no second rules implementation).
 *
 * Guarantees:
 *  - `eventId` is an idempotency key: a replay is accepted but never applied twice.
 *  - Each match has a monotonic `seq` assigned by the authority (timestamps are
 *    never used for ordering).
 *  - A late/foreign batch is re-sequenced to the tail in its original order, so
 *    a phone that queues offline and returns cannot rewind a live match.
 */
import {
  Match,
  MatchEventRecord,
  PadelMatchState,
} from '../src/types';
import {
  ScoreEvent,
  ScoreEventResult,
} from '../src/scoring/eventTypes';
import {
  createInitialMatchState,
  processAction,
  formatMatchScoreSummary,
} from '../src/scoring/scoringEngine';

export interface ApplyEventOptions {
  /** Where the event entered the system. */
  source?: 'client' | 'gateway';
  /** Optional override for MATCH_FINAL scorekeeper display. */
  submittedBy?: string;
}

export interface ApplyEventOutcome {
  result: ScoreEventResult;
  /** True when the match object was mutated and should be persisted/broadcast. */
  changed: boolean;
  /** Set when MATCH_FINAL completed the match (for knockout advancement). */
  finalised?: boolean;
}

/** Safe fallback state when a match has no stored padelState yet. */
function stateFor(match: Match): PadelMatchState {
  if (match.padelState) return match.padelState;

  const initial = createInitialMatchState(match.id);
  if (match.team1Score !== null && match.team2Score !== null) {
    initial.team1Games = match.team1Score;
    initial.team2Games = match.team2Score;
    if (initial.team1Games >= 6 || initial.team2Games >= 6) {
      initial.isMatchOver = true;
      initial.winnerTeamId = initial.team1Games >= 6 ? 'team1' : 'team2';
    }
  }
  return initial;
}

function matchesScorekeeper(record: MatchEventRecord, event: ScoreEvent): boolean {
  return record.eventId === event.eventId;
}

/** Idempotency: has this exact eventId already been applied to this match? */
export function findAppliedEvent(match: Match, eventId: string): MatchEventRecord | undefined {
  return (match.seqLog || []).find((record) => matchesScorekeeper(record, { eventId } as ScoreEvent));
}

/** Next monotonic sequence for a match's event log. */
export function nextSeqFor(match: Match): number {
  const log = match.seqLog || [];
  return log.length === 0 ? 1 : log[log.length - 1].seq + 1;
}

/**
 * Apply one score event to a match in place.
 *
 * The caller (TournamentStore) is responsible for persistence + broadcast when
 * `changed` is true. This function is synchronous and deterministic, which is
 * what makes concurrency safe inside the single Node process.
 */
export function applyScoreEvent(
  match: Match,
  event: ScoreEvent,
  options: ApplyEventOptions = {}
): ApplyEventOutcome {
  if (!event || typeof event.eventId !== 'string' || !event.eventId) {
    return {
      result: { eventId: String(event?.eventId ?? ''), accepted: false, duplicate: false, error: 'Missing eventId.' },
      changed: false,
    };
  }

  // 1. Idempotency — never apply the same eventId twice.
  const applied = findAppliedEvent(match, event.eventId);
  if (applied) {
    return {
      result: {
        eventId: event.eventId,
        accepted: true,
        duplicate: true,
        seq: applied.seq,
        matchVersion: match.matchVersion ?? 0,
      },
      changed: false,
    };
  }

  // 2. Reject cancellations and unknown event types defensively.
  if (match.status === 'cancelled') {
    return {
      result: { eventId: event.eventId, accepted: false, duplicate: false, error: 'Match is cancelled.' },
      changed: false,
    };
  }

  // Points/undo/reset must never reopen a completed match. MATCH_FINAL is
  // handled by its own idempotent guard below.
  if (match.status === 'completed' && event.type !== 'MATCH_FINAL') {
    return {
      result: {
        eventId: event.eventId,
        accepted: false,
        duplicate: false,
        error: 'This match has already been submitted and completed.',
      },
      changed: false,
    };
  }

  const seq = nextSeqFor(match);
  const serverTs = new Date().toISOString();
  let state = stateFor(match);
  let changed = true;
  let finalised = false;

  // Display names are only used in human-readable messages, never in scoring
  // logic. Match metadata stores team ids, so use neutral labels here.
  const t1Name = 'Team 1';
  const t2Name = 'Team 2';

  switch (event.type) {
    case 'POINT_TEAM_1':
    case 'POINT_TEAM_2':
    case 'UNDO':
    case 'RESET': {
      state = processAction(
        state,
        event.type === 'POINT_TEAM_1'
          ? { type: 'POINT_TEAM_1' }
          : event.type === 'POINT_TEAM_2'
            ? { type: 'POINT_TEAM_2' }
            : event.type === 'UNDO'
              ? { type: 'UNDO' }
              : { type: 'RESET' },
        t1Name,
        t2Name
      );
      match.padelState = state;
      match.team1Score = state.team1Games;
      match.team2Score = state.team2Games;
      match.scoreSummary = formatMatchScoreSummary(state);
      // Keep the match live while points are scored, exactly like the legacy UI.
      if (match.status === 'scheduled' || match.status === 'ready') {
        match.status = 'live';
      }
      break;
    }

    case 'MATCH_START': {
      if (match.status === 'scheduled' || match.status === 'ready') {
        match.status = 'live';
      } else {
        changed = false;
      }
      break;
    }

    case 'MATCH_FINAL': {
      const t1 = Number(event.payload?.team1Games ?? state.team1Games ?? 0);
      const t2 = Number(event.payload?.team2Games ?? state.team2Games ?? 0);

      if (!Number.isFinite(t1) || !Number.isFinite(t2) || t1 < 0 || t2 < 0) {
        return {
          result: { eventId: event.eventId, accepted: false, duplicate: false, error: 'Invalid final score.' },
          changed: false,
        };
      }
      if (match.status === 'completed') {
        return {
          result: {
            eventId: event.eventId,
            accepted: false,
            duplicate: false,
            error: 'This match has already been submitted and completed.',
          },
          changed: false,
        };
      }
      if (t1 === t2) {
        return {
          result: { eventId: event.eventId, accepted: false, duplicate: false, error: 'Padel matches cannot end in a draw.' },
          changed: false,
        };
      }

      state = {
        ...state,
        team1Games: t1,
        team2Games: t2,
        isMatchOver: true,
        winnerTeamId: t1 > t2 ? 'team1' : 'team2',
        completedAt: serverTs,
        lastEventMessage: `MATCH COMPLETE — ${t1 > t2 ? t1Name : t2Name} (${t1} - ${t2})`,
      };
      match.padelState = state;
      match.team1Score = t1;
      match.team2Score = t2;
      match.scoreSummary = event.payload?.scoreSummary || formatMatchScoreSummary(state);
      match.status = 'completed';
      match.completedAt = serverTs;
      match.submittedBy = options.submittedBy;
      finalised = true;
      break;
    }

    default:
      return {
        result: { eventId: event.eventId, accepted: false, duplicate: false, error: `Unsupported event type: ${String(event.type)}` },
        changed: false,
      };
  }

  if (!changed) {
    return {
      result: {
        eventId: event.eventId,
        accepted: true,
        duplicate: false,
        seq,
        matchVersion: match.matchVersion ?? 0,
      },
      changed: false,
    };
  }

  // 3. Record the applied event and bump the match version.
  const record: MatchEventRecord = {
    eventId: event.eventId,
    seq,
    type: event.type,
    courtId: event.courtId ?? match.courtId ?? null,
    scorekeeper: event.scorekeeper,
    clientTs: event.clientTs,
    serverTs,
    source: options.source || 'client',
    ...(event.payload ? { payload: event.payload } : {}),
  };
  match.seqLog = [...(match.seqLog || []), record];
  match.matchVersion = (match.matchVersion ?? 0) + 1;

  return {
    result: {
      eventId: event.eventId,
      accepted: true,
      duplicate: false,
      seq,
      matchVersion: match.matchVersion,
    },
    changed: true,
    finalised,
  };
}

/**
 * Display-name helper. Match metadata stores team ids rather than names, so
 * neutral labels are used. Names only appear in human-readable messages and are
 * never part of scoring logic.
 */
function t1NamePlaceholder(_match: Match, side: 'team1' | 'team2'): string {
  return side === 'team1' ? 'Team 1' : 'Team 2';
}

/** Convenience: apply a batch, preserving the caller's original order. */
export function applyScoreEventBatch(
  matchesById: Map<string, Match>,
  events: ScoreEvent[],
  options: ApplyEventOptions = {}
): { results: ScoreEventResult[]; changedMatches: Match[]; finalisedMatches: Match[] } {
  const results: ScoreEventResult[] = [];
  const changed = new Set<Match>();
  const finalised: Match[] = [];

  for (const event of events) {
    const match = matchesById.get(event.matchId);
    if (!match) {
      results.push({
        eventId: event.eventId,
        accepted: false,
        duplicate: false,
        error: `Match not found: ${event.matchId}`,
      });
      continue;
    }
    const outcome = applyScoreEvent(match, event, options);
    results.push(outcome.result);
    if (outcome.changed) changed.add(match);
    if (outcome.finalised) finalised.push(match);
  }

  return { results, changedMatches: [...changed], finalisedMatches: finalised };
}
