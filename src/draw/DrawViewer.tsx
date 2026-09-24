import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDrawState } from './useDrawState';
import { Wheel } from './Wheel';
import { GroupBoard } from './GroupBoard';
import { RevealOverlay } from './RevealOverlay';
import {
  isSoundEnabled,
  loadSoundPreference,
  playComplete,
  playReveal,
  playTick,
  setSoundEnabled,
} from './sound';
import { DRAW_THEME } from './theme';
import { Maximize2, Minimize2, Volume2, VolumeX, Trophy } from 'lucide-react';

export const DrawViewer: React.FC = () => {
  const { state, revealedCount, animation, error, loading } = useDrawState();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sound, setSound] = useState(() => loadSoundPreference());

  // ---- Fullscreen ---------------------------------------------------------
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => undefined);
    } else {
      document.exitFullscreen?.().catch(() => undefined);
    }
  };

  const toggleSound = () => {
    const next = !isSoundEnabled();
    setSoundEnabled(next);
    setSound(next);
  };

  // ---- Sound effects ------------------------------------------------------
  useEffect(() => {
    if (animation?.phase !== 'spinning' || !sound) return;
    const id = window.setInterval(playTick, 110);
    return () => window.clearInterval(id);
  }, [animation?.phase, sound]);

  const prevPhase = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (animation?.phase === 'group' && prevPhase.current !== 'group' && sound) {
      playReveal();
    }
    prevPhase.current = animation?.phase;
  }, [animation?.phase, sound]);

  const completePlayed = useRef(false);
  useEffect(() => {
    if (
      state?.status === 'complete' &&
      revealedCount === state.totalPairs &&
      !completePlayed.current &&
      sound
    ) {
      completePlayed.current = true;
      playComplete();
    }
  }, [state?.status, revealedCount, state?.totalPairs, sound]);

  // ---- Derived ------------------------------------------------------------
  const revealedResults = useMemo(
    () => (state ? state.results.slice(0, revealedCount) : []),
    [state, revealedCount]
  );
  const drawnPairIds = useMemo(
    () => new Set(revealedResults.map((r) => r.pairId)),
    [revealedResults]
  );
  const highlightPairId = revealedResults.length
    ? revealedResults[revealedResults.length - 1].pairId
    : null;

  const status = state?.status ?? 'setup';
  const total = state?.totalPairs ?? 20;
  const current = state?.currentDrawIndex ?? 0;

  const pageStyle: React.CSSProperties = {
    backgroundColor: DRAW_THEME.black,
    backgroundImage:
      'radial-gradient(circle at 50% 22%, rgba(46,107,255,0.18) 0%, rgba(7,10,18,0) 55%)',
  };

  if (loading && !state) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center overflow-x-hidden" style={pageStyle}>
        <span className="font-mono text-sm" style={{ color: DRAW_THEME.muted }}>
          Loading the live draw…
        </span>
      </div>
    );
  }

  return (
    <div className="draw-viewport flex min-h-screen w-full min-w-0 flex-col" style={pageStyle}>
      {/* Header */}
      <header style={{ backgroundColor: '#0B0E14' }}>
        <div
          className="mx-auto flex w-full min-w-0 max-w-[1600px] flex-col items-center gap-3 border-b-4 px-3 py-3 text-center sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:text-left"
          style={{ borderColor: DRAW_THEME.blue }}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-16 items-center justify-center rounded-xl bg-white px-2 shadow-md">
              <img src="/cpa%20logo%20final.svg" alt="CPA Padel" className="h-auto w-full" />
            </div>
            <div>
              <h1
                className="font-display text-lg font-bold uppercase italic leading-none tracking-tight sm:text-xl"
                style={{ color: DRAW_THEME.blue }}
              >
                Live Group Draw
              </h1>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-white/60">
                CPA Padel Tournament
              </p>
            </div>
          </div>

          <div className="flex w-full min-w-0 flex-wrap items-center justify-center gap-2 sm:w-auto sm:justify-start">
            <span
              className="rounded-full px-4 py-1.5 font-mono text-sm font-black tracking-wide text-white shadow"
              style={{ backgroundColor: DRAW_THEME.blue }}
            >
              DRAW: {current} / {total}
            </span>

            <button
              onClick={toggleSound}
              className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-white/20"
              title={sound ? 'Mute sound' : 'Enable sound'}
            >
              {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              <span>{sound ? 'Sound On' : 'Sound Off'}</span>
            </button>

            <button
              onClick={toggleFullscreen}
              className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-white/20"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              <span>{isFullscreen ? 'Exit' : 'Full Screen'}</span>
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div
          className="px-4 py-2 text-center text-xs"
          style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#FCA5A5' }}
        >
          {error} — retrying automatically…
        </div>
      )}

      {/* Body */}
      <main className="mx-auto w-full min-w-0 max-w-[1600px] flex-1 px-3 py-4 text-center sm:px-6 sm:py-6">
        <div className="flex w-full min-w-0 flex-col items-center justify-center">
          {/* Wheel */}
          <div className="relative mx-auto flex w-full min-w-0 max-w-3xl flex-col items-center justify-center p-2 sm:p-6">
            <Wheel
              pairs={state?.pairs ?? []}
              drawnPairIds={drawnPairIds}
              targetPairId={animation?.result.pairId ?? null}
              spinToken={animation?.token ?? 0}
              idle={(status === 'ready' || status === 'in_progress') && !animation}
            />

            <div className="mx-auto mt-3 max-w-full text-center">
              {status === 'setup' && (
                <p className="mx-auto max-w-full px-2 font-mono text-[11px] uppercase leading-relaxed tracking-widest sm:text-xs" style={{ color: '#F59E0B' }}>
                  Waiting for the host to initialize the draw
                </p>
              )}
              {status === 'ready' && (
                <p className="mx-auto max-w-full px-2 font-mono text-[11px] uppercase leading-relaxed tracking-widest sm:text-xs" style={{ color: DRAW_THEME.muted }}>
                  Draw ready — the host will press SPIN
                </p>
              )}
              {status === 'in_progress' && (
                <p className="mx-auto max-w-full px-2 font-mono text-[11px] uppercase leading-relaxed tracking-widest sm:text-xs" style={{ color: DRAW_THEME.green }}>
                  Draw in progress
                </p>
              )}
              {status === 'complete' && (
                <p className="font-display text-lg font-bold uppercase tracking-widest" style={{ color: DRAW_THEME.blueLight }}>
                  Draw Complete
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Draw complete banner */}
        {status === 'complete' && (
          <div
            className="draw-reveal-pop mx-auto mt-4 flex max-w-3xl flex-wrap items-center justify-center gap-2 rounded-2xl px-4 py-4 text-center shadow-md sm:gap-3"
            style={{ backgroundColor: DRAW_THEME.blue }}
          >
            <Trophy className="h-6 w-6 shrink-0 text-white" />
            <span className="font-display text-base font-bold uppercase tracking-wide text-white sm:text-2xl sm:tracking-widest">
              Draw Complete — 5 groups of {state?.groupSize ?? 4}
            </span>
          </div>
        )}

        {/* Group board */}
        <div className="mt-4">
          <GroupBoard
            groups={state?.groups ?? ['A', 'B', 'C', 'D', 'E']}
            results={revealedResults}
            groupSize={state?.groupSize ?? 4}
            highlightPairId={highlightPairId}
          />
        </div>
      </main>

      <RevealOverlay animation={animation} />
    </div>
  );
};
