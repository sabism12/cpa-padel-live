/**
 * Score event model shared by the browser, the Dell gateway, and Render.
 *
 * The server is the scoring authority: clients submit immutable, idempotent
 * events and the server derives match state from them. `eventId` is generated
 * and persisted by the client BEFORE any transmission, so retries and
 * multi-path delivery (Dell relay + direct Internet) can never double-apply.
 */

/** Point/reset style events that the existing scoringEngine can apply in order. */
export type ScoreEventType =
  | 'POINT_TEAM_1'
  | 'POINT_TEAM_2'
  | 'UNDO'
  | 'RESET'
  /** Marks a match live without recording a point. */
  | 'MATCH_START'
  /** Final result submission for the match. */
  | 'MATCH_FINAL';

export interface ScoreEvent {
  /** Client-generated idempotency key, e.g. crypto.randomUUID(). */
  eventId: string;
  matchId: string;
  /** Court the scorekeeper was operating; informational + reassignment. */
  courtId?: string | null;
  /** Human-readable scorekeeper identity (session name). */
  scorekeeper?: string;
  type: ScoreEventType;
  /** Only used by MATCH_FINAL: the official games for each side. */
  payload?: {
    team1Games?: number;
    team2Games?: number;
    scoreSummary?: string;
  };
  /** Client wall clock; informational only — never used for ordering. */
  clientTs: string;
}

export interface ScoreEventResult {
  eventId: string;
  accepted: boolean;
  /** True when this eventId had already been applied (idempotent replay). */
  duplicate: boolean;
  /** Per-match monotonic sequence assigned by the authority. */
  seq?: number;
  /** Match version after applying (bumped on every applied event). */
  matchVersion?: number;
  error?: string;
}

export interface SyncBatchResponse {
  success: boolean;
  results: ScoreEventResult[];
  /** Server match versions so the client can detect divergence. */
  versions: Record<string, number>;
  /** True when the authority had to re-sequence a late batch. */
  reconciled?: boolean;
}

export interface SyncHelloResponse {
  /** 'gateway' for the Dell, 'server' for Render. */
  role: 'gateway' | 'server';
  name: string;
  version: string;
  /** Gateway only: whether the Dell currently reaches its upstream. */
  upstreamReachable?: boolean;
}

/** Connection/mode the scorekeeper UI reports. */
export type SyncMode = 'online-local' | 'online-direct' | 'offline';
