import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Court, AuthSession } from '../types';
import { EnrichedMatch, submitScoreResult, setMatchLiveScore } from '../api';
import { pairLabel } from '../utils/teamDisplay';
import { stageLabel, isKnockoutMatch } from '../utils/matchStage';
import {
  PadelMatchState,
  ScoringActionHistoryItem,
} from '../scoring/types';
import {
  recordPoint,
  undoLastPoint,
  createInitialMatchState,
  formatPointDisplay,
  formatMatchScoreSummary,
} from '../scoring/scoringEngine';
import {
  ClipboardEdit,
  RotateCcw,
  Trophy,
  Flame,
  Radio,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  ShieldCheck,
  Zap,
  Sparkles,
  Pencil,
  ListOrdered,
  Search,
  ArrowUpDown,
  Check,
  Layers,
  X,
  Calendar,
  Shuffle,
} from 'lucide-react';

interface ScorekeeperViewProps {
  courts: Court[];
  matches: EnrichedMatch[];
  session: AuthSession | null;
  onOpenAuth: () => void;
  onSessionUpdate?: (session: AuthSession) => void;
  selectedCourtId?: string | null;
  onRefreshData: () => void;
}

export const ScorekeeperView: React.FC<ScorekeeperViewProps> = ({
  courts,
  matches,
  session,
  onOpenAuth,
  onSessionUpdate,
  selectedCourtId: initialCourtId,
  onRefreshData,
}) => {
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(
    initialCourtId || courts[0]?.id || null
  );
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  // Game picker & rescheduling modal states
  const [showGamePickerModal, setShowGamePickerModal] = useState<boolean>(false);
  const [gamePickerSearchQuery, setGamePickerSearchQuery] = useState<string>('');
  const [gamePickerTab, setGamePickerTab] = useState<'court' | 'all'>('court');

  const [padelState, setPadelState] = useState<PadelMatchState | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'saving' | 'error'>('synced');

  // Debounce ref for live score broadcasting
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (initialCourtId) {
      setSelectedCourtId(initialCourtId);
    }
  }, [initialCourtId]);

  const activeCourts = courts.filter((c) => c.active);
  const currentCourt = courts.find((c) => c.id === selectedCourtId) || activeCourts[0];

  // Matches for this court
  const allCourtMatches = matches.filter(
    (m) => m.courtId === currentCourt?.id && m.status !== 'cancelled'
  );
  const activeCourtMatches = allCourtMatches.filter((m) => m.status !== 'completed');

  // Other upcoming tournament matches (from other courts or unassigned)
  const otherUpcomingMatches = matches.filter(
    (m) => m.courtId !== currentCourt?.id && m.status !== 'completed' && m.status !== 'cancelled'
  );

  // Stabilized match selection (allows picking any match from this court or moved from another court)
  const currentMatch =
    (selectedMatchId ? matches.find((m) => m.id === selectedMatchId) : null) ||
    activeCourtMatches.find((m) => m.status === 'live') ||
    activeCourtMatches.find((m) => m.status === 'ready') ||
    activeCourtMatches[0] ||
    allCourtMatches[allCourtMatches.length - 1] ||
    null;

  const nextMatchInQueue = currentMatch
    ? activeCourtMatches.find((m) => m.id !== currentMatch.id) || null
    : null;

  // Initialize or load padel match state
  useEffect(() => {
    if (!currentMatch) {
      setPadelState(null);
      return;
    }

    // Try reading from localStorage first for offline resilience
    const localKey = `cpa_padel_match_${currentMatch.id}`;
    let loadedState: PadelMatchState | null = null;

    try {
      const saved = localStorage.getItem(localKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.matchId === currentMatch.id) {
          loadedState = parsed;
        }
      }
    } catch {
      // ignore
    }

    if (!loadedState && currentMatch.padelState) {
      loadedState = currentMatch.padelState;
    }

    if (!loadedState) {
      loadedState = createInitialMatchState(currentMatch.id);
      // If match already had an in-progress game score recorded
      if (currentMatch.team1Score !== null && currentMatch.team2Score !== null) {
        loadedState.team1Games = currentMatch.team1Score;
        loadedState.team2Games = currentMatch.team2Score;
        if (loadedState.team1Games >= 6 || loadedState.team2Games >= 6) {
          loadedState.isMatchOver = true;
          loadedState.winnerTeamId = loadedState.team1Games >= 6 ? 'team1' : 'team2';
        }
      }
    }

    setPadelState(loadedState);
    setErrorMessage(null);
    setSuccessMessage(null);
    setShowResetConfirm(false);
  }, [currentMatch?.id]);

  // Persist to local storage whenever padelState changes
  useEffect(() => {
    if (padelState && currentMatch) {
      const localKey = `cpa_padel_match_${currentMatch.id}`;
      try {
        localStorage.setItem(localKey, JSON.stringify(padelState));
      } catch {
        // ignore storage quota
      }
    }
  }, [padelState, currentMatch?.id]);

  // Function to broadcast live status/score to server
  const broadcastLiveScore = useCallback(
    (stateToBroadcast: PadelMatchState, status: 'live' | 'ready' | 'scheduled' | 'completed') => {
      const activeToken = session?.token;
      if (!currentMatch) return;

      if (!activeToken) {
        setSyncStatus('error');
        setErrorMessage('Authentication required: please sign in to broadcast live scores.');
        return;
      }

      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }

      setSyncStatus('saving');
      syncTimeoutRef.current = setTimeout(async () => {
        try {
          const summary = formatMatchScoreSummary(stateToBroadcast);
          await setMatchLiveScore(
            activeToken,
            currentMatch.id,
            stateToBroadcast.team1Games,
            stateToBroadcast.team2Games,
            status,
            stateToBroadcast,
            summary
          );
          setSyncStatus('synced');
          setErrorMessage(null);
        } catch (err: any) {
          console.warn('Live score sync notice:', err?.message || err);
          setSyncStatus('error');
          const msg = err?.message || 'Failed to sync live score';
          if (msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('scorekeeper')) {
            setErrorMessage('Scorekeeper PIN required: Please authenticate to broadcast live tournament points.');
          } else {
            setErrorMessage(msg);
          }
        }
      }, 300);
    },
    [session, currentMatch]
  );

  const handleQuickScorekeeperLogin = async () => {
    onOpenAuth();
  };

  // If user is not authenticated as scorekeeper or admin, prompt sign-in
  if (!session || !session.token || (session.role !== 'scorekeeper' && session.role !== 'admin')) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 text-center animate-in fade-in duration-300">
        <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-lime-400/10 border border-lime-400/20 text-lime-400 flex items-center justify-center mx-auto">
            <ClipboardEdit className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold font-display text-white">Scorekeeper Terminal</h2>
            <p className="text-sm text-slate-400 mt-2">
              Official scorekeepers can control court matches point-by-point in real time.
            </p>
          </div>
          <div className="space-y-3 pt-2">
            <button
              id="btn-scorekeeper-login-prompt"
              onClick={handleQuickScorekeeperLogin}
              className="w-full py-3.5 px-6 rounded-xl font-bold text-sm bg-lime-400 hover:bg-lime-300 text-slate-950 shadow-lg shadow-lime-500/20 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Zap className="w-4 h-4" />
              <span>Sign In as Scorekeeper</span>
            </button>
            <button
              id="btn-scorekeeper-login-custom"
              onClick={onOpenAuth}
              className="w-full py-2.5 px-6 rounded-xl font-semibold text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer"
            >
              Custom Sign In / Enter PIN manually
            </button>
          </div>
        </div>
      </div>
    );
  }

  const team1Name = pairLabel(currentMatch?.team1, 'TEAM ALPHA');
  const team2Name = pairLabel(currentMatch?.team2, 'TEAM BRAVO');

  // Handle Point Recorded
  const handleScorePoint = (team: 'team1' | 'team2') => {
    if (!padelState || !currentMatch || padelState.isMatchOver) return;

    setErrorMessage(null);
    const newState = recordPoint(padelState, team, team1Name, team2Name);
    setPadelState(newState);

    // CRITICAL: Always keep status as 'live' while scoring
    // Never auto-broadcast as 'completed' here, which would evict the match and make the confirmation window disappear!
    broadcastLiveScore(newState, 'live');
  };

  // Handle Undo Last Point
  const handleUndo = () => {
    if (!padelState || padelState.history.length === 0) return;

    const reverted = undoLastPoint(padelState);
    setPadelState(reverted);

    // Broadcast reverted state as 'live'
    broadcastLiveScore(reverted, 'live');
  };

  // Handle Reset Match
  const handleResetMatch = () => {
    if (!currentMatch) return;
    const fresh = createInitialMatchState(currentMatch.id);
    setPadelState(fresh);
    setShowResetConfirm(false);
    broadcastLiveScore(fresh, 'ready');
  };

  // Handle Final Match Submission
  const handleSubmitFinalResult = async () => {
    if (!currentMatch || !padelState) return;

    if (!padelState.isMatchOver) {
      setErrorMessage('Match is not completed yet. First team to reach 6 games wins the match.');
      return;
    }

    const activeToken = session?.token;
    if (!activeToken) {
      setErrorMessage('Authentication required: please sign in to submit results.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const summary = formatMatchScoreSummary(padelState);
      await submitScoreResult(
        activeToken,
        currentMatch.id,
        padelState.team1Games,
        padelState.team2Games,
        padelState,
        summary
      );

      // Lock current match ID so screen remains stable after submission
      setSelectedMatchId(currentMatch.id);

      // Clear local storage key
      const localKey = `cpa_padel_match_${currentMatch.id}`;
      localStorage.removeItem(localKey);

      setSuccessMessage(
        `Result submitted successfully! Winner: ${
          padelState.winnerTeamId === 'team1' ? team1Name : team2Name
        } (${summary})`
      );

      onRefreshData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit match result.');
    } finally {
      setSubmitting(false);
    }
  };

  // Mark match live without scoring a point yet
  const handleStartMatch = () => {
    if (!padelState || !currentMatch) return;
    broadcastLiveScore(padelState, 'live');
    onRefreshData();
  };

  // Select a game to score on the current court (with option to immediately mark live or reassign from another court)
  const handleSelectGameToScore = async (targetMatch: EnrichedMatch, goLiveImmediately = false) => {
    const activeToken = session?.token;
    if (!activeToken) {
      setErrorMessage('Authentication required: please sign in to modify matches.');
      return;
    }

    try {
      // If the match was originally scheduled on a different court, reassign it to this court
      if (targetMatch.courtId !== currentCourt?.id) {
        await setMatchLiveScore(
          activeToken,
          targetMatch.id,
          targetMatch.team1Score ?? 0,
          targetMatch.team2Score ?? 0,
          goLiveImmediately ? 'live' : targetMatch.status === 'completed' ? 'completed' : 'ready',
          targetMatch.padelState,
          targetMatch.scoreSummary,
          currentCourt?.id
        );
      } else if (goLiveImmediately && targetMatch.status !== 'live') {
        await setMatchLiveScore(
          activeToken,
          targetMatch.id,
          targetMatch.team1Score ?? 0,
          targetMatch.team2Score ?? 0,
          'live',
          targetMatch.padelState,
          targetMatch.scoreSummary,
          currentCourt?.id
        );
      }

      setSelectedMatchId(targetMatch.id);
      setShowGamePickerModal(false);
      setErrorMessage(null);
      setSuccessMessage(
        goLiveImmediately
          ? `Match #${targetMatch.matchNumber} (${pairLabel(targetMatch.team1)} vs ${pairLabel(targetMatch.team2)}) is now LIVE on ${currentCourt?.name}!`
          : `Switched to Match #${targetMatch.matchNumber}: ${pairLabel(targetMatch.team1)} vs ${pairLabel(targetMatch.team2)}`
      );
      onRefreshData();
    } catch (err: any) {
      console.warn('Game selection notice:', err?.message || err);
      // Still select locally so scorekeeper is never blocked
      setSelectedMatchId(targetMatch.id);
      setShowGamePickerModal(false);
      onRefreshData();
    }
  };

  const filterQuery = gamePickerSearchQuery.trim().toLowerCase();

  const filteredCourtMatches = allCourtMatches.filter((m) => {
    if (!filterQuery) return true;
    const p1 = `${m.team1?.player1 || ''} ${m.team1?.player2 || ''}`.toLowerCase();
    const p2 = `${m.team2?.player1 || ''} ${m.team2?.player2 || ''}`.toLowerCase();
    const num = `match #${m.matchNumber}`.toLowerCase();
    return (
      p1.includes(filterQuery) ||
      p2.includes(filterQuery) ||
      num.includes(filterQuery)
    );
  });

  const filteredOtherMatches = otherUpcomingMatches.filter((m) => {
    if (!filterQuery) return true;
    const p1 = `${m.team1?.player1 || ''} ${m.team1?.player2 || ''}`.toLowerCase();
    const p2 = `${m.team2?.player1 || ''} ${m.team2?.player2 || ''}`.toLowerCase();
    const num = `match #${m.matchNumber}`.toLowerCase();
    return (
      p1.includes(filterQuery) ||
      p2.includes(filterQuery) ||
      num.includes(filterQuery)
    );
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-emerald-400/40">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#170036] text-[#00DF81] text-xs font-black uppercase tracking-wider mb-2 shadow-sm">
            <ClipboardEdit className="w-3.5 h-3.5" />
            Scorekeeper Terminal • Court Official
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-[#170036] uppercase tracking-tight">
            Live Point-by-Point Scorekeeper
          </h1>
          <p className="text-xs font-mono font-bold text-slate-800 mt-1">
            Simplified Padel Rules: Point (Love/15/30/40) → Golden Point at 40-40 → Game → First to 6 Games Wins.
          </p>
        </div>

        {/* Sync & Role indicator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-white border border-emerald-300 text-xs shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span className="font-bold text-slate-800">{session.name}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-white border border-emerald-300 text-xs shadow-sm">
            {syncStatus === 'synced' && (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-emerald-700 font-bold">Live Synced</span>
              </>
            )}
            {syncStatus === 'saving' && (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-amber-700 font-bold">Broadcasting...</span>
              </>
            )}
            {syncStatus === 'error' && (
              <button
                onClick={onOpenAuth}
                className="flex items-center gap-1.5 text-rose-600 hover:text-rose-700 transition-colors cursor-pointer"
                title="Authentication required to sync scores. Click to sign in."
              >
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                <span className="font-bold underline">Auth required • Sign in</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Court Selection Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
        {courts.map((court) => {
          const isSelected = court.id === selectedCourtId;
          const courtMatches = matches.filter((m) => m.courtId === court.id);
          const courtHasLive = courtMatches.some((m) => m.status === 'live');

          // Stage currently on this court: the live match, else the next one up.
          const courtStageMatch =
            courtMatches.find((m) => m.status === 'live') ??
            courtMatches.find((m) => m.status === 'ready') ??
            courtMatches.find((m) => m.status === 'scheduled');

          return (
            <button
              key={court.id}
              id={`btn-court-tab-${court.id}`}
              onClick={() => {
                setSelectedCourtId(court.id);
                setSelectedMatchId(null);
                setSuccessMessage(null);
                setErrorMessage(null);
              }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer shadow-sm ${
                isSelected
                  ? 'bg-[#170036] text-[#00DF81] shadow-lg ring-2 ring-emerald-300'
                  : 'bg-white hover:bg-slate-50 text-slate-800 border border-emerald-300'
              }`}
            >
              {courtHasLive && (
                <span className="w-2 h-2 rounded-full bg-[#00DF81] animate-ping" />
              )}
              <span>{court.name}</span>
              {courtStageMatch && (
                <span
                  className={`text-[9px] font-mono normal-case tracking-wide ${
                    isSelected ? 'text-emerald-300/80' : 'text-slate-500'
                  }`}
                >
                  · {stageLabel(courtStageMatch)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 🎾 COURT GAME PICKER / QUEUE BAR: Pick any game on this court to score out of order */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ListOrdered className="w-4 h-4 text-lime-400" />
            <span className="text-xs font-black uppercase tracking-wider text-slate-200">
              Matches on {currentCourt?.name || 'Court'} ({allCourtMatches.length})
            </span>
            <span className="text-[11px] font-medium text-slate-400 hidden sm:inline">
              • Tap any match to score, even if played before others
            </span>
          </div>

          <button
            id="btn-open-game-picker"
            onClick={() => {
              setGamePickerTab('court');
              setGamePickerSearchQuery('');
              setShowGamePickerModal(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700 hover:border-slate-600"
          >
            <Layers className="w-3.5 h-3.5 text-lime-400" />
            <span>Select / Reschedule Match</span>
          </button>
        </div>

        {allCourtMatches.length === 0 ? (
          <div className="text-xs text-slate-400 py-1 flex items-center justify-between">
            <span>No matches currently assigned to this court.</span>
            <button
              onClick={() => {
                setGamePickerTab('all');
                setShowGamePickerModal(true);
              }}
              className="text-lime-400 underline font-bold text-xs cursor-pointer hover:text-lime-300"
            >
              Move a match from another court →
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-thin">
            {allCourtMatches.map((m) => {
              const isActive = currentMatch?.id === m.id;
              const isLive = m.status === 'live';
              const isCompleted = m.status === 'completed';

              return (
                <button
                  key={m.id}
                  id={`btn-pick-match-${m.id}`}
                  onClick={() => handleSelectGameToScore(m, false)}
                  className={`flex-shrink-0 min-w-[210px] max-w-[260px] p-3 rounded-xl text-left transition-all cursor-pointer border ${
                    isActive
                      ? 'bg-lime-950/40 border-lime-400 ring-1 ring-lime-400/50 shadow-md shadow-lime-400/10'
                      : 'bg-slate-950/70 hover:bg-slate-800/80 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] mb-1">
                    <span className="font-bold font-mono text-slate-400 truncate">
                      M#{m.matchNumber} • {stageLabel(m)}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider shrink-0 ${
                        isLive
                          ? 'bg-rose-500 text-white animate-pulse'
                          : isCompleted
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {isLive ? '🔴 LIVE' : isCompleted ? `✓ ${m.team1Score}-${m.team2Score}` : m.status}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-white truncate">
                    {pairLabel(m.team1)} vs {pairLabel(m.team2)}
                  </div>
                  {isActive ? (
                    <div className="flex items-center gap-1 text-[10px] font-extrabold text-lime-400 mt-1.5">
                      <Check className="w-3 h-3" />
                      <span>SCORING NOW</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1.5">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {m.scheduledTime}
                      </span>
                      <span className="hover:text-slate-300">Click to switch</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Active Match Console Container */}
      {!currentMatch ? (
        <div className="p-12 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <Clock className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-white font-display">
            No active or queued matches on {currentCourt?.name || 'this court'}
          </h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            All assigned matches for this court have been completed, or no matches are scheduled here yet.
          </p>
          <div className="pt-2">
            <button
              onClick={() => {
                setGamePickerTab('all');
                setShowGamePickerModal(true);
              }}
              className="px-6 py-3 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer inline-flex items-center gap-2 shadow-lg shadow-lime-400/20"
            >
              <Layers className="w-4 h-4" />
              <span>Pick a Match from Tournament Schedule</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Status & Match Meta Card */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
            <div className="flex flex-wrap items-center gap-3">
              <div
                className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${
                  currentMatch.status === 'live'
                    ? 'bg-rose-500 text-white animate-pulse'
                    : currentMatch.status === 'ready'
                    ? 'bg-amber-400 text-slate-950 font-extrabold'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {currentMatch.status === 'live' && (
                  <span className="w-2 h-2 rounded-full bg-white" />
                )}
                <span>{currentMatch.status === 'live' ? '🔴 LIVE' : currentMatch.status}</span>
              </div>
              <span className="text-sm font-bold text-white">
                {currentCourt?.name}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider ${
                  isKnockoutMatch(currentMatch)
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-[#170036] text-[#00DF81]'
                }`}
              >
                <Trophy className="w-3 h-3" />
                {stageLabel(currentMatch)}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                Match #{currentMatch.matchNumber} ({currentMatch.scheduledTime})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                id="btn-switch-game-header"
                onClick={() => {
                  setGamePickerTab('court');
                  setGamePickerSearchQuery('');
                  setShowGamePickerModal(true);
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 border border-slate-700"
                title="Switch to a different game on this court or another court"
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-lime-400" />
                <span>Switch Game</span>
              </button>
              {currentMatch.status !== 'live' && !padelState?.isMatchOver && (
                <button
                  id="btn-start-match-live"
                  onClick={handleStartMatch}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>Start Match (Go Live)</span>
                </button>
              )}
              <button
                onClick={() => setShowResetConfirm(true)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs font-medium rounded-xl transition-colors cursor-pointer"
                title="Reset game points to 0-0"
              >
                Reset Match
              </button>
            </div>
          </div>

          {/* Messages / Alerts */}
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex flex-wrap items-center justify-between gap-3 shadow-md">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
                <span>{errorMessage}</span>
              </div>
              {(errorMessage.toLowerCase().includes('auth') ||
                errorMessage.toLowerCase().includes('pin') ||
                errorMessage.toLowerCase().includes('scorekeeper')) && (
                <button
                  id="btn-reauth-scorekeeper"
                  onClick={onOpenAuth}
                  className="px-3 py-1.5 bg-lime-400 text-slate-950 text-xs font-black rounded-xl hover:bg-lime-300 transition-colors shadow-sm cursor-pointer whitespace-nowrap"
                >
                  Enter PIN to Authenticate
                </button>
              )}
            </div>
          )}

          {successMessage && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Reset Confirmation Banner */}
          {showResetConfirm && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span>Are you sure you want to reset this match to 0-0? Current points will be lost.</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleResetMatch}
                  className="px-3 py-1 bg-amber-500 text-slate-950 font-bold rounded-lg hover:bg-amber-400 transition-colors cursor-pointer"
                >
                  Yes, Reset
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="px-3 py-1 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Scorekeeper Console UI */}
          {padelState && (
            <div className="space-y-4">
              {/* Event message / status ticker */}
              {padelState.lastEventMessage && (
                <div className="py-2.5 px-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-lime-400 animate-pulse" />
                    <span className="font-semibold text-lime-400">Status:</span>
                    <span className="text-slate-300 font-medium">{padelState.lastEventMessage}</span>
                  </div>
                  {padelState.history.length > 0 && (
                    <span className="text-[11px] text-slate-500 font-mono">
                      Step #{padelState.history.length}
                    </span>
                  )}
                </div>
              )}

              {/* 🌟 GOLDEN POINT BANNER at 40-40 */}
              {padelState.isGoldenPoint && !padelState.isMatchOver && (
                <div
                  id="banner-golden-point"
                  className="p-5 rounded-3xl bg-gradient-to-r from-amber-500/25 via-amber-500/35 to-amber-600/25 border-2 border-amber-400 text-center space-y-1.5 shadow-xl shadow-amber-500/15 animate-pulse"
                >
                  <div className="flex items-center justify-center gap-2 text-amber-300 font-black tracking-widest text-base sm:text-lg uppercase">
                    <Flame className="w-6 h-6 text-amber-400" />
                    <span>GOLDEN POINT (PUNTO DE ORO)</span>
                    <Flame className="w-6 h-6 text-amber-400" />
                  </div>
                  <p className="text-xs sm:text-sm text-amber-200 font-semibold">
                    40 — 40 reached. Next rally decides the game! There is no advantage.
                  </p>
                </div>
              )}

              {/* 🏆 MATCH COMPLETE CONFIRMATION (First to reach 6 games) */}
              {padelState.isMatchOver && currentMatch.status !== 'completed' && (
                <div
                  id="banner-match-won"
                  className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-emerald-950/90 via-slate-900 to-lime-950/90 border-2 border-emerald-400 text-center space-y-4 shadow-2xl animate-in zoom-in-95 duration-200"
                >
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-inner border border-emerald-500/30">
                    <Trophy className="w-9 h-9" />
                  </div>

                  <div>
                    <span className="text-xs font-black uppercase tracking-widest text-emerald-400 block mb-1">
                      🏆 MATCH COMPLETE
                    </span>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                      WINNER
                    </span>
                    <div className="font-sans text-3xl sm:text-4xl font-bold text-white mt-1">
                      {padelState.winnerTeamId === 'team1' ? team1Name : team2Name}
                    </div>
                  </div>

                  {/* FINAL SCORE BOX */}
                  <div className="py-4 px-6 rounded-2xl bg-slate-950/90 border border-slate-800 max-w-sm mx-auto space-y-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block border-b border-slate-800 pb-1.5">
                      FINAL SCORE
                    </span>
                    <div className="flex items-center justify-between text-sm sm:text-base font-bold py-1">
                      <span className="text-white truncate text-left">{team1Name}</span>
                      <span className="font-mono text-2xl font-black text-lime-400 ml-4">
                        {padelState.team1Games}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm sm:text-base font-bold py-1">
                      <span className="text-white truncate text-left">{team2Name}</span>
                      <span className="font-mono text-2xl font-black text-sky-400 ml-4">
                        {padelState.team2Games}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-slate-800/80 pt-4">
                    <p className="text-sm font-semibold text-slate-200 mb-4">
                      Is this result correct?
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                      <button
                        id="btn-submit-official-result"
                        onClick={handleSubmitFinalResult}
                        disabled={submitting}
                        className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-black text-sm uppercase tracking-wider shadow-lg shadow-lime-400/25 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 className="w-5 h-5" />
                        <span>{submitting ? 'Submitting Result...' : '✓ SUBMIT RESULT'}</span>
                      </button>
                      <button
                        id="btn-undo-match-winning-point"
                        onClick={handleUndo}
                        className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 border border-slate-700"
                        title="Change score or undo the last recorded point"
                      >
                        <Pencil className="w-4 h-4" />
                        <span>✎ CHANGE SCORE</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Match Submitted & Finalized Card */}
              {currentMatch.status === 'completed' && (
                <div className="p-6 sm:p-8 rounded-3xl bg-emerald-950/40 border-2 border-emerald-500/40 text-center space-y-4 shadow-xl">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div>
                    <span className="text-xs font-black uppercase tracking-widest text-emerald-400 block mb-1">
                      MATCH RESULT SUBMITTED & CONFIRMED
                    </span>
                    <div className="font-sans text-2xl sm:text-3xl font-bold text-white mt-1">
                      {team1Name} ({currentMatch.team1Score}) vs {team2Name} ({currentMatch.team2Score})
                    </div>
                    <p className="text-xs text-slate-300 mt-1 max-w-md mx-auto">
                      Official tournament score saved. Standings and group qualification rankings have been updated live.
                    </p>
                  </div>
                  <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                    {nextMatchInQueue && (
                      <button
                        onClick={() => {
                          setSelectedMatchId(nextMatchInQueue.id);
                          setSuccessMessage(null);
                        }}
                        className="px-6 py-3.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-lime-400/20 inline-flex items-center gap-2"
                      >
                        <span>Proceed to Next Match ({stageLabel(nextMatchInQueue)} · {pairLabel(nextMatchInQueue.team1)} vs {pairLabel(nextMatchInQueue.team2)})</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setGamePickerTab('court');
                        setShowGamePickerModal(true);
                      }}
                      className="px-6 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer border border-slate-700 inline-flex items-center gap-2"
                    >
                      <ListOrdered className="w-4 h-4 text-lime-400" />
                      <span>Pick a Different Game to Score</span>
                    </button>
                  </div>
                  {!nextMatchInQueue && (
                    <div className="pt-1">
                      <p className="text-xs text-slate-500 italic mb-2">All scheduled matches on this court are completed.</p>
                      <button
                        onClick={() => {
                          setGamePickerTab('all');
                          setShowGamePickerModal(true);
                        }}
                        className="px-5 py-2.5 rounded-xl bg-lime-400/10 hover:bg-lime-400/20 text-lime-400 border border-lime-400/30 text-xs font-bold cursor-pointer inline-flex items-center gap-2"
                      >
                        <Shuffle className="w-3.5 h-3.5" />
                        <span>Move an upcoming match from another court</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Master Touch Scoreboard - Clean & Simple per prompt */}
              <div className="rounded-3xl bg-slate-900 border border-slate-800 overflow-hidden shadow-2xl">
                {/* Court & Live Bar */}
                <div className="py-3 px-6 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-widest text-slate-400">
                    {currentCourt?.name || 'COURT 1'}
                  </span>
                  <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-bold uppercase">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                    <span>LIVE MATCH</span>
                  </div>
                </div>

                {/* Games Standings (Team Alpha vs Team Bravo) */}
                <div className="grid grid-cols-2 divide-x divide-slate-800 border-b border-slate-800">
                  {/* Team 1 Summary */}
                  <div className="p-6 text-center bg-slate-900/50">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-lime-400 block mb-1 truncate">
                      TEAM 1
                    </span>
                    <div className="font-sans text-xl sm:text-2xl font-bold text-white truncate mb-2">
                      {team1Name}
                    </div>
                    <div className="inline-flex flex-col items-center p-3 sm:p-4 rounded-2xl bg-slate-950 border border-slate-800 min-w-[120px]">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-0.5">
                        GAMES
                      </span>
                      <span className="text-4xl sm:text-5xl font-display font-black text-white">
                        {padelState.team1Games}
                      </span>
                    </div>
                  </div>

                  {/* Team 2 Summary */}
                  <div className="p-6 text-center bg-slate-900/50">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-sky-400 block mb-1 truncate">
                      TEAM 2
                    </span>
                    <div className="font-sans text-xl sm:text-2xl font-bold text-white truncate mb-2">
                      {team2Name}
                    </div>
                    <div className="inline-flex flex-col items-center p-3 sm:p-4 rounded-2xl bg-slate-950 border border-slate-800 min-w-[120px]">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-0.5">
                        GAMES
                      </span>
                      <span className="text-4xl sm:text-5xl font-display font-black text-white">
                        {padelState.team2Games}
                      </span>
                    </div>
                  </div>
                </div>

                {/* CURRENT GAME Points Display */}
                <div className="p-6 sm:p-8 bg-slate-950/60 border-b border-slate-800">
                  <div className="text-center mb-4">
                    <span className="text-xs font-black uppercase tracking-widest text-slate-400">
                      CURRENT GAME
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 sm:gap-8 max-w-lg mx-auto">
                    {/* Alpha Points */}
                    <div className="p-4 sm:p-5 rounded-2xl bg-slate-900 border border-slate-800 text-center">
                      <span className="text-xs font-bold text-slate-400 block mb-1 truncate">
                        {team1Name}
                      </span>
                      <span
                        className={`text-4xl sm:text-6xl font-display font-black tracking-tight ${
                          padelState.isGoldenPoint ? 'text-amber-400' : 'text-lime-400'
                        }`}
                      >
                        {formatPointDisplay(padelState.team1Points)}
                      </span>
                    </div>

                    {/* Bravo Points */}
                    <div className="p-4 sm:p-5 rounded-2xl bg-slate-900 border border-slate-800 text-center">
                      <span className="text-xs font-bold text-slate-400 block mb-1 truncate">
                        {team2Name}
                      </span>
                      <span
                        className={`text-4xl sm:text-6xl font-display font-black tracking-tight ${
                          padelState.isGoldenPoint ? 'text-amber-400' : 'text-sky-400'
                        }`}
                      >
                        {formatPointDisplay(padelState.team2Points)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Point Action Buttons */}
                <div className="p-6 sm:p-8 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* [ ALPHA WON POINT ] */}
                    <button
                      id="btn-point-team-1"
                      onClick={() => handleScorePoint('team1')}
                      disabled={padelState.isMatchOver}
                      className={`w-full py-6 px-4 rounded-2xl font-black text-base sm:text-lg uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xl ${
                        padelState.isMatchOver
                          ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                          : padelState.isGoldenPoint
                          ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-amber-400/25 active:scale-98'
                          : 'bg-lime-400 hover:bg-lime-300 text-slate-950 shadow-lime-400/20 active:scale-98'
                      }`}
                    >
                      <span>
                        {padelState.isGoldenPoint
                          ? `${team1Name} WON GOLDEN POINT`
                          : `${team1Name} WON POINT`}
                      </span>
                    </button>

                    {/* [ BRAVO WON POINT ] */}
                    <button
                      id="btn-point-team-2"
                      onClick={() => handleScorePoint('team2')}
                      disabled={padelState.isMatchOver}
                      className={`w-full py-6 px-4 rounded-2xl font-black text-base sm:text-lg uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xl ${
                        padelState.isMatchOver
                          ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                          : padelState.isGoldenPoint
                          ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-amber-400/25 active:scale-98'
                          : 'bg-sky-400 hover:bg-sky-300 text-slate-950 shadow-sky-400/20 active:scale-98'
                      }`}
                    >
                      <span>
                        {padelState.isGoldenPoint
                          ? `${team2Name} WON GOLDEN POINT`
                          : `${team2Name} WON POINT`}
                      </span>
                    </button>
                  </div>

                  {/* [ UNDO LAST POINT ] */}
                  <div className="flex justify-center pt-2">
                    <button
                      id="btn-undo-last-point"
                      onClick={handleUndo}
                      disabled={padelState.history.length === 0}
                      className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:text-slate-600 disabled:bg-slate-950 text-xs sm:text-sm font-bold uppercase tracking-wider transition-all cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2 border border-slate-700/60"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>UNDO LAST POINT</span>
                      {padelState.history.length > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-slate-900 text-[10px] text-slate-400 font-mono">
                          {padelState.history.length}
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Point History Log */}
              {padelState.history.length > 0 && (
                <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-2 font-medium">
                    <span>Recent Action Audit Log</span>
                    <span className="font-mono">{padelState.history.length} actions</span>
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {padelState.history
                      .slice(-5)
                      .reverse()
                      .map((item: ScoringActionHistoryItem, idx: number) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-xs text-slate-400 py-1.5 px-3 rounded-lg bg-slate-950/80 border border-slate-800/40"
                        >
                          <span className="text-slate-300 font-medium">{item.description}</span>
                          <span className="text-[11px] font-mono text-slate-500">
                            {new Date(item.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Next Match Queue Preview */}
              {nextMatchInQueue && (
                <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-sky-400" />
                    <span className="font-bold text-slate-300 uppercase tracking-wider">Next on {currentCourt?.name}:</span>
                    <span className="text-slate-500 font-mono text-[11px] uppercase tracking-wider">
                      {stageLabel(nextMatchInQueue)}
                    </span>
                    <span>
                      {pairLabel(nextMatchInQueue.team1)} vs {pairLabel(nextMatchInQueue.team2)}
                    </span>
                  </div>
                  <span className="font-mono text-slate-500">{nextMatchInQueue.scheduledTime}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 📋 SELECT GAME TO SCORE / RESCHEDULING MODAL */}
      {showGamePickerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-lime-400" />
                  <h3 className="text-lg sm:text-xl font-bold font-display text-white">
                    Select Game to Score
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Active Court: <span className="text-lime-400 font-bold">{currentCourt?.name || 'Current Court'}</span> • Pick any match to take score from
                </p>
              </div>
              <button
                id="btn-close-game-picker"
                onClick={() => setShowGamePickerModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-800 bg-slate-950/40 px-4 sm:px-6">
              <button
                id="tab-picker-court"
                onClick={() => setGamePickerTab('court')}
                className={`py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                  gamePickerTab === 'court'
                    ? 'border-lime-400 text-lime-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <ListOrdered className="w-4 h-4" />
                <span>On {currentCourt?.name || 'Court'} ({allCourtMatches.length})</span>
              </button>
              <button
                id="tab-picker-all"
                onClick={() => setGamePickerTab('all')}
                className={`py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                  gamePickerTab === 'all'
                    ? 'border-lime-400 text-lime-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Shuffle className="w-4 h-4" />
                <span>Move Game from Other Courts ({otherUpcomingMatches.length})</span>
              </button>
            </div>

            {/* Search Filter */}
            <div className="p-3.5 sm:px-6 border-b border-slate-800/80 bg-slate-900/50">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="input-search-matches"
                  type="text"
                  value={gamePickerSearchQuery}
                  onChange={(e) => setGamePickerSearchQuery(e.target.value)}
                  placeholder="Filter by team, player name, or match #..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-lime-400"
                />
              </div>
            </div>

            {/* Scrollable Matches List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
              {gamePickerTab === 'court' ? (
                <>
                  {filteredCourtMatches.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 space-y-2">
                      <p className="text-sm font-semibold">No matches found matching your filter on this court.</p>
                      <p className="text-xs text-slate-500">
                        Need to play a different game? Check the "Move Game from Other Courts" tab above.
                      </p>
                    </div>
                  ) : (
                    filteredCourtMatches.map((m) => {
                      const isCurrentActive = currentMatch?.id === m.id;
                      const isLive = m.status === 'live';
                      const isCompleted = m.status === 'completed';

                      return (
                        <div
                          key={m.id}
                          className={`p-4 rounded-2xl border transition-all ${
                            isCurrentActive
                              ? 'bg-lime-950/30 border-lime-400/80 ring-1 ring-lime-400/40'
                              : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded-md bg-slate-800 font-mono text-[11px] font-bold text-slate-300">
                                  Match #{m.matchNumber}
                                </span>
                                <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {m.scheduledTime}
                                </span>
                                <span className="text-xs font-semibold text-slate-400">
                                  • {stageLabel(m)}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                                    isLive
                                      ? 'bg-rose-500 text-white animate-pulse'
                                      : isCompleted
                                      ? 'bg-emerald-500/20 text-emerald-400'
                                      : 'bg-slate-800 text-slate-400'
                                  }`}
                                >
                                  {isLive ? '🔴 LIVE' : isCompleted ? `✓ Final ${m.team1Score}-${m.team2Score}` : m.status}
                                </span>
                              </div>

                              <div className="text-sm font-black text-white">
                                {pairLabel(m.team1)}{' '}
                                <span className="text-slate-500 font-normal">vs</span>{' '}
                                {pairLabel(m.team2)}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 pt-2 sm:pt-0">
                              {isCurrentActive ? (
                                <span className="px-3.5 py-1.5 rounded-xl bg-lime-400/20 text-lime-400 text-xs font-bold flex items-center gap-1.5 border border-lime-400/30">
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Active Scoring</span>
                                </span>
                              ) : (
                                <>
                                  <button
                                    onClick={() => handleSelectGameToScore(m, false)}
                                    className="px-3.5 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-md shadow-lime-400/10 flex items-center gap-1.5"
                                  >
                                    <Zap className="w-3.5 h-3.5" />
                                    <span>{isCompleted ? 'Review Score' : 'Score This Game'}</span>
                                  </button>
                                  {!isCompleted && !isLive && (
                                    <button
                                      onClick={() => handleSelectGameToScore(m, true)}
                                      className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5"
                                    >
                                      <Radio className="w-3 h-3" />
                                      <span>Go Live</span>
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </>
              ) : (
                <>
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2 mb-2">
                    <Shuffle className="w-4 h-4 flex-shrink-0 text-amber-400" />
                    <span>
                      Need to play a game early or move a delayed game? Selecting a match here will reassign it to <strong>{currentCourt?.name}</strong> and load it directly into your scoring terminal.
                    </span>
                  </div>

                  {filteredOtherMatches.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 space-y-1">
                      <p className="text-sm font-semibold">No upcoming matches available from other courts.</p>
                      <p className="text-xs text-slate-500">All other tournament matches are completed or already assigned to this court.</p>
                    </div>
                  ) : (
                    filteredOtherMatches.map((m) => {
                      const originCourt = courts.find((c) => c.id === m.courtId);
                      return (
                        <div
                          key={m.id}
                          className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition-all"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded-md bg-slate-800 font-mono text-[11px] font-bold text-slate-300">
                                  Match #{m.matchNumber}
                                </span>
                                <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {m.scheduledTime}
                                </span>
                                <span className="text-xs font-medium text-slate-400">
                                  • Originally on {originCourt?.name || 'Unassigned'}
                                </span>
                                <span className="text-xs font-semibold text-slate-400">
                                  • {stageLabel(m)}
                                </span>
                              </div>

                              <div className="text-sm font-black text-white">
                                {pairLabel(m.team1)}{' '}
                                <span className="text-slate-500 font-normal">vs</span>{' '}
                                {pairLabel(m.team2)}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 pt-2 sm:pt-0">
                              <button
                                onClick={() => handleSelectGameToScore(m, true)}
                                className="px-4 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-md shadow-lime-400/10 flex items-center gap-1.5"
                              >
                                <Shuffle className="w-3.5 h-3.5" />
                                <span>Move & Start Live on {currentCourt?.name}</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 sm:px-6 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between text-xs text-slate-400">
              <span>Matches can be played in any order depending on court readiness.</span>
              <button
                onClick={() => setShowGamePickerModal(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
