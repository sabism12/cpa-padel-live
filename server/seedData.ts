import { Group, Team, Court, Match, TournamentSettings } from '../src/types';

export const DEFAULT_SETTINGS: TournamentSettings = {
  id: 'cpa-padel-2026',
  name: 'CPA PADEL TOURNAMENT',
  location: 'CPA Padel Arena & Club',
  date: '2026 Season Finals',
  scoring: {
    pointsForWin: 3,
    pointsForLoss: 0, // No points for a loss - only wins score (3 pts)
    pointsForDraw: 0,
    qualifiersPerGroup: 1, // Group winner qualifies directly (5 groups -> 5 teams)
    wildcardQualifiers: 3, // Plus the 3 best runners-up -> 8 teams in the knockout
    gamesToWinSet: 6,
    allowDraws: false,
  },
  version: 1,
};

export const INITIAL_GROUPS: Group[] = [
  { id: 'group-a', name: 'Group A', order: 1 },
  { id: 'group-b', name: 'Group B', order: 2 },
  { id: 'group-c', name: 'Group C', order: 3 },
  { id: 'group-d', name: 'Group D', order: 4 },
  { id: 'group-e', name: 'Group E', order: 5 },
];

export const INITIAL_COURTS: Court[] = [
  { id: 'court-1', name: 'Court 1 (Center)', active: true, order: 1 },
  { id: 'court-2', name: 'Court 2 (North)', active: true, order: 2 },
  { id: 'court-3', name: 'Court 3 (South)', active: true, order: 3 },
  { id: 'court-4', name: 'Court 4 (East)', active: true, order: 4 },
  { id: 'court-5', name: 'Court 5 (West)', active: true, order: 5 },
];

/**
 * Official tournament roster (20 pairings across 5 groups). This is the single
 * source of truth: the seed state, the "Reset all scores" action and the v6
 * migration all derive from it. Never reorder ids - matches reference them.
 */
export const INITIAL_TEAMS: Team[] = [
  // Group A
  { id: 'team-a1', name: 'Hamood / Hossam', player1: 'Hamood', player2: 'Hossam', groupId: 'group-a' },
  { id: 'team-a2', name: 'Hadi / Shahir', player1: 'Hadi', player2: 'Shahir', groupId: 'group-a' },
  { id: 'team-a3', name: 'Omer / Tariq', player1: 'Omer', player2: 'Tariq', groupId: 'group-a' },
  { id: 'team-a4', name: 'Derrick / Elvis', player1: 'Derrick', player2: 'Elvis', groupId: 'group-a' },

  // Group B
  { id: 'team-b1', name: 'Hashim / Muhsin', player1: 'Hashim', player2: 'Muhsin', groupId: 'group-b' },
  { id: 'team-b2', name: 'Daud / Ahmed Elmasry', player1: 'Daud', player2: 'Ahmed Elmasry', groupId: 'group-b' },
  { id: 'team-b3', name: 'Ansaf / Faham', player1: 'Ansaf', player2: 'Faham', groupId: 'group-b' },
  { id: 'team-b4', name: 'Jamshi / Hisham', player1: 'Jamshi', player2: 'Hisham', groupId: 'group-b' },

  // Group C
  { id: 'team-c1', name: 'Athif / Nadeer', player1: 'Athif', player2: 'Nadeer', groupId: 'group-c' },
  { id: 'team-c2', name: 'Sudhin / Junais', player1: 'Sudhin', player2: 'Junais', groupId: 'group-c' },
  { id: 'team-c3', name: 'Abdullah Othman / Akmal Rizvi', player1: 'Abdullah Othman', player2: 'Akmal Rizvi', groupId: 'group-c' },
  { id: 'team-c4', name: 'Abdulaziz Al Yafei / Osman Al Amoodi', player1: 'Abdulaziz Al Yafei', player2: 'Osman Al Amoodi', groupId: 'group-c' },

  // Group D
  { id: 'team-d1', name: 'Mohammed Jalil / Abdullah Mahmoud', player1: 'Mohammed Jalil', player2: 'Abdullah Mahmoud', groupId: 'group-d' },
  { id: 'team-d2', name: 'Ameen / Aflah', player1: 'Ameen', player2: 'Aflah', groupId: 'group-d' },
  { id: 'team-d3', name: 'Asim / Abhijit', player1: 'Asim', player2: 'Abhijit', groupId: 'group-d' },
  { id: 'team-d4', name: 'Suhaim / Zubair', player1: 'Suhaim', player2: 'Zubair', groupId: 'group-d' },

  // Group E
  { id: 'team-e1', name: 'Adil / Fawaz', player1: 'Adil', player2: 'Fawaz', groupId: 'group-e' },
  { id: 'team-e2', name: 'Sabah / Hamdan', player1: 'Sabah', player2: 'Hamdan', groupId: 'group-e' },
  { id: 'team-e3', name: 'Zameer / Moosa Faisal', player1: 'Zameer', player2: 'Moosa Faisal', groupId: 'group-e' },
  { id: 'team-e4', name: 'Bilal / Ali', player1: 'Bilal', player2: 'Ali', groupId: 'group-e' },
];

/**
 * The official round-robin fixture order for each group, expressed as indices
 * into that group's team list (0 = the group's first team). Every group plays
 * all six of its matches on one dedicated court, in this exact order, so the
 * generated schedule always matches the printed official fixture list.
 */
const GROUP_FIXTURE_LAYOUT: Record<string, [number, number][]> = {
  'group-a': [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]],
  'group-b': [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]],
  'group-c': [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]],
  'group-d': [[0, 1], [2, 3], [3, 1], [2, 0], [2, 1], [3, 0]],
  'group-e': [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]],
};

/** Official start window for each round-robin slot. */
const GROUP_START_TIMES = [
  '8:00–8:30',
  '8:30–9:00',
  '9:00–9:30',
  '9:30–10:00',
  '10:00–10:30',
  '10:30–11:00',
];

/**
 * Generate the official 30 round-robin matches (6 per 4-team group) plus the
 * 8-match knockout bracket. Group matches carry real teams; the knockout
 * bracket starts empty (TBD) and is seeded later from the group standings.
 *
 * The output is fully deterministic - no randomness - so regenerating never
 * changes the schedule.
 */
export function generateInitialMatches(groups: Group[], teams: Team[], courts: Court[]): Match[] {
  const matches: Match[] = [];
  let matchCounter = 1;

  groups.forEach((group, gIdx) => {
    const groupTeams = teams.filter((t) => t.groupId === group.id);
    if (groupTeams.length < 2) return;

    const layout = GROUP_FIXTURE_LAYOUT[group.id] || [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];
    const court = courts[gIdx % courts.length];

    layout.forEach(([i, j], rIdx) => {
      const t1 = groupTeams[i];
      const t2 = groupTeams[j];
      if (!t1 || !t2) return;

      matches.push({
        id: `match-${group.id}-${rIdx + 1}`,
        tournamentId: 'cpa-padel-2026',
        groupId: group.id,
        stage: 'group',
        matchNumber: matchCounter++,
        team1Id: t1.id,
        team2Id: t2.id,
        courtId: court ? court.id : null,
        scheduledTime: GROUP_START_TIMES[rIdx] || '11:00–11:30',
        status: 'scheduled',
        team1Score: null,
        team2Score: null,
      });
    });
  });

  // Knockout bracket: Quarter-Finals -> Semi-Finals -> 3rd Place & Grand Final.
  // Teams are intentionally blank so the bracket shows TBD until it is seeded.
  const knockoutMatches: Match[] = [
    // Quarter-Finals
    {
      id: 'match-ko-qf1',
      tournamentId: 'cpa-padel-2026',
      groupId: 'knockout',
      stage: 'knockout',
      round: 'qf',
      bracketPosition: 1,
      nextMatchId: 'match-ko-sf1',
      nextMatchSlot: 'team1',
      matchNumber: matchCounter++,
      team1Id: '',
      team2Id: '',
      courtId: courts[0]?.id || 'court-1',
      scheduledTime: '14:00',
      status: 'scheduled',
      team1Score: null,
      team2Score: null,
    },
    {
      id: 'match-ko-qf2',
      tournamentId: 'cpa-padel-2026',
      groupId: 'knockout',
      stage: 'knockout',
      round: 'qf',
      bracketPosition: 2,
      nextMatchId: 'match-ko-sf1',
      nextMatchSlot: 'team2',
      matchNumber: matchCounter++,
      team1Id: '',
      team2Id: '',
      courtId: courts[1]?.id || 'court-2',
      scheduledTime: '14:00',
      status: 'scheduled',
      team1Score: null,
      team2Score: null,
    },
    {
      id: 'match-ko-qf3',
      tournamentId: 'cpa-padel-2026',
      groupId: 'knockout',
      stage: 'knockout',
      round: 'qf',
      bracketPosition: 3,
      nextMatchId: 'match-ko-sf2',
      nextMatchSlot: 'team1',
      matchNumber: matchCounter++,
      team1Id: '',
      team2Id: '',
      courtId: courts[2]?.id || 'court-3',
      scheduledTime: '14:45',
      status: 'scheduled',
      team1Score: null,
      team2Score: null,
    },
    {
      id: 'match-ko-qf4',
      tournamentId: 'cpa-padel-2026',
      groupId: 'knockout',
      stage: 'knockout',
      round: 'qf',
      bracketPosition: 4,
      nextMatchId: 'match-ko-sf2',
      nextMatchSlot: 'team2',
      matchNumber: matchCounter++,
      team1Id: '',
      team2Id: '',
      courtId: courts[3]?.id || 'court-4',
      scheduledTime: '14:45',
      status: 'scheduled',
      team1Score: null,
      team2Score: null,
    },

    // Semi-Finals
    {
      id: 'match-ko-sf1',
      tournamentId: 'cpa-padel-2026',
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
      courtId: courts[0]?.id || 'court-1',
      scheduledTime: '15:45',
      status: 'scheduled',
      team1Score: null,
      team2Score: null,
    },
    {
      id: 'match-ko-sf2',
      tournamentId: 'cpa-padel-2026',
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
      courtId: courts[1]?.id || 'court-2',
      scheduledTime: '15:45',
      status: 'scheduled',
      team1Score: null,
      team2Score: null,
    },

    // 3rd Place Match
    {
      id: 'match-ko-3rd',
      tournamentId: 'cpa-padel-2026',
      groupId: 'knockout',
      stage: 'knockout',
      round: '3rd',
      bracketPosition: 1,
      matchNumber: matchCounter++,
      team1Id: '',
      team2Id: '',
      courtId: courts[1]?.id || 'court-2',
      scheduledTime: '16:45',
      status: 'scheduled',
      team1Score: null,
      team2Score: null,
    },

    // Grand Final
    {
      id: 'match-ko-final',
      tournamentId: 'cpa-padel-2026',
      groupId: 'knockout',
      stage: 'knockout',
      round: 'final',
      bracketPosition: 1,
      matchNumber: matchCounter++,
      team1Id: '',
      team2Id: '',
      courtId: courts[0]?.id || 'court-1',
      scheduledTime: '17:30',
      status: 'scheduled',
      team1Score: null,
      team2Score: null,
    },
  ];

  matches.push(...knockoutMatches);

  return matches;
}
