/**
 * Live Padel Group Draw — authoritative draw logic (server-side only).
 *
 * The browser never decides a draw result. This module produces the random
 * reveal order and group assignment and is the single source of truth.
 * All mutations happen synchronously in the Express process, so a spin is
 * atomic: two requests can never reveal the same pair or overfill a group.
 */
import crypto from 'crypto';
import {
  DrawApiState,
  DrawGroup,
  DrawPair,
  DrawResultRecord,
  DrawResultView,
  DrawSpinView,
  DrawStateRecord,
  DrawStatus,
} from '../src/draw/types';

export const DRAW_GROUPS: DrawGroup[] = ['A', 'B', 'C', 'D', 'E'];
export const GROUP_SIZE = 4;
export const TOTAL_PAIRS = 20;

/**
 * Smallest gap between two spins (ms). Guards against accidental double
 * clicks and two admin tabs firing at the same moment. A real spin animation
 * lasts ~5s, so this never gets in the way of the host.
 */
export const SPIN_COOLDOWN_MS = 2500;

/** Cryptographically strong Fisher-Yates shuffle. */
function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export function makePairId(index: number): string {
  return `draw-pair-${String(index + 1).padStart(2, '0')}`;
}

/** Build a fresh pair list from the existing tournament roster (reuses data). */
export function pairsFromTeams(teams: { player1: string; player2: string }[]): DrawPair[] {
  return teams.map((t, i) => ({
    id: makePairId(i),
    player1: (t.player1 || '').trim(),
    player2: (t.player2 || '').trim(),
  }));
}

export function createInitialDraw(pairs: DrawPair[]): DrawStateRecord {
  return {
    pairs,
    sequence: [],
    groupPlan: {},
    results: [],
    initialized: false,
    lastSpinAtMs: 0,
  };
}

/**
 * Validate an admin-submitted list of pairs.
 * Rules: exactly 20 pairs, both names present, no duplicated pair, and no
 * player appearing in more than one pair.
 */
export function validatePairs(
  raw: unknown
): { pairs?: DrawPair[]; error?: string } {
  if (!Array.isArray(raw)) {
    return { error: 'Pairs must be provided as a list.' };
  }
  if (raw.length !== TOTAL_PAIRS) {
    return {
      error: `Exactly ${TOTAL_PAIRS} pairs are required (received ${raw.length}).`,
    };
  }

  const seenPairs = new Set<string>();
  const seenPlayers = new Set<string>();
  const pairs: DrawPair[] = [];

  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i] as { player1?: string; player2?: string };
    const player1 = (entry?.player1 || '').trim();
    const player2 = (entry?.player2 || '').trim();
    const label = `Pair ${String(i + 1).padStart(2, '0')}`;

    if (!player1 || !player2) {
      return { error: `${label} needs both player names filled in.` };
    }

    const pairKey = [player1.toLowerCase(), player2.toLowerCase()].sort().join('|');
    if (seenPairs.has(pairKey)) {
      return { error: `${label} duplicates an existing pair (${player1} / ${player2}).` };
    }
    seenPairs.add(pairKey);

    for (const name of [player1, player2]) {
      const key = name.toLowerCase();
      if (seenPlayers.has(key)) {
        return { error: `Player "${name}" appears in more than one pair.` };
      }
      seenPlayers.add(key);
    }

    pairs.push({ id: makePairId(i), player1, player2 });
  }

  return { pairs };
}

/** Match a roster name against an exact name or surname alias. */
function matchesPlayerName(name: string, alias: string): boolean {
  const tokens = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/);
  return tokens.includes(alias.toLowerCase());
}

/** Find a pair by its two player aliases, allowing either player order. */
function findPairId(pairs: DrawPair[], playerA: string, playerB: string): string | undefined {
  return pairs.find(
    (pair) =>
      (matchesPlayerName(pair.player1, playerA) && matchesPlayerName(pair.player2, playerB)) ||
      (matchesPlayerName(pair.player1, playerB) && matchesPlayerName(pair.player2, playerA))
  )?.id;
}

/**
 * These pairs must be kept in separate groups for tournament seeding:
 * Bilal / Ali cannot share a group with either Omer / Tariq or
 * Abdullah Othman / Akmal Rizvi. Surname aliases keep this working if names
 * are displayed or entered in their shortened form.
 */
function respectsProtectedGroupSeparations(
  pairs: DrawPair[],
  groupPlan: Record<string, DrawGroup>
): boolean {
  const bilalAli = findPairId(pairs, 'Bilal', 'Ali');
  if (!bilalAli) return true;

  const mustSeparate = [
    findPairId(pairs, 'Omer', 'Tariq'),
    findPairId(pairs, 'Othman', 'Rizvi'),
  ].filter((id): id is string => !!id);

  return mustSeparate.every((pairId) => groupPlan[bilalAli] !== groupPlan[pairId]);
}

/**
 * Randomise the reveal order and assign exactly GROUP_SIZE pairs to each
 * group. Produces a stable plan that SPIN reveals one step at a time.
 */
export function initializeDraw(state: DrawStateRecord): string | null {
  if (state.pairs.length !== TOTAL_PAIRS) {
    return `Exactly ${TOTAL_PAIRS} valid pairs are required before initializing the draw.`;
  }

  const sequence = shuffle(state.pairs.map((p) => p.id));

  const bag: DrawGroup[] = [];
  for (const group of DRAW_GROUPS) {
    for (let i = 0; i < GROUP_SIZE; i++) bag.push(group);
  }

  // Rejection-sample a uniformly shuffled balanced group bag until the
  // protected pair-separation rules are satisfied. This preserves a fair
  // random assignment among all valid 4-per-group outcomes.
  let groupPlan: Record<string, DrawGroup> = {};
  while (true) {
    const shuffledBag = shuffle(bag);
    const candidate: Record<string, DrawGroup> = {};
    sequence.forEach((pairId, index) => {
      candidate[pairId] = shuffledBag[index];
    });
    if (respectsProtectedGroupSeparations(state.pairs, candidate)) {
      groupPlan = candidate;
      break;
    }
  }

  state.sequence = sequence;
  state.groupPlan = groupPlan;
  state.results = [];
  state.initialized = true;
  state.initializedAt = new Date().toISOString();
  delete state.lastSpin;
  state.lastSpinAtMs = 0;
  return null;
}

/** Reveal the next pair in the authoritative sequence. */
export function spinDraw(
  state: DrawStateRecord
): { error?: string; result?: DrawResultRecord } {
  if (!state.initialized) {
    return { error: 'The draw has not been initialized yet.' };
  }
  if (state.results.length >= state.pairs.length) {
    return { error: 'The draw is already complete.' };
  }

  const now = Date.now();
  if (state.lastSpinAtMs && now - state.lastSpinAtMs < SPIN_COOLDOWN_MS) {
    return { error: 'A spin is already in progress. Please wait a moment.' };
  }

  const index = state.results.length;
  const pairId = state.sequence[index];
  const assignedGroup = state.groupPlan[pairId];
  if (!pairId || !assignedGroup) {
    return { error: 'The draw state is inconsistent. Please re-initialize the draw.' };
  }

  const result: DrawResultRecord = {
    drawOrder: index + 1,
    pairId,
    assignedGroup,
    revealedAt: new Date().toISOString(),
  };
  state.results.push(result);
  state.lastSpin = {
    drawOrder: result.drawOrder,
    pairId,
    assignedGroup,
    at: result.revealedAt,
  };
  state.lastSpinAtMs = now;
  return { result };
}

/** Remove the most recent reveal and restore the pair to the pool. */
export function undoDraw(state: DrawStateRecord): string | null {
  if (!state.initialized) return 'The draw has not been initialized yet.';
  if (state.results.length === 0) return 'There are no draw results to undo.';

  state.results.pop();
  state.lastSpinAtMs = 0;

  const last = state.results[state.results.length - 1];
  if (last) {
    state.lastSpin = {
      drawOrder: last.drawOrder,
      pairId: last.pairId,
      assignedGroup: last.assignedGroup,
      at: last.revealedAt,
    };
  } else {
    delete state.lastSpin;
  }
  return null;
}

/** Return to the pre-draw state. Player pairs are intentionally preserved. */
export function resetDraw(state: DrawStateRecord): void {
  state.sequence = [];
  state.groupPlan = {};
  state.results = [];
  state.initialized = false;
  state.initializedAt = undefined;
  delete state.lastSpin;
  state.lastSpinAtMs = 0;
}

export function drawStatus(state: DrawStateRecord): DrawStatus {
  if (!state.initialized) return 'setup';
  if (state.results.length === 0) return 'ready';
  if (state.results.length < state.pairs.length) return 'in_progress';
  return 'complete';
}

/** Produce the safe, client-facing snapshot (no secret sequence/plan). */
export function serializeDraw(state: DrawStateRecord): DrawApiState {
  const pairMap = new Map(state.pairs.map((p) => [p.id, p]));

  const results: DrawResultView[] = state.results.map((r) => {
    const pair = pairMap.get(r.pairId);
    return {
      ...r,
      player1: pair?.player1 || '',
      player2: pair?.player2 || '',
    };
  });

  let lastSpin: DrawSpinView | undefined;
  if (state.lastSpin) {
    const pair = pairMap.get(state.lastSpin.pairId);
    lastSpin = {
      ...state.lastSpin,
      player1: pair?.player1 || '',
      player2: pair?.player2 || '',
    };
  }

  return {
    status: drawStatus(state),
    initialized: state.initialized,
    pairs: state.pairs,
    results,
    currentDrawIndex: state.results.length,
    totalPairs: state.pairs.length,
    groupSize: GROUP_SIZE,
    groups: DRAW_GROUPS,
    lastSpin,
    initializedAt: state.initializedAt,
  };
}
