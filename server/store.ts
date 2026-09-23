import fs from 'fs';
import path from 'path';
import { Group, Team, Court, Match, TournamentSettings, StandingsRow } from '../src/types';
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
}

/**
 * Current storage format.
 * v2: group stage matches each stay on their group's single dedicated court.
 * v3: tournament roster replaced with the official player pairings.
 * v4: 8-team knockout - 5 group winners + 3 wildcard runners-up.
 * v5: group stage scores 3 points for a win and 0 for a loss.
 */
const FORMAT_VERSION = 5;

/** Shared standings ordering: points -> game diff -> games won -> pairing. */
function compareStandingsRows(a: StandingsRow, b: StandingsRow): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.scoreDiff !== a.scoreDiff) return b.scoreDiff - a.scoreDiff;
  if (b.gamesWon !== a.gamesWon) return b.gamesWon - a.gamesWon;
  return a.teamName.localeCompare(b.teamName);
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

const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'tournament_state.json');

class TournamentStore {
  private state: TournamentState;
  private sseClients: Set<(data: string) => void> = new Set();

  constructor() {
    this.state = this.loadOrInitializeState();
  }

  private loadOrInitializeState(): TournamentState {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const raw = fs.readFileSync(STATE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.groups && parsed.teams && parsed.matches) {
          const hasKnockout = parsed.matches.some((m: any) => m.stage === 'knockout');
          if (!hasKnockout) {
            const seedMatches = generateInitialMatches(parsed.groups, parsed.teams, parsed.courts || INITIAL_COURTS);
            const koOnly = seedMatches.filter((m) => m.stage === 'knockout');
            parsed.matches.push(...koOnly);
          }

          // One-time migrations for saves written by an older format.
          const fromVersion: number = parsed.formatVersion ?? 1;
          if (fromVersion < FORMAT_VERSION) {
            if (fromVersion < 2) applyGroupCourtDedication(parsed);
            if (fromVersion < 3) applyRosterV3(parsed);
            if (fromVersion < 4) applyQualificationFormatV4(parsed);
            if (fromVersion < 5) applyPointsForLossV5(parsed);
            parsed.formatVersion = FORMAT_VERSION;
            this.persist(parsed);
          }

          return parsed;
        }
      }
    } catch (err) {
      console.error('Failed reading tournament state, re-initializing seed data:', err);
    }

    const groups = [...INITIAL_GROUPS];
    const courts = [...INITIAL_COURTS];
    const teams = [...INITIAL_TEAMS];
    const matches = generateInitialMatches(groups, teams, courts);

    const initialState: TournamentState = {
      settings: { ...DEFAULT_SETTINGS },
      groups,
      teams,
      courts,
      matches,
      lastUpdated: new Date().toISOString(),
      formatVersion: FORMAT_VERSION,
    };

    this.persist(initialState);
    return initialState;
  }

  private persist(state: TournamentState) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error writing tournament state file:', err);
    }
  }

  private notifyUpdates() {
    this.state.settings.version += 1;
    this.state.lastUpdated = new Date().toISOString();
    this.persist(this.state);

    const payload = JSON.stringify({
      version: this.state.settings.version,
      lastUpdated: this.state.lastUpdated,
    });

    for (const client of this.sseClients) {
      try {
        client(payload);
      } catch {
        // client may have closed
      }
    }
  }

  public registerSSE(client: (data: string) => void): () => void {
    this.sseClients.add(client);
    return () => {
      this.sseClients.delete(client);
    };
  }

  public resetToDemo(): TournamentState {
    const groups = [...INITIAL_GROUPS];
    const courts = [...INITIAL_COURTS];
    const teams = [...INITIAL_TEAMS];
    const matches = generateInitialMatches(groups, teams, courts);

    this.state = {
      settings: { ...DEFAULT_SETTINGS, version: this.state.settings.version + 1 },
      groups,
      teams,
      courts,
      matches,
      lastUpdated: new Date().toISOString(),
      formatVersion: FORMAT_VERSION,
    };
    this.notifyUpdates();
    return this.state;
  }

  public getState() {
    return this.state;
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
    this.state.matches[idx] = { ...this.state.matches[idx], ...updates };
    this.notifyUpdates();
    return this.state.matches[idx];
  }

  public autoGenerateGroupMatches(): Match[] {
    const newMatches: Match[] = [];
    let matchCounter = 1;
    const courts = this.state.courts.filter((c) => c.active);

    const timeSlots = ['09:00', '09:45', '10:30', '11:15', '12:00', '12:45', '13:30', '14:15'];

    this.state.groups.forEach((group, gIdx) => {
      const gTeams = this.state.teams.filter((t) => t.groupId === group.id);
      const n = gTeams.length;

      // Full Round Robin without duplicates
      let matchInGroup = 1;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const court = courts.length > 0 ? courts[gIdx % courts.length] : null;
          const time = timeSlots[(matchInGroup - 1) % timeSlots.length] || '14:00';

          newMatches.push({
            id: `match-${group.id}-${matchInGroup}`,
            tournamentId: this.state.settings.id,
            groupId: group.id,
            matchNumber: matchCounter++,
            team1Id: gTeams[i].id,
            team2Id: gTeams[j].id,
            courtId: court ? court.id : null,
            scheduledTime: time,
            status: 'scheduled',
            team1Score: null,
            team2Score: null,
          });
          matchInGroup++;
        }
      }
    });

    this.state.matches = newMatches;
    this.notifyUpdates();
    return this.state.matches;
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

    match.team1Score = team1Score;
    match.team2Score = team2Score;
    match.status = 'completed';
    match.completedAt = new Date().toISOString();
    if (submittedBy) match.submittedBy = submittedBy;
    if (padelState) match.padelState = padelState;
    if (scoreSummary) match.scoreSummary = scoreSummary;

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

  public calculateStandings(): Record<string, StandingsRow[]> {
    const { scoring } = this.state.settings;
    const result: Record<string, StandingsRow[]> = {};

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

      // Sort criteria: Points desc -> ScoreDiff desc -> GamesWon desc -> Name asc
      rows.sort(compareStandingsRows);

      // Direct qualification: the top N of each group.
      rows.forEach((row, idx) => {
        row.position = idx + 1;
        row.qualified = row.position <= scoring.qualifiersPerGroup;
      });

      result[group.id] = rows;
    });

    const directQualifiers = this.state.groups.flatMap((group) =>
      (result[group.id] || []).filter((row) => row.qualified)
    );

    // Wildcards fill the remaining knockout slots with the best teams that
    // missed direct qualification, compared across every group.
    const wildcardSlots = scoring.wildcardQualifiers || 0;
    const wildcards =
      wildcardSlots > 0
        ? Object.values(result)
            .flat()
            .filter((row) => !row.qualified)
            .sort(compareStandingsRows)
            .slice(0, wildcardSlots)
        : [];

    wildcards.forEach((row) => {
      row.qualified = true;
    });

    // Bracket seeding order: group winners first, then the wildcard entries.
    [...directQualifiers, ...wildcards].forEach((row, idx) => {
      row.qualificationRank = idx + 1;
    });

    return result;
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
