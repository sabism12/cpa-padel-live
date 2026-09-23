import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialMatchState,
  recordPoint,
  undoLastPoint,
  processAction,
  formatPointDisplay,
  formatMatchScoreSummary,
} from './scoringEngine';

describe('Simplified Padel Scoring Engine Tests (First to 6 Games + Golden Point)', () => {
  it('displays correct point labels for 0, 1, 2, 3: LOVE, 15, 30, 40', () => {
    assert.equal(formatPointDisplay(0), 'LOVE');
    assert.equal(formatPointDisplay(1), '15');
    assert.equal(formatPointDisplay(2), '30');
    assert.equal(formatPointDisplay(3), '40');
  });

  it('progresses normal scoring: Love -> 15 -> 30 -> 40', () => {
    let state = createInitialMatchState('match-test-1');
    assert.equal(state.team1Points, 0);
    assert.equal(formatPointDisplay(state.team1Points), 'LOVE');

    // 15
    state = recordPoint(state, 'team1', 'Alpha', 'Bravo');
    assert.equal(state.team1Points, 1);
    assert.equal(formatPointDisplay(state.team1Points), '15');

    // 30
    state = recordPoint(state, 'team1', 'Alpha', 'Bravo');
    assert.equal(state.team1Points, 2);
    assert.equal(formatPointDisplay(state.team1Points), '30');

    // 40
    state = recordPoint(state, 'team1', 'Alpha', 'Bravo');
    assert.equal(state.team1Points, 3);
    assert.equal(formatPointDisplay(state.team1Points), '40');
    assert.equal(state.isGoldenPoint, false);
  });

  it('triggers Golden Point at 40-40 and next point wins the game (no advantage)', () => {
    let state = createInitialMatchState('match-test-2');

    // Alpha gets 40
    state = recordPoint(state, 'team1', 'Alpha', 'Bravo'); // 15
    state = recordPoint(state, 'team1', 'Alpha', 'Bravo'); // 30
    state = recordPoint(state, 'team1', 'Alpha', 'Bravo'); // 40
    assert.equal(state.isGoldenPoint, false);

    // Bravo gets 40
    state = recordPoint(state, 'team2', 'Alpha', 'Bravo'); // 15
    state = recordPoint(state, 'team2', 'Alpha', 'Bravo'); // 30
    assert.equal(state.isGoldenPoint, false);
    state = recordPoint(state, 'team2', 'Alpha', 'Bravo'); // 40 -> triggers Golden Point!

    assert.equal(state.isGoldenPoint, true);
    assert.equal(state.team1Points, 3);
    assert.equal(state.team2Points, 3);

    // Alpha wins golden point
    state = recordPoint(state, 'team1', 'Alpha', 'Bravo');
    assert.equal(state.team1Games, 1);
    assert.equal(state.team2Games, 0);
    assert.equal(state.team1Points, 0);
    assert.equal(state.team2Points, 0);
    assert.equal(state.isGoldenPoint, false);
  });

  it('progresses games: team wins game -> games increase by 1 -> points reset to Love-Love', () => {
    let state = createInitialMatchState('match-test-3');
    assert.equal(state.team1Games, 0);
    assert.equal(state.team2Games, 0);

    // Game 1: 4 points to Alpha
    state = recordPoint(state, 'team1', 'Alpha', 'Bravo');
    state = recordPoint(state, 'team1', 'Alpha', 'Bravo');
    state = recordPoint(state, 'team1', 'Alpha', 'Bravo');
    state = recordPoint(state, 'team1', 'Alpha', 'Bravo');

    assert.equal(state.team1Games, 1);
    assert.equal(state.team2Games, 0);
    assert.equal(state.team1Points, 0);
    assert.equal(state.team2Points, 0);

    // Game 2: 4 points to Bravo
    state = recordPoint(state, 'team2', 'Alpha', 'Bravo');
    state = recordPoint(state, 'team2', 'Alpha', 'Bravo');
    state = recordPoint(state, 'team2', 'Alpha', 'Bravo');
    state = recordPoint(state, 'team2', 'Alpha', 'Bravo');

    assert.equal(state.team1Games, 1);
    assert.equal(state.team2Games, 1);
    assert.equal(state.team1Points, 0);
    assert.equal(state.team2Points, 0);
  });

  it('completes match when a team reaches 6 games (6-0, 6-4)', () => {
    let state = createInitialMatchState('match-test-4');
    state.team1Games = 5;
    state.team2Games = 4;

    // Team 1 wins next game to reach 6-4
    state = recordPoint(state, 'team1', 'Alpha', 'Bravo');
    state = recordPoint(state, 'team1', 'Alpha', 'Bravo');
    state = recordPoint(state, 'team1', 'Alpha', 'Bravo');
    state = recordPoint(state, 'team1', 'Alpha', 'Bravo');

    assert.equal(state.team1Games, 6);
    assert.equal(state.team2Games, 4);
    assert.equal(state.isMatchOver, true);
    assert.equal(state.winnerTeamId, 'team1');
    assert.equal(formatMatchScoreSummary(state), '6 - 4');

    // Further points should be ignored once match is over
    const ended = recordPoint(state, 'team2', 'Alpha', 'Bravo');
    assert.equal(ended.team2Games, 4);
  });

  it('immediately wins at 6-5 with NO requirement for a 2-game lead', () => {
    let state = createInitialMatchState('match-test-5');
    state.team1Games = 5;
    state.team2Games = 5;

    // Team 1 wins game to reach 6-5
    state = recordPoint(state, 'team1', 'Alpha', 'Bravo');
    state = recordPoint(state, 'team1', 'Alpha', 'Bravo');
    state = recordPoint(state, 'team1', 'Alpha', 'Bravo');
    state = recordPoint(state, 'team1', 'Alpha', 'Bravo');

    assert.equal(state.team1Games, 6);
    assert.equal(state.team2Games, 5);
    assert.equal(state.isMatchOver, true);
    assert.equal(state.winnerTeamId, 'team1');
    assert.equal(formatMatchScoreSummary(state), '6 - 5');
  });

  it('never enters 6-6, tiebreak, or sets beyond 6', () => {
    let state = createInitialMatchState('match-test-6');
    state.team1Games = 5;
    state.team2Games = 5;

    // Bravo wins next game -> 6-5 Bravo!
    state = recordPoint(state, 'team2', 'Alpha', 'Bravo');
    state = recordPoint(state, 'team2', 'Alpha', 'Bravo');
    state = recordPoint(state, 'team2', 'Alpha', 'Bravo');
    state = recordPoint(state, 'team2', 'Alpha', 'Bravo');

    assert.equal(state.team1Games, 5);
    assert.equal(state.team2Games, 6);
    assert.equal(state.isMatchOver, true);
    assert.equal(state.winnerTeamId, 'team2');

    // Ensure no tiebreak field or 6-6 state exists
    assert.equal((state as any).isTiebreak, undefined);
  });

  it('undoes normal points, Golden Point, game-winning point, and match-winning point', () => {
    let state = createInitialMatchState('match-test-7');

    // 1. Undo normal point
    state = recordPoint(state, 'team1', 'Alpha', 'Bravo'); // 15-0
    assert.equal(state.team1Points, 1);
    state = undoLastPoint(state);
    assert.equal(state.team1Points, 0);

    // 2. Undo game-winning point
    state = recordPoint(state, 'team1', 'Alpha', 'Bravo'); // 15
    state = recordPoint(state, 'team1', 'Alpha', 'Bravo'); // 30
    state = recordPoint(state, 'team1', 'Alpha', 'Bravo'); // 40
    state = recordPoint(state, 'team1', 'Alpha', 'Bravo'); // Game Alpha (1-0)
    assert.equal(state.team1Games, 1);
    assert.equal(state.team1Points, 0);

    state = undoLastPoint(state);
    assert.equal(state.team1Games, 0);
    assert.equal(state.team1Points, 3); // Restored to 40!
    assert.equal(state.team2Points, 0);

    // 3. Undo Golden Point
    state.team2Points = 3; // Now 40-40
    state.isGoldenPoint = true;
    state = recordPoint(state, 'team2', 'Alpha', 'Bravo'); // Bravo wins game via Golden Point!
    assert.equal(state.team2Games, 1);
    assert.equal(state.team2Points, 0);

    state = undoLastPoint(state);
    assert.equal(state.team2Games, 0);
    assert.equal(state.isGoldenPoint, true);
    assert.equal(state.team1Points, 3);
    assert.equal(state.team2Points, 3);

    // 4. Undo Match-winning point
    state.team1Games = 5;
    state.team2Games = 3;
    state.team1Points = 3;
    state.team2Points = 2;
    state.isGoldenPoint = false;

    // Team 1 wins game 6 -> MATCH COMPLETE (6-3)
    state = recordPoint(state, 'team1', 'Alpha', 'Bravo');
    assert.equal(state.team1Games, 6);
    assert.equal(state.isMatchOver, true);
    assert.equal(state.winnerTeamId, 'team1');

    // Undo match-winning point
    state = undoLastPoint(state);
    assert.equal(state.team1Games, 5);
    assert.equal(state.team2Games, 3);
    assert.equal(state.team1Points, 3);
    assert.equal(state.team2Points, 2);
    assert.equal(state.isMatchOver, false);
    assert.equal(state.winnerTeamId, null);
  });

  it('supports processAction dispatcher for actions', () => {
    let state = createInitialMatchState('match-test-8');
    state = processAction(state, { type: 'POINT_TEAM_1' }, 'Alpha', 'Bravo');
    assert.equal(state.team1Points, 1);

    state = processAction(state, { type: 'UNDO' });
    assert.equal(state.team1Points, 0);

    state = processAction(state, { type: 'POINT_TEAM_2' }, 'Alpha', 'Bravo');
    assert.equal(state.team2Points, 1);

    state = processAction(state, { type: 'RESET' });
    assert.equal(state.team2Points, 0);
    assert.equal(state.team1Games, 0);
  });
});
