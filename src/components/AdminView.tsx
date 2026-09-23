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
  Sparkles,
  Share2,
  Copy,
  ExternalLink,
  Flame,
  FileSpreadsheet,
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
  adminGenerateMatches,
  adminUpdateMatch,
  adminSaveSettings,
  adminResetDemo,
  adminExportData,
  adminImportData,
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
    'matches' | 'teams' | 'courts' | 'settings' | 'sheets' | 'qr'
  >('matches');

  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // Teams editing state
  const [editingTeam, setEditingTeam] = useState<Partial<Team> | null>(null);

  // Match editing modal state
  const [editingMatch, setEditingMatch] = useState<EnrichedMatch | null>(null);

  // QR Code Data URL state
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Settings form state
  const [settingsForm, setSettingsForm] = useState({
    name: settings?.name || 'CPA PADEL TOURNAMENT',
    location: settings?.location || 'CPA Padel Arena & Club',
    pointsForWin: settings?.scoring.pointsForWin ?? 3,
    pointsForLoss: settings?.scoring.pointsForLoss ?? 0,
    qualifiersPerGroup: settings?.scoring.qualifiersPerGroup ?? 2,
    wildcardQualifiers: settings?.scoring.wildcardQualifiers ?? 0,
    gamesToWinSet: settings?.scoring.gamesToWinSet ?? 6,
    scorekeeperPin: settings?.scorekeeperPin || 'padel2026',
    adminPassword: settings?.adminPasswordHash || 'admin123',
  });

  useEffect(() => {
    if (settings) {
      setSettingsForm({
        name: settings.name,
        location: settings.location,
        pointsForWin: settings.scoring.pointsForWin,
        pointsForLoss: settings.scoring.pointsForLoss,
        qualifiersPerGroup: settings.scoring.qualifiersPerGroup,
        wildcardQualifiers: settings.scoring.wildcardQualifiers ?? 0,
        gamesToWinSet: settings.scoring.gamesToWinSet,
        scorekeeperPin: settings.scorekeeperPin || 'padel2026',
        adminPassword: settings.adminPasswordHash || 'admin123',
      });
    }
  }, [settings]);

  // Generate QR code for tournament public results URL
  useEffect(() => {
    const publicUrl = `${window.location.origin}/results`;
    QRCode.toDataURL(publicUrl, { width: 320, margin: 2, color: { dark: '#070a12', light: '#ffffff' } })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('QR code generation error:', err));
  }, []);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setFeedbackMessage({ type, text });
    setTimeout(() => setFeedbackMessage(null), 4000);
  };

  // If not admin, require admin login
  if (!session || session.role !== 'admin') {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 text-center">
        <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mx-auto">
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
            className="w-full py-3.5 px-6 rounded-xl font-bold text-sm bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/20 transition-all"
          >
            Sign In with Administrator Credentials
          </button>
        </div>
      </div>
    );
  }

  // 11. Auto-generate Round Robin Group Matches
  const handleAutoGenerateMatches = async () => {
    if (
      !window.confirm(
        'Generate all 30 round-robin group stage matches? Existing unsaved match structures will be replaced.'
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      const res = await adminGenerateMatches(session.token);
      showNotification('success', `Successfully generated ${res.count} round-robin matches!`);
      onRefreshData();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to generate matches.');
    } finally {
      setLoading(false);
    }
  };

  // 26. Reset to Demo Data
  const handleResetDemoData = async () => {
    if (
      !window.confirm(
        'Reset tournament to full 20-team realistic demo data with 5 groups and completed/live sample matches?'
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      await adminResetDemo(session.token);
      showNotification('success', 'Tournament reset to demo state with 20 teams and 30 matches.');
      onRefreshData();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to reset demo.');
    } finally {
      setLoading(false);
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

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminSaveSettings(session.token, {
        name: settingsForm.name,
        location: settingsForm.location,
        scorekeeperPin: settingsForm.scorekeeperPin,
        adminPasswordHash: settingsForm.adminPassword,
        scoring: {
          pointsForWin: Number(settingsForm.pointsForWin),
          pointsForLoss: Number(settingsForm.pointsForLoss),
          qualifiersPerGroup: Number(settingsForm.qualifiersPerGroup),
          gamesToWinSet: Number(settingsForm.gamesToWinSet),
          allowDraws: false,
          wildcardQualifiers: Number(settingsForm.wildcardQualifiers),
        },
      });
      showNotification('success', 'Tournament settings and scoring rules updated.');
      onRefreshData();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to save settings.');
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
          <div className="p-2 rounded-xl bg-purple-500 text-white font-black shadow-lg shadow-purple-500/20">
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
            id="btn-admin-auto-generate"
            onClick={handleAutoGenerateMatches}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-lime-400 hover:bg-lime-300 text-slate-950 shadow-md shadow-lime-500/20 transition-all"
          >
            <Sparkles className="w-4 h-4" />
            <span>Generate 30 Matches</span>
          </button>

          <button
            type="button"
            id="btn-admin-reset-demo"
            onClick={handleResetDemoData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Demo</span>
          </button>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedbackMessage && (
        <div
          id="admin-alert-banner"
          className={`p-3.5 rounded-xl border text-xs sm:text-sm flex items-center justify-between gap-2 animate-in zoom-in-95 duration-150 ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
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
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Match Fixtures ({matches.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('teams')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${
            activeSubTab === 'teams'
              ? 'bg-purple-600 text-white shadow-sm'
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
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Grid className="w-4 h-4" />
          <span>Courts ({courts.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('settings')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${
            activeSubTab === 'settings'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Rules & Scoring</span>
        </button>

        <button
          onClick={() => setActiveSubTab('sheets')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${
            activeSubTab === 'sheets'
              ? 'bg-purple-600 text-white shadow-sm'
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
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <QrCode className="w-4 h-4" />
          <span>QR Code Poster</span>
        </button>
      </div>

      {/* TAB 1: MATCHES MANAGER */}
      {activeSubTab === 'matches' && (
        <div className="space-y-4">
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
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
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
                        <button
                          type="button"
                          onClick={() => setEditingMatch(m)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 ml-auto"
                        >
                          <Edit2 className="w-3 h-3 text-purple-400" />
                          <span>Edit</span>
                        </button>
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
                  className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-start justify-between gap-3 shadow-md"
                >
                  <div>
                    <span className="text-[10px] font-bold text-lime-400 uppercase tracking-wider block mb-1">
                      {gName}
                    </span>
                    <div className="font-sans font-bold text-white text-sm leading-tight">{pairLabel(t, 'TBD')}</div>
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
                        ? 'bg-emerald-500/20 text-emerald-400'
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

      {/* TAB 4: RULES & SETTINGS */}
      {activeSubTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6 max-w-2xl">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-base font-bold text-white font-display">
              Scoring Rules & Tournament Parameters
            </h3>
            <p className="text-xs text-slate-400">
              Customize point values, qualification thresholds, and access credentials
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Tournament Title
              </label>
              <input
                type="text"
                value={settingsForm.name}
                onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-lime-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Venue Location
              </label>
              <input
                type="text"
                value={settingsForm.location}
                onChange={(e) => setSettingsForm({ ...settingsForm, location: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-lime-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-800/80">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Points for Win
              </label>
              <input
                type="number"
                min="1"
                value={settingsForm.pointsForWin}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, pointsForWin: Number(e.target.value) })
                }
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-lime-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Points for Loss
              </label>
              <input
                type="number"
                min="0"
                value={settingsForm.pointsForLoss}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, pointsForLoss: Number(e.target.value) })
                }
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-lime-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Qualifiers per Group
              </label>
              <input
                type="number"
                min="1"
                max="4"
                value={settingsForm.qualifiersPerGroup}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, qualifiersPerGroup: Number(e.target.value) })
                }
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-lime-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Wildcard Qualifiers
              </label>
              <input
                type="number"
                min="0"
                max="10"
                value={settingsForm.wildcardQualifiers}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, wildcardQualifiers: Number(e.target.value) })
                }
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-lime-400"
              />
            </div>
          </div>

          {/* Scoring Format Summary Card */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-lime-400 flex items-center gap-1.5">
              <span>Simplified Padel Tournament Format:</span>
            </h4>
            <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside">
              <li>
                <strong>Game Points:</strong> Progresses Love &rarr; 15 &rarr; 30 &rarr; 40.
              </li>
              <li>
                <strong>Golden Point (Punto de Oro):</strong> At 40–40, the next rally wins the game directly. No advantage or second deuce.
              </li>
              <li>
                <strong>Match Win Condition:</strong> First team to win 6 games wins the match (e.g., 6–0, 6–4, 6–5). No 2-game lead requirement or tiebreak.
              </li>
              <li>
                <strong>Knockout Qualification:</strong>{' '}
                {Number(settingsForm.qualifiersPerGroup) === 1
                  ? 'Each group winner'
                  : `The top ${settingsForm.qualifiersPerGroup} of each group`}
                {Number(settingsForm.wildcardQualifiers) > 0
                  ? ` plus the ${settingsForm.wildcardQualifiers} best-placed wildcards`
                  : ''}{' '}
                advance to the knockout bracket.
              </li>
            </ul>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800/80">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Scorekeeper PIN / Passcode
              </label>
              <input
                type="text"
                value={settingsForm.scorekeeperPin}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, scorekeeperPin: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-lime-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Administrator Password
              </label>
              <input
                type="password"
                value={settingsForm.adminPassword}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, adminPassword: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-lime-400"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-lime-400 hover:bg-lime-300 text-slate-950 shadow-lg shadow-lime-500/20 transition-all"
          >
            Save Settings & Scoring Rules
          </button>
        </form>
      )}

      {/* TAB 5: GOOGLE SHEETS COMPATIBILITY & CSV EXPORT */}
      {activeSubTab === 'sheets' && (
        <div className="space-y-6 max-w-4xl">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
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
                className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-500/50 transition-all flex items-center justify-between text-left group"
              >
                <div>
                  <span className="font-bold text-white text-sm group-hover:text-emerald-300">
                    Export Matches & Scores (.CSV)
                  </span>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Download complete 30-match fixture list and scores ready for Excel / Google Sheets
                  </p>
                </div>
                <Download className="w-5 h-5 text-emerald-400 shrink-0 ml-3" />
              </button>

              <button
                type="button"
                id="btn-export-json"
                onClick={handleExportJson}
                className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-purple-500/50 transition-all flex items-center justify-between text-left group"
              >
                <div>
                  <span className="font-bold text-white text-sm group-hover:text-purple-300">
                    Export Full Tournament Backup (.JSON)
                  </span>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Complete state including teams, groups, courts, settings, and calculated standings
                  </p>
                </div>
                <Download className="w-5 h-5 text-purple-400 shrink-0 ml-3" />
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
