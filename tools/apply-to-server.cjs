/**
 * Applies the official roster + schedule to a running CPA Padel server via the
 * admin API, then resets the draw.
 *
 * Usage:
 *   node tools/apply-to-server.cjs <baseUrl> <adminPassword>
 *
 * Example (local Dell gateway):
 *   node tools/apply-to-server.cjs http://127.0.0.1:3000 MyAdminPassword
 */
const fs = require('fs');
const path = require('path');

const baseUrl = process.argv[2];
const adminPassword = process.argv[3];

if (!baseUrl || !adminPassword) {
  console.error('Usage: node tools/apply-to-server.cjs <baseUrl> <adminPassword>');
  process.exit(1);
}

const payloadFile = path.join(process.cwd(), 'admin-import-payload.json');
if (!fs.existsSync(payloadFile)) {
  console.error('Missing admin-import-payload.json - run tools/build-import-payload.cjs first.');
  process.exit(1);
}
const payload = JSON.parse(fs.readFileSync(payloadFile, 'utf8'));

async function main() {
  // --- 1. sign in ---------------------------------------------------------
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin', password: adminPassword, name: 'Schedule Import' }),
  });
  const login = await loginRes.json();
  if (!loginRes.ok || !login.token) {
    console.error('Login failed:', login.error || loginRes.status);
    process.exit(1);
  }
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` };
  console.log('signed in as admin');

  // --- 2. reset the draw FIRST (it references the old roster) -------------
  const drawReset = await fetch(`${baseUrl}/api/admin/draw/reset`, { method: 'POST', headers: auth });
  console.log('draw reset:', drawReset.status);

  // --- 3. import roster + schedule ---------------------------------------
  const importRes = await fetch(`${baseUrl}/api/admin/import`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify(payload),
  });
  const importBody = await importRes.json();
  if (!importRes.ok) {
    console.error('Import failed:', importBody.error || importRes.status);
    process.exit(1);
  }
  console.log('import:', importRes.status, importBody.message || '');

  // --- 4. reset the draw again so its pair list matches the new roster ---
  const drawReset2 = await fetch(`${baseUrl}/api/admin/draw/reset`, { method: 'POST', headers: auth });
  const drawState = await drawReset2.json();
  console.log('draw state:', drawState.success ? 'MULTIPLE_OK' : drawState.error);

  // --- 5. verify ----------------------------------------------------------
  const boot = await fetch(`${baseUrl}/api/bootstrap`).then((r) => r.json());
  const groupMatches = boot.matches.filter((m) => m.stage === 'group');
  console.log('');
  console.log('VERIFY');
  console.log('  teams        :', boot.teams.length);
  console.log('  groups       :', boot.groups.length);
  console.log('  group matches:', groupMatches.length);
  console.log('  completed    :', boot.matches.filter((m) => m.status === 'completed').length);
  console.log('  live         :', boot.matches.filter((m) => m.status === 'live').length);
  console.log('');
  console.log('Group roster:');
  for (const g of boot.groups) {
    const t = boot.teams.filter((x) => x.groupId === g.id);
    console.log(`  ${g.name}: ` + t.map((x) => `${x.player1} / ${x.player2}`).join(' | '));
  }
  console.log('');
  console.log('Court 1 schedule:');
  groupMatches
    .filter((m) => m.courtId === 'court-1')
    .forEach((m) => {
      console.log(`  ${m.scheduledTime}  ${m.team1.player1} / ${m.team1.player2} vs ${m.team2.player1} / ${m.team2.player2}`);
    });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
