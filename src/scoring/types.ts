export type PadelPoint = 0 | 1 | 2 | 3; // 0=LOVE, 1=15, 2=30, 3=40
export type PadelPointLabel = 'LOVE' | '15' | '30' | '40';

export interface ScoringActionHistoryItem {
  timestamp: string;
  type: 'POINT_TEAM_1' | 'POINT_TEAM_2' | 'RESET';
  description: string;
  snapshot: PadelMatchSnapshot;
}

export interface PadelMatchSnapshot {
  team1Games: number;
  team2Games: number;
  team1Points: PadelPoint;
  team2Points: PadelPoint;
  isGoldenPoint: boolean;
  isMatchOver: boolean;
  winnerTeamId?: 'team1' | 'team2' | null;
  lastEventMessage?: string;
}

export interface PadelMatchState extends PadelMatchSnapshot {
  matchId: string;
  history: ScoringActionHistoryItem[];
  startedAt?: string;
  completedAt?: string;
  // Optional backward-compatibility fields if needed by legacy views
  format?: string;
  currentSet?: number;
  team1SetsWon?: number;
  team2SetsWon?: number;
  completedSets?: any[];
}

export type ScoringAction =
  | { type: 'POINT_TEAM_1' }
  | { type: 'POINT_TEAM_2' }
  | { type: 'UNDO' }
  | { type: 'RESET' };
