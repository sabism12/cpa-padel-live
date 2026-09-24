import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { tournamentStore } from './server/store';
import { createSession, verifyToken, requireScorekeeper, requireAdmin } from './server/auth';
import {
  initializeDraw,
  resetDraw,
  serializeDraw,
  spinDraw,
  undoDraw,
  validatePairs,
} from './server/drawLogic';
import { Match, Group, Team, Court } from './src/types';

async function startServer() {
  // Do not accept requests until the file/Supabase state is fully loaded.
  await tournamentStore.initialize();
  const app = express();
  const PORT = Number.parseInt(process.env.PORT || '3000', 10);
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    throw new Error('PORT must be a valid TCP port between 1 and 65535.');
  }

  // Same-origin browser requests need no CORS headers. Cross-origin tools can
  // be allowed explicitly with a comma-separated CORS_ORIGINS allowlist.
  const allowedCorsOrigins = new Set(
    (process.env.CORS_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  );

  app.use(express.json());

  // Mutating endpoints use the existing synchronous store API, which queues
  // the snapshot write. Delay JSON responses until that queued write is
  // durable so callers never receive a success before storage confirms it.
  app.use((req: Request, res: Response, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      next();
      return;
    }

    const sendJson = res.json.bind(res);
    res.json = ((...args: any[]) => {
      void tournamentStore
        .flushPersistence()
        .then(() => sendJson(...args))
        .catch((error) => {
          console.error(`State persistence failed for ${req.method} ${req.path}.`, error);
          if (!res.headersSent) {
            res.status(500);
            sendJson({ error: 'Unable to persist tournament state.' });
          }
        });
      return res;
    }) as Response['json'];
    next();
  });

  // Optional CORS for explicitly allowed external tools; production defaults
  // to same-origin only rather than a wildcard origin.
  app.use((req, res, next) => {
    const origin = req.get('Origin');
    if (origin && allowedCorsOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Lightweight Render health check. Deliberately reports no secrets or state.
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  // ----------------------------------------------------
  // PUBLIC API ENDPOINTS
  // ----------------------------------------------------

  // Tournament Overview & Config
  app.get('/api/tournament', (req: Request, res: Response) => {
    const settings = tournamentStore.getSettings();
    const safeSettings = {
      id: settings.id,
      name: settings.name,
      location: settings.location,
      date: settings.date,
      scoring: settings.scoring,
      version: settings.version,
    };
    res.json({
      settings: safeSettings,
      groups: tournamentStore.getGroups(),
      courts: tournamentStore.getCourts(),
      lastUpdated: tournamentStore.getState().lastUpdated,
    });
  });

  // Summary Metrics (Matches completed, live, upcoming, etc.)
  app.get('/api/summary', (req: Request, res: Response) => {
    const matches = tournamentStore.getMatches();
    const completed = matches.filter((m) => m.status === 'completed').length;
    const live = matches.filter((m) => m.status === 'live').length;
    const upcoming = matches.filter((m) => m.status === 'scheduled' || m.status === 'ready').length;
    const total = matches.length;

    res.json({
      totalMatches: total,
      completedMatches: completed,
      liveMatches: live,
      upcomingMatches: upcoming,
      lastUpdated: tournamentStore.getState().lastUpdated,
      version: tournamentStore.getSettings().version,
    });
  });

  // Groups
  app.get('/api/groups', (req: Request, res: Response) => {
    res.json(tournamentStore.getGroups());
  });

  // Teams
  app.get('/api/teams', (req: Request, res: Response) => {
    res.json(tournamentStore.getTeams());
  });

  // Courts
  app.get('/api/courts', (req: Request, res: Response) => {
    res.json(tournamentStore.getCourts());
  });

  // Helper to enrich matches with team, court, and group metadata
  function getEnrichedMatchesList(matchesList?: Match[]) {
    const matches = matchesList || tournamentStore.getMatches();
    const teams = tournamentStore.getTeams();
    const teamMap = new Map(teams.map((t) => [t.id, t]));
    const courtMap = new Map(tournamentStore.getCourts().map((c) => [c.id, c]));
    const groupMap = new Map(tournamentStore.getGroups().map((g) => [g.id, g]));

    return matches.map((m) => ({
      ...m,
      team1: teamMap.get(m.team1Id) || { id: m.team1Id, name: 'Team 1', player1: '', player2: '', groupId: m.groupId },
      team2: teamMap.get(m.team2Id) || { id: m.team2Id, name: 'Team 2', player1: '', player2: '', groupId: m.groupId },
      court: m.courtId ? courtMap.get(m.courtId) : null,
      group: groupMap.get(m.groupId),
    }));
  }

  // 🚀 FAST BOOTSTRAP ENDPOINT: Bundles all tournament data into a single 1ms in-memory response
  app.get('/api/bootstrap', (req: Request, res: Response) => {
    const settings = tournamentStore.getSettings();
    const safeSettings = {
      id: settings.id,
      name: settings.name,
      location: settings.location,
      date: settings.date,
      scoring: settings.scoring,
      version: settings.version,
    };
    const matches = tournamentStore.getMatches();
    const completed = matches.filter((m) => m.status === 'completed').length;
    const live = matches.filter((m) => m.status === 'live').length;
    const upcoming = matches.filter((m) => m.status === 'scheduled' || m.status === 'ready').length;

    const completedSorted = [...matches.filter((m) => m.status === 'completed')].sort((a, b) => {
      const timeA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const timeB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return timeB - timeA;
    });

    res.json({
      settings: safeSettings,
      groups: tournamentStore.getGroups(),
      courts: tournamentStore.getCourts(),
      teams: tournamentStore.getTeams(),
      summary: {
        totalMatches: matches.length,
        completedMatches: completed,
        liveMatches: live,
        upcomingMatches: upcoming,
        lastUpdated: tournamentStore.getState().lastUpdated,
        version: settings.version,
      },
      matches: getEnrichedMatchesList(matches),
      standings: tournamentStore.calculateStandings(),
      latestResults: getEnrichedMatchesList(completedSorted.slice(0, 10)),
      lastUpdated: tournamentStore.getState().lastUpdated,
    });
  });

  // Matches (with resolved team info)
  app.get('/api/matches', (req: Request, res: Response) => {
    const { groupId, courtId, status } = req.query;
    let matches = tournamentStore.getMatches();

    if (groupId) {
      matches = matches.filter((m) => m.groupId === groupId);
    }
    if (courtId) {
      matches = matches.filter((m) => m.courtId === courtId);
    }
    if (status) {
      matches = matches.filter((m) => m.status === status);
    }

    res.json(getEnrichedMatchesList(matches));
  });

  // Standings
  app.get('/api/standings', (req: Request, res: Response) => {
    const standings = tournamentStore.calculateStandings();
    res.json(standings);
  });

  // Latest Results
  app.get('/api/latest-results', (req: Request, res: Response) => {
    const matches = tournamentStore.getMatches().filter((m) => m.status === 'completed');
    matches.sort((a, b) => {
      const timeA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const timeB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return timeB - timeA;
    });

    const teams = tournamentStore.getTeams();
    const teamMap = new Map(teams.map((t) => [t.id, t]));
    const groupMap = new Map(tournamentStore.getGroups().map((g) => [g.id, g]));

    const enriched = matches.slice(0, 10).map((m) => ({
      ...m,
      team1: teamMap.get(m.team1Id),
      team2: teamMap.get(m.team2Id),
      group: groupMap.get(m.groupId),
    }));

    res.json(enriched);
  });

  // Real-Time Server-Sent Events (SSE)
  app.get('/api/live-events', (req: Request, res: Response) => {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Ask EventSource to retry after a short connection loss and immediately
    // send a snapshot notification so clients refetch authoritative state.
    res.write('retry: 3000\n\n');
    res.write(`data: ${JSON.stringify({ type: 'connected', version: tournamentStore.getSettings().version })}\n\n`);

    let closed = false;
    const unregister = tournamentStore.registerSSE((data) => {
      if (!closed && !res.destroyed) res.write(`data: ${data}\n\n`);
    });

    // Heartbeat prevents idle proxies from closing a quiet draw connection.
    const heartbeat = setInterval(() => {
      if (!closed && !res.destroyed) res.write(': keep-alive\n\n');
    }, 25000);

    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unregister();
    };
    res.on('close', cleanup);
  });

  // ----------------------------------------------------
  // LIVE GROUP DRAW (Public read-only snapshot)
  // ----------------------------------------------------

  // Authoritative draw state. Public so viewers never need to log in.
  // `sequence` and `groupPlan` are never included, so future results stay secret.
  app.get('/api/draw', async (req: Request, res: Response) => {
    try {
      // Do not let a spectator read a newer in-memory snapshot before its
      // corresponding Supabase transaction has completed.
      await tournamentStore.flushPersistence();
      res.json(serializeDraw(tournamentStore.getDraw()));
    } catch (error) {
      console.error('Unable to read the durable public draw snapshot.', error);
      res.status(503).json({ error: 'The draw state is temporarily unavailable.' });
    }
  });

  // Client-side error reports from the draw viewer. Turned off unless
  // DRAW_CLIENT_ERRORS=on so it never adds noise or grows the log unbounded.
  app.post('/api/draw/client-error', (req: Request, res: Response) => {
    if (process.env.DRAW_CLIENT_ERRORS === 'on') {
      const { message, url, ua, at } = req.body || {};
      console.warn(
        `[draw client error] ${at || ''} ${message || 'unknown'} | ${url || ''} | ${ua || ''}`
      );
    }
    res.status(204).end();
  });

  // ----------------------------------------------------
  // AUTHENTICATION
  // ----------------------------------------------------

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { role, password, name } = req.body;
    const settings = tournamentStore.getSettings();

    if (role === 'admin') {
      if (settings.adminPasswordHash && password === settings.adminPasswordHash) {
        const token = createSession('admin', name || 'Tournament Admin');
        res.json({ token, role: 'admin', name: name || 'Tournament Admin' });
        return;
      }
      res.status(401).json({ error: 'Invalid admin credentials.' });
      return;
    }

    if (role === 'scorekeeper') {
      if (settings.scorekeeperPin && password === settings.scorekeeperPin) {
        const token = createSession('scorekeeper', name || 'Scorekeeper');
        res.json({ token, role: 'scorekeeper', name: name || 'Scorekeeper' });
        return;
      }
      res.status(401).json({ error: 'Invalid scorekeeper PIN/passcode.' });
      return;
    }

    res.status(400).json({ error: 'Invalid role specified.' });
  });

  app.get('/api/auth/me', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const user = verifyToken(token || undefined);
    if (!user) {
      res.json({ role: 'public', authenticated: false });
      return;
    }
    res.json({ ...user, token, authenticated: true });
  });

  // ----------------------------------------------------
  // SCOREKEEPER ENDPOINTS (Protected)
  // ----------------------------------------------------

  // Submit Completed Result
  app.post('/api/scorekeeper/submit-result', requireScorekeeper, (req: Request, res: Response) => {
    const { matchId, team1Score, team2Score, padelState, scoreSummary } = req.body;
    const user = (req as any).user;

    const result = tournamentStore.submitScore({
      matchId,
      team1Score: Number(team1Score),
      team2Score: Number(team2Score),
      submittedBy: `${user.name} (${user.role})`,
      isAdminOverride: user.role === 'admin',
      padelState,
      scoreSummary,
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    // Enrich nextMatch if available
    let enrichedNext = null;
    if (result.nextMatch) {
      const teams = tournamentStore.getTeams();
      const teamMap = new Map(teams.map((t) => [t.id, t]));
      const courtMap = new Map(tournamentStore.getCourts().map((c) => [c.id, c]));
      const groupMap = new Map(tournamentStore.getGroups().map((g) => [g.id, g]));

      enrichedNext = {
        ...result.nextMatch,
        team1: teamMap.get(result.nextMatch.team1Id),
        team2: teamMap.get(result.nextMatch.team2Id),
        court: result.nextMatch.courtId ? courtMap.get(result.nextMatch.courtId) : null,
        group: groupMap.get(result.nextMatch.groupId),
      };
    }

    res.json({
      success: true,
      match: result.match,
      nextMatch: enrichedNext,
      message: 'Result saved successfully.',
    });
  });

  // Update Live In-Progress Score or Status (and optional Court reassignment)
  app.post('/api/scorekeeper/set-live', requireScorekeeper, (req: Request, res: Response) => {
    const { matchId, team1Score, team2Score, status, padelState, scoreSummary, courtId } = req.body;

    const updates: Partial<Match> = {};
    if (status) updates.status = status;
    if (courtId !== undefined) updates.courtId = courtId;
    if (team1Score !== undefined && team1Score !== null && team1Score !== '') {
      updates.team1Score = Number(team1Score);
    }
    if (team2Score !== undefined && team2Score !== null && team2Score !== '') {
      updates.team2Score = Number(team2Score);
    }
    if (padelState !== undefined) {
      updates.padelState = padelState;
    }
    if (scoreSummary !== undefined) {
      updates.scoreSummary = scoreSummary;
    }

    const updated = tournamentStore.updateMatch(matchId, updates);
    if (!updated) {
      res.status(404).json({ error: 'Match not found.' });
      return;
    }

    res.json({ success: true, match: updated });
  });

  // ----------------------------------------------------
  // ADMIN DASHBOARD ENDPOINTS (Protected: Admin Only)
  // ----------------------------------------------------

  // Auto-generate round-robin group matches
  app.post('/api/admin/matches/generate', requireAdmin, (req: Request, res: Response) => {
    const matches = tournamentStore.autoGenerateGroupMatches();
    res.json({ success: true, matches, count: matches.length });
  });

  // Update Match details / score / court
  app.post('/api/admin/match', requireAdmin, (req: Request, res: Response) => {
    const { id, ...updates } = req.body;
    if (!id) {
      res.status(400).json({ error: 'Match ID is required.' });
      return;
    }

    const updated = tournamentStore.updateMatch(id, updates);
    if (!updated) {
      res.status(404).json({ error: 'Match not found.' });
      return;
    }
    res.json({ success: true, match: updated });
  });

  // Teams CRUD
  app.post('/api/admin/team', requireAdmin, (req: Request, res: Response) => {
    const { id, name, player1, player2, groupId } = req.body;
    if (!groupId) {
      res.status(400).json({ error: 'Group is required.' });
      return;
    }

    // Teams are identified by their two players, not a nickname.
    const label = name || [player1, player2].filter(Boolean).join(' / ');

    if (id) {
      const updated = tournamentStore.updateTeam(id, { name: label, player1, player2, groupId });
      res.json({ success: true, team: updated });
    } else {
      const created = tournamentStore.addTeam({ name: label, player1: player1 || '', player2: player2 || '', groupId });
      res.json({ success: true, team: created });
    }
  });

  app.delete('/api/admin/team/:id', requireAdmin, (req: Request, res: Response) => {
    const success = tournamentStore.deleteTeam(req.params.id);
    res.json({ success });
  });

  // Courts Management
  app.post('/api/admin/courts', requireAdmin, (req: Request, res: Response) => {
    const { courts } = req.body;
    if (!Array.isArray(courts)) {
      res.status(400).json({ error: 'Courts must be an array.' });
      return;
    }
    const updated = tournamentStore.setCourts(courts);
    res.json({ success: true, courts: updated });
  });

  // Knockout Bracket Seeding
  app.post('/api/knockout/seed-from-standings', requireAdmin, (req: Request, res: Response) => {
    const updatedMatches = tournamentStore.seedKnockoutFromStandings();
    res.json({ success: true, matches: getEnrichedMatchesList(updatedMatches) });
  });

  // Groups Management
  app.post('/api/admin/groups', requireAdmin, (req: Request, res: Response) => {
    const { groups } = req.body;
    if (!Array.isArray(groups)) {
      res.status(400).json({ error: 'Groups must be an array.' });
      return;
    }
    const updated = tournamentStore.setGroups(groups);
    res.json({ success: true, groups: updated });
  });

  // Settings & Scoring configuration
  app.post('/api/admin/settings', requireAdmin, (req: Request, res: Response) => {
    const updates = { ...(req.body || {}) };
    if (typeof updates.adminPasswordHash === 'string' && !updates.adminPasswordHash.trim()) {
      delete updates.adminPasswordHash;
    }
    if (typeof updates.scorekeeperPin === 'string' && !updates.scorekeeperPin.trim()) {
      delete updates.scorekeeperPin;
    }
    const updated = tournamentStore.updateSettings(updates);
    const { adminPasswordHash: _adminPassword, scorekeeperPin: _scorekeeperPin, ...safeSettings } = updated;
    res.json({ success: true, settings: safeSettings });
  });

  // Reset to Demo Data
  app.post('/api/admin/reset-demo', requireAdmin, (req: Request, res: Response) => {
    const state = tournamentStore.resetToDemo();
    const { adminPasswordHash: _adminPassword, scorekeeperPin: _scorekeeperPin, ...safeSettings } = state.settings;
    res.json({ success: true, state: { ...state, settings: safeSettings } });
  });

  // Export all tournament data (JSON & CSV compatible)
  app.get('/api/admin/export', requireAdmin, (req: Request, res: Response) => {
    const state = tournamentStore.getState();
    const standings = tournamentStore.calculateStandings();
    const { adminPasswordHash: _adminPassword, scorekeeperPin: _scorekeeperPin, ...safeSettings } = state.settings;

    res.json({
      tournament: safeSettings,
      groups: state.groups,
      courts: state.courts,
      teams: state.teams,
      matches: state.matches,
      standings,
      exportedAt: new Date().toISOString(),
    });
  });

  // Import tournament data
  app.post('/api/admin/import', requireAdmin, (req: Request, res: Response) => {
    const { tournament, groups, courts, teams, matches } = req.body;
    if (!groups || !teams || !matches) {
      res.status(400).json({ error: 'Invalid tournament import payload.' });
      return;
    }

    if (tournament) tournamentStore.updateSettings(tournament);
    if (groups) tournamentStore.setGroups(groups);
    if (courts) tournamentStore.setCourts(courts);
    // Replace teams & matches directly in state
    const state = tournamentStore.getState();
    state.teams = teams;
    state.matches = matches;
    tournamentStore.updateSettings({ version: state.settings.version + 1 });

    res.json({ success: true, message: 'Tournament data imported successfully.' });
  });

  // ----------------------------------------------------
  // LIVE GROUP DRAW — ADMIN OPERATIONS (Protected: Admin Only)
  // ----------------------------------------------------

  // Save/replace the 20 player pairs. Only allowed before the draw is initialized.
  app.post('/api/admin/draw/pairs', requireAdmin, (req: Request, res: Response) => {
    const { pairs } = req.body || {};
    const validation = validatePairs(pairs);
    if (validation.error) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const draw = tournamentStore.getDraw();
    if (draw.initialized) {
      res.status(400).json({ error: 'Reset the draw before changing the player pairs.' });
      return;
    }

    draw.pairs = validation.pairs!;
    draw.sequence = [];
    draw.groupPlan = {};
    draw.results = [];
    delete draw.lastSpin;
    draw.lastSpinAtMs = 0;

    tournamentStore.commitDraw();
    res.json({ success: true, state: serializeDraw(draw) });
  });

  // Randomise the reveal order and group assignments (requires exactly 20 pairs).
  app.post('/api/admin/draw/initialize', requireAdmin, (req: Request, res: Response) => {
    const draw = tournamentStore.getDraw();
    const error = initializeDraw(draw);
    if (error) {
      res.status(400).json({ error });
      return;
    }
    tournamentStore.commitDraw();
    res.json({ success: true, state: serializeDraw(draw) });
  });

  // Reveal the next authoritative pair + group. Atomic: the server decides.
  app.post('/api/admin/draw/spin', requireAdmin, (req: Request, res: Response) => {
    const draw = tournamentStore.getDraw();
    const { error, result } = spinDraw(draw);
    if (error) {
      res.status(400).json({ error });
      return;
    }
    tournamentStore.commitDraw();
    res.json({ success: true, result, state: serializeDraw(draw) });
  });

  // Undo the most recent reveal.
  app.post('/api/admin/draw/undo', requireAdmin, (req: Request, res: Response) => {
    const draw = tournamentStore.getDraw();
    const error = undoDraw(draw);
    if (error) {
      res.status(400).json({ error });
      return;
    }
    tournamentStore.commitDraw();
    res.json({ success: true, state: serializeDraw(draw) });
  });

  // Reset the draw back to its pre-draw state. Player pairs are kept.
  app.post('/api/admin/draw/reset', requireAdmin, (req: Request, res: Response) => {
    const draw = tournamentStore.getDraw();
    resetDraw(draw);
    tournamentStore.commitDraw();
    res.json({ success: true, state: serializeDraw(draw) });
  });

  // ----------------------------------------------------
  // VITE & STATIC SPA SERVING
  // ----------------------------------------------------

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // The production server bundle is stored beside the client build output;
    // never let express.static expose it or its source map to browsers.
    app.get(['/server.cjs', '/server.cjs.map'], (_req: Request, res: Response) => {
      res.sendStatus(404);
    });
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CPA Padel Tournament Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('CPA Padel server startup failed.', error);
  process.exitCode = 1;
});
