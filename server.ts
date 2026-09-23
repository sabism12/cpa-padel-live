import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { tournamentStore } from './server/store';
import { createSession, verifyToken, requireScorekeeper, requireAdmin } from './server/auth';
import { Match, Group, Team, Court } from './src/types';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Enable CORS headers for client requests and external tools
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
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
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    res.write(`data: ${JSON.stringify({ type: 'connected', version: tournamentStore.getSettings().version })}\n\n`);

    const unregister = tournamentStore.registerSSE((data) => {
      res.write(`data: ${data}\n\n`);
    });

    req.on('close', () => {
      unregister();
    });
  });

  // ----------------------------------------------------
  // AUTHENTICATION
  // ----------------------------------------------------

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { role, password, name } = req.body;
    const settings = tournamentStore.getSettings();

    if (role === 'admin') {
      const correctPassword = settings.adminPasswordHash || 'admin123';
      if (password === correctPassword) {
        const token = createSession('admin', name || 'Tournament Admin');
        res.json({ token, role: 'admin', name: name || 'Tournament Admin' });
        return;
      }
      res.status(401).json({ error: 'Invalid admin credentials.' });
      return;
    }

    if (role === 'scorekeeper') {
      const correctPin = settings.scorekeeperPin || 'padel2026';
      if (password === correctPin) {
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
    const updates = req.body;
    const updated = tournamentStore.updateSettings(updates);
    res.json({ success: true, settings: updated });
  });

  // Reset to Demo Data
  app.post('/api/admin/reset-demo', requireAdmin, (req: Request, res: Response) => {
    const state = tournamentStore.resetToDemo();
    res.json({ success: true, state });
  });

  // Export all tournament data (JSON & CSV compatible)
  app.get('/api/admin/export', requireAdmin, (req: Request, res: Response) => {
    const state = tournamentStore.getState();
    const standings = tournamentStore.calculateStandings();

    res.json({
      tournament: state.settings,
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
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CPA Padel Tournament Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
