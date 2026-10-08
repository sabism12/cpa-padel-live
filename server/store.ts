import { Group, Team, Court, Match, TournamentSettings, StandingsRow } from '../src/types';
import { DrawStateRecord } from '../src/draw/types';
import { createInitialDraw, pairsFromTeams } from './drawLogic';
import { createStatePersistence, StatePersistence } from './statePersistence';
import {
  ApplyEventOptions,
  applyScoreEventBatch,
} from './scoringAuthority';
import { ScoreEvent, ScoreEventResult } from '../src/scoring/eventTypes';
import { finalScoreError } from '../src/scoring/finalScore';
import {
  DEFAULT_SETTINGS,
  INITIAL_GROUPS,
  INITIAL_COURTS,
  INITIAL_TEAMS,
  generateInitialMatches,
} from './seedData';

interface TournamentState {
  settings: TournamentSettings;
  groups: Group[];
  teams: Team[];
  courts: Court[];
  matches: Match[];
  lastUpdated: string;
  /** Bumped when the stored shape/scheduling rules change, to trigger migrations. */
  formatVersion?: number;
  /** Authoritative Live Group Draw state (optional for older saves). */
  draw?: DrawStateRecord;
  /**
   * Live toss results (bylaw §4), keyed by tossPairKey(teamA, teamB) with the
   * winning team id as value. Only consulted when points and game difference
   * are both level.
   */
  tossWinners?: Record<string, string>;
}

/** `submittedBy` markers so a team's absence can be undone precisely. */
const WALKOVER_BY_ADMIN = 'Walkover (admin)';
const WALKOVER_BY_ABSENCE = 'Walkover (team did not come)';

/** Order-independent key for a pair of teams in the toss table. */
function tossPairKey(teamA: string, teamB: string): string {
  return [teamA, teamB].sort().join('|');
}

/**
 * Current storage format.
 * v2: group stage matches each stay on their group's single dedicated court.
 * v3: tournament roster replaced with the official player pairings.
 * v4: 8-team knockout - 5 group winners + 3 wildcard runners-up.
 * v5: group stage scores 3 points for a win and 0 for a loss.
 * v6: the destructive "Reset Demo" was removed. Saves still carrying the old
 *     sample roster are rebuilt with the official roster and fixture list.
 * v7: player change in Group D - "Ameen / Aflah" is now "Ameen / Abdu".
 */
const FORMAT_VERSION = 7;

/**
 * v7 migration: Aflah was replaced by Abdu as Ameen's partner. Renames the
 * player in the roster and in the live draw's pair list (which keeps its own
 * copy of the names). Matches only the exact "Ameen" + "Aflah" pairing, so a
 * pairing an admin has already edited is left alone. Team ids are unchanged,
 * so every match, result and standing carries over as it is.
 */
function applyPlayerRenameV7(state: any) {
  const same = (a: unknown, b: string) =>
    typeof a === 'string' && a.trim().toLowerCase() === b.toLowerCase();
  const rename = (pair: { player1?: string; player2?: string; name?: string }) => {
    const isPairing =
      (same(pair.player1, 'Ameen') && same(pair.player2, 'Aflah')) ||
      (same(pair.player1, 'Aflah') && same(pair.player2, 'Ameen'));
    if (!isPairing) return;
    if (same(pair.player1, 'Aflah')) pair.player1 = 'Abdu';
    if (same(pair.player2, 'Aflah')) pair.player2 = 'Abdu';
    if (typeof pair.name === 'string') pair.name = `${pair.player1} / ${pair.player2}`;
  };

  if (Array.isArray(state.teams)) state.teams.forEach(rename);
  if (Array.isArray(state.draw?.pairs)) state.draw.pairs.forEach(rename);
}

/**
 * v6 migration: the admin "Reset Demo" button used to overwrite the tournament
 * with a stale sample roster. Any save that still holds that sample roster
 * (detected by team-a2, which the old sample called "Abdullah Othman" and the
 * official roster calls "Hadi") is rebuilt from the official seed data: the
 * real 20 pairings, the official 30-match fixture list, an emptied knockout
 * bracket and a fresh draw.
 *
 * Saves that already hold the official roster are left completely untouched,
 * so real live scores on the correct schedule are never discarded.
 */
function applyOfficialScheduleV6(state: any): boolean {
  if (!Array.isArray(state.teams)) return false;

  const legacyA2 = state.teams.find((t: Team) => t.id === 'team-a2');
  if (!legacyA2 || legacyA2.player1 !== 'Abdullah Othman') return false;

  const groups = [...INITIAL_GROUPS];
  const courts =
    Array.isArray(state.courts) && state.courts.length > 0 ? state.courts : [...INITIAL_COURTS];
  const teams = [...INITIAL_TEAMS];

  state.groups = groups;
  state.teams = teams;
  state.matches = generateInitialMatches(groups, teams, courts);
  state.draw = createInitialDraw(pairsFromTeams(teams));
  return true;
}

/** True when bylaw §4 cannot separate two teams without a live toss. */
function levelOnPointsAndDiff(a: StandingsRow, b: StandingsRow): boolean {
  return a.points === b.points && a.scoreDiff === b.scoreDiff;
}

/**
 * Standings ordering per bylaw §4: points -> overall game difference -> live
 * toss. Teams still level with no toss recorded fall back to name order for a
 * stable display only; they are flagged with `tossPending` (see markTossPending).
 */
function compareStandingsRows(
  a: StandingsRow,
  b: StandingsRow,
  tossWinners: Record<string, string> = {}
): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.scoreDiff !== a.scoreDiff) return b.scoreDiff - a.scoreDiff;
  const tossWinner = tossWinners[tossPairKey(a.teamId, b.teamId)];
  if (tossWinner === a.teamId) return -1;
  if (tossWinner === b.teamId) return 1;
  return a.teamName.localeCompare(b.teamName);
}

/**
 * Flag teams that need a live toss. A toss only matters across a "cut": the
 * line between index cut-1 and cut (e.g. between 1st and 2nd in a group).
 * When the teams either side of a cut are level, every team level with them
 * joins the toss, and neighbours still unresolved by a recorded toss are flagged.
 */
function markTossPending(
  sortedRows: StandingsRow[],
  label: string,
  tossWinners: Record<string, string>,
  cuts: number[]
) {
  for (const cut of cuts) {
    const above = sortedRows[cut - 1];
    const below = sortedRows[cut];
    if (!above || !below || !levelOnPointsAndDiff(above, below)) continue;

    const level = sortedRows.filter((row) => levelOnPointsAndDiff(row, below));
    for (let i = 0; i < level.length - 1; i++) {
      const a = level[i];
      const b = level[i + 1];
      if (tossWinners[tossPairKey(a.teamId, b.teamId)]) continue;
      a.tossPending ??= label;
      b.tossPending ??= label;
    }
  }
}

/**
 * v5 migration: losing a group match no longer earns a point. Only wins score.
 */
function applyPointsForLossV5(state: any) {
  if (!state.settings?.scoring) return;
  state.settings.scoring.pointsForLoss = 0;
}

/**
 * v4 migration: the knockout bracket only has 8 slots, so qualification is the
 * group winners plus the best runners-up - not 2 from every group (which gave
 * 10 teams for a 8-team bracket).
 */
function applyQualificationFormatV4(state: any) {
  if (!state.settings?.scoring) return;
  state.settings.scoring.qualifiersPerGroup = 1;
  state.settings.scoring.wildcardQualifiers = 3;
}

/**
 * v3 migration: the roster was replaced with the official player pairings.
 * Re-sync saved teams (by id) so the new names show up without a demo reset.
 * Teams created in the admin panel have ids not in the seed and are left alone.
 */
function applyRosterV3(state: any) {
  if (!Array.isArray(state.teams)) return;
  const roster = new Map(INITIAL_TEAMS.map((t) => [t.id, t]));

  state.teams.forEach((team: Team) => {
    const seed = roster.get(team.id);
    if (!seed) return;
    team.name = seed.name;
    team.player1 = seed.player1;
    team.player2 = seed.player2;
  });
}

/**
 * v2 migration: group stage rule - a group plays ALL of its round-robin
 * matches on one dedicated court, so groups are never split across courts.
 * Saves written before v2 distributed group matches over several courts.
 */
function applyGroupCourtDedication(state: any) {
  const courts: Court[] = state.courts || [];
  if (courts.length === 0 || !Array.isArray(state.matches)) return;

  const groups: Group[] = [...(state.groups || [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );

  groups.forEach((group, gIdx) => {
    const court = courts[gIdx % courts.length];
    if (!court) return;
    state.matches.forEach((m: Match) => {
      if (m.stage === 'knockout' || m.groupId === 'knockout') return;
      if (m.groupId !== group.id) return;
      m.courtId = court.id;
    });
  });
}

class TournamentStore {
  private state!: TournamentState;
  private readonly persistence: StatePersistence<TournamentState>;
  private persistenceQueue: Promise<void> = Promise.resolve();
  private persistenceError: unknown = null;
  private sseClients: Set<(data: string) => void> = new Set();

  constructor() {
    this.persistence = createStatePersistence<TournamentState>();
  }

  /** Load the authoritative state before accepting HTTP requests. */
  public async initialize(): Promise<void> {
    const saved = await this.persistence.load();
    if (saved) {
      this.assertValidState(saved);
      this.state = saved;
      if (this.migrateLoadedState()) await this.persistence.save(this.state);
      return;
    }

    // Only construct seed state when the selected storage has no saved row/file.
    // Supabase initialization is an atomic insert-if-absent operation.
    const seed = this.createInitialState();
    this.state = await this.persistence.initialize(seed);
    this.assertValidState(this.state);
    if (this.migrateLoadedState()) await this.persistence.save(this.state);
  }

  private createInitialState(): TournamentState {
    const initialAdminPassword = process.env.INITIAL_ADMIN_PASSWORD;
    const initialScorekeeperPin = process.env.INITIAL_SCOREKEEPER_PIN;
    if (process.env.NODE_ENV === 'production' && (!initialAdminPassword || !initialScorekeeperPin)) {
      throw new Error(
        'INITIAL_ADMIN_PASSWORD and INITIAL_SCOREKEEPER_PIN must be set before creating production tournament state.'
      );
    }

    const groups = [...INITIAL_GROUPS];
    const courts = [...INITIAL_COURTS];
    const teams = [...INITIAL_TEAMS];
    const matches = generateInitialMatches(groups, teams, courts);

    return {
      settings: {
        ...DEFAULT_SETTINGS,
        adminPasswordHash: initialAdminPassword || 'admin123',
        scorekeeperPin: initialScorekeeperPin || 'padel2026',
      },
      groups,
      teams,
      courts,
      matches,
      lastUpdated: new Date().toISOString(),
      formatVersion: FORMAT_VERSION,
      draw: createInitialDraw(pairsFromTeams(teams)),
    };
  }

  private assertValidState(state: any): asserts state is TournamentState {
    if (
      !state ||
      !state.settings ||
      !Array.isArray(state.groups) ||
      !Array.isArray(state.teams) ||
      !Array.isArray(state.courts) ||
      !Array.isArray(state.matches)
    ) {
      throw new Error('Saved tournament state is invalid; refusing to replace it with seed data.');
    }
  }

  /** Apply existing in-place migrations and report if persistence is needed. */
  private migrateLoadedState(): boolean {
    let changed = false;
    const state = this.state as any;
    const hasKnockout = state.matches.some((m: any) => m.stage === 'knockout');
    if (!hasKnockout) {
      const seedMatches = generateInitialMatches(state.groups, state.teams, state.courts || INITIAL_COURTS);
      state.matches.push(...seedMatches.filter((m) => m.stage === 'knockout'));
      changed = true;
    }

    const fromVersion: number = state.formatVersion ?? 1;
    if (fromVersion < FORMAT_VERSION) {
      // v6 first: it inspects the raw roster, which older migrations rewrite.
      if (fromVersion < 6) applyOfficialScheduleV6(state);
      if (fromVersion < 2) applyGroupCourtDedication(state);
      if (fromVersion < 3) applyRosterV3(state);
      if (fromVersion < 4) applyQualificationFormatV4(state);
      if (fromVersion < 5) applyPointsForLossV5(state);
      if (fromVersion < 7) applyPlayerRenameV7(state);
      state.formatVersion = FORMAT_VERSION;
      changed = true;
    }

    if (!state.draw) {
      state.draw = createInitialDraw(pairsFromTeams(state.teams || INITIAL_TEAMS));
      changed = true;
    }

    if (!state.settings.adminPasswordHash || !state.settings.scorekeeperPin) {
      const initialAdminPassword = process.env.INITIAL_ADMIN_PASSWORD;
      const initialScorekeeperPin = process.env.INITIAL_SCOREKEEPER_PIN;
      if (
        process.env.NODE_ENV === 'production' &&
        ((!state.settings.adminPasswordHash && !initialAdminPassword) ||
          (!state.settings.scorekeeperPin && !initialScorekeeperPin))
      ) {
        throw new Error('Missing saved admin credentials; set the corresponding INITIAL_* secret.');
      }
      state.settings.adminPasswordHash ||= initialAdminPassword || 'admin123';
      state.settings.scorekeeperPin ||= initialScorekeeperPin || 'padel2026';
      changed = true;
    }

    return changed;
  }

  private persist() {
    // Snapshot immediately so queued writes cannot observe later in-memory
    // mutations and overtake one another.
    const snapshot = JSON.parse(JSON.stringify(this.state)) as TournamentState;
    const write = async () => {
      try {
        await this.persistence.save(snapshot);
        this.persistenceError = null;
      } catch (error) {
        this.persistenceError = error;
        console.error('Failed to persist tournament state.', error);
      }
    };
    this.persistenceQueue = this.persistenceQueue.then(write, write);
  }

  /** Await queued saves before confirming an HTTP mutation to its caller. */
  public async flushPersistence(): Promise<void> {
    await this.persistenceQueue;
    if (this.persistenceError) {
      throw new Error('Unable to persist tournament state.', { cause: this.persistenceError });
    }
  }

  private notifyUpdates() {
    this.state.settings.version += 1;
    this.state.lastUpdated = new Date().toISOString();
    this.persist();

    const payload = JSON.stringify({
      version: this.state.settings.version,
      lastUpdated: this.state.lastUpdated,
    });

    // Do not announce a mutation to spectators until the durable adapter has
    // confirmed it. The per-request response middleware also awaits this save.
    void this.flushPersistence()
      .then(() => {
        for (const client of this.sseClients) {
          try {
            client(payload);
          } catch {
            // client may have closed
          }
        }
      })
      .catch(() => {
        // The mutation endpoint reports the storage error to its caller.
      });
  }

  public registerSSE(client: (data: string) => void): () => void {
    this.sseClients.add(client);
    return () => {
      this.sseClients.delete(client);
    };
  }

  public getState() {
    return this.state;
  }

  /* ---------------------------------------------------------------- */
  /* Authoritative scoring (event-sourced)                             */
  /* ---------------------------------------------------------------- */

  /** All matches as a lookup map, for batch event application. */
  public getMatchMap(): Map<string, Match> {
    return new Map(this.state.matches.map((m) => [m.id, m]));
  }

  /**
   * Apply an already-validated batch of score events to the matches they target.
   * The caller must then call commitScoreChanges() to persist + broadcast.
   */
  public applyScoreEvents(
    events: ScoreEvent[],
    options: ApplyEventOptions = {}
  ): {
    results: ScoreEventResult[];
    changedMatchIds: string[];
    finalisedMatchIds: string[];
  } {
    const { results, changedMatches, finalisedMatches } = applyScoreEventBatch(
      this.getMatchMap(),
      events,
      options
    );
    return {
      results,
      changedMatchIds: changedMatches.map((m) => m.id),
      finalisedMatchIds: finalisedMatches.map((m) => m.id),
    };
  }

  /**
   * Apply knockout advancement for a match finalised through the event path.
   * Reuses the exact same advancement rules as submitScore().
   */
  public advanceKnockoutForMatch(matchId: string): void {
    const match = this.state.matches.find((m) => m.id === matchId);
    if (!match || match.stage !== 'knockout') return;
    if (match.team1Score === null || match.team2Score === null) return;

    const winnerId = match.team1Score > match.team2Score ? match.team1Id : match.team2Id;
    const loserId = match.team1Score > match.team2Score ? match.team2Id : match.team1Id;

    if (match.nextMatchId && match.nextMatchSlot) {
      const nextMatch = this.state.matches.find((m) => m.id === match.nextMatchId);
      if (nextMatch) {
        if (match.nextMatchSlot === 'team1') nextMatch.team1Id = winnerId;
        else if (match.nextMatchSlot === 'team2') nextMatch.team2Id = winnerId;
      }
    }

    if (match.loserNextMatchId && match.loserNextMatchSlot) {
      const loserNextMatch = this.state.matches.find((m) => m.id === match.loserNextMatchId);
      if (loserNextMatch) {
        if (match.loserNextMatchSlot === 'team1') loserNextMatch.team1Id = loserId;
        else if (match.loserNextMatchSlot === 'team2') loserNextMatch.team2Id = loserId;
      }
    }
  }

  /** Persist and broadcast after one or more score events changed matches. */
  public commitScoreChanges(): void {
    this.notifyUpdates();
  }

  /* ---------------------------------------------------------------- */
  /* Live Group Draw                                                   */
  /* ---------------------------------------------------------------- */

  /** The authoritative draw state (created on demand for safety). */
  public getDraw(): DrawStateRecord {
    if (!this.state.draw) {
      this.state.draw = createInitialDraw(pairsFromTeams(this.state.teams));
    }
    return this.state.draw;
  }

  /** Persist + broadcast the current draw state to every connected viewer. */
  public commitDraw(): DrawStateRecord {
    this.notifyUpdates();
    return this.state.draw!;
  }

  public getSettings(): TournamentSettings {
    return this.state.settings;
  }

  public updateSettings(partial: Partial<TournamentSettings>): TournamentSettings {
    this.state.settings = {
      ...this.state.settings,
      ...partial,
      scoring: {
        ...this.state.settings.scoring,
        ...(partial.scoring || {}),
      },
    };
    this.notifyUpdates();
    return this.state.settings;
  }

  public getGroups(): Group[] {
    return this.state.groups.sort((a, b) => a.order - b.order);
  }

  public setGroups(groups: Group[]): Group[] {
    this.state.groups = groups;
    this.notifyUpdates();
    return this.state.groups;
  }

  public getCourts(): Court[] {
    return this.state.courts.sort((a, b) => a.order - b.order);
  }

  public setCourts(courts: Court[]): Court[] {
    this.state.courts = courts;
    this.notifyUpdates();
    return this.state.courts;
  }

  public getTeams(): Team[] {
    return this.state.teams;
  }

  public addTeam(team: Omit<Team, 'id'> & { id?: string }): Team {
    const newTeam: Team = {
      id: team.id || `team-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      name: team.name.trim(),
      player1: team.player1.trim(),
      player2: team.player2.trim(),
      groupId: team.groupId,
    };
    this.state.teams.push(newTeam);
    this.notifyUpdates();
    return newTeam;
  }

  public updateTeam(id: string, updates: Partial<Team>): Team | null {
    const idx = this.state.teams.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    this.state.teams[idx] = { ...this.state.teams[idx], ...updates };
    this.notifyUpdates();
    return this.state.teams[idx];
  }

  public deleteTeam(id: string): boolean {
    const idx = this.state.teams.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    this.state.teams.splice(idx, 1);
    // Remove references in matches or mark cancelled
    this.state.matches = this.state.matches.filter(
      (m) => m.team1Id !== id && m.team2Id !== id
    );
    this.notifyUpdates();
    return true;
  }

  public getMatches(): Match[] {
    return this.state.matches.sort((a, b) => a.matchNumber - b.matchNumber);
  }

  public updateMatch(id: string, updates: Partial<Match>): Match | null {
    const idx = this.state.matches.findIndex((m) => m.id === id);
    if (idx === -1) return null;
    const match = { ...this.state.matches[idx], ...updates };
    this.state.matches[idx] = match;
    // A finished knockout result entered here (admin match edit) moves the
    // winner and loser on exactly like submitScore(). A level score has no
    // winner, so nobody moves.
    if (match.status === 'completed' && match.team1Score !== match.team2Score) {
      this.advanceKnockoutForMatch(id);
    }
    this.notifyUpdates();
    return match;
  }

  public submitScore(params: {
    matchId: string;
    team1Score: number;
    team2Score: number;
    submittedBy?: string;
    isAdminOverride?: boolean;
    padelState?: any;
    scoreSummary?: string;
  }): { success: boolean; match?: Match; error?: string; nextMatch?: Match | null } {
    const { matchId, team1Score, team2Score, submittedBy, isAdminOverride, padelState, scoreSummary } = params;

    const match = this.state.matches.find((m) => m.id === matchId);
    if (!match) {
      return { success: false, error: 'Match not found.' };
    }

    if (match.status === 'completed' && !isAdminOverride) {
      return {
        success: false,
        error: 'This match has already been submitted and completed. Contact an admin to modify.',
      };
    }

    if (
      typeof team1Score !== 'number' ||
      typeof team2Score !== 'number' ||
      isNaN(team1Score) ||
      isNaN(team2Score)
    ) {
      return { success: false, error: 'Scores must be valid numbers.' };
    }

    if (team1Score < 0 || team2Score < 0) {
      return { success: false, error: 'Scores cannot be negative.' };
    }

    if (!this.state.settings.scoring.allowDraws && team1Score === team2Score) {
      return { success: false, error: 'Padel matches cannot end in a draw. A winner is required.' };
    }

    // First to 6 games, no tiebreak: only 6-0 ... 6-5 either way round.
    const formatError = finalScoreError(team1Score, team2Score);
    if (formatError) {
      return { success: false, error: formatError };
    }

    const completedAt = new Date().toISOString();
    match.team1Score = team1Score;
    match.team2Score = team2Score;
    match.status = 'completed';
    match.completedAt = completedAt;
    match.matchVersion = (match.matchVersion ?? 0) + 1;
    // A typed result replaces any earlier walkover, and its "submitted by"
    // marker, so undoing a team's absence never clears this result.
    delete match.walkover;
    if (submittedBy) match.submittedBy = submittedBy;
    else delete match.submittedBy;
    // Standings read games from padelState, so a result entered without one
    // (or correcting an earlier one) must not leave the old games behind.
    match.padelState = padelState || {
      matchId: match.id,
      team1Games: team1Score,
      team2Games: team2Score,
      team1Points: 0,
      team2Points: 0,
      isGoldenPoint: false,
      isMatchOver: true,
      winnerTeamId: team1Score > team2Score ? 'team1' : 'team2',
      lastEventMessage: `Match Completed (${team1Score} - ${team2Score})`,
      history: [],
      completedAt,
    };
    match.scoreSummary = scoreSummary || `${team1Score} - ${team2Score}`;

    // Knockout Winner & Loser Advancement
    if (match.stage === 'knockout') {
      const winnerId = team1Score > team2Score ? match.team1Id : match.team2Id;
      const loserId = team1Score > team2Score ? match.team2Id : match.team1Id;

      if (match.nextMatchId && match.nextMatchSlot) {
        const nextMatch = this.state.matches.find((m) => m.id === match.nextMatchId);
        if (nextMatch) {
          if (match.nextMatchSlot === 'team1') nextMatch.team1Id = winnerId;
          else if (match.nextMatchSlot === 'team2') nextMatch.team2Id = winnerId;
        }
      }

      if (match.loserNextMatchId && match.loserNextMatchSlot) {
        const loserNextMatch = this.state.matches.find((m) => m.id === match.loserNextMatchId);
        if (loserNextMatch) {
          if (match.loserNextMatchSlot === 'team1') loserNextMatch.team1Id = loserId;
          else if (match.loserNextMatchSlot === 'team2') loserNextMatch.team2Id = loserId;
        }
      }
    }

    // Find next match for this court
    let nextMatch: Match | null = null;
    if (match.courtId) {
      const courtMatches = this.state.matches.filter(
        (m) => m.courtId === match.courtId && m.id !== match.id && m.status !== 'completed' && m.status !== 'cancelled'
      );
      if (courtMatches.length > 0) {
        nextMatch = courtMatches[0];
        // If it was scheduled, elevate to ready
        if (nextMatch.status === 'scheduled') {
          nextMatch.status = 'ready';
        }
      }
    }

    this.notifyUpdates();
    return { success: true, match, nextMatch };
  }

  /**
   * Clear the score/state of every non-cancelled match and return it to the
   * scheduled pre-play state. Used by the scorekeeper's "Reset All Games"
   * action. Broadcasts a version bump so spectator screens refresh instantly.
   *
   * SCOPE — the schedule is left exactly as-is: court assignment (`courtId`),
   * start time (`scheduledTime`), match order/number, stage/round and bracket
   * position are all preserved. Only the recorded result is cleared
   * (`team1Score`/`team2Score`/`padelState`/`scoreSummary`/completion metadata),
   * the event log is emptied, and the match is returned to `scheduled`.
   *
   * Knockout matches additionally have their team slots cleared, so the bracket
   * shows TBD again ready to be re-seeded from the (now empty) group standings.
   */
  public resetAllMatchScores(): { matchesReset: number; knockoutReset: number } {
    let matchesReset = 0;
    let knockoutReset = 0;
    for (const match of this.state.matches) {
      if (match.status === 'cancelled') continue;

      match.team1Score = null;
      match.team2Score = null;
      delete match.padelState;
      delete match.scoreSummary;
      delete match.completedAt;
      delete match.submittedBy;
      delete match.seqLog;
      delete match.walkover;
      match.matchVersion = 0;
      match.status = 'scheduled';

      // Knockout bracket: drop advanced teams so every slot shows TBD again.
      // The match itself (court, time, order, round) stays on the schedule.
      if (match.stage === 'knockout' || match.groupId === 'knockout') {
        match.team1Id = '';
        match.team2Id = '';
        knockoutReset++;
      }

      matchesReset++;
    }

    // Toss results belong to the old standings.
    this.state.tossWinners = {};
    // Absence walkovers were just cleared, so every team is back in.
    for (const team of this.state.teams) delete team.withdrawn;

    this.notifyUpdates();
    return { matchesReset, knockoutReset };
  }

  /**
   * Record a live toss (bylaw §4): `winnerId` won against every team in
   * `loserIds`. For a 3-way tie, record the first toss winner against both
   * others, then the next toss between the remaining two.
   */
  public recordToss(winnerId: string, loserIds: string[]): boolean {
    const known = new Set(this.state.teams.map((t) => t.id));
    const losers = loserIds.filter((id) => id !== winnerId && known.has(id));
    if (!known.has(winnerId) || losers.length === 0) return false;

    const tossWinners = { ...(this.state.tossWinners || {}) };
    for (const loserId of losers) {
      tossWinners[tossPairKey(winnerId, loserId)] = winnerId;
    }
    this.state.tossWinners = tossWinners;
    this.notifyUpdates();
    return true;
  }

  /** Forget every recorded toss result. */
  public clearTosses(): void {
    this.state.tossWinners = {};
    this.notifyUpdates();
  }

  /**
   * Walkover (bylaw §6). 'team1'/'team2' records a 6-0 win for that side;
   * 'both' records a loss for both teams with no games; null clears the W/O
   * and returns the match to scheduled.
   */
  public setWalkover(matchId: string, outcome: 'team1' | 'team2' | 'both' | null): Match | null {
    const match = this.state.matches.find((m) => m.id === matchId);
    if (!match) return null;
    this.applyWalkover(match, outcome, WALKOVER_BY_ADMIN);
    this.notifyUpdates();
    return match;
  }

  /**
   * Mark a team as not coming (or back again). Every unplayed match of the
   * team becomes a 6-0 walkover to its opponent (or 'both' if the opponent is
   * also absent). Results already played are kept. Undoing it clears only the
   * walkovers this action created.
   */
  public setTeamWithdrawn(teamId: string, withdrawn: boolean): { team: Team; matchesChanged: number } | null {
    const team = this.state.teams.find((t) => t.id === teamId);
    if (!team) return null;

    if (withdrawn) team.withdrawn = true;
    else delete team.withdrawn;

    const isAbsent = (id: string) => !!this.state.teams.find((t) => t.id === id)?.withdrawn;
    let matchesChanged = 0;

    for (const match of this.state.matches) {
      const side = match.team1Id === teamId ? 'team1' : match.team2Id === teamId ? 'team2' : null;
      if (!side) continue;
      const opponentId = side === 'team1' ? match.team2Id : match.team1Id;
      if (!opponentId) continue; // knockout slot not decided yet
      const opponentSide = side === 'team1' ? 'team2' : 'team1';

      if (withdrawn) {
        // Only unplayed matches change; finished results stay on the board.
        if (match.status === 'completed' || match.status === 'cancelled') {
          // ...unless it is a walkover this same action created earlier, where
          // the opponent may now also be absent.
          if (match.submittedBy !== WALKOVER_BY_ABSENCE) continue;
        }
        this.applyWalkover(match, isAbsent(opponentId) ? 'both' : opponentSide, WALKOVER_BY_ABSENCE);
        matchesChanged++;
      } else {
        if (match.submittedBy !== WALKOVER_BY_ABSENCE) continue;
        // Opponent still absent: this team now wins by walkover instead.
        this.applyWalkover(match, isAbsent(opponentId) ? side : null, WALKOVER_BY_ABSENCE);
        matchesChanged++;
      }
    }

    this.notifyUpdates();
    return { team, matchesChanged };
  }

  /** Apply (or clear, with null) a walkover on one match without persisting. */
  private applyWalkover(
    match: Match,
    outcome: 'team1' | 'team2' | 'both' | null,
    submittedBy: string
  ): void {
    const now = new Date().toISOString();
    delete match.seqLog;
    match.matchVersion = (match.matchVersion ?? 0) + 1;

    if (outcome === null) {
      delete match.walkover;
      delete match.padelState;
      delete match.scoreSummary;
      delete match.completedAt;
      delete match.submittedBy;
      match.team1Score = null;
      match.team2Score = null;
      match.status = 'scheduled';
      return;
    }

    match.walkover = outcome;
    match.status = 'completed';
    match.completedAt = now;
    match.submittedBy = submittedBy;

    if (outcome === 'both') {
      match.team1Score = 0;
      match.team2Score = 0;
      match.scoreSummary = 'W/O (both absent)';
      delete match.padelState;
      return;
    }

    const team1Won = outcome === 'team1';
    match.team1Score = team1Won ? 6 : 0;
    match.team2Score = team1Won ? 0 : 6;
    match.scoreSummary = 'W/O';
    match.padelState = {
      matchId: match.id,
      team1Games: match.team1Score,
      team2Games: match.team2Score,
      team1Points: 0,
      team2Points: 0,
      isGoldenPoint: false,
      isMatchOver: true,
      winnerTeamId: outcome,
      lastEventMessage: 'Walkover',
      history: [],
      completedAt: now,
    };

    this.advanceKnockoutForMatch(match.id);
  }

  public calculateStandings(): Record<string, StandingsRow[]> {
    const { scoring } = this.state.settings;
    const result: Record<string, StandingsRow[]> = {};
    const tossWinners = this.state.tossWinners || {};
    const byBylaw = (a: StandingsRow, b: StandingsRow) => compareStandingsRows(a, b, tossWinners);
    const isUnplayed = (m: Match) => m.status !== 'completed' && m.status !== 'cancelled';
    const isGroupComplete = (groupId: string) => {
      const groupMatches = this.state.matches.filter((m) => m.groupId === groupId);
      return groupMatches.length > 0 && !groupMatches.some(isUnplayed);
    };
    // Most points one match can still add, for "can anyone catch them?" checks.
    const maxPointsPerMatch = Math.max(
      scoring.pointsForWin,
      scoring.pointsForLoss,
      scoring.allowDraws ? scoring.pointsForDraw ?? 0 : 0
    );
    const wildcardSlots = scoring.wildcardQualifiers || 0;
    // Group places that can still lead to the quarter-finals: the direct
    // qualifiers, plus the runner-up spot when runners-up can take a wildcard.
    const contendingPlaces = scoring.qualifiersPerGroup + (wildcardSlots > 0 ? 1 : 0);
    let allGroupsComplete = true;

    this.state.groups.forEach((group) => {
      const gTeams = this.state.teams.filter((t) => t.groupId === group.id);
      const gMatches = this.state.matches.filter(
        (m) => m.groupId === group.id && m.status === 'completed'
      );

      const rows: StandingsRow[] = gTeams.map((team) => {
        let matchesPlayed = 0;
        let wins = 0;
        let losses = 0;
        let points = 0;
        let gamesWon = 0;
        let gamesLost = 0;

        gMatches.forEach((m) => {
          // Neither team reported (bylaw §6): both take a loss, no games.
          if (m.walkover === 'both') {
            if (m.team1Id === team.id || m.team2Id === team.id) {
              matchesPlayed++;
              losses++;
              points += scoring.pointsForLoss;
            }
            return;
          }
          if (m.team1Score === null || m.team2Score === null) return;

          // In first-to-6-games simplified format, score is the games count (e.g. 6-4 or 6-5)
          const t1Games = m.padelState?.team1Games !== undefined ? m.padelState.team1Games : (m.team1Score ?? 0);
          const t2Games = m.padelState?.team2Games !== undefined ? m.padelState.team2Games : (m.team2Score ?? 0);
          
          let team1WonMatch = t1Games > t2Games;
          if (m.padelState?.winnerTeamId) {
            team1WonMatch = m.padelState.winnerTeamId === 'team1';
          }

          if (m.team1Id === team.id) {
            matchesPlayed++;
            gamesWon += t1Games;
            gamesLost += t2Games;
            if (team1WonMatch) {
              wins++;
              points += scoring.pointsForWin;
            } else {
              losses++;
              points += scoring.pointsForLoss;
            }
          } else if (m.team2Id === team.id) {
            matchesPlayed++;
            gamesWon += t2Games;
            gamesLost += t1Games;
            if (!team1WonMatch) {
              wins++;
              points += scoring.pointsForWin;
            } else {
              losses++;
              points += scoring.pointsForLoss;
            }
          }
        });

        const scoreDiff = gamesWon - gamesLost;

        return {
          position: 0,
          teamId: team.id,
          teamName: team.name,
          player1: team.player1,
          player2: team.player2,
          groupId: group.id,
          matchesPlayed,
          wins,
          losses,
          points,
          gamesWon,
          gamesLost,
          scoreDiff,
          qualified: false,
        };
      });

      // Bylaw §4: points -> game difference -> live toss.
      rows.sort(byBylaw);
      rows.forEach((row, idx) => {
        row.position = idx + 1;
      });

      // Once the group is finished, a toss decides level teams for 1st place
      // (qualifies) and 2nd place (runner-up comparison). 3rd/4th don't matter.
      const groupComplete = isGroupComplete(group.id);
      if (groupComplete) {
        markTossPending(rows, `${group.name} position`, tossWinners, [
          scoring.qualifiersPerGroup,
          scoring.qualifiersPerGroup + 1,
        ]);
      } else {
        allGroupsComplete = false;
      }

      // Direct qualification (bylaw §3): the group winner, marked only once it
      // is certain - the group is finished with no toss pending, or too few
      // rivals can still reach this team's points to push it out.
      const unplayedGroupMatches = this.state.matches.filter(
        (m) => m.groupId === group.id && isUnplayed(m)
      );
      const maxPoints = (row: StandingsRow) =>
        row.points +
        unplayedGroupMatches.filter((m) => m.team1Id === row.teamId || m.team2Id === row.teamId).length *
          maxPointsPerMatch;
      rows.forEach((row) => {
        if (row.position > scoring.qualifiersPerGroup) return;
        const rivals = rows.filter((other) => other !== row && maxPoints(other) >= row.points).length;
        row.qualified = (groupComplete && !row.tossPending) || rivals < scoring.qualifiersPerGroup;
      });

      // Eliminated once the team can no longer finish in a contending place:
      // enough rivals already have more points than it can still reach, or
      // the group is finished and it ended below those places.
      rows.forEach((row) => {
        const outOfReach = rows.filter((other) => other !== row && other.points > maxPoints(row)).length;
        row.eliminated =
          outOfReach >= contendingPlaces ||
          (groupComplete && row.position > contendingPlaces && !row.tossPending);
      });

      result[group.id] = rows;
    });

    // Group winners, listed by record (quarter-final pairings are drawn by lot).
    const directQualifiers = this.state.groups
      .flatMap((group) => (result[group.id] || []).filter((row) => row.qualified))
      .sort(byBylaw);

    // Bylaw §3: the remaining places go to the best RUNNERS-UP only (the team
    // directly below the qualifying places in each group), never 3rd or 4th.
    const runnerUpPosition = scoring.qualifiersPerGroup + 1;
    const runnersUp = this.state.groups
      .map((group) => (result[group.id] || []).find((row) => row.position === runnerUpPosition))
      .filter((row): row is StandingsRow => !!row)
      .sort(byBylaw);
    const wildcards = runnersUp.slice(0, wildcardSlots);

    if (allGroupsComplete) {
      // Only the last qualifying runner-up place needs a toss; quarter-final
      // pairings are drawn by lot, so seeding order doesn't matter.
      markTossPending(runnersUp, 'Best runners-up', tossWinners, [wildcardSlots]);

      // Runners-up are compared across every group, so a wildcard place is
      // only certain once the whole group stage is over and no toss is pending.
      wildcards.forEach((row) => {
        row.qualified = !row.tossPending;
      });
      // Runners-up below the wildcard places miss out (bylaw §3), so a group
      // can end with only its winner going through.
      runnersUp.slice(wildcardSlots).forEach((row) => {
        row.eliminated = !row.tossPending;
      });
    }

    // Listing order for the qualified teams: group winners, then runners-up.
    [...directQualifiers, ...wildcards.filter((row) => row.qualified)].forEach((row, idx) => {
      row.qualificationRank = idx + 1;
    });

    return result;
  }

  /**
   * Quarter-final pairings drawn by lot at the venue. `pairs` holds the four
   * drawn matches in bracket order (QF1..QF4): QF1/QF2 winners meet in SF1,
   * QF3/QF4 winners in SF2. Only allowed before any quarter-final has started.
   * Semi-final, 3rd-place and final slots are cleared until QF results arrive.
   */
  public setQuarterFinalDraw(pairs: [string, string][]): { error?: string; matches?: Match[] } {
    if (!Array.isArray(pairs) || pairs.length !== 4) {
      return { error: 'Exactly 4 quarter-final pairings are required.' };
    }
    const ids = pairs.flat();
    const known = new Set(this.state.teams.map((t) => t.id));
    if (ids.length !== 8 || ids.some((id) => typeof id !== 'string' || !known.has(id))) {
      return { error: 'Every quarter-final slot needs a valid team.' };
    }
    if (new Set(ids).size !== 8) {
      return { error: 'Each team can only appear once in the quarter-final draw.' };
    }

    const findQf = (n: number) =>
      this.state.matches.find((m) => m.stage === 'knockout' && m.round === 'qf' && m.bracketPosition === n);

    // Create the knockout structure if it doesn't exist yet.
    if (![1, 2, 3, 4].every((n) => findQf(n))) {
      this.seedKnockoutFromStandings();
    }
    const qfs = [1, 2, 3, 4].map((n) => findQf(n)!);
    if (qfs.some((m) => !m)) return { error: 'Knockout bracket is missing quarter-final matches.' };

    const started = qfs.find((m) => m.status === 'live' || (m.status === 'completed' && !m.walkover));
    if (started) {
      return {
        error: `Quarter-final #${started.matchNumber} has already started. Reset its score before changing the draw.`,
      };
    }

    const isAbsent = (id: string) => !!this.state.teams.find((t) => t.id === id)?.withdrawn;
    const clearResult = (m: Match) => {
      m.team1Score = null;
      m.team2Score = null;
      m.status = 'scheduled';
      delete m.padelState;
      delete m.scoreSummary;
      delete m.completedAt;
      delete m.submittedBy;
      delete m.seqLog;
      delete m.walkover;
      m.matchVersion = (m.matchVersion ?? 0) + 1;
    };

    qfs.forEach((m, i) => {
      clearResult(m);
      m.team1Id = pairs[i][0];
      m.team2Id = pairs[i][1];
    });

    // Later rounds wait for the new quarter-final results.
    for (const m of this.state.matches) {
      if (m.stage === 'knockout' && m.round !== 'qf') {
        clearResult(m);
        m.team1Id = '';
        m.team2Id = '';
      }
    }

    // A team already marked as not coming loses its quarter-final by walkover.
    for (const m of qfs) {
      const absent1 = isAbsent(m.team1Id);
      const absent2 = isAbsent(m.team2Id);
      if (absent1 || absent2) {
        this.applyWalkover(
          m,
          absent1 && absent2 ? 'both' : absent1 ? 'team2' : 'team1',
          WALKOVER_BY_ABSENCE
        );
      }
    }

    this.notifyUpdates();
    return { matches: qfs };
  }

  public seedKnockoutFromStandings(): Match[] {
    const standings = this.calculateStandings();

    // Seeds are ordered by qualification rank: the group winners first, then
    // the wildcard runners-up that took the remaining bracket slots.
    const seeds = Object.values(standings)
      .flat()
      .filter((row) => row.qualified)
      .sort((a, b) => (a.qualificationRank ?? 999) - (b.qualificationRank ?? 999))
      .map((row) => row.teamId);

    this.state.matches = this.state.matches.filter((m) => m.stage !== 'knockout');
    let matchCounter = Math.max(...this.state.matches.map((m) => m.matchNumber), 0) + 1;
    const courts = this.getCourts();
    const fallbackTeams = this.getTeams().map((x) => x.id);

    // Standard 8-team bracket seeding: 1v8, 4v5, 3v6, 2v7
    const seed = (n: number): string =>
      seeds[n - 1] ||
      (fallbackTeams.length > 0 ? fallbackTeams[(n - 1) % fallbackTeams.length] : 'team-a1');

    const qf1T1 = seed(1);
    const qf1T2 = seed(8);
    const qf2T1 = seed(4);
    const qf2T2 = seed(5);
    const qf3T1 = seed(3);
    const qf3T2 = seed(6);
    const qf4T1 = seed(2);
    const qf4T2 = seed(7);

    const freshKoMatches: Match[] = [
      {
        id: 'match-ko-qf1',
        tournamentId: this.state.settings.id,
        groupId: 'knockout',
        stage: 'knockout',
        round: 'qf',
        bracketPosition: 1,
        nextMatchId: 'match-ko-sf1',
        nextMatchSlot: 'team1',
        matchNumber: matchCounter++,
        team1Id: qf1T1,
        team2Id: qf1T2,
        courtId: courts[0]?.id || null,
        scheduledTime: '14:00',
        status: 'scheduled',
        team1Score: null,
        team2Score: null,
      },
      {
        id: 'match-ko-qf2',
        tournamentId: this.state.settings.id,
        groupId: 'knockout',
        stage: 'knockout',
        round: 'qf',
        bracketPosition: 2,
        nextMatchId: 'match-ko-sf1',
        nextMatchSlot: 'team2',
        matchNumber: matchCounter++,
        team1Id: qf2T1,
        team2Id: qf2T2,
        courtId: courts[1]?.id || null,
        scheduledTime: '14:00',
        status: 'scheduled',
        team1Score: null,
        team2Score: null,
      },
      {
        id: 'match-ko-qf3',
        tournamentId: this.state.settings.id,
        groupId: 'knockout',
        stage: 'knockout',
        round: 'qf',
        bracketPosition: 3,
        nextMatchId: 'match-ko-sf2',
        nextMatchSlot: 'team1',
        matchNumber: matchCounter++,
        team1Id: qf3T1,
        team2Id: qf3T2,
        courtId: courts[2]?.id || null,
        scheduledTime: '14:45',
        status: 'scheduled',
        team1Score: null,
        team2Score: null,
      },
      {
        id: 'match-ko-qf4',
        tournamentId: this.state.settings.id,
        groupId: 'knockout',
        stage: 'knockout',
        round: 'qf',
        bracketPosition: 4,
        nextMatchId: 'match-ko-sf2',
        nextMatchSlot: 'team2',
        matchNumber: matchCounter++,
        team1Id: qf4T1,
        team2Id: qf4T2,
        courtId: courts[3]?.id || null,
        scheduledTime: '14:45',
        status: 'scheduled',
        team1Score: null,
        team2Score: null,
      },
      {
        id: 'match-ko-sf1',
        tournamentId: this.state.settings.id,
        groupId: 'knockout',
        stage: 'knockout',
        round: 'sf',
        bracketPosition: 1,
        nextMatchId: 'match-ko-final',
        nextMatchSlot: 'team1',
        loserNextMatchId: 'match-ko-3rd',
        loserNextMatchSlot: 'team1',
        matchNumber: matchCounter++,
        team1Id: '',
        team2Id: '',
        courtId: courts[0]?.id || null,
        scheduledTime: '15:45',
        status: 'scheduled',
        team1Score: null,
        team2Score: null,
      },
      {
        id: 'match-ko-sf2',
        tournamentId: this.state.settings.id,
        groupId: 'knockout',
        stage: 'knockout',
        round: 'sf',
        bracketPosition: 2,
        nextMatchId: 'match-ko-final',
        nextMatchSlot: 'team2',
        loserNextMatchId: 'match-ko-3rd',
        loserNextMatchSlot: 'team2',
        matchNumber: matchCounter++,
        team1Id: '',
        team2Id: '',
        courtId: courts[1]?.id || null,
        scheduledTime: '15:45',
        status: 'scheduled',
        team1Score: null,
        team2Score: null,
      },
      {
        id: 'match-ko-3rd',
        tournamentId: this.state.settings.id,
        groupId: 'knockout',
        stage: 'knockout',
        round: '3rd',
        bracketPosition: 1,
        matchNumber: matchCounter++,
        team1Id: '',
        team2Id: '',
        courtId: courts[1]?.id || null,
        scheduledTime: '16:45',
        status: 'scheduled',
        team1Score: null,
        team2Score: null,
      },
      {
        id: 'match-ko-final',
        tournamentId: this.state.settings.id,
        groupId: 'knockout',
        stage: 'knockout',
        round: 'final',
        bracketPosition: 1,
        matchNumber: matchCounter++,
        team1Id: '',
        team2Id: '',
        courtId: courts[0]?.id || null,
        scheduledTime: '17:30',
        status: 'scheduled',
        team1Score: null,
        team2Score: null,
      },
    ];

    this.state.matches.push(...freshKoMatches);
    this.notifyUpdates();
    return this.state.matches;
  }
}

export const tournamentStore = new TournamentStore();
