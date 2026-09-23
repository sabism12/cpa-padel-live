export * from './types';

import {
  PadelMatchState,
  PadelMatchSnapshot,
  PadelPoint,
  PadelPointLabel,
  ScoringActionHistoryItem,
  ScoringAction,
} from './types';

/**
 * Returns user-facing label for current game points:
 * 0 = LOVE
 * 1 = 15
 * 2 = 30
 * 3 = 40
 */
export function formatPointDisplay(point: PadelPoint): PadelPointLabel {
  switch (point) {
    case 0:
      return 'LOVE';
    case 1:
      return '15';
    case 2:
      return '30';
    case 3:
      return '40';
    default:
      return 'LOVE';
  }
}

/**
 * Creates a clean initial match state for the simplified first-to-6-games format
 */
export function createInitialMatchState(matchId: string): PadelMatchState {
  return {
    matchId,
    team1Games: 0,
    team2Games: 0,
    team1Points: 0,
    team2Points: 0,
    isGoldenPoint: false,
    isMatchOver: false,
    winnerTeamId: null,
    lastEventMessage: 'Match Ready — Love-Love',
    history: [],
    // Legacy support fields
    format: 'first_to_6',
    currentSet: 1,
    team1SetsWon: 0,
    team2SetsWon: 0,
    completedSets: [],
  };
}

/**
 * Creates an immutable snapshot of scoring state for undo history
 */
function extractSnapshot(state: PadelMatchState): PadelMatchSnapshot {
  return {
    team1Games: state.team1Games,
    team2Games: state.team2Games,
    team1Points: state.team1Points,
    team2Points: state.team2Points,
    isGoldenPoint: state.isGoldenPoint,
    isMatchOver: state.isMatchOver,
    winnerTeamId: state.winnerTeamId,
    lastEventMessage: state.lastEventMessage,
  };
}

/**
 * Applies a point to the match state deterministically following:
 * Point (Love, 15, 30, 40) -> Golden Point at 40-40 -> Game -> First to 6 Games Wins Match.
 */
export function recordPoint(
  currentState: PadelMatchState,
  scoringTeam: 'team1' | 'team2',
  team1Name: string = 'Team 1',
  team2Name: string = 'Team 2'
): PadelMatchState {
  if (currentState.isMatchOver) {
    return currentState;
  }

  // Create deep copy of state for pure immutability
  const state: PadelMatchState = {
    ...currentState,
    history: [...currentState.history],
  };

  const isTeam1 = scoringTeam === 'team1';
  const scorerName = isTeam1 ? team1Name : team2Name;

  // Snapshot before point for Undo stack
  const snapshot = extractSnapshot(currentState);
  const historyItem: ScoringActionHistoryItem = {
    timestamp: new Date().toISOString(),
    type: isTeam1 ? 'POINT_TEAM_1' : 'POINT_TEAM_2',
    description: `Point to ${scorerName}`,
    snapshot,
  };
  state.history.push(historyItem);

  if (!state.startedAt) {
    state.startedAt = new Date().toISOString();
  }

  let gameWon = false;

  // 1. Golden Point handling (40-40 reached previously)
  if (state.isGoldenPoint) {
    // The next rally decides the game. No advantage system. No second deuce.
    gameWon = true;
  } else {
    // 2. Normal progression within the game: 0 (Love) -> 1 (15) -> 2 (30) -> 3 (40)
    if (isTeam1) {
      if (state.team1Points === 0) {
        state.team1Points = 1; // 15
      } else if (state.team1Points === 1) {
        state.team1Points = 2; // 30
      } else if (state.team1Points === 2) {
        state.team1Points = 3; // 40
        // If opponent is also at 40, enter Golden Point immediately
        if (state.team2Points === 3) {
          state.isGoldenPoint = true;
        }
      } else if (state.team1Points === 3) {
        // Was at 40, opponent < 40 -> Team 1 wins game!
        gameWon = true;
      }
    } else {
      if (state.team2Points === 0) {
        state.team2Points = 1; // 15
      } else if (state.team2Points === 1) {
        state.team2Points = 2; // 30
      } else if (state.team2Points === 2) {
        state.team2Points = 3; // 40
        // If opponent is also at 40, enter Golden Point immediately
        if (state.team1Points === 3) {
          state.isGoldenPoint = true;
        }
      } else if (state.team2Points === 3) {
        // Was at 40, opponent < 40 -> Team 2 wins game!
        gameWon = true;
      }
    }
  }

  // If game is not won yet: update message and return
  if (!gameWon) {
    if (state.isGoldenPoint) {
      state.lastEventMessage = 'DEUCE — GOLDEN POINT (Next rally wins game)';
    } else {
      const p1Str = formatPointDisplay(state.team1Points);
      const p2Str = formatPointDisplay(state.team2Points);
      state.lastEventMessage = `Point ${scorerName} (${p1Str} - ${p2Str})`;
    }
    return state;
  }

  // 3. Game Won:
  // Add 1 to that team's game count.
  // Reset current game score to LOVE-LOVE.
  // Continue match.
  if (isTeam1) {
    state.team1Games += 1;
  } else {
    state.team2Games += 1;
  }

  state.team1Points = 0;
  state.team2Points = 0;
  state.isGoldenPoint = false;

  const g1 = state.team1Games;
  const g2 = state.team2Games;

  // 4. Match Completion:
  // First team to reach 6 games wins the set/match.
  // NO requirement for a 2-game lead (6-0, 6-1, 6-2, 6-3, 6-4, 6-5 all win immediately).
  // NO 6-6, NO tiebreak, NO extended set.
  if (g1 >= 6) {
    state.isMatchOver = true;
    state.winnerTeamId = 'team1';
    state.completedAt = new Date().toISOString();
    state.lastEventMessage = `MATCH COMPLETE — ${team1Name} (${g1} - ${g2})`;
    // Legacy support
    state.team1SetsWon = 1;
    state.team2SetsWon = 0;
    state.completedSets = [{ setNumber: 1, team1Games: g1, team2Games: g2, winner: 'team1' }];
  } else if (g2 >= 6) {
    state.isMatchOver = true;
    state.winnerTeamId = 'team2';
    state.completedAt = new Date().toISOString();
    state.lastEventMessage = `MATCH COMPLETE — ${team2Name} (${g1} - ${g2})`;
    // Legacy support
    state.team1SetsWon = 0;
    state.team2SetsWon = 1;
    state.completedSets = [{ setNumber: 1, team1Games: g1, team2Games: g2, winner: 'team2' }];
  } else {
    // Next game starting
    state.lastEventMessage = `GAME ${scorerName} (${g1} - ${g2}) — Next game starting`;
  }

  return state;
}

/**
 * Undoes the last recorded point with 100% precision.
 * Correctly restores 15, 30, 40, Golden Point, game completion, and match completion.
 */
export function undoLastPoint(currentState: PadelMatchState): PadelMatchState {
  if (currentState.history.length === 0) {
    return currentState;
  }

  const history = [...currentState.history];
  const lastAction = history.pop()!;
  const prevSnapshot = lastAction.snapshot;

  return {
    ...currentState,
    ...prevSnapshot,
    history,
    lastEventMessage: `Undid last point (${lastAction.description})`,
    // Legacy support sync
    team1SetsWon: prevSnapshot.isMatchOver && prevSnapshot.winnerTeamId === 'team1' ? 1 : 0,
    team2SetsWon: prevSnapshot.isMatchOver && prevSnapshot.winnerTeamId === 'team2' ? 1 : 0,
    completedSets: prevSnapshot.isMatchOver
      ? [
          {
            setNumber: 1,
            team1Games: prevSnapshot.team1Games,
            team2Games: prevSnapshot.team2Games,
            winner: prevSnapshot.winnerTeamId || 'team1',
          },
        ]
      : [],
  };
}

/**
 * General action dispatcher (POINT_TEAM_1, POINT_TEAM_2, UNDO, RESET)
 */
export function processAction(
  state: PadelMatchState,
  action: ScoringAction,
  team1Name: string = 'Team 1',
  team2Name: string = 'Team 2'
): PadelMatchState {
  switch (action.type) {
    case 'POINT_TEAM_1':
      return recordPoint(state, 'team1', team1Name, team2Name);
    case 'POINT_TEAM_2':
      return recordPoint(state, 'team2', team1Name, team2Name);
    case 'UNDO':
      return undoLastPoint(state);
    case 'RESET':
      return createInitialMatchState(state.matchId);
    default:
      return state;
  }
}

/**
 * Formats a clean match score summary, e.g. "6 - 4" or "6 - 5"
 */
export function formatMatchScoreSummary(state: PadelMatchState): string {
  return `${state.team1Games} - ${state.team2Games}`;
}
