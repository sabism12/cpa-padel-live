/**
 * Applies the official roster + schedule DIRECTLY to the local state file.
 * Use this when the gateway is stopped. Restart the gateway afterwards.
 *
 * Reads:  admin-import-payload.json
 * Writes: data/tournament_state.json
 *
 * The knockout bracket is kept but emptied, and all scoring + draw state is
 * cleared so the tournament starts clean.
 */
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(process.cwd(), 'data', 'tournament_state.json');
const PAYLOAD_FILE = path.join(process.cwd(), 'admin-import-payload.json');

if (!fs.existsSync(STATE_FILE)) {
  console.error('State file not found:', STATE_FILE);
  process.exit(1);
}
if (!fs.existsSync(PAYLOAD_FILE)) {
  console.error('Missing', PAYLOAD_FILE, '- run tools/build-import-payload.cjs first.');
  process.exit(1);
}

const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
const payload = JSON.parse(fs.readFileSync(PAYLOAD_FILE, 'utf8'));

if (payload.teams.length !== 20) throw new Error('payload teams != 20');
if (payload.groups.length !== 5) throw new Error('payload groups != 5');

// Build the new matches: group stage from the payload + emptied knockout.
const groupMatches = payload.matches.filter((m) => m.stage === 'group');
let nextNumber = Math.max(0, ...groupMatches.map((m) => m.matchNumber)) + 1;

const knockout = (state.matches || [])
  .filter((m) => m.stage === 'knockout')
  .map((m) => ({
    ...m,
    matchNumber: nextNumber++,
    team1Id: '',
    team2Id: '',
    team1Score: null,
    team2Score: null,
    status: 'scheduled',
    completedAt: undefined,
    submittedBy: undefined,
    scoreSummary: undefined,
    padelState: undefined,
    seqLog: [],
    matchVersion: 0,
  }));

state.teams = payload.teams;
state.groups = payload.groups;
state.matches = [...groupMatches, ...knockout];

// Reset the draw to match the new roster; not yet initialized.
state.draw = {
  pairs: payload.teams.map((t, i) => ({
    id: `draw-pair-${String(i + 1).padStart(2, '0')}`,
    player1: t.player1,
    player2: t.player2,
  })),
  sequence: [],
  groupPlan: {},
  results: [],
  initialized: false,
  lastSpinAtMs: 0,
};

state.settings.version = (state.settings.version || 1) + 1;
state.lastUpdated = new Date().toISOString();

fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');

// ---- report -------------------------------------------------------------
const teamMap = {};
for (const t of state.teams) teamMap[t.id] = `${t.player1} / ${t.player2}`;

console.log('APPLIED');
console.log('  teams        :', state.teams.length);
console.log('  groups       :', state.groups.length);
console.log('  group matches:', groupMatches.length);
console.log('  knockout     :', knockout.length, '(emptied)');
console.log('  draw         : reset (pairs seeded, not initialized)');
console.log('  completed    :', state.matches.filter((m) => m.status === 'completed').length);
console.log('  live         :', state.matches.filter((m) => m.status === 'live').length);
console.log('');
console.log('Roster:');
for (const g of state.groups) {
  const t = state.teams.filter((x) => x.groupId === g.id);
  console.log(`  ${g.name}: ` + t.map((x) => `${x.player1} / ${x.player2}`).join(' | '));
}
console.log('');
console.log('Court 1 schedule:');
groupMatches
  .filter((m) => m.courtId === 'court-1')
  .forEach((m) => {
    console.log(`  ${m.scheduledTime}  ${teamMap[m.team1Id]} vs ${teamMap[m.team2Id]}`);
  });
