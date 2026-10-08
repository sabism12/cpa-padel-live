// Parse the official CPA Padel match schedule CSV and produce:
//   - the 20-pair roster (with groups)
//   - the 30 group-stage matches with times and courts
// Output: schedule-import.json for the server to ingest.
const fs = require('fs');

const CSV = 'C:\\Users\\DELL\\Downloads\\Match_Schedule(Match Schedule).csv';
const OUT = 'C:\\Users\\DELL\\Desktop\\cpa padel app - Copy\\schedule-import.json';

// The CSV was typed by hand, so the same pair sometimes appears written in two
// different ways. Normalising BEFORE collecting collapses them into one pair.
const NAME_FIX = {
  'Hamood / Hosam': 'Hamood / Hossam',
  'Ansaf CK / Faham': 'Ansaf / Faham',
  'Asim / Abhi': 'Asim / Abhijit',
  // Player change: Abdu replaced Aflah as Ameen's partner.
  'Ameen / Aflah': 'Ameen / Abdu',
};
const norm = (n) => NAME_FIX[n] || n;

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E'];
const COURT_IDS = ['court-1', 'court-2', 'court-3', 'court-4', 'court-5'];

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const raw = fs.readFileSync(CSV, 'utf8').replace(/^\uFEFF/, '');
const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);

const header = splitCsvLine(lines[0]);
const courtCols = header.slice(1);

const pairsByGroup = {};
for (const g of GROUP_LETTERS) pairsByGroup[g] = [];
const matches = [];

for (let r = 1; r < lines.length; r++) {
  const cols = splitCsvLine(lines[r]);
  const time = cols[0];
  if (!time) continue;

  for (let c = 0; c < courtCols.length; c++) {
    const cell = cols[c + 1];
    if (!cell || cell.indexOf(' vs ') === -1) continue;

    const group = GROUP_LETTERS[c];
    const parts = cell.split(' vs ');
    const a = norm(parts[0].trim());
    const b = norm(parts[1].trim());

    for (const p of [a, b]) {
      if (pairsByGroup[group].indexOf(p) === -1) pairsByGroup[group].push(p);
    }

    matches.push({
      group,
      courtId: COURT_IDS[c],
      courtName: courtCols[c],
      time,
      team1: a,
      team2: b,
    });
  }
}

// Build the flat roster.
const roster = [];
for (const g of GROUP_LETTERS) {
  for (const name of pairsByGroup[g]) {
    const parts = name.split(' / ');
    roster.push({ group: g, player1: parts[0].trim(), player2: parts[1].trim(), name });
  }
}

console.log('=== GROUPS ===');
for (const g of GROUP_LETTERS) {
  console.log(`Group ${g} (${pairsByGroup[g].length} pairs):`);
  for (const p of pairsByGroup[g]) console.log('   ' + p);
}

const perGroup = {};
for (const m of matches) perGroup[m.group] = (perGroup[m.group] || 0) + 1;

console.log('\n=== COUNTS ===');
console.log('roster pairs :', roster.length);
console.log('total matches:', matches.length);
console.log('per group    :', JSON.stringify(perGroup));

const problems = [];
for (const g of GROUP_LETTERS) {
  if (pairsByGroup[g].length !== 4) problems.push(`Group ${g} has ${pairsByGroup[g].length} pairs (expected 4)`);
  if ((perGroup[g] || 0) !== 6) problems.push(`Group ${g} has ${perGroup[g] || 0} matches (expected 6)`);
}
if (roster.length !== 20) problems.push(`Roster has ${roster.length} pairs (expected 20)`);
if (matches.length !== 30) problems.push(`Schedule has ${matches.length} matches (expected 30)`);

for (const g of GROUP_LETTERS) {
  for (const p of pairsByGroup[g]) {
    const opp = matches
      .filter((m) => m.group === g && (m.team1 === p || m.team2 === p))
      .map((m) => (m.team1 === p ? m.team2 : m.team1));
    const uniq = opp.filter((v, i) => opp.indexOf(v) === i);
    if (uniq.length !== 3) problems.push(`Group ${g}: ${p} faces ${uniq.length} distinct opponents (expected 3)`);
  }
}

console.log('\n=== VALIDATION ===');
if (problems.length === 0) console.log('PASS: 20 pairs, 5 groups of 4, 30 matches, complete round robin in every group');
else problems.forEach((p) => console.log('  PROBLEM: ' + p));

fs.writeFileSync(OUT, JSON.stringify({ roster, matches, groupPairs: pairsByGroup }, null, 2), 'utf8');
console.log('\nwritten:', OUT);
