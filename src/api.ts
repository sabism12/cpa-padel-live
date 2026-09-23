import { TournamentSettings, Group, Team, Court, Match, StandingsRow } from './types';

export interface TournamentData {
  settings: TournamentSettings;
  groups: Group[];
  courts: Court[];
  lastUpdated: string;
}

export interface SummaryData {
  totalMatches: number;
  completedMatches: number;
  liveMatches: number;
  upcomingMatches: number;
  lastUpdated: string;
  version: number;
}

export interface EnrichedMatch extends Match {
  team1?: Team;
  team2?: Team;
  court?: Court | null;
  group?: Group;
}

export interface BootstrapData {
  settings: TournamentSettings;
  groups: Group[];
  courts: Court[];
  teams: Team[];
  summary: SummaryData;
  matches: EnrichedMatch[];
  standings: Record<string, StandingsRow[]>;
  latestResults: EnrichedMatch[];
  lastUpdated: string;
}

export async function fetchBootstrap(retries = 2): Promise<BootstrapData> {
  let lastError: any = null;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch('/api/bootstrap');
      if (res.ok) {
        return await res.json();
      }
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err: any) {
      lastError = err;
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1)));
      }
    }
  }
  throw lastError || new Error('Failed to fetch bootstrap data');
}

export async function fetchTournament(): Promise<TournamentData> {
  const res = await fetch('/api/tournament');
  if (!res.ok) throw new Error('Failed to fetch tournament info');
  return res.json();
}

export async function fetchSummary(): Promise<SummaryData> {
  const res = await fetch('/api/summary');
  if (!res.ok) throw new Error('Failed to fetch summary');
  return res.json();
}

export async function fetchGroups(): Promise<Group[]> {
  const res = await fetch('/api/groups');
  if (!res.ok) throw new Error('Failed to fetch groups');
  return res.json();
}

export async function fetchTeams(): Promise<Team[]> {
  const res = await fetch('/api/teams');
  if (!res.ok) throw new Error('Failed to fetch teams');
  return res.json();
}

export async function fetchCourts(): Promise<Court[]> {
  const res = await fetch('/api/courts');
  if (!res.ok) throw new Error('Failed to fetch courts');
  return res.json();
}

export async function fetchMatches(filters?: {
  groupId?: string;
  courtId?: string;
  status?: string;
}): Promise<EnrichedMatch[]> {
  const params = new URLSearchParams();
  if (filters?.groupId) params.append('groupId', filters.groupId);
  if (filters?.courtId) params.append('courtId', filters.courtId);
  if (filters?.status) params.append('status', filters.status);

  const res = await fetch(`/api/matches?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch matches');
  return res.json();
}

export async function fetchStandings(): Promise<Record<string, StandingsRow[]>> {
  const res = await fetch('/api/standings');
  if (!res.ok) throw new Error('Failed to fetch standings');
  return res.json();
}

export async function fetchLatestResults(): Promise<EnrichedMatch[]> {
  const res = await fetch('/api/latest-results');
  if (!res.ok) throw new Error('Failed to fetch latest results');
  return res.json();
}

export async function login(role: 'admin' | 'scorekeeper', password: string, name?: string) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, password, name }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Authentication failed');
  }
  return data as { token: string; role: 'admin' | 'scorekeeper'; name: string };
}

export async function checkAuth(token: string) {
  const res = await fetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export async function submitScoreResult(
  token: string,
  matchId: string,
  team1Score: number,
  team2Score: number,
  padelState?: any,
  scoreSummary?: string
) {
  const res = await fetch('/api/scorekeeper/submit-result', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ matchId, team1Score, team2Score, padelState, scoreSummary }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to submit score');
  }
  return data as { success: boolean; match: Match; nextMatch?: EnrichedMatch | null; message: string };
}

export async function setMatchLiveScore(
  token: string,
  matchId: string,
  team1Score: number,
  team2Score: number,
  status: 'live' | 'ready' | 'scheduled' | 'completed',
  padelState?: any,
  scoreSummary?: string,
  courtId?: string
) {
  const res = await fetch('/api/scorekeeper/set-live', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ matchId, team1Score, team2Score, status, padelState, scoreSummary, courtId }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to update live match');
  }
  return data;
}

export async function adminGenerateMatches(token: string) {
  const res = await fetch('/api/admin/matches/generate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to generate matches');
  return data;
}

export async function adminUpdateMatch(token: string, match: Partial<Match> & { id: string }) {
  const res = await fetch('/api/admin/match', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(match),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update match');
  return data;
}

export async function adminSaveTeam(
  token: string,
  team: { id?: string; name: string; player1: string; player2: string; groupId: string }
) {
  const res = await fetch('/api/admin/team', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(team),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to save team');
  return data;
}

export async function adminDeleteTeam(token: string, id: string) {
  const res = await fetch(`/api/admin/team/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete team');
  return data;
}

export async function adminSaveCourts(token: string, courts: Court[]) {
  const res = await fetch('/api/admin/courts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ courts }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to save courts');
  return data;
}

export async function adminSaveGroups(token: string, groups: Group[]) {
  const res = await fetch('/api/admin/groups', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ groups }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to save groups');
  return data;
}

export async function adminSaveSettings(token: string, settings: Partial<TournamentSettings>) {
  const res = await fetch('/api/admin/settings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(settings),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to save settings');
  return data;
}

export async function adminResetDemo(token: string) {
  const res = await fetch('/api/admin/reset-demo', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to reset demo data');
  return data;
}

export async function adminExportData(token: string) {
  const res = await fetch('/api/admin/export', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to export data');
  return res.json();
}

export async function adminImportData(token: string, payload: any) {
  const res = await fetch('/api/admin/import', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to import data');
  return data;
}

export async function seedKnockoutFromStandings(token: string) {
  const res = await fetch('/api/knockout/seed-from-standings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to seed knockout bracket');
  return data;
}
