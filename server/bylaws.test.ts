/**
 * Automated checks for the tournament bylaws (qualification, tie-breaks,
 * walkovers, absent teams, quarter-final draw).
 *
 * Runs against a throwaway COPY of data/tournament_state.json in a temp
 * folder, so it never touches real tournament data:
 *   npx tsx --test server/bylaws.test.ts
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { finalScoreError } from '../src/scoring/finalScore';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpa-bylaws-'));
fs.copyFileSync(
  path.join(process.cwd(), 'data', 'tournament_state.json'),
  path.join(tempDir, 'tournament_state.json')
);
// Must be set before the store module is loaded.
process.env.DATA_DIR = tempDir;
process.env.TOURNAMENT_STORAGE = 'file';

let store: any;
let groups: string[][]; // team ids per group, in group order

/** Record a finished group match: `a` scored aGames, `b` scored bGames. */
function play(a: string, b: string, aGames: number, bGames: number) {
  const m = store.state.matches.find(
    (x: any) => x.stage !== 'knockout' && [x.team1Id, x.team2Id].sort().join() === [a, b].sort().join()
  );
  assert.ok(m, `no match between ${a} and ${b}`);
  const swap = m.team1Id !== a;
  store.updateMatch(m.id, {
    status: 'completed',
    team1Score: swap ? bGames : aGames,
    team2Score: swap ? aGames : bGames,
    padelState: undefined,
  });
}

const matchOf = (a: string, b: string) =>
  store.state.matches.find(
    (x: any) => x.stage !== 'knockout' && [x.team1Id, x.team2Id].sort().join() === [a, b].sort().join()
  );

const row = (teamId: string) =>
  Object.values(store.calculateStandings() as Record<string, any[]>)
    .flat()
    .find((r) => r.teamId === teamId);

/** Group where 1st beats everyone and 2nd/3rd/4th follow in order. */
function clearGroup(ids: string[]) {
  const [w, x, y, z] = ids;
  play(w, x, 6, 3); play(w, y, 6, 3); play(w, z, 6, 3);
  play(x, y, 6, 3); play(x, z, 6, 3); play(y, z, 6, 3);
}

/** Settle level teams by live toss: each team wins against every team after it. */
function tossOrder(ids: string[]) {
  ids.slice(0, -1).forEach((id, i) => store.recordToss(id, ids.slice(i + 1)));
}

const qualifiedIds = () =>
  Object.values(store.calculateStandings() as Record<string, any[]>)
    .flat()
    .filter((r) => r.qualified)
    .map((r) => r.teamId as string);

before(async () => {
  const mod = await import('./store');
  store = mod.tournamentStore;
  await store.initialize();
  groups = store.state.groups.map((g: any) =>
    store.state.teams.filter((t: any) => t.groupId === g.id).map((t: any) => t.id)
  );
});

describe('player change: Ameen / Aflah is now Ameen / Abdu', () => {
  it('renames the player in the roster and the draw, keeping the same team', () => {
    const team = store.state.teams.find((t: any) => t.id === 'team-d2');
    assert.equal(team.player1, 'Ameen');
    assert.equal(team.player2, 'Abdu');
    assert.equal(team.name, 'Ameen / Abdu');

    const names = [
      ...store.state.teams.flatMap((t: any) => [t.name, t.player1, t.player2]),
      ...store.state.draw.pairs.flatMap((p: any) => [p.player1, p.player2]),
    ];
    assert.ok(!names.some((n: string) => /aflah/i.test(n)), 'no "Aflah" left anywhere');
    assert.ok(
      store.state.draw.pairs.some((p: any) => p.player1 === 'Ameen' && p.player2 === 'Abdu'),
      'the draw lists the new pairing'
    );
    assert.ok(store.state.matches.some((m: any) => m.team1Id === 'team-d2' || m.team2Id === 'team-d2'),
      'its matches still point at the same team');
  });
});

describe('bylaw §3 — quarter-final qualification', () => {
  it('sends the 5 group winners + best 3 RUNNERS-UP only (never 3rd/4th place)', () => {
    store.resetAllMatchScores();
    // Group A: winner 9 pts, then a 3-way cycle (3 pts each) -> runner-up has 3 pts.
    const [a1, a2, a3, a4] = groups[0];
    play(a1, a2, 6, 0); play(a1, a3, 6, 0); play(a1, a4, 6, 0);
    play(a2, a3, 6, 0); play(a3, a4, 6, 4); play(a4, a2, 6, 5);
    // Groups B-E: three teams on 6 pts (2-2-2-0), so their 3rd place has MORE
    // points than group A's runner-up. The old rule would have let them in.
    for (const [x1, x2, x3, x4] of groups.slice(1)) {
      play(x1, x2, 6, 3); play(x2, x3, 6, 4); play(x3, x1, 6, 5);
      play(x1, x4, 6, 0); play(x2, x4, 6, 0); play(x3, x4, 6, 0);
    }
    // x2/x3 finish level for 2nd, then the four runners-up are level for the
    // last 3 places: nobody behind the group winners is in until the tosses.
    assert.equal(qualifiedIds().length, 5, 'only the 5 clear group winners before the tosses');
    assert.equal(row(a2).eliminated, true, 'a 3-pt runner-up cannot beat four 6-pt runners-up');
    assert.equal(row(groups[1][2]).eliminated, false, 'level for 2nd place: waits for the toss');
    for (const [, x2, x3] of groups.slice(1)) tossOrder([x2, x3]);
    tossOrder(groups.slice(1).map((g) => g[1]));

    const standings = store.calculateStandings();
    const qualified = Object.values(standings).flat().filter((r: any) => r.qualified);

    assert.equal(qualified.length, 8, 'exactly 8 teams qualify');
    assert.ok(qualified.every((r: any) => r.position <= 2), 'no 3rd/4th placed team qualifies');
    const winners = qualified.filter((r: any) => r.position === 1);
    assert.equal(winners.length, 5, 'all 5 group winners qualify');
    assert.ok(
      !row(a2).qualified || row(a2).points >= 6,
      'a weak runner-up (3 pts) does not beat runners-up on 6 pts'
    );
    assert.equal(row(a2).qualified, false, 'group A runner-up (3 pts) misses out');

    const all = Object.values(standings).flat() as any[];
    assert.equal(all.filter((r) => r.eliminated).length, 12, 'every other team is eliminated');
    assert.ok(all.every((r) => !(r.qualified && r.eliminated)), 'never both');
    assert.ok([a2, a3, a4].every((id) => row(id).eliminated), 'group A sends only its winner');
    const lastRunnerUp = groups[4][1];
    assert.equal(row(lastRunnerUp).eliminated, true, 'the runner-up that lost the toss is out');
  });
});

describe('qualified / eliminated only once the place is certain', () => {
  it('nobody is qualified or eliminated before any match is played', () => {
    store.resetAllMatchScores();
    assert.deepEqual(qualifiedIds(), []);
    const all = Object.values(store.calculateStandings() as Record<string, any[]>).flat();
    assert.ok(all.every((r) => !r.eliminated));
  });

  it('a team is eliminated once it can no longer finish in the top two', () => {
    store.resetAllMatchScores();
    const [a1, a2, a3, a4] = groups[0];
    play(a1, a4, 6, 0); play(a2, a4, 6, 0);
    assert.equal(row(a4).eliminated, false, 'a4 can still draw level on points');
    play(a3, a4, 6, 0);
    assert.equal(row(a4).eliminated, true, 'three teams already have more than a4 can reach');
    assert.equal(row(a3).eliminated, false, 'a3 still has two matches to play');
  });

  it('a group leader qualifies as soon as no rival can still catch them', () => {
    store.resetAllMatchScores();
    const [a1, a2, a3, a4] = groups[0];
    play(a1, a2, 6, 0); play(a1, a3, 6, 0);
    assert.equal(row(a1).qualified, false, 'a4 can still beat a1 and catch up on points');
    play(a1, a4, 6, 0);
    assert.equal(row(a1).qualified, true, 'three wins: nobody else can reach 9 points');
    play(a2, a3, 6, 0);
    assert.equal(row(a2).qualified, false, 'runner-up places wait for the whole group stage');
  });

  it('a group winner level on points waits for the group to finish', () => {
    store.resetAllMatchScores();
    const [a1, a2, a3, a4] = groups[0];
    play(a1, a2, 6, 5); play(a1, a3, 6, 0); play(a4, a1, 6, 5);
    play(a2, a3, 6, 5); play(a2, a4, 6, 5);
    assert.equal(row(a1).qualified, false, 'a2 is level on 6 points and the group is not over');
    play(a3, a4, 6, 5);
    assert.equal(row(a1).qualified, true, 'group finished: game difference decides');
    assert.ok(row(a3).eliminated && row(a4).eliminated, '3rd and 4th are out once the group is over');
    assert.equal(row(a2).eliminated, false, 'the runner-up waits for the other groups');
  });
});

describe('bylaw §4 — points, game difference, then live toss', () => {
  it('uses game difference before anything else', () => {
    store.resetAllMatchScores();
    const [x1, x2, x3, x4] = groups[0];
    // x1 and x2 both finish on 6 pts; x1 has the better game difference.
    play(x1, x2, 6, 5); play(x1, x3, 6, 0); play(x4, x1, 6, 5);
    play(x2, x3, 6, 5); play(x2, x4, 6, 5); play(x3, x4, 6, 5);
    const rows = store.calculateStandings()[store.state.groups[0].id];
    assert.equal(rows[0].teamId, x1);
    assert.equal(rows[1].teamId, x2);
    assert.equal(rows[0].points, rows[1].points, 'level on points');
    assert.notEqual(rows[0].scoreDiff, rows[1].scoreDiff);
    assert.ok(!rows[0].tossPending, 'no toss needed when game difference separates them');
  });

  it('flags a toss only where it matters, and respects the recorded winner', () => {
    store.resetAllMatchScores();
    for (const g of groups.slice(1)) clearGroup(g);
    const [a1, a2, a3, a4] = groups[0];
    // Group A: a1 clear winner; a2, a3, a4 level (3 pts, equal game difference).
    play(a1, a2, 6, 0); play(a1, a3, 6, 0); play(a1, a4, 6, 0);
    play(a2, a3, 6, 0); play(a3, a4, 6, 0); play(a4, a2, 6, 0);

    let flagged = Object.values(store.calculateStandings() as Record<string, any[]>)
      .flat()
      .filter((r) => r.tossPending);
    const flaggedIds = flagged.map((r) => r.teamId);
    // 1st (a1) is clear; the tie is for 2nd place, which feeds the runner-up comparison.
    assert.ok(flaggedIds.includes(a2) && flaggedIds.includes(a3) && flaggedIds.includes(a4));
    assert.ok(!flaggedIds.includes(a1));

    store.recordToss(a3, [a2, a4]);
    store.recordToss(a4, [a2]);
    const order = store.calculateStandings()[store.state.groups[0].id].map((r: any) => r.teamId);
    assert.deepEqual(order.slice(0, 4), [a1, a3, a4, a2], 'toss winners are ranked in toss order');
    store.clearTosses();
  });

  it('ties for 3rd/4th place never need a toss', () => {
    store.resetAllMatchScores();
    for (const g of groups.slice(1)) clearGroup(g);
    const [a1, a2, a3, a4] = groups[0];
    play(a1, a2, 6, 3); play(a1, a3, 6, 3); play(a1, a4, 6, 3);
    play(a2, a3, 6, 3); play(a2, a4, 6, 3);
    play(a3, a4, 6, 0); // a3 beats a4 -> 3rd and 4th are clearly separated
    const rows = store.calculateStandings()[store.state.groups[0].id];
    assert.ok(
      rows.every((r: any) => !String(r.tossPending ?? '').startsWith('Group A')),
      'no group-position toss for group A'
    );
  });
});

describe('bylaw §6 — walkovers', () => {
  it('a walkover is a 6-0 win for the team that came', () => {
    store.resetAllMatchScores();
    const [a1, a2] = groups[0];
    const m = matchOf(a1, a2);
    store.setWalkover(m.id, m.team1Id === a1 ? 'team1' : 'team2');
    assert.equal(m.status, 'completed');
    assert.equal(Math.max(m.team1Score, m.team2Score), 6);
    assert.equal(Math.min(m.team1Score, m.team2Score), 0);
    assert.equal(row(a1).wins, 1);
    assert.equal(row(a1).scoreDiff, 6);
    assert.equal(row(a2).losses, 1);
  });

  it('neither team reporting = both lose, no games', () => {
    store.resetAllMatchScores();
    const [a1, a2] = groups[0];
    store.setWalkover(matchOf(a1, a2).id, 'both');
    for (const id of [a1, a2]) {
      assert.equal(row(id).wins, 0);
      assert.equal(row(id).losses, 1);
      assert.equal(row(id).points, 0);
      assert.equal(row(id).scoreDiff, 0);
    }
  });

  it('can be cleared back to scheduled', () => {
    store.resetAllMatchScores();
    const [a1, a2] = groups[0];
    const m = matchOf(a1, a2);
    store.setWalkover(m.id, 'both');
    store.setWalkover(m.id, null);
    assert.equal(m.status, 'scheduled');
    assert.equal(m.walkover, undefined);
    assert.equal(row(a1).matchesPlayed, 0);
  });
});

describe('team did not come — all unplayed matches become walkovers', () => {
  it('keeps played results, gives opponents 6-0, and can be undone', () => {
    store.resetAllMatchScores();
    const [a1, a2, a3, a4] = groups[0];
    play(a1, a3, 4, 6); // a1 already played (and lost) before not coming

    const out = store.setTeamWithdrawn(a1, true);
    assert.equal(out.matchesChanged, 2, 'the two unplayed matches change');
    const played = matchOf(a1, a3);
    assert.equal(played.walkover, undefined, 'the played result stays');
    assert.equal(matchOf(a1, a2).walkover, matchOf(a1, a2).team1Id === a1 ? 'team2' : 'team1');
    assert.equal(row(a2).wins, 1);
    assert.equal(row(a4).wins, 1);

    // Opponent also absent -> that match becomes "both".
    store.setTeamWithdrawn(a2, true);
    assert.equal(matchOf(a1, a2).walkover, 'both');

    // a1 back: only the walkovers made by the absence are undone.
    store.setTeamWithdrawn(a1, false);
    assert.equal(matchOf(a1, a4).status, 'scheduled');
    assert.equal(matchOf(a1, a3).status, 'completed', 'the played result still stands');
    assert.equal(matchOf(a1, a2).walkover, matchOf(a1, a2).team1Id === a1 ? 'team1' : 'team2');

    store.resetAllMatchScores();
    assert.ok(store.state.teams.every((t: any) => !t.withdrawn), 'reset brings every team back');
  });
});

describe('quarter-final draw by lot', () => {
  const eight = () => {
    store.resetAllMatchScores();
    for (const g of groups) clearGroup(g);
    // Every runner-up finishes on the same record; the toss picks the best 3.
    tossOrder(groups.map((g) => g[1]));
    return qualifiedIds();
  };

  it('rejects duplicates, unknown teams and wrong sizes', () => {
    const q = eight();
    assert.equal(q.length, 8);
    const ok: [string, string][] = [[q[0], q[1]], [q[2], q[3]], [q[4], q[5]], [q[6], q[7]]];
    assert.ok(store.setQuarterFinalDraw([[q[0], q[0]], ...ok.slice(1)]).error, 'duplicate team');
    assert.ok(store.setQuarterFinalDraw([[q[0], 'nobody'], ...ok.slice(1)]).error, 'unknown team');
    assert.ok(store.setQuarterFinalDraw(ok.slice(0, 3)).error, 'only 3 pairings');
  });

  it('sets exactly the pairings the admin entered and clears later rounds', () => {
    const q = eight();
    const pairs: [string, string][] = [[q[0], q[5]], [q[1], q[2]], [q[3], q[7]], [q[4], q[6]]];
    assert.equal(store.setQuarterFinalDraw(pairs).error, undefined);
    pairs.forEach(([a, b], i) => {
      const m = store.state.matches.find((x: any) => x.id === `match-ko-qf${i + 1}`);
      assert.equal(m.team1Id, a);
      assert.equal(m.team2Id, b);
    });
    for (const id of ['match-ko-sf1', 'match-ko-sf2', 'match-ko-final', 'match-ko-3rd']) {
      const m = store.state.matches.find((x: any) => x.id === id);
      assert.equal(m.team1Id, '');
      assert.equal(m.team2Id, '');
    }
  });

  it('winners wait for the semi-final draw and the QF draw locks once a quarter-final is played', () => {
    const q = eight();
    const pairs: [string, string][] = [[q[0], q[1]], [q[2], q[3]], [q[4], q[5]], [q[6], q[7]]];
    store.setQuarterFinalDraw(pairs);
    store.submitScore({ matchId: 'match-ko-qf1', team1Score: 6, team2Score: 2, isAdminOverride: true });
    store.submitScore({ matchId: 'match-ko-qf2', team1Score: 3, team2Score: 6, isAdminOverride: true });
    const sf1 = store.state.matches.find((x: any) => x.id === 'match-ko-sf1');
    assert.deepEqual([sf1.team1Id, sf1.team2Id], ['', ''], 'semi-finals are drawn by lot, not filled by bracket');
    assert.ok(store.setQuarterFinalDraw(pairs).error, 'draw is locked after play starts');
  });

  it('a team already marked as not coming loses its quarter-final by walkover', () => {
    const q = eight();
    store.setTeamWithdrawn(q[1], true);
    store.setQuarterFinalDraw([[q[0], q[1]], [q[2], q[3]], [q[4], q[5]], [q[6], q[7]]]);
    const qf1 = store.state.matches.find((x: any) => x.id === 'match-ko-qf1');
    assert.equal(qf1.walkover, 'team1');
    assert.equal(qf1.status, 'completed');
    store.resetAllMatchScores();
  });
});

describe('quick results — first to 6 games, no tiebreak', () => {
  it('accepts only 6-0 ... 6-5, either way round', () => {
    for (let loser = 0; loser <= 5; loser++) {
      assert.equal(finalScoreError(6, loser), null, `6-${loser}`);
      assert.equal(finalScoreError(loser, 6), null, `${loser}-6`);
      assert.equal(finalScoreError('6', String(loser)), null, 'typed text works too');
    }
    const invalid: [unknown, unknown][] = [
      [6, 6], [7, 5], [5, 7], [7, 6], [4, 3], [0, 0], [5, 5],
      ['', 4], [6, ''], [null, 6], [6, undefined], ['  ', 2],
      [-1, 6], [6, 2.5], ['x', 6], [10, 6],
    ];
    for (const [a, b] of invalid) {
      assert.ok(finalScoreError(a, b), `${String(a)}-${String(b)} must be rejected`);
    }
  });

  it('the server result path refuses an impossible final and leaves the match unplayed', () => {
    store.resetAllMatchScores();
    const [a1, a2] = groups[0];
    const m = matchOf(a1, a2);
    for (const [t1, t2] of [[6, 6], [7, 5], [4, 3]]) {
      const out = store.submitScore({ matchId: m.id, team1Score: t1, team2Score: t2, isAdminOverride: true });
      assert.equal(out.success, false, `${t1}-${t2} is refused`);
      assert.ok(out.error);
    }
    assert.equal(m.status, 'scheduled');
    assert.equal(m.team1Score, null);
    assert.equal(store.submitScore({ matchId: m.id, team1Score: 6, team2Score: 5 }).success, true);
    assert.equal(m.status, 'completed');
  });

  it('a correction replaces the old games, padelState and walkover', () => {
    store.resetAllMatchScores();
    const [a1, a2] = groups[0];
    const m = matchOf(a1, a2);
    const a1Side = m.team1Id === a1 ? 'team1' : 'team2';
    store.setWalkover(m.id, a1Side); // a1 wins 6-0 by W/O
    assert.equal(row(a1).wins, 1);

    // Paper sheet says a2 actually won 6-4: the admin corrects it.
    const [s1, s2] = a1Side === 'team1' ? [4, 6] : [6, 4];
    assert.equal(store.submitScore({ matchId: m.id, team1Score: s1, team2Score: s2, isAdminOverride: true }).success, true);
    assert.equal(m.walkover, undefined, 'no longer a walkover');
    assert.equal(m.padelState.team1Games, s1, 'standings read the new games');
    assert.equal(m.padelState.winnerTeamId, a1Side === 'team1' ? 'team2' : 'team1');
    assert.equal(row(a2).wins, 1);
    assert.equal(row(a2).scoreDiff, 2);
    assert.equal(row(a1).wins, 0);

    // A completed match can't be overwritten without the admin override.
    assert.equal(store.submitScore({ matchId: m.id, team1Score: 6, team2Score: 0 }).success, false);
  });

  it('a match being scored live on a phone can be finished from quick results', () => {
    store.resetAllMatchScores();
    const [a1, a2] = groups[0];
    const m = matchOf(a1, a2);
    let n = 0;
    const phone = (type: string) =>
      store.applyScoreEvents([
        { eventId: `phone-${++n}`, matchId: m.id, type, clientTs: new Date().toISOString() },
      ]).results[0];

    // The phone has scored one game for each side so far: live at 1-1.
    for (let i = 0; i < 4; i++) phone('POINT_TEAM_1');
    for (let i = 0; i < 4; i++) phone('POINT_TEAM_2');
    assert.equal(m.status, 'live');
    assert.equal(m.padelState.team1Games, 1);

    assert.equal(store.submitScore({ matchId: m.id, team1Score: 6, team2Score: 4, isAdminOverride: true }).success, true);
    assert.equal(m.status, 'completed');
    assert.deepEqual([m.padelState.team1Games, m.padelState.team2Games], [6, 4], 'standings use the typed final, not 1-1');
    assert.equal(m.padelState.isMatchOver, true);

    const late = phone('POINT_TEAM_2');
    assert.equal(late.accepted, false, "the phone's next point is refused");
    assert.deepEqual([m.team1Score, m.team2Score], [6, 4]);
  });
});

describe('knockout advancement from typed results', () => {
  const ko = (id: string) => store.state.matches.find((x: any) => x.id === `match-ko-${id}`);
  let q: string[];

  /** Group stage finished and a fixed quarter-final draw: QFn is q[2n-2] v q[2n-1]. */
  const drawQuarterFinals = () => {
    store.resetAllMatchScores();
    for (const g of groups) clearGroup(g);
    tossOrder(groups.map((g) => g[1]));
    q = qualifiedIds();
    assert.equal(q.length, 8);
    assert.equal(
      store.setQuarterFinalDraw([[q[0], q[1]], [q[2], q[3]], [q[4], q[5]], [q[6], q[7]]]).error,
      undefined
    );
  };

  it('quick results (submitScore): winners reach the final, semi-final losers the 3rd-place match', () => {
    drawQuarterFinals();
    const enter = (id: string, t1: number, t2: number) =>
      assert.equal(store.submitScore({ matchId: ko(id).id, team1Score: t1, team2Score: t2, isAdminOverride: true }).success, true);

    enter('qf1', 6, 4); enter('qf2', 5, 6); enter('qf3', 6, 0); enter('qf4', 3, 6);
    assert.equal(ko('sf1').team1Id, '', 'semi-finals wait for the draw by lot');
    assert.equal(store.setSemiFinalDraw([[q[0], q[3]], [q[4], q[7]]]).error, undefined);
    assert.deepEqual([ko('sf1').team1Id, ko('sf1').team2Id], [q[0], q[3]]);
    assert.deepEqual([ko('sf2').team1Id, ko('sf2').team2Id], [q[4], q[7]]);

    enter('sf1', 6, 2); enter('sf2', 4, 6);
    assert.deepEqual([ko('final').team1Id, ko('final').team2Id], [q[0], q[7]]);
    assert.deepEqual([ko('3rd').team1Id, ko('3rd').team2Id], [q[3], q[4]]);

    // A correction that flips SF1 swaps the finalist and the 3rd-place team.
    enter('sf1', 5, 6);
    assert.equal(ko('final').team1Id, q[3]);
    assert.equal(ko('3rd').team1Id, q[0]);
  });

  it('admin match edit (updateMatch) moves the knockout winner on as well', () => {
    drawQuarterFinals();
    store.updateMatch(ko('qf1').id, { status: 'completed', team1Score: 6, team2Score: 3, walkover: undefined });
    store.updateMatch(ko('qf2').id, { status: 'completed', team1Score: 2, team2Score: 6, walkover: undefined });
    store.updateMatch(ko('qf3').id, { status: 'completed', team1Score: 6, team2Score: 1, walkover: undefined });
    store.updateMatch(ko('qf4').id, { status: 'completed', team1Score: 6, team2Score: 2, walkover: undefined });
    assert.equal(ko('sf1').team1Id, '', 'semi-finals wait for the draw by lot');
    assert.equal(store.setSemiFinalDraw([[q[0], q[3]], [q[4], q[6]]]).error, undefined);
    assert.deepEqual([ko('sf1').team1Id, ko('sf1').team2Id], [q[0], q[3]]);

    store.updateMatch(ko('sf1').id, { status: 'completed', team1Score: 4, team2Score: 6 });
    assert.equal(ko('final').team1Id, q[3], 'SF1 winner is in the final');
    assert.equal(ko('3rd').team1Id, q[0], 'SF1 loser plays for 3rd place');

    // Correcting the edit moves the right team instead.
    store.updateMatch(ko('qf2').id, { team1Score: 6, team2Score: 1 });
    assert.equal(ko('sf1').team2Id, q[2]);
  });

  it('semi-final draw by lot: only after every quarter-final, only the 4 winners', () => {
    drawQuarterFinals();
    const enter = (id: string, t1: number, t2: number) =>
      store.submitScore({ matchId: ko(id).id, team1Score: t1, team2Score: t2, isAdminOverride: true });
    enter('qf1', 6, 2); enter('qf2', 3, 6); enter('qf3', 6, 4);
    // Winners so far: q[0], q[3], q[4]; QF4 (q[6] v q[7]) not played yet.
    assert.ok(store.setSemiFinalDraw([[q[0], q[4]], [q[3], q[6]]]).error, 'QF4 has no result yet');

    enter('qf4', 5, 6); // q[7] wins
    assert.ok(store.setSemiFinalDraw([[q[0], q[4]], [q[3], q[1]]]).error, 'q[1] lost its quarter-final');
    assert.ok(store.setSemiFinalDraw([[q[0], q[0]], [q[3], q[7]]]).error, 'duplicate team');
    assert.ok(store.setSemiFinalDraw([[q[0], q[4]]] as any).error, 'only one pairing');
  });

  it('semi-final draw sets the drawn pairings, and results then reach the final and 3rd place', () => {
    drawQuarterFinals();
    const enter = (id: string, t1: number, t2: number) =>
      store.submitScore({ matchId: ko(id).id, team1Score: t1, team2Score: t2, isAdminOverride: true });
    enter('qf1', 6, 2); enter('qf2', 3, 6); enter('qf3', 6, 4); enter('qf4', 5, 6);
    // Bracket order would be SF1 q[0] v q[3], SF2 q[4] v q[7]. The lot says otherwise:
    assert.equal(store.setSemiFinalDraw([[q[0], q[4]], [q[3], q[7]]]).error, undefined);
    assert.deepEqual([ko('sf1').team1Id, ko('sf1').team2Id], [q[0], q[4]]);
    assert.deepEqual([ko('sf2').team1Id, ko('sf2').team2Id], [q[3], q[7]]);
    assert.ok(ko('sf1').drawnByLot && ko('sf2').drawnByLot);
    assert.equal(ko('final').team1Id, '', 'final waits for the semi-finals');

    // A corrected QF3 (q[5] now wins) puts the new winner where q[4] was drawn,
    // not into QF3's bracket slot in SF2.
    enter('qf3', 4, 6);
    assert.deepEqual([ko('sf1').team1Id, ko('sf1').team2Id], [q[0], q[5]]);
    assert.deepEqual([ko('sf2').team1Id, ko('sf2').team2Id], [q[3], q[7]]);

    enter('sf1', 6, 3); enter('sf2', 2, 6);
    assert.deepEqual([ko('final').team1Id, ko('final').team2Id], [q[0], q[7]]);
    assert.deepEqual([ko('3rd').team1Id, ko('3rd').team2Id], [q[5], q[3]]);

    assert.ok(store.setSemiFinalDraw([[q[0], q[3]], [q[5], q[7]]]).error, 'locked once a semi-final is played');

    store.resetAllMatchScores();
    assert.ok(!ko('sf1').drawnByLot && !ko('sf2').drawnByLot, 'reset clears the draw');
  });

  it('admin match edit does not move anyone for an unfinished or level knockout score', () => {
    drawQuarterFinals();
    store.updateMatch(ko('qf3').id, { status: 'live', team1Score: 6, team2Score: 2 });
    assert.equal(ko('sf2').team1Id, '', 'live match: nobody moves yet');
    store.updateMatch(ko('qf3').id, { status: 'completed', team1Score: 6, team2Score: 6 });
    assert.equal(ko('sf2').team1Id, '', 'no winner in a level score');
    store.resetAllMatchScores();
  });
});
