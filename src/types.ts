import { PadelMatchState } from './scoring/types';

export * from './scoring/types';

export type MatchStatus = 'scheduled' | 'ready' | 'live' | 'completed' | 'cancelled';

export interface Group {
  id: string;
  name: string; // e.g. "Group A"
  order: number;
}

export interface Team {
  id: string;
  name: string;
  player1: string;
  player2: string;
  groupId: string;
}

export type MatchStage = 'group' | 'knockout';
export type KnockoutRound = 'r16' | 'qf' | 'sf' | 'final' | '3rd';

export interface Court {
  id: string;
  name: string; // e.g. "Court 1"
  active: boolean;
  order: number;
}

export interface Match {
  id: string;
  tournamentId: string;
  groupId: string;
  stage?: MatchStage;
  round?: KnockoutRound;
  bracketPosition?: number;
  nextMatchId?: string;
  nextMatchSlot?: 'team1' | 'team2';
  loserNextMatchId?: string;
  loserNextMatchSlot?: 'team1' | 'team2';
  matchNumber: number;
  team1Id: string;
  team2Id: string;
  courtId: string | null;
  scheduledTime: string; // e.g. "18:00"
  status: MatchStatus;
  team1Score: number | null;
  team2Score: number | null;
  completedAt?: string;
  submittedBy?: string;
  notes?: string;
  padelState?: PadelMatchState;
  scoreSummary?: string;
}

export interface StandingsRow {
  position: number;
  teamId: string;
  teamName: string;
  player1: string;
  player2: string;
  groupId: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  points: number;
  gamesWon: number;
  gamesLost: number;
  scoreDiff: number;
  qualified: boolean;
  qualificationRank?: number;
}

export interface ScoringSettings {
  pointsForWin: number;
  pointsForLoss: number;
  pointsForDraw?: number;
  qualifiersPerGroup: number; // e.g. 2 teams qualify per group
  wildcardQualifiers: number; // e.g. best 3rd place teams
  gamesToWinSet: number; // standard 6 or 9
  allowDraws: boolean;
}

export interface TournamentSettings {
  id: string;
  name: string;
  location: string;
  date: string;
  scoring: ScoringSettings;
  adminPasswordHash?: string;
  scorekeeperPin?: string;
  version: number;
}

export interface UserRole {
  role: 'public' | 'scorekeeper' | 'admin';
  name?: string;
}

export interface AuthSession {
  token: string;
  role: 'scorekeeper' | 'admin';
  name: string;
  expiresAt: number;
}
