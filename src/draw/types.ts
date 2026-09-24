/**
 * Live Padel Group Draw — shared types.
 *
 * These types are used by both the Express server (authoritative draw state)
 * and the React draw pages. They are intentionally plain data so they can be
 * persisted inside the existing tournament state JSON file.
 */

export type DrawGroup = 'A' | 'B' | 'C' | 'D' | 'E';

export type DrawStatus = 'setup' | 'ready' | 'in_progress' | 'complete';

/** One player pair, e.g. "Faham / Ansaf". */
export interface DrawPair {
  id: string;
  player1: string;
  player2: string;
}

/** A revealed draw result (authoritative, stored server-side). */
export interface DrawResultRecord {
  /** 1-based reveal order. */
  drawOrder: number;
  pairId: string;
  assignedGroup: DrawGroup;
  revealedAt: string;
}

/** Metadata for the most recent spin, used to drive the client animation. */
export interface DrawSpinMeta {
  drawOrder: number;
  pairId: string;
  assignedGroup: DrawGroup;
  at: string;
}

/**
 * The authoritative draw state stored on the server.
 *
 * `sequence` (the randomised reveal order) and `groupPlan` (the randomised
 * pair -> group assignment) are secret until each result is revealed, so they
 * are NEVER sent to clients before their turn.
 */
export interface DrawStateRecord {
  pairs: DrawPair[];
  sequence: string[];
  groupPlan: Record<string, DrawGroup>;
  results: DrawResultRecord[];
  initialized: boolean;
  initializedAt?: string;
  lastSpin?: DrawSpinMeta;
  lastSpinAtMs?: number;
}

/* ------------------------------------------------------------------ */
/* Client-facing (safe) shapes                                         */
/* ------------------------------------------------------------------ */

export interface DrawResultView extends DrawResultRecord {
  player1: string;
  player2: string;
}

export interface DrawSpinView extends DrawSpinMeta {
  player1: string;
  player2: string;
}

export interface DrawApiState {
  status: DrawStatus;
  initialized: boolean;
  pairs: DrawPair[];
  results: DrawResultView[];
  currentDrawIndex: number;
  totalPairs: number;
  groupSize: number;
  groups: DrawGroup[];
  lastSpin?: DrawSpinView;
  initializedAt?: string;
}
