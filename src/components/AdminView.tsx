import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Users,
  LayoutGrid,
  Calendar,
  Download,
  QrCode,
  RotateCcw,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Copy,
  FileSpreadsheet,
  Coins,
  Shuffle,
  ClipboardList,
  X,
} from 'lucide-react';
import QRCode from 'qrcode';
import { Team, Group, Court, TournamentSettings, AuthSession, StandingsRow } from '../types';
import { pairLabel } from '../utils/teamDisplay';
import { QuickResultsPanel } from './QuickResultsPanel';
import {
  AdminDialog,
  BandLabel,
  MatchStatusPill,
  SectionCard,
  adminStageLabel,
  bandButton,
  bandOutlineButton,
  dangerButton,
  fieldInput,
  fieldLabel,
  outlineButton,
  primaryButton,
  smallDangerButton,
  smallOutlineButton,
  smallQuietDangerButton,
} from './AdminUI';
import {
  EnrichedMatch,
  adminSaveTeam,
  adminDeleteTeam,
  adminSaveCourts,
  adminUpdateMatch,
  adminExportData,
  resetAllScores,
  adminSetWalkover,
  adminSetTeamWithdrawn,
  adminSetQuarterFinalDraw,
  adminRecordToss,
  adminClearTosses,
} from '../api';

interface AdminViewProps {
  session: AuthSession | null;
  onOpenAuth: () => void;
  teams: Team[];
  groups: Group[];
  courts: Court[];
  matches: EnrichedMatch[];
  settings?: TournamentSettings;
  standings: Record<string, StandingsRow[]>;
  onRefreshData: () => void;
}

type AdminTab = 'quick' | 'matches' | 'tiebreaks' | 'qfdraw' | 'teams' | 'courts' | 'sheets' | 'qr';
type FixtureFilter = 'all' | 'live' | 'upcoming' | 'completed';

const FIXTURE_FILTERS: { id: FixtureFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'completed', label: 'Finished' },
];

function matchesFixtureFilter(m: EnrichedMatch, filter: FixtureFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'upcoming') return m.status === 'scheduled' || m.status === 'ready';
  return m.status === filter;
}

type BadgeTone = 'count' | 'alert' | 'live';
interface NavItem {
  id: AdminTab;
  label: string;
  icon: React.ElementType;
  badge?: { value: number; tone: BadgeTone };
}

export const AdminView: React.FC<AdminViewProps> = ({
  session,
  onOpenAuth,
  teams,
  groups,
  courts,
  matches,
  settings,
  standings,
  onRefreshData,
}) => {
  // Quick results first: typing in the paper score sheets is the match-day job.
  const [activeSubTab, setActiveSubTab] = useState<AdminTab>('quick');
  const [fixtureFilter, setFixtureFilter] = useState<FixtureFilter>('all');

  // Quarter-final draw by lot: 4 pairings, QF1..QF4, as team ids ('' = empty).
  const [qfDraw, setQfDraw] = useState<string[][]>([
    ['', ''],
    ['', ''],
    ['', ''],
    ['', ''],
  ]);
  const [savingQfDraw, setSavingQfDraw] = useState(false);

  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Reset all game scores (test before the match / start clean)
  const [showResetAllConfirm, setShowResetAllConfirm] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);

  // Teams editing state
  const [editingTeam, setEditingTeam] = useState<Partial<Team> | null>(null);

  // Match editing modal state
  const [editingMatch, setEditingMatch] = useState<EnrichedMatch | null>(null);

  // Quick "team absent" (walkover) dialog
  const [absentMatch, setAbsentMatch] = useState<EnrichedMatch | null>(null);

  // QR Code Data URL state
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Generate QR code for tournament public results URL
  useEffect(() => {
    const publicUrl = `${window.location.origin}/results`;
    QRCode.toDataURL(publicUrl, { width: 320, margin: 2, color: { dark: '#070a12', light: '#ffffff' } })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('QR code generation error:', err));
  }, []);

  const quarterFinals = [1, 2, 3, 4].map((n) =>
    matches.find((m) => m.stage === 'knockout' && m.round === 'qf' && m.bracketPosition === n)
  );
  const qfStarted = quarterFinals.some(
    (m) => m && (m.status === 'live' || (m.status === 'completed' && !m.walkover))
  );
  const qualifiedRows = Object.values(standings)
    .flat()
    .filter((row) => row.qualified)
    .sort((a, b) => (a.qualificationRank ?? 99) - (b.qualificationRank ?? 99));

  useEffect(() => {
    if (activeSubTab !== 'qfdraw') return;
    setQfDraw(quarterFinals.map((m) => [m?.team1Id || '', m?.team2Id || '']));
    // Load once when the tab opens; later refreshes must not wipe an unsaved draw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubTab]);

  // Teams level on points and game difference that need a live toss (bylaw §4),
  // grouped into tie sets: same toss reason, same points, same game difference.
  const tieSets = Object.values(
    Object.values(standings)
      .flat()
      .filter((row) => row.tossPending)
      .reduce<Record<string, { label: string; rows: StandingsRow[] }>>((sets, row) => {
        const key = `${row.tossPending}|${row.points}|${row.scoreDiff}`;
        (sets[key] ??= { label: row.tossPending!, rows: [] }).rows.push(row);
        return sets;
      }, {})
  ).filter((set) => set.rows.length > 1);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setFeedbackMessage({ type, text });
    setTimeout(() => setFeedbackMessage(null), 4000);
  };

  // If not admin, require admin login
  if (!session || session.role !== 'admin') {
    return (
      <div className="max-w-lg mx-auto py-12">
        <div className="p-8 rounded-3xl bg-white border border-blue-300/80 shadow-xl text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-[#0A0A0F] text-[#CCFF00] flex items-center justify-center mx-auto">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-4xl font-display font-semibold uppercase tracking-wide leading-none text-[#0A0A0F]">
              Admin sign-in required
            </h2>
            <p className="text-sm text-slate-600 mt-3">
              Only tournament directors and administrators can change teams, results, courts and
              the knockout draw.
            </p>
          </div>
          <button id="btn-admin-login-prompt" onClick={onOpenAuth} className={`${primaryButton} w-full min-h-12`}>
            Sign in as administrator
          </button>
        </div>
      </div>
    );
  }

  // 11. Reset ALL game scores back to 0-0 (and empty the knockout bracket).
  // Useful to dry-run the scoring flow before the match and start clean.
  const handleResetAllScores = async () => {
    setResettingAll(true);
    try {
      const { matchesReset, knockoutReset } = await resetAllScores(session.token);

      setShowResetAllConfirm(false);
      showNotification(
        'success',
        `All scores reset to 0-0 (${matchesReset} match${matchesReset === 1 ? '' : 'es'} cleared)${
          knockoutReset > 0
            ? `, knockout bracket cleared to TBD (${knockoutReset})`
            : ''
        }. Court times unchanged.`
      );
      onRefreshData();
    } catch (err: any) {
      showNotification('error', err?.message || 'Failed to reset all scores.');
    } finally {
      setResettingAll(false);
    }
  };

  // Team Save / Delete
  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeam?.player1?.trim() || !editingTeam?.player2?.trim() || !editingTeam?.groupId) {
      showNotification('error', 'Both player names and a group are required.');
      return;
    }

    // Teams have no nickname - the pairing of the two players is the identity.
    const label = pairLabel(editingTeam);

    try {
      await adminSaveTeam(session.token, {
        id: editingTeam.id,
        name: label,
        player1: editingTeam.player1.trim(),
        player2: editingTeam.player2.trim(),
        groupId: editingTeam.groupId,
      });
      showNotification('success', `Pairing "${label}" saved successfully.`);
      setEditingTeam(null);
      onRefreshData();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to save team.');
    }
  };

  const handleDeleteTeam = async (teamId: string, label: string) => {
    if (!window.confirm(`Delete pairing "${label}"? Associated match fixtures will be removed.`)) {
      return;
    }

    try {
      await adminDeleteTeam(session.token, teamId);
      showNotification('success', `Pairing "${label}" deleted.`);
      onRefreshData();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to delete team.');
    }
  };

  // Match Save / Correct Scores
  const handleSaveMatchDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMatch) return;

    try {
      const t1 =
        editingMatch.team1Score !== null && editingMatch.team1Score !== undefined
          ? Number(editingMatch.team1Score)
          : null;
      const t2 =
        editingMatch.team2Score !== null && editingMatch.team2Score !== undefined
          ? Number(editingMatch.team2Score)
          : null;

      const isCompleted = editingMatch.status === 'completed';

      await adminUpdateMatch(session.token, {
        id: editingMatch.id,
        courtId: editingMatch.courtId || null,
        scheduledTime: editingMatch.scheduledTime,
        status: editingMatch.status,
        team1Score: t1,
        team2Score: t2,
        padelState:
          t1 !== null && t2 !== null
            ? {
                matchId: editingMatch.id,
                team1Games: t1,
                team2Games: t2,
                team1Points: 0,
                team2Points: 0,
                isGoldenPoint: false,
                isMatchOver: isCompleted,
                winnerTeamId: isCompleted ? (t1 > t2 ? 'team1' : 'team2') : null,
                lastEventMessage: isCompleted
                  ? `Match Completed (${t1} - ${t2})`
                  : `Score: ${t1} - ${t2}`,
                history: [],
              }
            : undefined,
        scoreSummary: t1 !== null && t2 !== null ? `${t1} - ${t2}` : undefined,
      });
      showNotification('success', `Match #${editingMatch.matchNumber} updated.`);
      setEditingMatch(null);
      onRefreshData();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to update match.');
    }
  };

  // Walkover (bylaw §6). `outcome` is the side that WINS by walkover, i.e.
  // the opposite of the team that did not come; 'both' = neither came.
  const handleWalkover = async (
    match: EnrichedMatch,
    outcome: 'team1' | 'team2' | 'both' | null
  ) => {
    const t1 = pairLabel(match.team1, 'Pair 1');
    const t2 = pairLabel(match.team2, 'Pair 2');
    const question =
      outcome === null
        ? `Clear the walkover for Match #${match.matchNumber} and return it to scheduled?`
        : outcome === 'both'
        ? `Neither team came for Match #${match.matchNumber}?\n\nBoth teams get a loss and no games.`
        : outcome === 'team1'
        ? `${t2} did not come?\n\nRecord a walkover: ${t1} wins 6-0.`
        : `${t1} did not come?\n\nRecord a walkover: ${t2} wins 6-0.`;
    if (!window.confirm(question)) return;

    try {
      await adminSetWalkover(session.token, match.id, outcome);
      showNotification(
        'success',
        outcome === null
          ? `Walkover cleared for Match #${match.matchNumber}.`
          : `Walkover recorded for Match #${match.matchNumber}.`
      );
      setEditingMatch(null);
      setAbsentMatch(null);
      onRefreshData();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to record walkover.');
    }
  };

  /** "Which team did not come?" choices, shared by the quick dialog and the edit window. */
  const renderAbsentChoices = (match: EnrichedMatch) => {
    const choice =
      'w-full text-left px-3.5 py-3 rounded-2xl bg-slate-50 border border-slate-200 hover:border-rose-300 hover:bg-rose-50 transition-colors cursor-pointer';
    return (
      <div className="grid grid-cols-1 gap-2">
        <button type="button" onClick={() => handleWalkover(match, 'team2')} className={choice}>
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-rose-600">Did not come</span>
          <span className="block text-sm font-bold text-[#0A0A0F]">{pairLabel(match.team1, 'Pair 1')}</span>
          <span className="block text-xs text-slate-500 mt-0.5">
            W/O — {pairLabel(match.team2, 'Pair 2')} wins 6-0
          </span>
        </button>
        <button type="button" onClick={() => handleWalkover(match, 'team1')} className={choice}>
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-rose-600">Did not come</span>
          <span className="block text-sm font-bold text-[#0A0A0F]">{pairLabel(match.team2, 'Pair 2')}</span>
          <span className="block text-xs text-slate-500 mt-0.5">
            W/O — {pairLabel(match.team1, 'Pair 1')} wins 6-0
          </span>
        </button>
        <button type="button" onClick={() => handleWalkover(match, 'both')} className={choice}>
          <span className="block text-sm font-bold text-rose-700">Neither team came</span>
          <span className="block text-xs text-slate-500 mt-0.5">Both teams get a loss, no games</span>
        </button>
        {match.walkover && (
          <button type="button" onClick={() => handleWalkover(match, null)} className={`${outlineButton} w-full`}>
            Clear walkover (back to scheduled)
          </button>
        )}
      </div>
    );
  };

  // Team did not come (bylaw §6): unplayed matches -> walkovers to opponents.
  const handleTeamWithdrawn = async (team: Team, withdrawn: boolean) => {
    const label = pairLabel(team, 'this team');
    const unplayed = matches.filter(
      (m) =>
        (m.team1Id === team.id || m.team2Id === team.id) &&
        m.status !== 'completed' &&
        m.status !== 'cancelled'
    ).length;
    const question = withdrawn
      ? `${label} did not come?\n\nTheir ${unplayed} unplayed match${
          unplayed === 1 ? '' : 'es'
        } will be recorded as walkovers: each opponent wins 6-0. Results already played stay.`
      : `${label} is back?\n\nThe walkovers created when they were marked absent will be cleared and those matches go back to scheduled.`;
    if (!window.confirm(question)) return;

    try {
      const { matchesChanged } = await adminSetTeamWithdrawn(session.token, team.id, withdrawn);
      showNotification(
        'success',
        withdrawn
          ? `${label} marked as did not come — ${matchesChanged} match${
              matchesChanged === 1 ? '' : 'es'
            } recorded as W/O.`
          : `${label} is back — ${matchesChanged} walkover${matchesChanged === 1 ? '' : 's'} cleared.`
      );
      onRefreshData();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to update team.');
    }
  };

  // Save the quarter-final pairings drawn by lot.
  const handleSaveQfDraw = async () => {
    const ids = qfDraw.flat();
    if (ids.some((id) => !id)) {
      showNotification('error', 'Fill all 8 quarter-final slots first.');
      return;
    }
    if (new Set(ids).size !== 8) {
      showNotification('error', 'Each team can only appear once in the draw.');
      return;
    }
    const summary = qfDraw
      .map(
        ([a, b], i) =>
          `QF${i + 1}: ${pairLabel(teams.find((t) => t.id === a))} vs ${pairLabel(teams.find((t) => t.id === b))}`
      )
      .join('\n');
    if (!window.confirm(`Save this quarter-final draw?\n\n${summary}`)) return;

    setSavingQfDraw(true);
    try {
      await adminSetQuarterFinalDraw(session.token, qfDraw as [string, string][]);
      showNotification('success', 'Quarter-final draw saved. The knockout bracket is updated.');
      onRefreshData();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to save the quarter-final draw.');
    } finally {
      setSavingQfDraw(false);
    }
  };

  // Live toss (bylaw §4): the winner is placed above every other team in the tie.
  const handleTossWinner = async (winner: StandingsRow, tied: StandingsRow[]) => {
    const others = tied.filter((r) => r.teamId !== winner.teamId);
    if (
      !window.confirm(
        `${pairLabel(winner)} won the live toss against ${others
          .map((r) => pairLabel(r))
          .join(' and ')}?`
      )
    ) {
      return;
    }
    try {
      await adminRecordToss(
        session.token,
        winner.teamId,
        others.map((r) => r.teamId)
      );
      showNotification('success', `Toss recorded: ${pairLabel(winner)} placed higher.`);
      onRefreshData();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to record toss.');
    }
  };

  const handleClearTosses = async () => {
    if (!window.confirm('Clear ALL recorded toss results? Tied teams will show "toss pending" again.')) {
      return;
    }
    try {
      await adminClearTosses(session.token);
      showNotification('success', 'All toss results cleared.');
      onRefreshData();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to clear toss results.');
    }
  };

  // Courts Manager
  const handleAddCourt = async () => {
    const newCourtNumber = courts.length + 1;
    const newCourts: Court[] = [
      ...courts,
      {
        id: `court-${Date.now().toString(36)}`,
        name: `Court ${newCourtNumber}`,
        active: true,
        order: newCourtNumber,
      },
    ];

    try {
      await adminSaveCourts(session.token, newCourts);
      showNotification('success', `Added Court ${newCourtNumber}.`);
      onRefreshData();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to add court.');
    }
  };

  const handleToggleCourt = async (courtId: string) => {
    const newCourts = courts.map((c) => (c.id === courtId ? { ...c, active: !c.active } : c));
    try {
      await adminSaveCourts(session.token, newCourts);
      showNotification('success', 'Court status updated.');
      onRefreshData();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to update court.');
    }
  };

  const handleDeleteCourt = async (courtId: string, courtName: string) => {
    if (!window.confirm(`Delete ${courtName}? Matches assigned will become unscheduled.`)) {
      return;
    }
    const newCourts = courts.filter((c) => c.id !== courtId);
    try {
      await adminSaveCourts(session.token, newCourts);
      showNotification('success', `${courtName} removed.`);
      onRefreshData();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to remove court.');
    }
  };

  // Export JSON / CSV
  const handleExportJson = async () => {
    try {
      const data = await adminExportData(session.token);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cpa_padel_tournament_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showNotification('success', 'Exported JSON backup file.');
    } catch (err: any) {
      showNotification('error', err.message || 'Export failed.');
    }
  };

  const handleExportCsv = async () => {
    try {
      // Build clean CSV of all matches and standings
      let csvContent = 'MatchNumber,Group,Pair1,Pair2,Court,ScheduledTime,Status,Pair1Score,Pair2Score\n';
      matches.forEach((m) => {
        csvContent += `${m.matchNumber},"${m.group?.name || ''}","${pairLabel(m.team1, '')}","${pairLabel(m.team2, '')}","${m.court?.name || ''}","${m.scheduledTime}","${m.status}",${m.team1Score ?? ''},${m.team2Score ?? ''}\n`;
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cpa_padel_matches_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showNotification('success', 'Exported CSV matches table.');
    } catch (err: any) {
      showNotification('error', err.message || 'Export failed.');
    }
  };

  // Copy Public Link
  const handleCopyLink = () => {
    const publicUrl = `${window.location.origin}/results`;
    navigator.clipboard.writeText(publicUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  /* ------------------------------------------------------------------ */
  /* Layout data                                                        */
  /* ------------------------------------------------------------------ */

  const completedCount = matches.filter((m) => m.status === 'completed').length;
  const liveCount = matches.filter((m) => m.status === 'live').length;
  const toEnterCount = matches.filter(
    (m) => m.status !== 'completed' && m.status !== 'cancelled' && m.team1Id && m.team2Id
  ).length;
  const qualifierSlots =
    (settings?.scoring?.qualifiersPerGroup ?? 1) * (groups.length || 5) + (settings?.scoring?.wildcardQualifiers ?? 3);

  const navGroups: { label: string; items: NavItem[] }[] = [
    {
      label: 'Match day',
      items: [
        {
          id: 'quick',
          label: 'Quick results',
          icon: ClipboardList,
          badge: toEnterCount > 0 ? { value: toEnterCount, tone: 'count' } : undefined,
        },
        {
          id: 'matches',
          label: 'Fixtures & edits',
          icon: Calendar,
          badge: liveCount > 0 ? { value: liveCount, tone: 'live' } : undefined,
        },
        {
          id: 'tiebreaks',
          label: 'Tie-breaks',
          icon: Coins,
          badge: tieSets.length > 0 ? { value: tieSets.length, tone: 'alert' } : undefined,
        },
        { id: 'qfdraw', label: 'QF draw', icon: Shuffle },
      ],
    },
    {
      label: 'Setup',
      items: [
        { id: 'teams', label: 'Teams', icon: Users, badge: { value: teams.length, tone: 'count' } },
        { id: 'courts', label: 'Courts', icon: LayoutGrid, badge: { value: courts.length, tone: 'count' } },
      ],
    },
    {
      label: 'Share',
      items: [
        { id: 'sheets', label: 'Export data', icon: FileSpreadsheet },
        { id: 'qr', label: 'QR poster', icon: QrCode },
      ],
    },
  ];

  const renderBadge = (badge: NavItem['badge'], active: boolean) => {
    if (!badge) return null;
    const tone =
      badge.tone === 'alert'
        ? 'bg-amber-400 text-[#0A0A0F]'
        : badge.tone === 'live'
        ? 'bg-[#CCFF00] text-[#0A0A0F] ring-1 ring-[#0A0A0F]/20'
        : active
        ? 'bg-white/15 text-white'
        : 'bg-slate-100 text-slate-600';
    return (
      <span
        className={`min-w-5 h-5 px-1.5 rounded-full text-[10px] font-mono font-black inline-flex items-center justify-center gap-1 ${tone}`}
      >
        {badge.tone === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-[#0A0A0F] animate-pulse" />}
        {badge.value}
      </span>
    );
  };

  const stats: {
    label: string;
    value: number;
    of?: number;
    tab: AdminTab;
    tone?: 'live' | 'alert';
    onOpen?: () => void;
  }[] = [
    { label: 'Results in', value: completedCount, of: matches.length, tab: 'quick' },
    {
      label: 'Live now',
      value: liveCount,
      tab: 'matches',
      tone: liveCount > 0 ? 'live' : undefined,
      onOpen: () => setFixtureFilter('live'),
    },
    { label: 'Tosses needed', value: tieSets.length, tab: 'tiebreaks', tone: tieSets.length > 0 ? 'alert' : undefined },
    { label: 'Qualified', value: qualifiedRows.length, of: qualifierSlots, tab: 'qfdraw' },
  ];

  /** A pairing line in the fixtures list: winner in ink, loser greyed. */
  const fixturePair = (m: EnrichedMatch, side: 1 | 2) => {
    const teamId = side === 1 ? m.team1Id : m.team2Id;
    const team = side === 1 ? m.team1 : m.team2;
    const scored = m.status === 'completed' && m.walkover !== 'both' && m.team1Score !== null && m.team2Score !== null;
    const lost = scored && (side === 1 ? m.team1Score! < m.team2Score! : m.team2Score! < m.team1Score!);
    return (
      <span
        className={`block leading-snug ${
          !teamId ? 'italic font-medium text-slate-400' : lost ? 'font-semibold text-slate-400' : 'font-bold text-[#0A0A0F]'
        }`}
      >
        {teamId ? pairLabel(team) : 'TBD'}
      </span>
    );
  };

  const fixtureScore = (m: EnrichedMatch) => {
    if (m.walkover === 'both') return <span className="text-xs font-mono font-bold text-slate-500">W/O</span>;
    if ((m.status === 'completed' || m.status === 'live') && m.team1Score !== null && m.team2Score !== null) {
      return (
        <span className="font-display font-bold text-2xl leading-none text-[#0A0A0F] whitespace-nowrap">
          {m.team1Score}–{m.team2Score}
        </span>
      );
    }
    return <span className="text-slate-300">—</span>;
  };

  const fixtureActions = (m: EnrichedMatch) => (
    <div className="flex items-center justify-end gap-1.5">
      {(m.status !== 'completed' || m.walkover) && m.status !== 'cancelled' && (
        <button
          type="button"
          onClick={() => setAbsentMatch(m)}
          title="A team did not come: record a walkover (W/O)"
          className={m.walkover ? smallDangerButton : smallQuietDangerButton}
        >
          {m.walkover ? 'W/O ✓' : 'Absent / W/O'}
        </button>
      )}
      <button
        type="button"
        onClick={() => setEditingMatch(m)}
        aria-label={`Edit match #${m.matchNumber}`}
        className={smallOutlineButton}
      >
        <Edit2 className="w-3 h-3" />
        Edit
      </button>
    </div>
  );

  const visibleFixtures = matches.filter((m) => matchesFixtureFilter(m, fixtureFilter));

  const teamsByGroup = [
    ...[...groups]
      .sort((a, b) => a.order - b.order)
      .map((g) => ({ id: g.id, name: g.name, teams: teams.filter((t) => t.groupId === g.id) })),
    { id: '__none__', name: 'No group', teams: teams.filter((t) => !groups.some((g) => g.id === t.groupId)) },
  ].filter((g) => g.id !== '__none__' || g.teams.length > 0);

  const groupOf = (row: StandingsRow) => groups.find((g) => g.id === row.groupId)?.name;

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  return (
    <div className="space-y-4 sm:space-y-6 pb-24">
      {/* Page heading, as on the public pages */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4 pt-1 sm:pt-4">
        <div>
          <p className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#0A0A0F]/70">
            Admin panel
          </p>
          <h1 className="mt-1 font-display font-bold uppercase tracking-tight text-[#0A0A0F] leading-[0.85] text-[2.75rem] sm:text-7xl">
            Tournament Control
          </h1>
        </div>
        <button
          type="button"
          id="btn-admin-reset-all-scores"
          onClick={() => {
            setShowResetAllConfirm(true);
            setFeedbackMessage(null);
          }}
          disabled={resettingAll}
          className={`${dangerButton} self-start sm:self-auto shadow-md`}
          title="Reset every match score to 0-0 and clear the knockout bracket back to TBD"
        >
          <RotateCcw className="w-4 h-4" />
          Reset all scores
        </button>
      </header>

      {/* Reset All Scores Confirmation */}
      {showResetAllConfirm && (
        <div
          role="alert"
          className="rounded-2xl bg-white border-2 border-rose-400 shadow-md px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-900">
              Reset the scores of <strong>all matches</strong> back to 0-0? Every completed and in-progress
              game is cleared, the spectator boards update immediately and the knockout bracket goes back
              to TBD. Courts and times stay. This cannot be undone.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              id="btn-admin-confirm-reset-all-scores"
              onClick={handleResetAllScores}
              disabled={resettingAll}
              className="min-h-10 px-4 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-mono font-bold uppercase tracking-widest transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              {resettingAll ? 'Resetting…' : 'Yes, reset all'}
            </button>
            <button
              type="button"
              onClick={() => setShowResetAllConfirm(false)}
              disabled={resettingAll}
              className={outlineButton}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* At-a-glance tiles; each one opens the tab that deals with it */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {stats.map((stat) => (
          <button
            key={stat.label}
            type="button"
            onClick={() => {
              stat.onOpen?.();
              setActiveSubTab(stat.tab);
            }}
            className={`text-left rounded-2xl sm:rounded-3xl border shadow-md hover:shadow-xl px-3.5 py-3 sm:p-5 transition-all cursor-pointer ${
              stat.tone === 'alert'
                ? 'bg-amber-50 border-amber-300 hover:border-amber-400'
                : 'bg-white border-blue-300/80 hover:border-blue-500'
            }`}
          >
            <span className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-widest text-slate-500">
              {stat.tone === 'live' && (
                <span className="w-2 h-2 rounded-full bg-[#CCFF00] border border-[#0A0A0F] animate-pulse" />
              )}
              {stat.tone === 'alert' && <Coins className="w-3.5 h-3.5 text-amber-600" />}
              {stat.label}
            </span>
            <span className="mt-1.5 sm:mt-2 flex items-baseline gap-1.5">
              <span className="font-display font-bold text-3xl sm:text-5xl leading-none text-[#0A0A0F]">
                {stat.value}
              </span>
              {stat.of !== undefined && (
                <span className="text-sm font-mono font-bold text-slate-400">/ {stat.of}</span>
              )}
            </span>
          </button>
        ))}
      </div>

      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-6 lg:items-start space-y-4 lg:space-y-0">
        {/* Phones and tablets: the site's swipeable pill-tab row */}
        <nav
          aria-label="Admin sections"
          className="lg:hidden flex items-center gap-1.5 p-1.5 bg-white/90 backdrop-blur-md border border-blue-400/60 rounded-2xl overflow-x-auto scrollbar-none shadow-md"
        >
          {navGroups
            .flatMap((g) => g.items)
            .map((item) => {
              const active = activeSubTab === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={(e) => {
                    setActiveSubTab(item.id);
                    e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
                  }}
                  className={`shrink-0 min-h-11 px-3.5 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap inline-flex items-center gap-2 transition-colors cursor-pointer ${
                    active ? 'bg-[#0A0A0F] text-[#CCFF00] shadow-md' : 'text-slate-800 hover:bg-blue-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                  {renderBadge(item.badge, active)}
                </button>
              );
            })}
        </nav>

        {/* Desktop: grouped sidebar */}
        <nav
          aria-label="Admin sections"
          className="hidden lg:block lg:sticky lg:top-4 bg-white border border-blue-300/80 rounded-3xl shadow-xl p-2.5"
        >
          {navGroups.map((group) => (
            <div key={group.label} className="pb-1.5">
              <div className="px-3 pt-3 pb-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400">
                {group.label}
              </div>
              {group.items.map((item) => {
                const active = activeSubTab === item.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setActiveSubTab(item.id)}
                    className={`w-full min-h-11 px-3 rounded-2xl text-sm font-bold flex items-center gap-3 text-left transition-colors cursor-pointer ${
                      active ? 'bg-[#0A0A0F] text-[#CCFF00] shadow-md' : 'text-slate-800 hover:bg-blue-50'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${active ? '' : 'text-blue-600'}`} />
                    <span className="flex-1 min-w-0 truncate">{item.label}</span>
                    {renderBadge(item.badge, active)}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="min-w-0 space-y-4">
          {/* Tie-break reminder on the match-day tabs */}
          {tieSets.length > 0 && (activeSubTab === 'matches' || activeSubTab === 'qfdraw' || activeSubTab === 'quick') && (
            <button
              type="button"
              onClick={() => setActiveSubTab('tiebreaks')}
              className="w-full text-left rounded-2xl bg-amber-50 border-2 border-amber-300 px-4 py-3 text-sm font-bold text-amber-900 flex items-center gap-3 shadow-md cursor-pointer hover:border-amber-400"
            >
              <Coins className="w-5 h-5 text-amber-600 shrink-0" />
              <span className="flex-1">
                {tieSets.length} live toss{tieSets.length === 1 ? '' : 'es'} needed to settle the standings
              </span>
              <span className="text-[11px] font-mono uppercase tracking-widest">Open →</span>
            </button>
          )}

          {/* TAB: QUICK RESULTS (final games typed from the paper score sheets) */}
          {activeSubTab === 'quick' && (
            <QuickResultsPanel
              token={session.token}
              matches={matches}
              courts={courts}
              onRefreshData={onRefreshData}
            />
          )}

          {/* TAB: FIXTURES — schedule and score corrections */}
          {activeSubTab === 'matches' && (
            <SectionCard
              title="Fixtures"
              aside={<BandLabel>{matches.length} matches</BandLabel>}
              strip="Edit fixes a score, court, time or status · Absent / W/O records a walkover"
              bodyClassName=""
            >
              <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3">
                <div className="flex items-center gap-1.5 p-1.5 bg-white border border-blue-400/60 rounded-2xl overflow-x-auto scrollbar-none">
                  {FIXTURE_FILTERS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      aria-pressed={fixtureFilter === f.id}
                      onClick={() => setFixtureFilter(f.id)}
                      className={`flex-1 px-3 py-2 rounded-xl text-xs sm:text-sm font-black tracking-wider uppercase whitespace-nowrap transition-colors cursor-pointer ${
                        fixtureFilter === f.id ? 'bg-[#0A0A0F] text-[#CCFF00] shadow-md' : 'text-slate-800 hover:bg-blue-100'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {visibleFixtures.length === 0 ? (
                <p className="px-6 pb-8 pt-4 text-center text-sm italic text-slate-500">No matches here.</p>
              ) : (
                <>
                  {/* Tablet / desktop: table */}
                  <div className="hidden md:block">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-y border-slate-200 text-[10px] font-mono font-bold uppercase tracking-widest text-slate-500">
                          <th className="py-3 pl-6 pr-2 w-12">#</th>
                          <th className="py-3 px-3">Pairings</th>
                          <th className="py-3 px-3">Court · Time</th>
                          <th className="py-3 px-3">Status</th>
                          <th className="py-3 px-3 text-center">Score</th>
                          <th className="py-3 pl-3 pr-6 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visibleFixtures.map((m) => (
                          <tr key={m.id} className={m.status === 'live' ? 'bg-[#CCFF00]/10' : 'hover:bg-blue-50/50'}>
                            <td className="py-3 pl-6 pr-2 align-top font-mono font-bold text-slate-400">{m.matchNumber}</td>
                            <td className="py-3 px-3 align-top">
                              <span className="block text-[10px] font-mono font-bold uppercase tracking-wider text-blue-700 mb-0.5">
                                {adminStageLabel(m)}
                              </span>
                              {fixturePair(m, 1)}
                              {fixturePair(m, 2)}
                            </td>
                            <td className="py-3 px-3 align-top">
                              <span className="block font-semibold text-slate-700 whitespace-nowrap">
                                {m.court?.name || 'Unassigned'}
                              </span>
                              <span className="block text-xs font-mono text-slate-500 whitespace-nowrap">{m.scheduledTime}</span>
                            </td>
                            <td className="py-3 px-3 align-top">
                              <MatchStatusPill match={m} />
                            </td>
                            <td className="py-3 px-3 align-top text-center">{fixtureScore(m)}</td>
                            <td className="py-3 pl-3 pr-6 align-top">{fixtureActions(m)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Phones: match tiles */}
                  <ul className="md:hidden px-3 pb-3 space-y-2.5">
                    {visibleFixtures.map((m) => (
                      <li
                        key={m.id}
                        className={`p-3.5 rounded-2xl border space-y-2.5 ${
                          m.status === 'live' ? 'bg-[#CCFF00]/10 border-[#0A0A0F]' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-700 truncate min-w-0">
                            Match #{m.matchNumber} • {adminStageLabel(m)}
                          </span>
                          <MatchStatusPill match={m} />
                        </div>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <div className="min-w-0">
                            {fixturePair(m, 1)}
                            {fixturePair(m, 2)}
                          </div>
                          <div className="shrink-0">{fixtureScore(m)}</div>
                        </div>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-xs font-mono text-slate-500">
                            {m.court?.name || 'Unassigned'} · {m.scheduledTime}
                          </span>
                          {fixtureActions(m)}
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </SectionCard>
          )}

          {/* TAB: TIE-BREAKS (live toss, bylaw §4) */}
          {activeSubTab === 'tiebreaks' && (
            <SectionCard
              title="Tie-breaks"
              aside={
                <button type="button" onClick={handleClearTosses} className={bandOutlineButton}>
                  Clear all
                </button>
              }
              strip="Bylaw §4 · points → game difference → live toss"
            >
              <p className="text-sm text-slate-600 max-w-2xl">
                Teams level on points are separated by game difference. If they are still level, a live
                toss decides. Ties show up here once a group (or, for the runners-up, the whole group
                stage) is finished. Record each toss winner below.
              </p>

              {tieSets.length === 0 ? (
                <div className="py-8 rounded-2xl bg-slate-50 border border-slate-200 text-center text-sm text-slate-500">
                  <CheckCircle2 className="w-6 h-6 text-blue-600 mx-auto mb-2" />
                  No tosses needed right now.
                </div>
              ) : (
                tieSets.map((set) => (
                  <div
                    key={`${set.label}-${set.rows.map((r) => r.teamId).join('-')}`}
                    className="rounded-2xl bg-amber-50 border-2 border-amber-300 p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xl font-display font-semibold uppercase tracking-wide leading-none text-[#0A0A0F]">
                        {set.label}
                      </span>
                      <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-800">
                        {set.rows[0].points} pts · game diff{' '}
                        {set.rows[0].scoreDiff > 0 ? `+${set.rows[0].scoreDiff}` : set.rows[0].scoreDiff} ·{' '}
                        {set.rows.length} level
                      </span>
                    </div>
                    <div className="space-y-2">
                      {set.rows.map((row) => (
                        <div
                          key={row.teamId}
                          className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-white border border-amber-200"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-[#0A0A0F] truncate">{pairLabel(row)}</div>
                            <div className="text-[11px] font-mono text-slate-500">
                              {groupOf(row)} · #{row.position}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleTossWinner(row, set.rows)}
                            className={`${primaryButton} min-h-9 px-3.5 text-[10px] shrink-0`}
                          >
                            Won toss
                          </button>
                        </div>
                      ))}
                    </div>
                    {set.rows.length > 2 && (
                      <p className="text-xs text-amber-900">
                        3+ teams level: record the first toss winner, then run the next toss between the
                        remaining teams.
                      </p>
                    )}
                  </div>
                ))
              )}
            </SectionCard>
          )}

          {/* TAB: QUARTER-FINAL DRAW BY LOT */}
          {activeSubTab === 'qfdraw' && (
            <SectionCard
              title="Quarter-final draw"
              aside={<BandLabel>By lot</BandLabel>}
              strip="QF1 & QF2 winners → SF1 · QF3 & QF4 winners → SF2"
            >
              <p className="text-sm text-slate-600 max-w-2xl">
                The 8 qualified teams draw lots live at the venue. Enter the pairings here exactly as
                drawn.
              </p>

              {qfStarted && (
                <div className="rounded-2xl bg-white border-2 border-rose-400 px-4 py-3 text-sm font-semibold text-rose-800">
                  A quarter-final has already started, so the draw is locked. Reset that match's score
                  to change the draw.
                </div>
              )}
              {qualifiedRows.length < 8 && (
                <div className="rounded-2xl bg-amber-50 border-2 border-amber-300 px-4 py-3 text-sm font-semibold text-amber-900">
                  Only {qualifiedRows.length} teams are qualified so far. Finish the group stage before the
                  draw.
                </div>
              )}

              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-2.5">
                <span className={fieldLabel}>Qualified teams ({qualifiedRows.length})</span>
                <div className="flex flex-wrap gap-1.5">
                  {qualifiedRows.length === 0 && (
                    <span className="text-sm italic text-slate-500">Nobody has qualified yet.</span>
                  )}
                  {qualifiedRows.map((row) => {
                    const used = qfDraw.flat().includes(row.teamId);
                    return (
                      <span
                        key={row.teamId}
                        className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                          used
                            ? 'bg-white text-slate-400 border-slate-200 line-through'
                            : 'bg-[#CCFF00] text-[#0A0A0F] border-[#0A0A0F]/20'
                        }`}
                      >
                        {pairLabel(row)}
                        <span className="ml-1.5 text-[10px] font-mono font-bold opacity-60">
                          {groupOf(row)} #{row.position}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {qfDraw.map((pair, qfIndex) => (
                  <div key={qfIndex} className="rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-2.5 bg-[#0A0A0F] flex items-center justify-between">
                      <span className="text-2xl font-display font-semibold uppercase tracking-wide leading-none text-[#CCFF00]">
                        QF{qfIndex + 1}
                      </span>
                      <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/60">
                        Winner → SF{qfIndex < 2 ? 1 : 2}
                      </span>
                    </div>
                    <div className="p-3 space-y-2">
                      {pair.map((teamId, slot) => (
                        <select
                          key={slot}
                          value={teamId}
                          disabled={qfStarted}
                          aria-label={`QF${qfIndex + 1} team ${slot + 1}`}
                          onChange={(e) =>
                            setQfDraw((current) =>
                              current.map((p, i) =>
                                i === qfIndex ? p.map((id, s) => (s === slot ? e.target.value : id)) : p
                              )
                            )
                          }
                          className={fieldInput}
                        >
                          <option value="">— pick team —</option>
                          {qualifiedRows.map((row) => {
                            const takenElsewhere = row.teamId !== teamId && qfDraw.flat().includes(row.teamId);
                            return (
                              <option key={row.teamId} value={row.teamId} disabled={takenElsewhere}>
                                {pairLabel(row)} ({groupOf(row)})
                                {takenElsewhere ? ' — already drawn' : ''}
                              </option>
                            );
                          })}
                        </select>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSaveQfDraw}
                  disabled={qfStarted || savingQfDraw}
                  className={`${primaryButton} min-h-11 px-5`}
                >
                  {savingQfDraw ? 'Saving…' : 'Save quarter-final draw'}
                </button>
                <button
                  type="button"
                  onClick={() => setQfDraw([['', ''], ['', ''], ['', ''], ['', '']])}
                  disabled={qfStarted || savingQfDraw}
                  className={`${outlineButton} min-h-11`}
                >
                  Clear form
                </button>
              </div>
            </SectionCard>
          )}

          {/* TAB: TEAMS */}
          {activeSubTab === 'teams' && (
            <SectionCard
              title="Teams"
              aside={
                <button
                  type="button"
                  onClick={() =>
                    setEditingTeam({
                      name: '',
                      player1: '',
                      player2: '',
                      groupId: groups[0]?.id || 'group-a',
                    })
                  }
                  className={bandButton}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add team
                </button>
              }
              strip={`${teams.length} pairings · ${groups.length} groups · Did not come records walkovers for every unplayed match`}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
                {teamsByGroup.map((group) => (
                  <div key={group.id} className="rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 flex items-center justify-between gap-2">
                      <span className="text-xl font-display font-semibold uppercase tracking-wide leading-none text-[#0A0A0F]">
                        {group.name}
                      </span>
                      <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-blue-800/80">
                        {group.teams.length} pairs
                      </span>
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {group.teams.length === 0 && (
                        <li className="px-4 py-4 text-sm italic text-slate-500">No pairings yet.</li>
                      )}
                      {group.teams.map((t) => (
                        <li
                          key={t.id}
                          className={`px-4 py-3 flex items-center gap-3 ${t.withdrawn ? 'bg-rose-50' : ''}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div
                              className={`text-sm font-bold leading-snug ${
                                t.withdrawn ? 'text-slate-400 line-through' : 'text-[#0A0A0F]'
                              }`}
                            >
                              {pairLabel(t, 'TBD')}
                            </div>
                            {t.withdrawn && (
                              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-rose-600">
                                Did not come
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleTeamWithdrawn(t, !t.withdrawn)}
                            className={t.withdrawn ? smallOutlineButton : smallQuietDangerButton}
                          >
                            {t.withdrawn ? 'Team is back' : 'Did not come'}
                          </button>
                          <div className="flex items-center shrink-0">
                            <button
                              type="button"
                              onClick={() => setEditingTeam(t)}
                              className="w-8 h-8 rounded-full text-slate-500 hover:text-[#0A0A0F] hover:bg-slate-100 inline-flex items-center justify-center cursor-pointer"
                              aria-label={`Edit ${pairLabel(t, 'team')}`}
                              title="Edit team"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTeam(t.id, pairLabel(t, 'this pairing'))}
                              className="w-8 h-8 rounded-full text-slate-500 hover:text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center cursor-pointer"
                              aria-label={`Delete ${pairLabel(t, 'team')}`}
                              title="Delete team"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* TAB: COURTS */}
          {activeSubTab === 'courts' && (
            <SectionCard
              title="Courts"
              aside={
                <button type="button" onClick={handleAddCourt} className={bandButton}>
                  <Plus className="w-3.5 h-3.5" />
                  Add court
                </button>
              }
              strip={`${courts.filter((c) => c.active).length} active · scorekeepers and spectators see active courts`}
            >
              <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden">
                {courts.map((court) => {
                  const courtMatches = matches.filter((m) => m.courtId === court.id).length;
                  return (
                    <li key={court.id} className="px-4 py-3.5 flex items-center gap-3 flex-wrap sm:flex-nowrap">
                      <div className="flex-1 min-w-0">
                        <div className="text-2xl font-display font-semibold uppercase tracking-wide leading-none text-[#0A0A0F] truncate">
                          {court.name}
                        </div>
                        <div className="mt-1 text-[11px] font-mono font-bold text-slate-500">
                          {courtMatches} match{courtMatches === 1 ? '' : 'es'} scheduled
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black uppercase tracking-wider ${
                          court.active ? 'bg-[#CCFF00] text-[#0A0A0F]' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {court.active ? 'Active' : 'Inactive'}
                      </span>
                      <button type="button" onClick={() => handleToggleCourt(court.id)} className={smallOutlineButton}>
                        {court.active ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCourt(court.id, court.name)}
                        className="w-8 h-8 rounded-full text-slate-500 hover:text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center cursor-pointer"
                        aria-label={`Delete ${court.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </SectionCard>
          )}

          {/* TAB: EXPORT (Google Sheets & CSV) */}
          {activeSubTab === 'sheets' && (
            <SectionCard title="Export data" strip="Backups and Google Sheets">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  id="btn-export-csv"
                  onClick={handleExportCsv}
                  className="p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-blue-500 transition-colors flex items-center justify-between gap-3 text-left cursor-pointer group"
                >
                  <div>
                    <span className="block text-sm font-bold text-[#0A0A0F] group-hover:text-blue-700">
                      Matches & scores (.csv)
                    </span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      Every fixture and score, ready for Excel or Google Sheets
                    </span>
                  </div>
                  <Download className="w-5 h-5 text-blue-600 shrink-0" />
                </button>

                <button
                  type="button"
                  id="btn-export-json"
                  onClick={handleExportJson}
                  className="p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-blue-500 transition-colors flex items-center justify-between gap-3 text-left cursor-pointer group"
                >
                  <div>
                    <span className="block text-sm font-bold text-[#0A0A0F] group-hover:text-blue-700">
                      Full tournament backup (.json)
                    </span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      Teams, groups, courts, settings and standings
                    </span>
                  </div>
                  <Download className="w-5 h-5 text-blue-600 shrink-0" />
                </button>
              </div>

              <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4 sm:p-5 space-y-3">
                <h3 className="text-xl font-display font-semibold uppercase tracking-wide leading-none text-[#0A0A0F]">
                  Live link to Google Sheets
                </h3>
                <ol className="text-sm text-slate-700 space-y-2 list-decimal list-inside leading-relaxed">
                  <li>Open your Google Sheet and select cell A1.</li>
                  <li>
                    To pull the matches:{' '}
                    <code className="px-2 py-0.5 rounded-lg bg-white border border-blue-200 text-blue-800 font-mono text-xs break-all">
                      =IMPORTDATA("{window.location.origin}/api/matches")
                    </code>
                  </li>
                  <li>
                    To pull the standings:{' '}
                    <code className="px-2 py-0.5 rounded-lg bg-white border border-blue-200 text-blue-800 font-mono text-xs break-all">
                      =IMPORTDATA("{window.location.origin}/api/standings")
                    </code>
                  </li>
                  <li>
                    Google Sheets refreshes this about every hour; a Google Apps Script timer can fetch it
                    every minute without changing the website.
                  </li>
                </ol>
              </div>
            </SectionCard>
          )}

          {/* TAB: QR CODE POSTER */}
          {activeSubTab === 'qr' && (
            <SectionCard title="QR poster" strip="Print it on banners so spectators open the live results">
              <div className="max-w-sm mx-auto text-center space-y-4">
                {qrDataUrl && (
                  <div className="p-4 bg-white rounded-3xl border border-slate-200 shadow-md inline-block">
                    <img
                      src={qrDataUrl}
                      alt="Tournament Live Results QR Code"
                      className="w-56 h-56 mx-auto rounded-lg"
                    />
                  </div>
                )}

                <div className="p-2 pl-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs flex items-center justify-between gap-2">
                  <span className="truncate font-mono font-bold text-slate-600">{`${window.location.origin}/results`}</span>
                  <button type="button" onClick={handleCopyLink} className={smallOutlineButton}>
                    <Copy className="w-3.5 h-3.5" />
                    {copiedLink ? 'Copied!' : 'Copy'}
                  </button>
                </div>

                {qrDataUrl && (
                  <a
                    href={qrDataUrl}
                    download="cpa_padel_tournament_qr.png"
                    className={`${primaryButton} w-full min-h-12`}
                  >
                    <Download className="w-4 h-4" />
                    Download QR code
                  </a>
                )}
              </div>
            </SectionCard>
          )}
        </div>
      </div>

      {/* MATCH EDITING DIALOG */}
      {editingMatch && (
        <AdminDialog
          title={`Edit match #${editingMatch.matchNumber}`}
          subtitle={`${adminStageLabel(editingMatch)} · ${editingMatch.court?.name || 'No court'} · ${editingMatch.scheduledTime}`}
          onClose={() => setEditingMatch(null)}
          onSubmit={handleSaveMatchDetails}
        >
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-sm font-bold text-center text-[#0A0A0F]">
            {pairLabel(editingMatch.team1, 'TBD')} <span className="font-mono text-xs text-slate-400 mx-1">vs</span>{' '}
            {pairLabel(editingMatch.team2, 'TBD')}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel} htmlFor="edit-match-court">Court</label>
              <select
                id="edit-match-court"
                value={editingMatch.courtId || ''}
                onChange={(e) => setEditingMatch({ ...editingMatch, courtId: e.target.value || null })}
                className={fieldInput}
              >
                <option value="">Unassigned</option>
                {courts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={fieldLabel} htmlFor="edit-match-time">Scheduled time</label>
              <input
                id="edit-match-time"
                type="text"
                value={editingMatch.scheduledTime}
                onChange={(e) => setEditingMatch({ ...editingMatch, scheduledTime: e.target.value })}
                className={fieldInput}
              />
            </div>
          </div>

          <div>
            <label className={fieldLabel} htmlFor="edit-match-status">Status</label>
            <select
              id="edit-match-status"
              value={editingMatch.status}
              onChange={(e) => setEditingMatch({ ...editingMatch, status: e.target.value as any })}
              className={fieldInput}
            >
              <option value="scheduled">Scheduled</option>
              <option value="ready">Ready</option>
              <option value="live">Live</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label className={`${fieldLabel} truncate`} htmlFor="edit-match-score1">
                {pairLabel(editingMatch.team1, 'Pair 1')}
              </label>
              <input
                id="edit-match-score1"
                type="number"
                min="0"
                max="6"
                value={editingMatch.team1Score ?? ''}
                onChange={(e) =>
                  setEditingMatch({
                    ...editingMatch,
                    team1Score: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                placeholder="Games, e.g. 6"
                className={fieldInput}
              />
            </div>
            <div className="min-w-0">
              <label className={`${fieldLabel} truncate`} htmlFor="edit-match-score2">
                {pairLabel(editingMatch.team2, 'Pair 2')}
              </label>
              <input
                id="edit-match-score2"
                type="number"
                min="0"
                max="6"
                value={editingMatch.team2Score ?? ''}
                onChange={(e) =>
                  setEditingMatch({
                    ...editingMatch,
                    team2Score: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                placeholder="Games, e.g. 4"
                className={fieldInput}
              />
            </div>
          </div>

          {/* Walkover (bylaw §6): 5-minute grace period expired */}
          <div className="rounded-2xl border border-slate-200 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className={`${fieldLabel} mb-0`}>Walkover (W/O)</span>
              {editingMatch.walkover && (
                <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-mono font-black uppercase tracking-wider">
                  {editingMatch.walkover === 'both'
                    ? 'Both absent'
                    : `W/O to ${pairLabel(
                        editingMatch.walkover === 'team1' ? editingMatch.team1 : editingMatch.team2,
                        'team'
                      )}`}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Which team did not come? A walkover counts as a 6-0 win for the team that came.
            </p>
            {renderAbsentChoices(editingMatch)}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setEditingMatch(null)} className={outlineButton}>
              Cancel
            </button>
            <button type="submit" className={primaryButton}>
              Save changes
            </button>
          </div>
        </AdminDialog>
      )}

      {/* TEAM ABSENT / WALKOVER DIALOG (bylaw §6) */}
      {absentMatch && (
        <AdminDialog
          title="Team did not come"
          subtitle={`Match #${absentMatch.matchNumber} · ${absentMatch.group?.name || adminStageLabel(absentMatch)} · ${absentMatch.scheduledTime}`}
          onClose={() => setAbsentMatch(null)}
          maxWidth="max-w-md"
        >
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-sm font-bold text-center text-[#0A0A0F]">
            {pairLabel(absentMatch.team1, 'TBD')} <span className="font-mono text-xs text-slate-400 mx-1">vs</span>{' '}
            {pairLabel(absentMatch.team2, 'TBD')}
          </div>
          <p className="text-sm text-slate-600">
            Bylaw §6: after the 5-minute grace period, the team that came wins by walkover (6-0).
          </p>
          {renderAbsentChoices(absentMatch)}
        </AdminDialog>
      )}

      {/* TEAM EDIT / ADD DIALOG */}
      {editingTeam && (
        <AdminDialog
          title={editingTeam.id ? 'Edit team' : 'Add team'}
          onClose={() => setEditingTeam(null)}
          onSubmit={handleSaveTeam}
          maxWidth="max-w-md"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel} htmlFor="edit-team-p1">Player 1</label>
              <input
                id="edit-team-p1"
                type="text"
                value={editingTeam.player1 || ''}
                onChange={(e) => setEditingTeam({ ...editingTeam, player1: e.target.value })}
                className={fieldInput}
              />
            </div>
            <div>
              <label className={fieldLabel} htmlFor="edit-team-p2">Player 2</label>
              <input
                id="edit-team-p2"
                type="text"
                value={editingTeam.player2 || ''}
                onChange={(e) => setEditingTeam({ ...editingTeam, player2: e.target.value })}
                className={fieldInput}
              />
            </div>
          </div>

          <div>
            <label className={fieldLabel} htmlFor="edit-team-group">Group</label>
            <select
              id="edit-team-group"
              value={editingTeam.groupId || groups[0]?.id}
              onChange={(e) => setEditingTeam({ ...editingTeam, groupId: e.target.value })}
              className={fieldInput}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setEditingTeam(null)} className={outlineButton}>
              Cancel
            </button>
            <button type="submit" className={primaryButton}>
              Save team
            </button>
          </div>
        </AdminDialog>
      )}

      {/* Feedback toast: fixed, so it shows wherever the page is scrolled and above dialogs */}
      {feedbackMessage && (
        <div
          id="admin-alert-banner"
          role={feedbackMessage.type === 'error' ? 'alert' : 'status'}
          className={`fixed z-[60] bottom-4 inset-x-4 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[26rem] rounded-2xl bg-white border-2 shadow-2xl px-4 py-3 flex items-start gap-3 ${
            feedbackMessage.type === 'success' ? 'border-blue-300' : 'border-rose-400'
          }`}
        >
          {feedbackMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          )}
          <p
            className={`flex-1 min-w-0 text-sm font-semibold ${
              feedbackMessage.type === 'success' ? 'text-blue-900' : 'text-rose-800'
            }`}
          >
            {feedbackMessage.text}
          </p>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            aria-label="Dismiss message"
            className="shrink-0 w-8 h-8 -mr-1.5 -my-0.5 rounded-full text-slate-500 hover:bg-slate-100 inline-flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
