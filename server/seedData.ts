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

export const INITIAL_TEAMS: Team[] = [
  // Group A
  { id: 'team-a1', name: 'Hamood / Hossam', player1: 'Hamood', player2: 'Hossam', groupId: 'group-a' },
  { id: 'team-a2', name: 'Abdullah Othman / Akmal Rizvi', player1: 'Abdullah Othman', player2: 'Akmal Rizvi', groupId: 'group-a' },
  { id: 'team-a3', name: 'Faisal / Muhammed', player1: 'Faisal', player2: 'Muhammed', groupId: 'group-a' },
  { id: 'team-a4', name: 'Mohammed Jalil / Abdullah Mahmoud', player1: 'Mohammed Jalil', player2: 'Abdullah Mahmoud', groupId: 'group-a' },

  // Group B
  { id: 'team-b1', name: 'Derrick / Elvis', player1: 'Derrick', player2: 'Elvis', groupId: 'group-b' },
  { id: 'team-b2', name: 'Suhaim / Zubair', player1: 'Suhaim', player2: 'Zubair', groupId: 'group-b' },
  { id: 'team-b3', name: 'Zameer / Moosa Faisal', player1: 'Zameer', player2: 'Moosa Faisal', groupId: 'group-b' },
  { id: 'team-b4', name: 'Abdulaziz Al Yafei / Osman Al Amoodi', player1: 'Abdulaziz Al Yafei', player2: 'Osman Al Amoodi', groupId: 'group-b' },

  // Group C
  { id: 'team-c1', name: 'Jamshi / Hisham', player1: 'Jamshi', player2: 'Hisham', groupId: 'group-c' },
  { id: 'team-c2', name: 'Hashim / Muhsin', player1: 'Hashim', player2: 'Muhsin', groupId: 'group-c' },
  { id: 'team-c3', name: 'Sudhin / Junais', player1: 'Sudhin', player2: 'Junais', groupId: 'group-c' },
  { id: 'team-c4', name: 'Sabah / Hamdan', player1: 'Sabah', player2: 'Hamdan', groupId: 'group-c' },

  // Group D
  { id: 'team-d1', name: 'Adil / Fawaz', player1: 'Adil', player2: 'Fawaz', groupId: 'group-d' },
  { id: 'team-d2', name: 'Ansaf / Faham', player1: 'Ansaf', player2: 'Faham', groupId: 'group-d' },
  { id: 'team-d3', name: 'Bilal / Ali', player1: 'Bilal', player2: 'Ali', groupId: 'group-d' },
  { id: 'team-d4', name: 'Asim / Abhijit', player1: 'Asim', player2: 'Abhijit', groupId: 'group-d' },

  // Group E
  { id: 'team-e1', name: 'Ameen / Wayward', player1: 'Ameen', player2: 'Wayward', groupId: 'group-e' },
  { id: 'team-e2', name: 'Athif / Nadeer', player1: 'Athif', player2: 'Nadeer', groupId: 'group-e' },
  { id: 'team-e3', name: 'Hadi / Shahir', player1: 'Hadi', player2: 'Shahir', groupId: 'group-e' },
  { id: 'team-e4', name: 'Omer / Tariq', player1: 'Omer', player2: 'Tariq', groupId: 'group-e' },
];

/**
 * Generate 30 round robin matches (6 per 4-team group)
 * For 4 teams [0, 1, 2, 3]:
 * 1: 0 vs 1
 * 2: 2 vs 3
 * 3: 0 vs 2
 * 4: 1 vs 3
 * 5: 0 vs 3
 * 6: 1 vs 2
 *
 * Group stage format: every group plays ALL of its matches on one dedicated
 * court (Group A -> Court 1, Group B -> Court 2, ...). Groups are never split
 * across multiple courts during the round robin.
 */
export function generateInitialMatches(groups: Group[], teams: Team[], courts: Court[]): Match[] {
  const matches: Match[] = [];
  let matchCounter = 1;

  const times = ['09:00', '09:45', '10:30', '11:15', '12:00', '12:45'];

  groups.forEach((group, gIdx) => {
    const groupTeams = teams.filter((t) => t.groupId === group.id);
    if (groupTeams.length < 2) return;

    const pairs: [number, number][] = [
      [0, 1],
      [2, 3],
      [0, 2],
      [1, 3],
      [0, 3],
      [1, 2],
    ];

    pairs.forEach((pair, rIdx) => {
      const t1 = groupTeams[pair[0]];
      const t2 = groupTeams[pair[1]];
      if (!t1 || !t2) return;

      const court = courts[gIdx % courts.length];

      matches.push({
        id: `match-${group.id}-${rIdx + 1}`,
        tournamentId: 'cpa-padel-2026',
        groupId: group.id,
        matchNumber: matchCounter++,
        team1Id: t1.id,
        team2Id: t2.id,
        courtId: court ? court.id : null,
        scheduledTime: times[rIdx] || '13:00',
        stage: 'group',
        status: 'scheduled',
        team1Score: null,
        team2Score: null,
      });
    });
  });

  // Knockout Matches (Quarter-Finals -> Semi-Finals -> 3rd Place & Grand Final)
  const knockoutMatches: Match[] = [
    // Quarter-Finals (QF1, QF2, QF3, QF4)
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
      team1Id: 'team-a1', // Hamood / Hossam
      team2Id: 'team-c2', // Hashim / Muhsin
      courtId: courts[0]?.id || 'court-1',
      scheduledTime: '14:00',
      status: 'completed',
      team1Score: 6,
      team2Score: 1,
      completedAt: new Date(Date.now() - 3600000 * 3).toISOString(),
      submittedBy: 'Official Scorekeeper',
      scoreSummary: '6 - 1',
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
      team1Id: 'team-b1', // Derrick / Elvis
      team2Id: 'team-d2', // Ansaf / Faham
      courtId: courts[1]?.id || 'court-2',
      scheduledTime: '14:00',
      status: 'completed',
      team1Score: 6,
      team2Score: 4,
      completedAt: new Date(Date.now() - 3600000 * 3).toISOString(),
      submittedBy: 'Official Scorekeeper',
      scoreSummary: '6 - 4',
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
      team1Id: 'team-c1', // Jamshi / Hisham
      team2Id: 'team-a3', // Faisal / Muhammed
      courtId: courts[2]?.id || 'court-3',
      scheduledTime: '14:45',
      status: 'completed',
      team1Score: 6,
      team2Score: 3,
      completedAt: new Date(Date.now() - 3600000 * 2.5).toISOString(),
      submittedBy: 'Official Scorekeeper',
      scoreSummary: '6 - 3',
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
      team1Id: 'team-d1', // Adil / Fawaz
      team2Id: 'team-b2', // Suhaim / Zubair
      courtId: courts[3]?.id || 'court-4',
      scheduledTime: '14:45',
      status: 'completed',
      team1Score: 7,
      team2Score: 5,
      completedAt: new Date(Date.now() - 3600000 * 2.5).toISOString(),
      submittedBy: 'Official Scorekeeper',
      scoreSummary: '7 - 5',
    },

    // Semi-Finals (SF1, SF2)
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
      team1Id: 'team-a1', // Hamood / Hossam (Winner QF1)
      team2Id: 'team-b1', // Derrick / Elvis (Winner QF2)
      courtId: courts[0]?.id || 'court-1',
      scheduledTime: '15:45',
      status: 'completed',
      team1Score: 6,
      team2Score: 2,
      completedAt: new Date(Date.now() - 3600000 * 1.5).toISOString(),
      submittedBy: 'Official Scorekeeper',
      scoreSummary: '6 - 2',
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
      team1Id: 'team-c1', // Jamshi / Hisham (Winner QF3)
      team2Id: 'team-d1', // Adil / Fawaz (Winner QF4)
      courtId: courts[1]?.id || 'court-2',
      scheduledTime: '15:45',
      status: 'completed',
      team1Score: 6,
      team2Score: 4,
      completedAt: new Date(Date.now() - 3600000 * 1.5).toISOString(),
      submittedBy: 'Official Scorekeeper',
      scoreSummary: '6 - 4',
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
      team1Id: 'team-b1', // Derrick / Elvis (Loser SF1)
      team2Id: 'team-d1', // Adil / Fawaz (Loser SF2)
      courtId: courts[1]?.id || 'court-2',
      scheduledTime: '16:45',
      status: 'completed',
      team1Score: 6,
      team2Score: 4,
      completedAt: new Date(Date.now() - 3600000 * 0.8).toISOString(),
      submittedBy: 'Official Scorekeeper',
      scoreSummary: '6 - 4',
    },

    // Grand FINAL
    {
      id: 'match-ko-final',
      tournamentId: 'cpa-padel-2026',
      groupId: 'knockout',
      stage: 'knockout',
      round: 'final',
      bracketPosition: 1,
      matchNumber: matchCounter++,
      team1Id: 'team-a1', // Hamood / Hossam (Winner SF1)
      team2Id: 'team-c1', // Jamshi / Hisham (Winner SF2)
      courtId: courts[0]?.id || 'court-1',
      scheduledTime: '17:30',
      status: 'completed',
      team1Score: 6,
      team2Score: 3,
      completedAt: new Date(Date.now() - 1800000).toISOString(),
      submittedBy: 'Head Referee',
      scoreSummary: '6 - 3',
    },
  ];

  matches.push(...knockoutMatches);

  // Populate some realistic finished and live matches for the demo:
  // Match 1 (Group A): Hamood / Hossam vs Abdullah Othman / Akmal Rizvi -> Completed 6-3
  const m1 = matches.find((m) => m.id === 'match-group-a-1');
  if (m1) {
    m1.status = 'completed';
    m1.team1Score = 6;
    m1.team2Score = 3;
    m1.completedAt = new Date(Date.now() - 3600000 * 2).toISOString();
    m1.submittedBy = 'Scorekeeper (Court 1)';  }

  // Match 2 (Group A): Faisal / Muhammed vs Mohammed Jalil / Abdullah Mahmoud -> Completed 6-4
  const m2 = matches.find((m) => m.id === 'match-group-a-2');
  if (m2) {
    m2.status = 'completed';
    m2.team1Score = 6;
    m2.team2Score = 4;
    m2.completedAt = new Date(Date.now() - 3600000 * 1.5).toISOString();
    m2.submittedBy = 'Scorekeeper (Court 1)';
  }

  // Match 1 (Group B): Derrick / Elvis vs Suhaim / Zubair -> Completed 6-2
  const mb1 = matches.find((m) => m.id === 'match-group-b-1');
  if (mb1) {
    mb1.status = 'completed';
    mb1.team1Score = 6;
    mb1.team2Score = 2;
    mb1.completedAt = new Date(Date.now() - 3600000 * 1.2).toISOString();
    mb1.submittedBy = 'Scorekeeper (Court 2)';
  }

  // Match 1 (Group C): Jamshi / Hisham vs Hashim / Muhsin -> Completed 6-4
  const mc1 = matches.find((m) => m.id === 'match-group-c-1');
  if (mc1) {
    mc1.status = 'completed';
    mc1.team1Score = 6;
    mc1.team2Score = 4;
    mc1.completedAt = new Date(Date.now() - 3600000 * 0.8).toISOString();
    mc1.submittedBy = 'Scorekeeper (Court 3)';
    mc1.scoreSummary = '6 - 4';
  }

  // Live match on Court 1: Group A, Hamood / Hossam vs Faisal / Muhammed (4 - 3)
  const m3 = matches.find((m) => m.id === 'match-group-a-3');
  if (m3) {
    m3.courtId = 'court-1';
    m3.status = 'live';
    m3.team1Score = 4;
    m3.team2Score = 3;
    m3.scoreSummary = '4 - 3';
    m3.padelState = {
      matchId: 'match-group-a-3',
      team1Games: 4,
      team2Games: 3,
      team1Points: 2, // 30
      team2Points: 1, // 15
      isGoldenPoint: false,
      isMatchOver: false,
      winnerTeamId: null,
      lastEventMessage: 'Point Hamood / Hossam (30 - 15)',
      history: [],
    };
  }

  // Ready match on Court 2: Group B, Zameer / Moosa Faisal vs Abdulaziz Al Yafei / Osman Al Amoodi
  const mb2 = matches.find((m) => m.id === 'match-group-b-2');
  if (mb2) {
    mb2.courtId = 'court-2';
    mb2.status = 'ready';
  }

  return matches;
}
