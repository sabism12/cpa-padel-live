import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Users,
  Grid,
  Calendar,
  Settings,
  Download,
  Upload,
  QrCode,
  RotateCcw,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Share2,
  Copy,
  ExternalLink,
  Flame,
  FileSpreadsheet,
  Coins,
  Shuffle,
} from 'lucide-react';
import QRCode from 'qrcode';
import { Team, Group, Court, Match, TournamentSettings, AuthSession, StandingsRow } from '../types';
import { pairLabel } from '../utils/teamDisplay';
import {
  EnrichedMatch,
  adminSaveTeam,
  adminDeleteTeam,
  adminSaveCourts,
  adminSaveGroups,
  adminUpdateMatch,
  adminExportData,
  adminImportData,
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
  const [activeSubTab, setActiveSubTab] = useState<
    'matches' | 'tiebreaks' | 'qfdraw' | 'teams' | 'courts' | 'sheets' | 'qr'
  >('matches');

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
      <div className="max-w-xl mx-auto py-12 px-4 text-center">
        <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-zinc-400 flex items-center justify-center mx-auto">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold font-display text-white">Administrator Access Required</h2>
            <p className="text-sm text-slate-400 mt-2">
              Only tournament directors and administrators can modify teams, auto-generate rounds,
              reschedule courts, and adjust rules.
            </p>
          </div>
          <button
            id="btn-admin-login-prompt"
            onClick={onOpenAuth}
            className="w-full py-3.5 px-6 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20 transition-all"
          >
            Sign In with Administrator Credentials
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
  const renderAbsentChoices = (match: EnrichedMatch) => (
    <div className="grid grid-cols-1 gap-2">
      <button
        type="button"
        onClick={() => handleWalkover(match, 'team2')}
        className="px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold text-left"
      >
        <span className="text-rose-300">Did not come:</span> {pairLabel(match.team1, 'Pair 1')}
        <span className="block text-[10px] font-medium text-slate-400 mt-0.5">
          W/O — {pairLabel(match.team2, 'Pair 2')} wins 6-0
        </span>
      </button>
      <button
        type="button"
        onClick={() => handleWalkover(match, 'team1')}
        className="px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold text-left"
      >
        <span className="text-rose-300">Did not come:</span> {pairLabel(match.team2, 'Pair 2')}
        <span className="block text-[10px] font-medium text-slate-400 mt-0.5">
          W/O — {pairLabel(match.team1, 'Pair 1')} wins 6-0
        </span>
      </button>
      <button
        type="button"
        onClick={() => handleWalkover(match, 'both')}
        className="px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 text-xs font-bold text-left"
      >
        Neither team came
        <span className="block text-[10px] font-medium text-slate-400 mt-0.5">
          Both teams get a loss, no games
        </span>
      </button>
      {match.walkover && (
        <button
          type="button"
          onClick={() => handleWalkover(match, null)}
          className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-bold text-left"
        >
          Clear walkover (back to scheduled)
        </button>
      )}
    </div>
  );

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

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Admin Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-500 text-white font-black shadow-lg shadow-blue-500/20">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-display font-bold text-white">
              ADMIN CONTROL PANEL
            </h1>
            <p className="text-xs text-slate-400">
              Manage teams &bull; Schedule fixtures &bull; Score corrections &bull; Google Sheets
            </p>
          </div>
        </div>

        {/* Global Action Quick Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            id="btn-admin-reset-all-scores"
            onClick={() => {
              setShowResetAllConfirm(true);
              setFeedbackMessage(null);
            }}
            disabled={resettingAll}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title="Reset every match score to 0-0 and clear the knockout bracket back to TBD"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset All Scores</span>
          </button>
        </div>
      </div>

      {/* Reset All Scores Confirmation */}
      {showResetAllConfirm && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/40 text-rose-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5 sm:mt-0" />
            <span>
              Reset the scores of <strong>ALL matches</strong> back to 0-0? Every completed and
              in-progress game will be cleared and the spectator boards will update immediately.
              The knockout bracket will also be cleared back to TBD. Court times and courts stay
              unchanged. This cannot be undone.
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              id="btn-admin-confirm-reset-all-scores"
              onClick={handleResetAllScores}
              disabled={resettingAll}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {resettingAll ? 'Resetting…' : 'Yes, Reset All'}
            </button>
            <button
              type="button"
              onClick={() => setShowResetAllConfirm(false)}
              disabled={resettingAll}
              className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Feedback Alert */}
      {feedbackMessage && (
        <div
          id="admin-alert-banner"
          className={`p-3.5 rounded-xl border text-xs sm:text-sm flex items-center justify-between gap-2 animate-in zoom-in-95 duration-150 ${
            feedbackMessage.type === 'success'
              ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
          <button onClick={() => setFeedbackMessage(null)} className="text-xs opacity-70 hover:opacity-100">
            &times;
          </button>
        </div>
      )}

      {/* Sub Tabs Navigation */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('matches')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${
            activeSubTab === 'matches'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Match Fixtures ({matches.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('tiebreaks')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${
            activeSubTab === 'tiebreaks'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Coins className="w-4 h-4" />
          <span>Tie-breaks</span>
          {tieSets.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black">
              {tieSets.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('qfdraw')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${
            activeSubTab === 'qfdraw'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shuffle className="w-4 h-4" />
          <span>QF Draw</span>
        </button>

        <button
          onClick={() => setActiveSubTab('teams')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${
            activeSubTab === 'teams'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Teams ({teams.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('courts')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${
            activeSubTab === 'courts'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Grid className="w-4 h-4" />
          <span>Courts ({courts.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('sheets')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${
            activeSubTab === 'sheets'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Google Sheets & CSV</span>
        </button>

        <button
          onClick={() => setActiveSubTab('qr')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${
            activeSubTab === 'qr'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <QrCode className="w-4 h-4" />
          <span>QR Code Poster</span>
        </button>
      </div>

      {/* TAB: QUARTER-FINAL DRAW BY LOT */}
      {activeSubTab === 'qfdraw' && (
        <div className="space-y-4 max-w-3xl">
          <div>
            <h3 className="text-base font-bold text-white font-display">Quarter-final Draw (by lot)</h3>
            <p className="text-xs text-slate-400 max-w-xl">
              The 8 qualified teams draw lots live at the venue. Enter the drawn pairings here
              exactly as drawn. The semi-finals follow the bracket: QF1 winner vs QF2 winner, and
              QF3 winner vs QF4 winner.
            </p>
          </div>

          {qfStarted && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs">
              A quarter-final has already started, so the draw is locked. Reset that match's score to
              change the draw.
            </div>
          )}
          {qualifiedRows.length < 8 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
              Only {qualifiedRows.length} teams are qualified so far. Finish the group stage before
              the draw.
            </div>
          )}
          {tieSets.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveSubTab('tiebreaks')}
              className="w-full text-left p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs font-bold"
            >
              A live toss is still needed to settle who qualifies — open Tie-breaks →
            </button>
          )}

          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
            <span className="text-xs font-black uppercase tracking-wider text-lime-400">
              Qualified teams ({qualifiedRows.length})
            </span>
            <div className="flex flex-wrap gap-1.5">
              {qualifiedRows.map((row) => {
                const used = qfDraw.flat().includes(row.teamId);
                return (
                  <span
                    key={row.teamId}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${
                      used
                        ? 'bg-slate-950 text-slate-500 border-slate-800 line-through'
                        : 'bg-lime-400/10 text-lime-300 border-lime-400/30'
                    }`}
                  >
                    {pairLabel(row)}
                    <span className="ml-1 text-[9px] text-slate-500">
                      {groups.find((g) => g.id === row.groupId)?.name} #{row.position}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {qfDraw.map((pair, qfIndex) => (
              <div key={qfIndex} className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-white">
                    QF{qfIndex + 1}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    winner → SF{qfIndex < 2 ? 1 : 2}
                  </span>
                </div>
                {pair.map((teamId, slot) => (
                  <select
                    key={slot}
                    value={teamId}
                    disabled={qfStarted}
                    onChange={(e) =>
                      setQfDraw((current) =>
                        current.map((p, i) =>
                          i === qfIndex ? p.map((id, s) => (s === slot ? e.target.value : id)) : p
                        )
                      )
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-lime-400 disabled:opacity-50"
                  >
                    <option value="">— pick team —</option>
                    {qualifiedRows.map((row) => {
                      const takenElsewhere =
                        row.teamId !== teamId && qfDraw.flat().includes(row.teamId);
                      return (
                        <option key={row.teamId} value={row.teamId} disabled={takenElsewhere}>
                          {pairLabel(row)} ({groups.find((g) => g.id === row.groupId)?.name})
                          {takenElsewhere ? ' — already drawn' : ''}
                        </option>
                      );
                    })}
                  </select>
                ))}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSaveQfDraw}
              disabled={qfStarted || savingQfDraw}
              className="px-5 py-2.5 rounded-xl text-sm font-bold bg-lime-400 hover:bg-lime-300 text-slate-950 shadow-md disabled:opacity-50"
            >
              {savingQfDraw ? 'Saving…' : 'Save Quarter-final Draw'}
            </button>
            <button
              type="button"
              onClick={() => setQfDraw([['', ''], ['', ''], ['', ''], ['', '']])}
              disabled={qfStarted || savingQfDraw}
              className="px-4 py-2.5 rounded-xl text-sm font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-50"
            >
              Clear form
            </button>
          </div>
        </div>
      )}

      {/* TAB: TIE-BREAKS (live toss, bylaw §4) */}
      {activeSubTab === 'tiebreaks' && (
        <div className="space-y-4 max-w-3xl">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-white font-display">Live Toss Tie-breaks</h3>
              <p className="text-xs text-slate-400 max-w-xl">
                Bylaw §4: teams level on points are separated by game difference. If they are still
                level, a live toss decides. Ties appear here once a group (or, for seeding and
                runners-up, the whole group stage) is finished. Record each toss winner below.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClearTosses}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            >
              Clear all toss results
            </button>
          </div>

          {tieSets.length === 0 ? (
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 text-center text-sm text-slate-400">
              No tosses needed right now.
            </div>
          ) : (
            tieSets.map((set) => (
              <div
                key={`${set.label}-${set.rows.map((r) => r.teamId).join('-')}`}
                className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                    {set.label}
                  </span>
                  <span className="text-[11px] font-mono text-amber-200/80">
                    {set.rows[0].points} pts · game diff{' '}
                    {set.rows[0].scoreDiff > 0 ? `+${set.rows[0].scoreDiff}` : set.rows[0].scoreDiff} ·{' '}
                    {set.rows.length} teams level
                  </span>
                </div>
                <div className="space-y-2">
                  {set.rows.map((row) => (
                    <div
                      key={row.teamId}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">{pairLabel(row)}</div>
                        <div className="text-[11px] text-slate-400">
                          {groups.find((g) => g.id === row.groupId)?.name} · #{row.position}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTossWinner(row, set.rows)}
                        className="shrink-0 px-3 py-1.5 rounded-lg bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-black"
                      >
                        Won toss
                      </button>
                    </div>
                  ))}
                </div>
                {set.rows.length > 2 && (
                  <p className="text-[11px] text-amber-200/80">
                    3+ teams level: record the first toss winner, then run the next toss between the
                    remaining teams.
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 1: MATCHES MANAGER */}
      {activeSubTab === 'matches' && (
        <div className="space-y-4">
          {tieSets.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveSubTab('tiebreaks')}
              className="w-full text-left p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs font-bold flex items-center gap-2"
            >
              <Coins className="w-4 h-4 text-amber-400 shrink-0" />
              {tieSets.length} live toss{tieSets.length === 1 ? '' : 'es'} needed to settle standings
              — open Tie-breaks →
            </button>
          )}
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white font-display">
              Match Scheduling & Score Correction
            </h3>
            <span className="text-xs text-slate-400">
              Admin can override scores, reassign courts, and update statuses
            </span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] font-extrabold uppercase text-slate-400">
                    <th className="py-3 px-3 text-center">#</th>
                    <th className="py-3 px-3">Group</th>
                    <th className="py-3 px-4">Matchup</th>
                    <th className="py-3 px-3">Court</th>
                    <th className="py-3 px-3">Time</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-center">Score</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {matches.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-850/50 transition-colors">
                      <td className="py-3 px-3 text-center font-mono text-slate-500">
                        {m.matchNumber}
                      </td>
                      <td className="py-3 px-3 font-semibold text-lime-400">{m.group?.name}</td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-white">
                          {pairLabel(m.team1, 'TBD')} <span className="text-slate-500 font-normal">vs</span>{' '}
                          {pairLabel(m.team2, 'TBD')}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-300">{m.court?.name || 'Unassigned'}</td>
                      <td className="py-3 px-3 font-mono text-slate-400">{m.scheduledTime}</td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            m.status === 'live'
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : m.status === 'completed'
                              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                              : m.status === 'ready'
                              ? 'bg-lime-400/20 text-lime-400 border border-lime-400/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {m.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center font-display font-extrabold text-lime-400">
                        {m.team1Score !== null && m.team2Score !== null
                          ? `${m.team1Score} — ${m.team2Score}`
                          : '—'}
                        {m.scoreSummary && (
                          <div className="text-[10px] font-mono text-slate-400 font-normal">
                            {m.scoreSummary}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {(m.status !== 'completed' || m.walkover) && m.status !== 'cancelled' && (
                            <button
                              type="button"
                              onClick={() => setAbsentMatch(m)}
                              title="A team did not come: record a walkover (W/O)"
                              className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold whitespace-nowrap"
                            >
                              {m.walkover ? 'W/O ✓' : 'Absent / W/O'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setEditingMatch(m)}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1"
                          >
                            <Edit2 className="w-3 h-3 text-zinc-400" />
                            <span>Edit</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TEAMS MANAGER */}
      {activeSubTab === 'teams' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white font-display">
                Registered Tournament Teams ({teams.length}/20)
              </h3>
              <p className="text-xs text-slate-400">
                5 Groups &bull; 4 Teams per group &bull; Editable roster
              </p>
            </div>
            <button
              onClick={() =>
                setEditingTeam({
                  name: '',
                  player1: '',
                  player2: '',
                  groupId: groups[0]?.id || 'group-a',
                })
              }
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-lime-400 hover:bg-lime-300 text-slate-950 shadow-md transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Team</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {teams.map((t) => {
              const gName = groups.find((g) => g.id === t.groupId)?.name;
              return (
                <div
                  key={t.id}
                  className={`p-4 rounded-xl border flex items-start justify-between gap-3 shadow-md ${
                    t.withdrawn ? 'bg-rose-950/30 border-rose-500/40' : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-lime-400 uppercase tracking-wider block mb-1">
                      {gName}
                      {t.withdrawn && (
                        <span className="ml-2 px-1.5 py-0.5 rounded bg-rose-500 text-white text-[9px] font-black">
                          DID NOT COME
                        </span>
                      )}
                    </span>
                    <div
                      className={`font-sans font-bold text-sm leading-tight ${
                        t.withdrawn ? 'text-slate-400 line-through' : 'text-white'
                      }`}
                    >
                      {pairLabel(t, 'TBD')}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleTeamWithdrawn(t, !t.withdrawn)}
                      className={`mt-2.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                        t.withdrawn
                          ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                          : 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border-rose-500/30'
                      }`}
                    >
                      {t.withdrawn ? 'Team is back' : 'Did not come (W/O all)'}
                    </button>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setEditingTeam(t)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                      title="Edit team"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteTeam(t.id, pairLabel(t, 'this pairing'))}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Delete team"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: COURTS MANAGER */}
      {activeSubTab === 'courts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white font-display">Courts Configuration</h3>
              <p className="text-xs text-slate-400">
                Scorekeepers and spectators see these active tournament courts
              </p>
            </div>
            <button
              onClick={handleAddCourt}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-lime-400 hover:bg-lime-300 text-slate-950 shadow-md transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Court</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {courts.map((court) => (
              <div
                key={court.id}
                className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3 shadow-md"
              >
                <div>
                  <h4 className="font-bold text-white text-sm">{court.name}</h4>
                  <span
                    className={`inline-block mt-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      court.active
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {court.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleCourt(court.id)}
                    className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    {court.active ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => handleDeleteCourt(court.id, court.name)}
                    className="p-1.5 text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: GOOGLE SHEETS COMPATIBILITY & CSV EXPORT */}
      {activeSubTab === 'sheets' && (
        <div className="space-y-6 max-w-4xl">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white font-display">
                  Google Sheets & Data Management Integration
                </h3>
                <p className="text-xs text-slate-400">
                  Export live tournament results, matches, and standings for Google Sheets backup
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3">
              <button
                type="button"
                id="btn-export-csv"
                onClick={handleExportCsv}
                className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-blue-500/50 transition-all flex items-center justify-between text-left group"
              >
                <div>
                  <span className="font-bold text-white text-sm group-hover:text-blue-300">
                    Export Matches & Scores (.CSV)
                  </span>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Download complete 30-match fixture list and scores ready for Excel / Google Sheets
                  </p>
                </div>
                <Download className="w-5 h-5 text-blue-400 shrink-0 ml-3" />
              </button>

              <button
                type="button"
                id="btn-export-json"
                onClick={handleExportJson}
                className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-blue-500/50 transition-all flex items-center justify-between text-left group"
              >
                <div>
                  <span className="font-bold text-white text-sm group-hover:text-zinc-400">
                    Export Full Tournament Backup (.JSON)
                  </span>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Complete state including teams, groups, courts, settings, and calculated standings
                  </p>
                </div>
                <Download className="w-5 h-5 text-zinc-400 shrink-0 ml-3" />
              </button>
            </div>

            {/* Google Sheets Live Sync Guide */}
            <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-3 mt-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-lime-400">
                How to Connect to Google Sheets Live:
              </h4>
              <ol className="text-xs text-slate-300 space-y-2 list-decimal list-inside leading-relaxed">
                <li>Open your Google Sheet and select cell A1.</li>
                <li>
                  Enter standard Google Sheets formula to pull matches in real time:{' '}
                  <code className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-lime-400 font-mono">
                    =IMPORTDATA("{window.location.origin}/api/matches")
                  </code>
                </li>
                <li>
                  To import standings directly:{' '}
                  <code className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-lime-400 font-mono">
                    =IMPORTDATA("{window.location.origin}/api/standings")
                  </code>
                </li>
                <li>
                  Google Sheets refreshes automatically every hour, or you can use Google Apps Script to
                  fetch scores on a 1-minute timer without altering the website!
                </li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: QR CODE POSTER */}
      {activeSubTab === 'qr' && (
        <div className="max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-lime-400/20 text-lime-400 flex items-center justify-center mx-auto">
            <QrCode className="w-6 h-6" />
          </div>

          <div>
            <h3 className="text-xl font-display font-bold text-white">Public Results QR Code</h3>
            <p className="text-xs text-slate-400 mt-1">
              Print this QR code on tournament banners and posters so spectators and players can scan
              and view live group standings on their smartphones.
            </p>
          </div>

          {/* QR Canvas render */}
          {qrDataUrl && (
            <div className="p-4 bg-white rounded-2xl inline-block shadow-inner">
              <img
                src={qrDataUrl}
                alt="Tournament Live Results QR Code"
                className="w-56 h-56 mx-auto rounded-lg"
              />
            </div>
          )}

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-400 flex items-center justify-between gap-2">
            <span className="truncate font-mono">{`${window.location.origin}/results`}</span>
            <button
              onClick={handleCopyLink}
              className="text-lime-400 hover:text-lime-300 font-semibold flex items-center gap-1 shrink-0"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedLink ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>

          {qrDataUrl && (
            <a
              href={qrDataUrl}
              download="cpa_padel_tournament_qr.png"
              className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-lime-400 hover:bg-lime-300 text-slate-950 shadow-lg shadow-lime-500/20 transition-all flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Download High-Res QR Code</span>
            </a>
          )}
        </div>
      )}

      {/* MATCH EDITING MODAL */}
      {editingMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-150">
          <form
            onSubmit={handleSaveMatchDetails}
            className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white font-display">
                Edit Match #{editingMatch.matchNumber} ({editingMatch.group?.name})
              </h3>
              <button
                type="button"
                onClick={() => setEditingMatch(null)}
                className="text-slate-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-sm font-bold text-center text-white">
              {pairLabel(editingMatch.team1, 'TBD')} vs {pairLabel(editingMatch.team2, 'TBD')}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Court Assignment
                </label>
                <select
                  value={editingMatch.courtId || ''}
                  onChange={(e) =>
                    setEditingMatch({ ...editingMatch, courtId: e.target.value || null })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-lime-400"
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
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Scheduled Time
                </label>
                <input
                  type="text"
                  value={editingMatch.scheduledTime}
                  onChange={(e) =>
                    setEditingMatch({ ...editingMatch, scheduledTime: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-lime-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Status</label>
                <select
                  value={editingMatch.status}
                  onChange={(e) =>
                    setEditingMatch({ ...editingMatch, status: e.target.value as any })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-lime-400"
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="ready">Ready</option>
                  <option value="live">Live</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {pairLabel(editingMatch.team1, 'Pair 1')} Games (e.g. 6)
                </label>
                <input
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
                  placeholder="e.g. 6"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-lime-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {pairLabel(editingMatch.team2, 'Pair 2')} Games (e.g. 4)
                </label>
                <input
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
                  placeholder="e.g. 4"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-lime-400"
                />
              </div>
            </div>

            {/* Walkover (bylaw §6): 5-minute grace period expired */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-300">Walkover (W/O)</span>
                {editingMatch.walkover && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 text-[10px] font-black uppercase">
                    {editingMatch.walkover === 'both'
                      ? 'Both absent'
                      : `W/O to ${pairLabel(
                          editingMatch.walkover === 'team1' ? editingMatch.team1 : editingMatch.team2,
                          'team'
                        )}`}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Which team did not come? A walkover counts as a 6-0 win for the team that came.
              </p>
              {renderAbsentChoices(editingMatch)}
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingMatch(null)}
                className="px-4 py-2 text-xs font-semibold bg-slate-800 text-slate-300 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold bg-lime-400 text-slate-950 rounded-xl shadow-md"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TEAM ABSENT / WALKOVER DIALOG (bylaw §6) */}
      {absentMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white font-display">Team did not come</h3>
                <p className="text-[11px] text-slate-400">
                  Match #{absentMatch.matchNumber} · {absentMatch.group?.name || 'Knockout'} ·{' '}
                  {absentMatch.scheduledTime}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAbsentMatch(null)}
                className="text-slate-400 hover:text-white text-lg"
              >
                &times;
              </button>
            </div>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-sm font-bold text-center text-white">
              {pairLabel(absentMatch.team1, 'TBD')} vs {pairLabel(absentMatch.team2, 'TBD')}
            </div>
            <p className="text-xs text-slate-400">
              Bylaw §6: after the 5-minute grace period, the team that came wins by walkover (6-0).
            </p>
            {renderAbsentChoices(absentMatch)}
          </div>
        </div>
      )}

      {/* TEAM EDIT / ADD MODAL */}
      {editingTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-150">
          <form
            onSubmit={handleSaveTeam}
            className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white font-display">
                {editingTeam.id ? 'Edit Team' : 'Add New Team'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingTeam(null)}
                className="text-slate-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Player 1</label>
                <input
                  type="text"
                  value={editingTeam.player1 || ''}
                  onChange={(e) => setEditingTeam({ ...editingTeam, player1: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-lime-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Player 2</label>
                <input
                  type="text"
                  value={editingTeam.player2 || ''}
                  onChange={(e) => setEditingTeam({ ...editingTeam, player2: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-lime-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Group Assignment
              </label>
              <select
                value={editingTeam.groupId || groups[0]?.id}
                onChange={(e) => setEditingTeam({ ...editingTeam, groupId: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-lime-400"
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingTeam(null)}
                className="px-4 py-2 text-xs font-semibold bg-slate-800 text-slate-300 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold bg-lime-400 text-slate-950 rounded-xl shadow-md"
              >
                Save Team
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
