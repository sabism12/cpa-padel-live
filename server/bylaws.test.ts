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

before(async () => {
  const mod = await import('./store');
  store = mod.tournamentStore;
  await store.initialize();
  groups = store.state.groups.map((g: any) =>
    store.state.teams.filter((t: any) => t.groupId === g.id).map((t: any) => t.id)
  );
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
    return Object.values(store.calculateStandings() as Record<string, any[]>)
      .flat()
      .filter((r) => r.qualified)
      .map((r) => r.teamId as string);
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

  it('winners move to the semi-finals and the draw locks once a quarter-final is played', () => {
    const q = eight();
    const pairs: [string, string][] = [[q[0], q[1]], [q[2], q[3]], [q[4], q[5]], [q[6], q[7]]];
    store.setQuarterFinalDraw(pairs);
    store.submitScore({ matchId: 'match-ko-qf1', team1Score: 6, team2Score: 2, isAdminOverride: true });
    store.submitScore({ matchId: 'match-ko-qf2', team1Score: 3, team2Score: 6, isAdminOverride: true });
    const sf1 = store.state.matches.find((x: any) => x.id === 'match-ko-sf1');
    assert.equal(sf1.team1Id, q[0], 'QF1 winner is SF1 team 1');
    assert.equal(sf1.team2Id, q[3], 'QF2 winner is SF1 team 2');
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
