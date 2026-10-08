import React, { useState, useEffect, useCallback } from 'react';
import { Court, AuthSession, Team } from '../types';
import { EnrichedMatch, setMatchLiveScore } from '../api';
import { pairLabel } from '../utils/teamDisplay';
import { stageLabel } from '../utils/matchStage';
import { useScoreSender, sendScoreEvent, retryScoreEventsNow, SenderSnapshot } from '../scorekeeper/scoreSender';
import { SyncStatusBar } from '../scorekeeper/SyncStatusBar';
import { ScoreEvent, ScoreEventType } from '../scoring/eventTypes';
import { PadelMatchState } from '../scoring/types';
import {
  recordPoint,
  undoLastPoint,
  createInitialMatchState,
  formatPointDisplay,
  formatMatchScoreSummary,
} from '../scoring/scoringEngine';
import {
  AlertCircle,
  ArrowRight,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ClipboardEdit,
  Clock,
  Flame,
  History,
  Plus,
  Radio,
  Search,
  Shuffle,
  Trophy,
  Undo2,
  X,
} from 'lucide-react';

/** How long to trust our own just-confirmed score over older server data. */
const ACK_GRACE_MS = 10000;

/** The server's view of a match's scoring state. */
function serverStateFor(match: EnrichedMatch): PadelMatchState {
  if (match.padelState) {
    return { ...match.padelState, matchId: match.id, history: match.padelState.history ?? [] };
  }
  const state = createInitialMatchState(match.id);
  if (match.team1Score !== null && match.team2Score !== null) {
    state.team1Games = match.team1Score;
    state.team2Games = match.team2Score;
    if (state.team1Games >= 6 || state.team2Games >= 6) {
      state.isMatchOver = true;
      state.winnerTeamId = state.team1Games >= 6 ? 'team1' : 'team2';
    }
  }
  return state;
}

/**
 * Pairing for inline text, e.g. "Hadi / Shahir". Non-breaking spaces around
 * the slash keep a pairing together, so lines wrap between pairings instead
 * of leaving "Omer /" on one line and "Tariq" on the next.
 */
function pairText(team?: Team | null): string {
  return pairLabel(team).replace(' / ', ' / ');
}

function newEventId(prefix = 'evt'): string {
  return (
    (crypto as any)?.randomUUID?.() ??
    `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
}

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
  // Score events go straight to the server, in order, with automatic retry.
  // The server derives the official score; this phone only shows its own taps
  // ahead of the server while they are still on their way.
  const sender = useScoreSender(session?.token ?? null);

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

  /**
   * Send a score event. The eventId is generated once here and reused on every
   * retry, so a resend after a Wi-Fi blip can never double-count a point.
   * Resolves true once the server accepts it, false if the server refuses it.
   */
  const emitScoreEvent = useCallback(
    (type: ScoreEventType, payload?: ScoreEvent['payload']): Promise<boolean> => {
      if (!currentMatch) return Promise.resolve(false);
      const event: ScoreEvent = {
        eventId: newEventId(type === 'MATCH_FINAL' ? 'evt-final' : 'evt'),
        matchId: currentMatch.id,
        courtId: currentCourt?.id ?? null,
        scorekeeper: session?.name || 'Scorekeeper',
        type,
        ...(payload ? { payload } : {}),
        clientTs: new Date().toISOString(),
      };
      return sendScoreEvent(event).then(
        () => true,
        (err) => {
          setErrorMessage(err?.message || 'Score not accepted by the server.');
          onRefreshData();
          return false;
        }
      );
    },
    [currentMatch, currentCourt?.id, session?.name, onRefreshData]
  );

  // Scores used to be cached per match on the phone; the server is now the
  // only source of truth, so clear any leftovers from older versions.
  useEffect(() => {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith('cpa_padel_match_')) localStorage.removeItem(key);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const matchId = currentMatch?.id ?? null;
  const pendingHere = matchId ? sender.pendingByMatch[matchId] ?? 0 : 0;
  const ackedHere = matchId ? sender.ackedByMatch[matchId] : undefined;
  const serverPadel = currentMatch?.padelState;
  const serverKey = currentMatch
    ? [
        currentMatch.matchVersion ?? 0,
        currentMatch.status,
        currentMatch.team1Score,
        currentMatch.team2Score,
        serverPadel?.team1Games,
        serverPadel?.team2Games,
        serverPadel?.team1Points,
        serverPadel?.team2Points,
        serverPadel?.isGoldenPoint,
        serverPadel?.history?.length,
      ].join('|')
    : '';

  // Clear messages when switching to a different match.
  useEffect(() => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setShowResetConfirm(false);
  }, [matchId]);

  // Follow the server's score (so admin corrections and "Reset All" show up on
  // every phone), except while this phone's own taps are still on their way or
  // the server data is older than a version the server already confirmed.
  useEffect(() => {
    if (!currentMatch) {
      setPadelState(null);
      return;
    }
    const waitingForServer =
      !!ackedHere &&
      Date.now() - ackedHere.at < ACK_GRACE_MS &&
      (currentMatch.matchVersion ?? 0) < ackedHere.version;

    setPadelState((prev) => {
      if (prev?.matchId === currentMatch.id && (pendingHere > 0 || waitingForServer)) return prev;
      return serverStateFor(currentMatch);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, serverKey, pendingHere, ackedHere, sender.rejectedTick]);

  // Escape closes the match picker.
  useEffect(() => {
    if (!showGamePickerModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowGamePickerModal(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showGamePickerModal]);

  // If user is not authenticated as scorekeeper or admin, prompt sign-in
  if (!session || !session.token || (session.role !== 'scorekeeper' && session.role !== 'admin')) {
    return (
      <div className="max-w-md mx-auto py-12">
        <div className="rounded-3xl bg-white shadow-xl border border-blue-300/80 p-8 text-center space-y-5">
          <ClipboardEdit className="w-10 h-10 text-blue-600 mx-auto" />
          <div>
            <h2 className="font-display font-semibold uppercase tracking-wide text-4xl leading-none text-[#0A0A0F]">
              Scorekeeper
            </h2>
            <p className="text-sm text-slate-600 mt-2">
              Sign in with the scorekeeper PIN to score matches point by point.
            </p>
          </div>
          <button
            id="btn-scorekeeper-login-prompt"
            onClick={onOpenAuth}
            className="w-full min-h-12 rounded-full bg-[#0A0A0F] hover:bg-slate-800 text-[#CCFF00] text-xs font-mono font-bold uppercase tracking-widest transition-colors cursor-pointer"
          >
            Sign in as scorekeeper
          </button>
        </div>
      </div>
    );
  }

  const team1Name = pairLabel(currentMatch?.team1, 'Team 1');
  const team2Name = pairLabel(currentMatch?.team2, 'Team 2');

  /** Server messages use neutral "Team 1/2"; show the real pairings instead. */
  const withTeamNames = (message: string) =>
    message.replace(/\bTeam 1\b/g, team1Name).replace(/\bTeam 2\b/g, team2Name);

  // Handle Point Recorded — local UI updates immediately, server is authority.
  const handleScorePoint = (team: 'team1' | 'team2') => {
    if (!padelState || !currentMatch || padelState.isMatchOver) return;

    setErrorMessage(null);
    const newState = recordPoint(padelState, team, team1Name, team2Name);
    setPadelState(newState);
    void emitScoreEvent(team === 'team1' ? 'POINT_TEAM_1' : 'POINT_TEAM_2');
  };

  // Handle Undo Last Point
  const handleUndo = () => {
    if (!padelState || padelState.history.length === 0) return;

    const reverted = undoLastPoint(padelState);
    setPadelState(reverted);
    void emitScoreEvent('UNDO');
  };

  // Handle Reset Match
  const handleResetMatch = () => {
    if (!currentMatch) return;
    const fresh = createInitialMatchState(currentMatch.id);
    setPadelState(fresh);
    setShowResetConfirm(false);
    void emitScoreEvent('RESET');
  };

  // Handle Final Match Submission. "Submitted" is only shown once the server
  // has accepted the result; the server applies knockout advancement once.
  const handleSubmitFinalResult = async () => {
    if (!currentMatch || !padelState) return;

    if (!padelState.isMatchOver) {
      setErrorMessage('Match is not completed yet. First team to reach 6 games wins the match.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    // Lock current match ID so the screen stays on this match after submission.
    setSelectedMatchId(currentMatch.id);

    const summary = formatMatchScoreSummary(padelState);
    const accepted = await emitScoreEvent('MATCH_FINAL', {
      team1Games: padelState.team1Games,
      team2Games: padelState.team2Games,
      scoreSummary: summary,
    });

    // On success the card itself switches to "Result saved".
    if (accepted) onRefreshData();
    setSubmitting(false);
  };

  // Mark match live without scoring a point yet
  const handleStartMatch = () => {
    if (!padelState || !currentMatch) return;
    void emitScoreEvent('MATCH_START').then((accepted) => {
      if (accepted) onRefreshData();
    });
  };

  // Select a game to score on the current court (with option to immediately mark live or reassign from another court)
  const handleSelectGameToScore = async (targetMatch: EnrichedMatch, goLiveImmediately = false) => {
    const activeToken = session?.token;
    if (!activeToken) {
      setErrorMessage('Authentication required: please sign in to modify matches.');
      return;
    }

    const movedHere = targetMatch.courtId !== currentCourt?.id;
    try {
      // If the match was originally scheduled on a different court, reassign it to this court
      if (movedHere) {
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
      // Plain switches need no message: the scoring card itself changes.
      setSuccessMessage(
        movedHere
          ? `Match ${targetMatch.matchNumber} moved to ${currentCourt?.name}${goLiveImmediately ? ' and is now live' : ''}.`
          : goLiveImmediately
            ? `Match ${targetMatch.matchNumber} is now live on ${currentCourt?.name}.`
            : null
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

  const openPicker = (tab: 'court' | 'all') => {
    setGamePickerTab(tab);
    setGamePickerSearchQuery('');
    setShowGamePickerModal(true);
  };

  const filterQuery = gamePickerSearchQuery.trim().toLowerCase();
  const matchesFilter = (m: EnrichedMatch) => {
    if (!filterQuery) return true;
    const p1 = `${m.team1?.player1 || ''} ${m.team1?.player2 || ''}`.toLowerCase();
    const p2 = `${m.team2?.player1 || ''} ${m.team2?.player2 || ''}`.toLowerCase();
    const num = `match #${m.matchNumber} ${m.matchNumber}`.toLowerCase();
    return p1.includes(filterQuery) || p2.includes(filterQuery) || num.includes(filterQuery);
  };
  const filteredCourtMatches = allCourtMatches.filter(matchesFilter);
  // Matches being scored live on another court go last and need an explicit
  // take-over, so two scorekeepers never end up scoring the same match.
  const filteredOtherMatches = otherUpcomingMatches
    .filter(matchesFilter)
    .sort((a, b) => Number(a.status === 'live') - Number(b.status === 'live'));

  const isSubmitted = currentMatch?.status === 'completed';
  const isOver = !!padelState?.isMatchOver;
  const isGolden = !!padelState?.isGoldenPoint && !isOver;
  const winner = isOver ? padelState?.winnerTeamId : null;
  const courtMatchesPlayed = allCourtMatches.filter((m) => m.status === 'completed').length;
  const needsSignIn =
    !!errorMessage && /auth|pin|sign|scorekeeper/i.test(errorMessage);

  return (
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-5">
      {/* 1. Court tabs — the site's pill-tab row (as the homepage group tabs) */}
      <nav
        aria-label="Courts"
        className="flex items-center gap-1.5 p-1.5 bg-white/90 backdrop-blur-md border border-blue-400/60 rounded-2xl overflow-x-auto scrollbar-none shadow-md"
      >
        {courts.map((court) => {
          const isSelected = court.id === currentCourt?.id;
          const courtHasLive = matches.some((m) => m.courtId === court.id && m.status === 'live');
          return (
            <button
              key={court.id}
              id={`btn-court-tab-${court.id}`}
              aria-pressed={isSelected}
              onClick={() => {
                setSelectedCourtId(court.id);
                setSelectedMatchId(null);
                setSuccessMessage(null);
                setErrorMessage(null);
              }}
              className={`shrink-0 min-h-11 px-3.5 sm:px-4 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider whitespace-nowrap inline-flex items-center gap-2 transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-[#0A0A0F] text-[#CCFF00] shadow-md'
                  : 'text-slate-800 hover:bg-blue-100 hover:text-slate-950'
              }`}
            >
              {courtHasLive && (
                <span
                  className={`w-2 h-2 rounded-full motion-safe:animate-pulse ${
                    isSelected ? 'bg-[#CCFF00]' : 'bg-[#2E6BFF]'
                  }`}
                  aria-label="Live match on this court"
                />
              )}
              {court.name}
            </button>
          );
        })}
      </nav>

      {/* Shown only when points are stuck retrying or sign-in has expired */}
      <SyncStatusBar
        status={sender.status}
        pending={sender.pending}
        lastError={sender.lastError}
        onRetry={retryScoreEventsNow}
        onSignIn={onOpenAuth}
      />

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="space-y-4 sm:space-y-5 min-w-0">
          {/* Messages */}
          {errorMessage && (
            <div
              role="alert"
              className="rounded-2xl bg-white border-2 border-rose-400 px-4 py-3 flex items-start gap-3 shadow-md"
            >
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <p className="flex-1 min-w-0 text-sm font-semibold text-rose-800">{errorMessage}</p>
              {needsSignIn && (
                <button
                  id="btn-reauth-scorekeeper"
                  onClick={onOpenAuth}
                  className="shrink-0 min-h-9 px-3.5 rounded-full bg-[#0A0A0F] text-[#CCFF00] text-[11px] font-mono font-bold uppercase tracking-widest cursor-pointer"
                >
                  Sign in
                </button>
              )}
              <button
                onClick={() => setErrorMessage(null)}
                aria-label="Dismiss message"
                className="shrink-0 w-9 h-9 -mr-1.5 -my-1 rounded-full text-rose-700 hover:bg-rose-50 inline-flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="rounded-2xl bg-white border-2 border-blue-300 px-4 py-3 flex items-start gap-3 shadow-md"
            >
              <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <p className="flex-1 min-w-0 text-sm font-semibold text-blue-900">{successMessage}</p>
              <button
                onClick={() => setSuccessMessage(null)}
                aria-label="Dismiss message"
                className="shrink-0 w-9 h-9 -mr-1.5 -my-1 rounded-full text-blue-700 hover:bg-blue-50 inline-flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {!currentMatch || !padelState ? (
            /* No match assigned to this court */
            <section className="rounded-3xl bg-white shadow-xl border border-blue-300/80 px-6 py-10 text-center">
              <Clock className="w-9 h-9 text-slate-400 mx-auto" />
              <h2 className="mt-3 font-display font-semibold uppercase tracking-wide text-3xl sm:text-4xl leading-none text-[#0A0A0F]">
                No match to score
              </h2>
              <p className="mt-2 text-sm text-slate-600 max-w-sm mx-auto">
                Nothing is scheduled on {currentCourt?.name || 'this court'}. Move a match here from
                another court to start scoring.
              </p>
              <button
                onClick={() => openPicker('all')}
                className="mt-5 min-h-12 px-6 rounded-full bg-[#0A0A0F] hover:bg-slate-800 text-[#CCFF00] text-xs font-mono font-bold uppercase tracking-widest inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Shuffle className="w-4 h-4" />
                Move a match here
              </button>
            </section>
          ) : (
            /* 2. Scoring card — the site's live-match card (ink body, blue band) */
            <section
              id="scorekeeper-console"
              aria-label={`Match ${currentMatch.matchNumber}`}
              className="rounded-3xl bg-[#0A0A0F] text-white border-2 border-blue-400 shadow-2xl overflow-hidden"
            >
              {/* Band: status, stage, match number + switch */}
              <div className="px-4 sm:px-6 py-3 sm:py-3.5 bg-blue-800/50 border-b border-blue-400/40 flex items-center justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <MatchStatusChip match={currentMatch} tone="dark" />
                    <span className="px-2.5 py-1 rounded-full bg-blue-500/20 border border-blue-400/40 text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-wider text-blue-100 whitespace-nowrap">
                      {stageLabel(currentMatch)}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono font-bold text-blue-100/80 truncate">
                    Match {currentMatch.matchNumber} · {currentMatch.scheduledTime}
                  </div>
                </div>
                <button
                  id="btn-switch-game-header"
                  onClick={() => openPicker('court')}
                  className="shrink-0 min-h-10 px-3.5 rounded-full border border-white/30 text-white hover:bg-white hover:text-slate-950 text-[11px] font-mono font-bold uppercase tracking-widest inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  Switch
                </button>
              </div>

              <div className="p-3 sm:p-5 space-y-3 sm:space-y-4">
                {/* Scoreboard — each pairing sits directly above its point button */}
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                  <TeamTile
                    label="Pairing 1"
                    accent="volt"
                    team={currentMatch.team1}
                    games={padelState.team1Games}
                    points={isOver ? null : formatPointDisplay(padelState.team1Points)}
                    golden={isGolden}
                    result={winner ? (winner === 'team1' ? 'won' : 'lost') : undefined}
                  />
                  <TeamTile
                    label="Pairing 2"
                    accent="blue"
                    team={currentMatch.team2}
                    games={padelState.team2Games}
                    points={isOver ? null : formatPointDisplay(padelState.team2Points)}
                    golden={isGolden}
                    result={winner ? (winner === 'team2' ? 'won' : 'lost') : undefined}
                  />
                </div>

                {isGolden && (
                  <div
                    id="banner-golden-point"
                    className="rounded-2xl bg-amber-400 text-slate-950 px-4 py-2.5 flex items-center justify-center gap-2 text-center"
                  >
                    <Flame className="w-4 h-4 shrink-0" />
                    <span className="text-xs sm:text-sm font-black uppercase tracking-wider">
                      Golden point · next rally wins
                    </span>
                    <Flame className="w-4 h-4 shrink-0" />
                  </div>
                )}

                {isSubmitted ? (
                  /* Result already saved: point to the next match */
                  <div className="rounded-2xl bg-white/5 border border-white/15 p-4 sm:p-5 text-center space-y-3">
                    <div className="inline-flex items-center gap-2 text-[#CCFF00] text-[11px] font-mono font-bold uppercase tracking-widest">
                      <CheckCircle2 className="w-4 h-4" />
                      Result saved
                    </div>
                    <p className="text-sm text-zinc-300">
                      Standings and the spectator screens are already updated.
                    </p>
                    {nextMatchInQueue ? (
                      <button
                        onClick={() => {
                          setSelectedMatchId(nextMatchInQueue.id);
                          setSuccessMessage(null);
                        }}
                        className="w-full min-h-14 rounded-2xl bg-[#CCFF00] hover:bg-[#d8ff4d] text-slate-950 px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                      >
                        <span className="min-w-0">
                          <span className="block text-[10px] font-mono font-bold uppercase tracking-widest opacity-70">
                            Next on this court · Match {nextMatchInQueue.matchNumber}
                          </span>
                          <span className="block text-sm font-extrabold leading-snug">
                            {pairText(nextMatchInQueue.team1)} vs {pairText(nextMatchInQueue.team2)}
                          </span>
                        </span>
                        <ArrowRight className="w-5 h-5 shrink-0" />
                      </button>
                    ) : (
                      <p className="text-xs font-mono font-bold uppercase tracking-widest text-zinc-400">
                        Every match on this court is done
                      </p>
                    )}
                    <button
                      onClick={() => openPicker(nextMatchInQueue ? 'court' : 'all')}
                      className="w-full min-h-11 rounded-2xl border border-white/20 text-white hover:bg-white/10 text-[11px] font-mono font-bold uppercase tracking-widest inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <Shuffle className="w-3.5 h-3.5" />
                      {nextMatchInQueue ? 'Pick another match' : 'Move a match here'}
                    </button>
                  </div>
                ) : isOver ? (
                  /* Someone reached 6 games: confirm and submit */
                  <div
                    id="banner-match-won"
                    className="rounded-2xl bg-[#CCFF00] text-slate-950 p-4 sm:p-5 text-center space-y-3"
                  >
                    <div className="text-[11px] font-mono font-bold uppercase tracking-widest">
                      Match complete · check the score
                    </div>
                    <div>
                      <div className="font-display font-semibold uppercase tracking-wide text-2xl sm:text-3xl leading-none">
                        {pairText(winner === 'team1' ? currentMatch.team1 : currentMatch.team2)} win
                      </div>
                      <div className="mt-1 font-display font-black text-5xl leading-none tabular-nums">
                        {padelState.team1Games} – {padelState.team2Games}
                      </div>
                    </div>
                    <button
                      id="btn-submit-official-result"
                      onClick={handleSubmitFinalResult}
                      disabled={submitting}
                      className="w-full min-h-14 rounded-2xl bg-[#0A0A0F] hover:bg-slate-800 text-[#CCFF00] text-sm font-black uppercase tracking-wider inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                      {submitting ? 'Submitting…' : 'Submit result'}
                    </button>
                    <button
                      id="btn-undo-match-winning-point"
                      onClick={handleUndo}
                      className="w-full min-h-11 rounded-2xl border border-slate-950/30 hover:bg-slate-950/10 text-[11px] font-mono font-bold uppercase tracking-widest inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <Undo2 className="w-4 h-4" />
                      Wrong? Undo last point
                    </button>
                  </div>
                ) : (
                  /* Playing: the point buttons */
                  <>
                    {currentMatch.status !== 'live' && (
                      <button
                        id="btn-start-match-live"
                        onClick={handleStartMatch}
                        className="w-full min-h-11 rounded-2xl border border-[#CCFF00]/50 text-[#CCFF00] hover:bg-[#CCFF00] hover:text-slate-950 text-[11px] font-mono font-bold uppercase tracking-widest inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <Radio className="w-4 h-4" />
                        Start match · show as live
                      </button>
                    )}

                    <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                      <PointButton
                        id="btn-point-team-1"
                        accent="volt"
                        team={currentMatch.team1}
                        golden={isGolden}
                        onClick={() => handleScorePoint('team1')}
                      />
                      <PointButton
                        id="btn-point-team-2"
                        accent="blue"
                        team={currentMatch.team2}
                        golden={isGolden}
                        onClick={() => handleScorePoint('team2')}
                      />
                    </div>

                    {showResetConfirm ? (
                      <div className="rounded-2xl bg-amber-400/10 border border-amber-400/50 p-3.5 space-y-3">
                        <p className="text-sm font-semibold text-amber-100">
                          Reset this match to 0–0? Every point recorded so far is cleared.
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={handleResetMatch}
                            className="min-h-11 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-[11px] font-mono font-bold uppercase tracking-widest transition-colors cursor-pointer"
                          >
                            Yes, reset
                          </button>
                          <button
                            onClick={() => setShowResetConfirm(false)}
                            className="min-h-11 rounded-2xl border border-white/20 text-white hover:bg-white/10 text-[11px] font-mono font-bold uppercase tracking-widest transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <button
                          id="btn-undo-last-point"
                          onClick={handleUndo}
                          disabled={padelState.history.length === 0}
                          className="min-h-12 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-[11px] font-mono font-bold uppercase tracking-widest inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Undo2 className="w-4 h-4" />
                          Undo last point
                        </button>
                        <button
                          onClick={() => setShowResetConfirm(true)}
                          className="min-h-12 px-4 rounded-2xl border border-white/15 text-zinc-300 hover:text-white hover:bg-white/10 text-[11px] font-mono font-bold uppercase tracking-widest transition-colors cursor-pointer"
                        >
                          Reset
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Footer: last action + whether it reached the server */}
              <div className="px-4 sm:px-6 py-3 border-t border-zinc-800 flex items-center justify-between gap-3">
                <span
                  className="min-w-0 truncate text-[11px] font-mono font-semibold text-zinc-400"
                  aria-live="polite"
                >
                  {padelState.lastEventMessage ? withTeamNames(padelState.lastEventMessage) : ''}
                </span>
                <SyncIndicator sender={sender} onSignIn={onOpenAuth} />
              </div>
            </section>
          )}

          {/* Point log — collapsed by default */}
          {padelState && padelState.history.length > 0 && (
            <details className="group rounded-3xl bg-white shadow-xl border border-blue-300/80 overflow-hidden text-slate-900">
              <summary className="list-none [&::-webkit-details-marker]:hidden min-h-14 px-5 py-3 flex items-center justify-between gap-3 cursor-pointer">
                <span className="flex items-center gap-2 font-display font-semibold uppercase tracking-wide text-xl sm:text-2xl leading-none text-[#0A0A0F]">
                  <History className="w-4 h-4 text-blue-600" />
                  Point log
                </span>
                <span className="flex items-center gap-2 text-[11px] font-mono font-bold uppercase tracking-widest text-slate-500">
                  {padelState.history.length} {padelState.history.length === 1 ? 'point' : 'points'}
                  <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
                </span>
              </summary>
              <ol className="border-t border-slate-100 divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {padelState.history
                  .map((item, idx) => ({ item, number: idx + 1 }))
                  .slice(-12)
                  .reverse()
                  .map(({ item, number }) => (
                    <li key={number} className="px-5 py-2.5 flex items-center gap-3 text-sm">
                      <span className="w-7 shrink-0 text-[11px] font-mono font-bold text-slate-400 tabular-nums">
                        {number}
                      </span>
                      <span
                        className={`w-2 h-2 shrink-0 rounded-full ${
                          item.type === 'POINT_TEAM_1' ? 'bg-[#CCFF00] ring-1 ring-slate-300' : 'bg-[#2E6BFF]'
                        }`}
                        aria-hidden="true"
                      />
                      <span className="flex-1 min-w-0 truncate font-semibold text-slate-800">
                        Point · {item.type === 'POINT_TEAM_1' ? team1Name : team2Name}
                      </span>
                      <span className="shrink-0 text-[11px] font-mono text-slate-500 tabular-nums">
                        {new Date(item.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </li>
                  ))}
              </ol>
            </details>
          )}
        </div>

        {/* 3. Court queue — every match on this court; tap one to score it */}
        <aside className="lg:sticky lg:top-4">
          <section
            aria-label={`Matches on ${currentCourt?.name || 'this court'}`}
            className="overflow-hidden rounded-3xl bg-white shadow-xl border border-blue-300/80 text-slate-900"
          >
            <div className="px-5 py-4 bg-[#0A0A0F] flex items-center justify-between gap-3">
              <h2 className="min-w-0 truncate font-display font-semibold uppercase tracking-wide text-2xl sm:text-3xl leading-none text-[#CCFF00]">
                {currentCourt?.name || 'Court'}
              </h2>
              <span className="shrink-0 text-[11px] font-mono font-bold uppercase tracking-widest text-white/60">
                {courtMatchesPlayed}/{allCourtMatches.length} played
              </span>
            </div>

            {allCourtMatches.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">No matches are assigned to this court.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {allCourtMatches.map((m) => {
                  const isActive = currentMatch?.id === m.id;
                  return (
                    <li key={m.id}>
                      <button
                        id={`btn-pick-match-${m.id}`}
                        onClick={() => handleSelectGameToScore(m, false)}
                        aria-current={isActive ? 'true' : undefined}
                        className={`w-full text-left px-4 sm:px-5 py-3 flex items-center gap-3 transition-colors cursor-pointer ${
                          isActive ? 'bg-blue-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className={`w-9 h-9 shrink-0 rounded-xl inline-flex items-center justify-center font-display font-black text-base ${
                            isActive ? 'bg-[#0A0A0F] text-[#CCFF00]' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {m.matchNumber}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-extrabold text-[#0A0A0F] leading-snug">
                            {pairText(m.team1)} <span className="font-medium text-slate-400">vs</span>{' '}
                            {pairText(m.team2)}
                          </span>
                          <span className="block text-[11px] font-mono font-bold text-slate-500 mt-0.5">
                            {m.scheduledTime} · {stageLabel(m)}
                          </span>
                        </span>
                        {isActive ? (
                          <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-blue-700">
                            {m.status === 'completed' ? 'Viewing' : 'Scoring'}
                          </span>
                        ) : (
                          <MatchStatusChip match={m} />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="px-4 sm:px-5 py-3.5 border-t border-slate-100 bg-slate-50/60">
              <button
                id="btn-open-game-picker"
                onClick={() => openPicker('all')}
                className="w-full min-h-11 rounded-full border border-slate-900/30 bg-white text-[#0A0A0F] hover:bg-slate-900 hover:text-white text-[11px] font-mono font-bold uppercase tracking-widest inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Shuffle className="w-3.5 h-3.5" />
                Move a match here
              </button>
            </div>
          </section>
        </aside>
      </div>

      {/* Match picker: switch match on this court, or move one here */}
      {showGamePickerModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-950/70 backdrop-blur-sm"
          onClick={() => setShowGamePickerModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="game-picker-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[88vh] flex flex-col overflow-hidden bg-white text-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl"
          >
            <div className="px-5 sm:px-6 py-4 sm:py-5 bg-[#0A0A0F] flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3
                  id="game-picker-title"
                  className="font-display font-semibold uppercase tracking-wide text-3xl sm:text-4xl leading-none text-[#CCFF00]"
                >
                  Select match
                </h3>
                <p className="mt-1.5 text-[11px] font-mono font-bold uppercase tracking-widest text-white/60 truncate">
                  Scoring on {currentCourt?.name || 'this court'}
                </p>
              </div>
              <button
                id="btn-close-game-picker"
                onClick={() => setShowGamePickerModal(false)}
                aria-label="Close"
                className="shrink-0 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white inline-flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 sm:px-6 pt-4 space-y-3">
              <div role="tablist" className="grid grid-cols-2 gap-1.5 p-1.5 bg-slate-100 rounded-2xl">
                {(
                  [
                    ['court', `This court (${allCourtMatches.length})`],
                    ['all', `Other courts (${otherUpcomingMatches.length})`],
                  ] as const
                ).map(([tab, label]) => (
                  <button
                    key={tab}
                    id={tab === 'court' ? 'tab-picker-court' : 'tab-picker-all'}
                    role="tab"
                    aria-selected={gamePickerTab === tab}
                    onClick={() => setGamePickerTab(tab)}
                    className={`min-h-11 px-2 rounded-xl text-[11px] sm:text-xs font-black uppercase tracking-wider transition-colors cursor-pointer ${
                      gamePickerTab === tab
                        ? 'bg-[#0A0A0F] text-[#CCFF00] shadow-md'
                        : 'text-slate-700 hover:bg-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="input-search-matches"
                  type="search"
                  value={gamePickerSearchQuery}
                  onChange={(e) => setGamePickerSearchQuery(e.target.value)}
                  placeholder="Search a player or match number"
                  aria-label="Search matches"
                  className="w-full min-h-11 pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 font-medium"
                />
              </div>

              {gamePickerTab === 'all' && (
                <p className="rounded-2xl bg-blue-50 border border-blue-100 px-3.5 py-2.5 text-xs font-semibold text-blue-900">
                  Picking a match here moves it to {currentCourt?.name || 'this court'} and starts
                  it live.
                </p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-2.5">
              {gamePickerTab === 'court' ? (
                filteredCourtMatches.length === 0 ? (
                  <p className="py-10 text-center text-sm text-slate-500">
                    No match on this court matches your search.
                  </p>
                ) : (
                  filteredCourtMatches.map((m) => {
                    const isCurrent = currentMatch?.id === m.id;
                    const isCompleted = m.status === 'completed';
                    return (
                      <PickerRow key={m.id} match={m} highlight={isCurrent ? 'current' : undefined}>
                        {isCurrent ? (
                          <span className="min-h-10 px-3.5 rounded-full bg-blue-100 text-blue-800 text-[11px] font-mono font-bold uppercase tracking-widest inline-flex items-center">
                            On screen
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => handleSelectGameToScore(m, false)}
                              className="min-h-10 px-4 rounded-full bg-[#0A0A0F] hover:bg-slate-800 text-[#CCFF00] text-[11px] font-mono font-bold uppercase tracking-widest inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                            >
                              {isCompleted ? 'Open result' : 'Score this match'}
                            </button>
                            {!isCompleted && m.status !== 'live' && (
                              <button
                                onClick={() => handleSelectGameToScore(m, true)}
                                className="min-h-10 px-4 rounded-full border border-slate-900/30 bg-white text-[#0A0A0F] hover:bg-slate-900 hover:text-white text-[11px] font-mono font-bold uppercase tracking-widest inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                              >
                                <Radio className="w-3.5 h-3.5" />
                                Go live
                              </button>
                            )}
                          </>
                        )}
                      </PickerRow>
                    );
                  })
                )
              ) : filteredOtherMatches.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-500">
                  No upcoming match on another court{filterQuery ? ' matches your search' : ''}.
                </p>
              ) : (
                filteredOtherMatches.map((m) => {
                  const originCourt = courts.find((c) => c.id === m.courtId);
                  const liveElsewhere = m.status === 'live';
                  return (
                    <PickerRow
                      key={m.id}
                      match={m}
                      origin={originCourt?.name || 'Unassigned'}
                      highlight={liveElsewhere ? 'warning' : undefined}
                    >
                      {liveElsewhere ? (
                        <button
                          onClick={() => {
                            const confirmed = window.confirm(
                              `Match ${m.matchNumber} is being scored live on ${
                                originCourt?.name || 'another court'
                              } right now.\n\nTake it over and move it to ${
                                currentCourt?.name || 'this court'
                              }? Only do this if that scorekeeper has stopped.`
                            );
                            if (confirmed) void handleSelectGameToScore(m, true);
                          }}
                          className="min-h-10 px-4 rounded-full border border-rose-300 bg-white text-rose-700 hover:bg-rose-600 hover:text-white text-[11px] font-mono font-bold uppercase tracking-widest inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <AlertCircle className="w-3.5 h-3.5" />
                          Take over…
                        </button>
                      ) : (
                        <button
                          onClick={() => handleSelectGameToScore(m, true)}
                          className="min-h-10 px-4 rounded-full bg-[#CCFF00] hover:bg-[#d8ff4d] text-slate-950 text-[11px] font-mono font-bold uppercase tracking-widest inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Shuffle className="w-3.5 h-3.5" />
                          Move here &amp; go live
                        </button>
                      )}
                    </PickerRow>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------------ */
/* Building blocks                                                           */
/* ------------------------------------------------------------------------ */

const CHIP = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider whitespace-nowrap';

/** Match status pill in the site's chip style, for the ink card or a white card. */
const MatchStatusChip: React.FC<{ match: EnrichedMatch; tone?: 'dark' | 'light' }> = ({
  match,
  tone = 'light',
}) => {
  if (match.status === 'live') {
    return (
      <span className={`${CHIP} bg-[#CCFF00] text-slate-950`}>
        <span className="w-1.5 h-1.5 rounded-full bg-slate-950 motion-safe:animate-pulse" />
        Live
      </span>
    );
  }
  if (match.status === 'completed') {
    return (
      <span
        className={`${CHIP} ${
          tone === 'dark' ? 'bg-white/10 text-white border border-white/20' : 'bg-[#0A0A0F] text-[#CCFF00]'
        }`}
      >
        Final {match.team1Score}–{match.team2Score}
      </span>
    );
  }
  return (
    <span
      className={`${CHIP} ${
        tone === 'dark'
          ? 'bg-white/10 text-blue-100 border border-white/15'
          : 'bg-slate-100 text-slate-600 border border-slate-200'
      }`}
    >
      {match.status === 'ready' ? 'Up next' : 'Scheduled'}
    </span>
  );
};

/**
 * One pairing on the scoreboard: names, then games and current-game points.
 * `points` is null once the match is over (only the games count then).
 */
const TeamTile: React.FC<{
  label: string;
  accent: 'volt' | 'blue';
  team?: Team;
  games: number;
  points: string | null;
  golden: boolean;
  result?: 'won' | 'lost';
}> = ({ label, accent, team, games, points, golden, result }) => (
  <div
    className={`rounded-2xl border p-3 sm:p-4 flex flex-col ${
      result === 'won' ? 'bg-zinc-800/80 border-[#CCFF00]' : 'bg-zinc-800/60 border-zinc-700/80'
    }`}
  >
    {result === 'won' ? (
      <span className="flex items-center gap-1.5 text-[10px] font-mono font-black uppercase tracking-wider text-[#CCFF00]">
        <Trophy className="w-3 h-3" />
        Winner
      </span>
    ) : (
      <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
        <span className={`w-2 h-2 rounded-full ${accent === 'volt' ? 'bg-[#CCFF00]' : 'bg-[#2E6BFF]'}`} />
        {label}
      </span>
    )}
    <div
      className={`mt-1.5 mb-3 text-sm sm:text-base font-bold leading-snug ${
        result === 'lost' ? 'text-zinc-400' : 'text-white'
      }`}
    >
      {team?.player1 || 'TBD'}
      <span className="block">{team?.player2 || ''}</span>
    </div>
    <dl className="mt-auto pt-2.5 border-t border-zinc-700 space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <dt className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">Games</dt>
        <dd className="font-display font-black text-4xl sm:text-5xl leading-none text-white tabular-nums">
          {games}
        </dd>
      </div>
      {points !== null && (
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">Points</dt>
          <dd
            className={`font-display font-black text-4xl sm:text-5xl leading-none tabular-nums ${
              golden ? 'text-amber-400' : 'text-[#CCFF00]'
            }`}
          >
            {points}
          </dd>
        </div>
      )}
    </dl>
  </div>
);

/** Big courtside button that records a point for one pairing. */
const PointButton: React.FC<{
  id: string;
  accent: 'volt' | 'blue';
  team?: Team;
  golden: boolean;
  onClick: () => void;
}> = ({ id, accent, team, golden, onClick }) => (
  <button
    id={id}
    onClick={onClick}
    aria-label={`Point to ${pairLabel(team, 'this pairing')}`}
    className={`w-full min-h-28 rounded-2xl px-3 py-4 flex flex-col items-center justify-center gap-1.5 text-center shadow-lg transition-[transform,background-color] duration-100 active:scale-[0.97] cursor-pointer ${
      accent === 'volt'
        ? 'bg-[#CCFF00] hover:bg-[#d8ff4d] text-slate-950'
        : 'bg-[#2E6BFF] hover:bg-[#4a7fff] text-white'
    }`}
  >
    <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold uppercase tracking-widest opacity-80">
      <Plus className="w-3.5 h-3.5" />
      {golden ? 'Golden point' : 'Point'}
    </span>
    <span className="text-sm sm:text-base font-extrabold leading-snug">
      {team?.player1 || 'TBD'}
      <span className="block">{team?.player2 || ''}</span>
    </span>
  </button>
);

/** A match in the picker: what it is, then the actions passed as children. */
const PickerRow: React.FC<{
  match: EnrichedMatch;
  origin?: string;
  highlight?: 'current' | 'warning';
  children: React.ReactNode;
}> = ({ match, origin, highlight, children }) => (
  <div
    className={`rounded-2xl border p-3.5 ${
      highlight === 'current'
        ? 'border-blue-500 bg-blue-50'
        : highlight === 'warning'
          ? 'border-rose-200 bg-rose-50/60'
          : 'border-slate-200 bg-white'
    }`}
  >
    <div className="flex items-center justify-between gap-2">
      <span className="min-w-0 truncate text-[11px] font-mono font-bold text-slate-500">
        <span className="text-[#0A0A0F]">Match {match.matchNumber}</span> · {match.scheduledTime} ·{' '}
        {stageLabel(match)}
        {origin ? ` · ${origin}` : ''}
      </span>
      <MatchStatusChip match={match} />
    </div>
    <div className="mt-1 text-sm font-extrabold text-[#0A0A0F] leading-snug">
      {pairText(match.team1)} <span className="font-medium text-slate-400">vs</span> {pairText(match.team2)}
    </div>
    <div className="mt-3 flex flex-wrap gap-2">{children}</div>
  </div>
);

/** Small "are my points on the server?" readout for the scoring card footer. */
const SyncIndicator: React.FC<{ sender: SenderSnapshot; onSignIn: () => void }> = ({
  sender,
  onSignIn,
}) => {
  if (sender.status === 'auth') {
    return (
      <button
        onClick={onSignIn}
        className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-widest text-rose-400 hover:text-rose-300 cursor-pointer"
      >
        <span className="w-2 h-2 rounded-full bg-rose-500 motion-safe:animate-pulse" />
        Sign in to send
      </button>
    );
  }
  if (sender.pending > 0) {
    return (
      <span className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-widest text-amber-300">
        <span className="w-2 h-2 rounded-full bg-amber-400 motion-safe:animate-pulse" />
        {sender.status === 'retrying' ? 'Retrying…' : 'Sending…'}
      </span>
    );
  }
  return (
    <span className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-widest text-[#CCFF00]">
      <CheckCircle2 className="w-3.5 h-3.5" />
      Saved
    </span>
  );
};
