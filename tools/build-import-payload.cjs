/**
 * Builds the /api/admin/import payload from schedule-import.json:
 *   - 20 teams (official roster, correct groups)
 *   - 5 groups
 *   - 30 group matches with official times/courts + reset knockout bracket
 *
 * Output: admin-import-payload.json
 * Run: node tools/build-import-payload.cjs
 */
const fs = require('fs');
const path = require('path');

const IMPORT_FILE = path.join(process.cwd(), 'schedule-import.json');
const STATE_FILE = path.join(process.cwd(), 'data', 'tournament_state.json');
const OUT = path.join(process.cwd(), 'admin-import-payload.json');

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E'];
const COURT_IDS = ['court-1', 'court-2', 'court-3', 'court-4', 'court-5'];

function teamIdFor(group, i) {
  return `team-${group.toLowerCase()}${i + 1}`;
}

const parsed = JSON.parse(fs.readFileSync(IMPORT_FILE, 'utf8'));
if (parsed.roster.length !== 20) throw new Error('Expected 20 pairs, got ' + parsed.roster.length);
if (parsed.matches.length !== 30) throw new Error('Expected 30 matches, got ' + parsed.matches.length);

// --- teams ---------------------------------------------------------------
const teams = [];
const idByName = {};
for (const g of GROUP_LETTERS) {
  const inGroup = parsed.roster.filter((r) => r.group === g);
  if (inGroup.length !== 4) throw new Error(`Group ${g} must have 4 pairs, got ${inGroup.length}`);
  inGroup.forEach((r, i) => {
    const id = teamIdFor(g, i);
    idByName[r.name] = id;
    teams.push({
      id,
      name: `${r.player1} / ${r.player2}`,
      player1: r.player1,
      player2: r.player2,
      groupId: `group-${g.toLowerCase()}`,
    });
  });
}

// --- groups --------------------------------------------------------------
const groups = GROUP_LETTERS.map((g, i) => ({
  id: `group-${g.toLowerCase()}`,
  name: `Group ${g}`,
  order: i + 1,
}));

// --- group matches -------------------------------------------------------
const matches = [];
let matchNumber = 1;
for (let i = 0; i < GROUP_LETTERS.length; i++) {
  const g = GROUP_LETTERS[i];
  const courtId = COURT_IDS[i];
  parsed.matches
    .filter((m) => m.group === g)
    .forEach((m, idx) => {
      const t1 = idByName[m.team1];
      const t2 = idByName[m.team2];
      if (!t1 || !t2) throw new Error(`Unknown pair in group ${g}: ${m.team1} vs ${m.team2}`);
      matches.push({
        id: `match-group-${g.toLowerCase()}-${idx + 1}`,
        tournamentId: 'cpa-padel-2026',
        groupId: `group-${g.toLowerCase()}`,
        stage: 'group',
        matchNumber: matchNumber++,
        team1Id: t1,
        team2Id: t2,
        courtId,
        scheduledTime: m.time,
        status: 'scheduled',
        team1Score: null,
        team2Score: null,
      });
    });
}

// --- knockout bracket: keep the shape, empty the slots -------------------
let existingKo = [];
try {
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  existingKo = (state.matches || []).filter((m) => m.stage === 'knockout');
} catch {
  existingKo = [];
}

const knockout = existingKo.map((m) => ({
  ...m,
  matchNumber: matchNumber++,
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

const payload = { groups, teams, matches: [...matches, ...knockout] };

// --- validate ------------------------------------------------------------
const problems = [];
if (teams.length !== 20) problems.push(`teams=${teams.length}`);
if (matches.length !== 30) problems.push(`group matches=${matches.length}`);
for (const g of GROUP_LETTERS) {
  const n = matches.filter((m) => m.groupId === `group-${g.toLowerCase()}`).length;
  if (n !== 6) problems.push(`Group ${g} matches=${n}`);
}
const seen = new Set();
for (const m of matches) {
  const k = [m.team1Id, m.team2Id].sort().join('|');
  if (seen.has(k)) problems.push(`duplicate fixture ${k}`);
  seen.add(k);
}

fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8');

console.log('teams        :', teams.length);
console.log('groups       :', groups.length);
console.log('group matches:', matches.length);
console.log('knockout     :', knockout.length);
console.log('problems     :', problems.length === 0 ? 'none' : problems.join('; '));
console.log('written      :', OUT);

if (problems.length) process.exit(1);
