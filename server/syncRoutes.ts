/**
 * Score synchronization routes.
 *
 * `POST /api/sync/events` accepts immutable, idempotent score events from either
 *  - a scorekeeper phone (existing scorekeeper/admin auth), or
 *  - the Dell gateway relaying on a phone's behalf (dedicated relay auth).
 *
 * The server is the authority: it assigns per-match sequence numbers, derives
 * match state through the existing scoringEngine, persists, and broadcasts the
 * usual SSE version bump so public viewers update automatically.
 *
 * ADDITIVE: the legacy `/api/scorekeeper/set-live` and `/api/scorekeeper/submit-result`
 * endpoints remain untouched for backward compatibility.
 */
import { Request, Response, Router } from 'express';
import { tournamentStore } from './store';
import { verifyToken, requireScorekeeper } from './auth';
import { requireRelay, isRelayConfigured } from './relayAuth';
import { ScoreEvent } from '../src/scoring/eventTypes';
import { Match } from '../src/types';
import { gatewayRelay } from './gateway';

const GATEWAY_NAME = process.env.GATEWAY_NAME || 'Dell Gateway';
const MAX_BATCH = 200;

/** Validate one incoming event, returning a normalised event or an error. */
function normalizeEvent(raw: any): { event?: ScoreEvent; error?: string } {
  if (!raw || typeof raw !== 'object') return { error: 'Event must be an object.' };
  if (typeof raw.eventId !== 'string' || raw.eventId.length < 8 || raw.eventId.length > 128) {
    return { error: 'Event requires a valid eventId.' };
  }
  if (typeof raw.matchId !== 'string' || !raw.matchId) {
    return { error: 'Event requires a matchId.' };
  }
  const allowed = ['POINT_TEAM_1', 'POINT_TEAM_2', 'UNDO', 'RESET', 'MATCH_START', 'MATCH_FINAL'];
  if (typeof raw.type !== 'string' || !allowed.includes(raw.type)) {
    return { error: `Unsupported event type: ${String(raw.type)}` };
  }

  return {
    event: {
      eventId: raw.eventId,
      matchId: raw.matchId,
      courtId: typeof raw.courtId === 'string' || raw.courtId === null ? raw.courtId : undefined,
      scorekeeper: typeof raw.scorekeeper === 'string' ? raw.scorekeeper.slice(0, 120) : undefined,
      type: raw.type,
      payload:
        raw.payload && typeof raw.payload === 'object'
          ? {
              team1Games: Number.isFinite(Number(raw.payload.team1Games)) ? Number(raw.payload.team1Games) : undefined,
              team2Games: Number.isFinite(Number(raw.payload.team2Games)) ? Number(raw.payload.team2Games) : undefined,
              scoreSummary: typeof raw.payload.scoreSummary === 'string' ? raw.payload.scoreSummary.slice(0, 60) : undefined,
            }
          : undefined,
      clientTs: typeof raw.clientTs === 'string' ? raw.clientTs : new Date().toISOString(),
    },
  };
}

/** Lightweight readiness probe used by phones to detect the Dell on the LAN. */
function helloHandler(role: 'gateway' | 'server', name: string) {
  return (_req: Request, res: Response) => {
    res.json({
      role,
      name,
      version: tournamentStore.getSettings().version,
      ...(role === 'gateway' ? { upstreamReachable: true } : {}),
    });
  };
}

/** Read-only match snapshot so a reconnecting phone can resync its view. */
function versionMap(matches: Match[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of matches) out[m.id] = m.matchVersion ?? 0;
  return out;
}

export function createSyncRouter(mode: 'server' | 'gateway'): Router {
  const router = Router();

  // --- Discovery ---------------------------------------------------------
  router.get('/hello', helloHandler(mode === 'gateway' ? 'gateway' : 'server', mode === 'gateway' ? GATEWAY_NAME : 'CPA Render'));

  // --- Event ingest ------------------------------------------------------
  // Accepts BOTH auth types. The gateway relays phone events with its relay
  // credential; a phone talking directly to Render uses its scorekeeper token.
  router.post('/events', (req: Request, res: Response, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;

    // Prefer an explicit relay token; otherwise fall back to scorekeeper auth.
    const relayCandidate = token?.startsWith('cpa_relay_');
    if (relayCandidate) {
      requireRelay(req, res, () => handleEvents(req, res, 'gateway'));
      return;
    }

    const session = verifyToken(token);
    if (session && (session.role === 'scorekeeper' || session.role === 'admin')) {
      (req as any).user = session;
      handleEvents(req, res, 'client');
      return;
    }

    if (isRelayConfigured() && mode === 'gateway') {
      res.status(401).json({ error: 'Unauthorized. Scorekeeper or gateway relay credential required.' });
      return;
    }
    requireScorekeeper(req, res, () => handleEvents(req, res, 'client'));
  });

  function handleEvents(req: Request, res: Response, source: 'client' | 'gateway') {
    const body = req.body || {};
    const rawEvents = Array.isArray(body) ? body : body.events;

    if (!Array.isArray(rawEvents)) {
      res.status(400).json({ error: 'Body must contain an events array.' });
      return;
    }
    if (rawEvents.length === 0) {
      res.json({ success: true, results: [], versions: versionMap(tournamentStore.getMatches()) });
      return;
    }
    if (rawEvents.length > MAX_BATCH) {
      res.status(413).json({ error: `Batch exceeds the ${MAX_BATCH}-event limit.` });
      return;
    }

    const events: ScoreEvent[] = [];
    for (const raw of rawEvents) {
      const { event, error } = normalizeEvent(raw);
      if (error) {
        res.status(400).json({ error });
        return;
      }
      events.push(event!);
    }

    // relay relays are low-privilege: attribute them consistently for auditing.
    const relay = (req as any).relay;
    const session = (req as any).user;
    const submittedBy = relay
      ? `${relay.name} (relay)`
      : session
        ? `${session.name} (${session.role})`
        : undefined;

    const { results, changedMatchIds, finalisedMatchIds } = tournamentStore.applyScoreEvents(events, {
      source,
      submittedBy,
    });

    // Reuse the existing knockout advancement rules for event-path finals.
    for (const matchId of finalisedMatchIds) {
      tournamentStore.advanceKnockoutForMatch(matchId);
    }

    if (changedMatchIds.length > 0) {
      tournamentStore.commitScoreChanges();
    }

    // Gateway mode: queue locally-accepted events for upstream relay. Deduped
    // by eventId, and persisted so a Dell Internet outage cannot lose scores.
    if (mode === 'gateway') {
      const acceptedIds = new Set(results.filter((r) => r.accepted).map((r) => r.eventId));
      for (const event of events) {
        if (acceptedIds.has(event.eventId)) gatewayRelay.enqueue(event);
      }
    }

    const matches = tournamentStore.getMatches();
    res.json({
      success: true,
      results,
      versions: versionMap(matches),
    });
  }

  // --- Read-only state for reconnecting phones ---------------------------
  router.get('/state', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;
    const session = verifyToken(token);
    const relay = token?.startsWith('cpa_relay_');
    if (!session && !relay) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const matchId = typeof req.query.matchId === 'string' ? req.query.matchId : undefined;
    const matches = tournamentStore.getMatches().filter((m) => !matchId || m.id === matchId);

    res.json({
      success: true,
      versions: versionMap(matches),
      matches: matches.map((m) => ({
        id: m.id,
        status: m.status,
        team1Score: m.team1Score,
        team2Score: m.team2Score,
        matchVersion: m.matchVersion ?? 0,
        padelState: m.padelState,
        scoreSummary: m.scoreSummary,
      })),
    });
  });

  return router;
}
