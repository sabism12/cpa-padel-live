import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AuthModal } from '../components/AuthModal';
import { AuthSession } from '../types';
import { checkAuth } from '../api';
import { useDrawState } from './useDrawState';
import { Wheel, WheelHandle } from './Wheel';
import { GroupBoard } from './GroupBoard';
import { DrawHistory } from './DrawHistory';
import { RevealOverlay } from './RevealOverlay';
import {
  adminInitializeDraw,
  adminResetDraw,
  adminSaveDrawPairs,
  adminSpinDraw,
  adminUndoDraw,
} from './drawApi';
import { TOTAL_PAIRS, GROUP_MS, PAIR_MS, SPIN_MS } from './constants';
import { DrawApiState } from './types';
import { pairLabel } from '../utils/teamDisplay';
import { DRAW_THEME } from './theme';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  LogOut,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Square,
  Undo2,
  Upload,
} from 'lucide-react';

interface PairForm {
  player1: string;
  player2: string;
}

const EMPTY_PAIR: PairForm = { player1: '', player2: '' };

function buildForm(pairs: { player1: string; player2: string }[]): PairForm[] {
  const rows = pairs.map((p) => ({ player1: p.player1 || '', player2: p.player2 || '' }));
  while (rows.length < TOTAL_PAIRS) rows.push({ ...EMPTY_PAIR });
  return rows.slice(0, TOTAL_PAIRS);
}

function parseCsv(text: string): PairForm[] {
  const rows: PairForm[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^player\s*1/i.test(line)) continue; // skip header row
    const parts = line.split(/[,\t;]/).map((s) => s.trim());
    if (parts.length < 2) continue;
    if (!parts[0] && !parts[1]) continue;
    rows.push({ player1: parts[0] || '', player2: parts[1] || '' });
  }
  return rows;
}

const pageStyle: React.CSSProperties = {
  backgroundColor: DRAW_THEME.black,
  backgroundImage:
    'radial-gradient(circle at 50% 12%, rgba(46,107,255,0.16) 0%, rgba(7,10,18,0) 55%)',
};

const cardStyle: React.CSSProperties = {
  backgroundColor: DRAW_THEME.panel,
  border: `1px solid ${DRAW_THEME.line}`,
};

const inputStyle: React.CSSProperties = {
  backgroundColor: '#0B0E14',
  borderColor: DRAW_THEME.line,
  color: DRAW_THEME.white,
};

export const DrawAdmin: React.FC = () => {
  const { state, revealedCount, animation, error, refresh } = useDrawState();

  // ---- Admin session (reuses the existing staff authentication) -----------
  const [session, setSession] = useState<AuthSession | null>(() => {
    try {
      const stored = localStorage.getItem('cpa_auth_session');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.token && parsed.role === 'admin') return parsed;
      }
    } catch {
      // ignore
    }
    return null;
  });
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (!session?.token) {
      setAuthChecked(true);
      return;
    }
    checkAuth(session.token)
      .then((verified) => {
        if (!verified?.authenticated || verified.role !== 'admin') {
          localStorage.removeItem('cpa_auth_session');
          setSession(null);
        }
      })
      .catch(() => undefined)
      .finally(() => setAuthChecked(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignOut = () => {
    localStorage.removeItem('cpa_auth_session');
    setSession(null);
  };

  // ---- Pair editor --------------------------------------------------------
  const [formPairs, setFormPairs] = useState<PairForm[]>(() =>
    Array.from({ length: TOTAL_PAIRS }, () => ({ ...EMPTY_PAIR }))
  );
  const formInitRef = useRef(false);

  useEffect(() => {
    if (!state || formInitRef.current) return;
    formInitRef.current = true;
    setFormPairs(buildForm(state.pairs));
  }, [state]);

  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  /** True while the automatic draw sequence is running (SPIN was pressed). */
  const [autoRunning, setAutoRunning] = useState(false);
  const [csvText, setCsvText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drives the wheel animation straight from the authoritative result.
  const wheelHandleRef = useRef<WheelHandle | null>(null);
  // Guards the auto sequence against double-starts and stale refreshes.
  const autoRef = useRef(false);
  // The draw index we last animated, so each pair is revealed exactly once.
  const lastAnimatedRef = useRef(-1);

  const status = state?.status ?? 'setup';
  const initialized = state?.initialized ?? false;
  const token = session?.token ?? '';

  const serverPairs = state?.pairs ?? [];
  const isDirty = useMemo(() => {
    const a = formPairs.map((p) => ({ player1: p.player1.trim(), player2: p.player2.trim() }));
    const b = buildForm(serverPairs).map((p) => ({
      player1: p.player1.trim(),
      player2: p.player2.trim(),
    }));
    return JSON.stringify(a) !== JSON.stringify(b);
  }, [formPairs, serverPairs]);

  const filledCount = formPairs.filter((p) => p.player1.trim() && p.player2.trim()).length;

  const updatePair = (index: number, field: keyof PairForm, value: string) => {
    setFormPairs((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  // ---- Actions ------------------------------------------------------------
  const withBusy = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    setMessage(null);
    try {
      await action();
    } catch (err: any) {
      setMessage({ type: 'err', text: err?.message || 'Something went wrong.' });
    } finally {
      setBusy(null);
    }
  };

  const handleSavePairs = () =>
    withBusy('save', async () => {
      await adminSaveDrawPairs(token, formPairs);
      await refresh({ animate: false });
      setMessage({ type: 'ok', text: 'Player pairs saved.' });
    });

  const handleInitialize = () =>
    withBusy('init', async () => {
      if (isDirty) {
        await adminSaveDrawPairs(token, formPairs);
      }
      await adminInitializeDraw(token);
      await refresh({ animate: false });
      stopAuto();
      lastAnimatedRef.current = -1;
      setMessage({ type: 'ok', text: 'Draw initialized. Ready to spin!' });
    });

  // Claim an index so each reveal animates exactly once.
  const claimIndex = (index: number) => {
    if (index <= lastAnimatedRef.current) return false;
    lastAnimatedRef.current = index;
    return true;
  };

  const stopAuto = () => {
    autoRef.current = false;
    setAutoRunning(false);
  };

  /**
   * Runs the whole draw automatically: reveal the next pair, wait for the
   * reveal to finish, then immediately continue until all 20 are assigned
   * (or the host presses STOP).
   */
  const handleSpin = async () => {
    if (autoRef.current) return;
    autoRef.current = true;
    setAutoRunning(true);
    setMessage(null);
    setBusy('spin');

    while (autoRef.current) {
      let spinState: DrawApiState | null = null;

      // Guard the server's short spin cooldown between reveals.
      await new Promise((r) => setTimeout(r, 150));
      if (!autoRef.current) break;

      try {
        const res = await adminSpinDraw(token);
        spinState = res.state;
      } catch (err: any) {
        setMessage({ type: 'err', text: err?.message || 'Spin failed.' });
        break;
      }

      const index = spinState.currentDrawIndex;
      const result = spinState.results[spinState.results.length - 1];
      if (!result) break;

      if (claimIndex(index)) {
        wheelHandleRef.current?.spinTo(result.pairId);
        await new Promise((r) => setTimeout(r, SPIN_MS + PAIR_MS + GROUP_MS + 400));
      }

      if (!autoRef.current) break;
      if (spinState.status === 'complete') break;
    }

    setBusy(null);
    stopAuto();
    refresh({ animate: false });
  };

  const handleStopSpinning = () => {
    stopAuto();
    setBusy(null);
    setMessage({ type: 'ok', text: 'Draw stopped. You can press SPIN to continue.' });
  };

  const handleUndo = () =>
    withBusy('undo', async () => {
      stopAuto();
      await adminUndoDraw(token);
      lastAnimatedRef.current = -1;
      await refresh({ animate: false });
      setMessage({ type: 'ok', text: 'Last draw undone.' });
    });

  const handleReset = () => {
    if (!window.confirm('Reset the draw? All revealed results will be cleared. Your 20 pairs are kept.')) {
      return;
    }
    void withBusy('reset', async () => {
      stopAuto();
      await adminResetDraw(token);
      lastAnimatedRef.current = -1;
      await refresh({ animate: false });
      setMessage({ type: 'ok', text: 'Draw reset. Player pairs were kept.' });
    });
  };

  const applyCsv = () => {
    const parsed = parseCsv(csvText);
    if (parsed.length === 0) {
      setMessage({ type: 'err', text: 'No rows found. Paste lines like: Faham,Ansaf' });
      return;
    }
    setFormPairs(buildForm(parsed));
    setMessage({
      type: 'ok',
      text: `Imported ${Math.min(parsed.length, TOTAL_PAIRS)} pair(s). Review them, then Save / Initialize.`,
    });
  };

  const onFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result || ''));
      setMessage({ type: 'ok', text: 'CSV loaded. Click "Import from CSV" to apply.' });
    };
    reader.readAsText(file);
  };

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

  // ---- Auth gate ----------------------------------------------------------
  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={pageStyle}>
        <span className="font-mono text-sm" style={{ color: DRAW_THEME.muted }}>
          Checking access…
        </span>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4" style={pageStyle}>
        <div className="mb-6 text-center">
          <div
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-widest"
            style={{ borderColor: DRAW_THEME.line, backgroundColor: DRAW_THEME.panel, color: DRAW_THEME.blueLight }}
          >
            <ShieldCheck className="h-3 w-3" />
            Draw Administrator
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold italic text-white sm:text-3xl">
            LIVE GROUP DRAW <span style={{ color: DRAW_THEME.blue }}>ADMIN</span>
          </h1>
          <p className="mt-1 font-mono text-xs text-white/50">
            Sign in with the administrator password to run the draw
          </p>
        </div>
        <AuthModal
          isOpen
          defaultRole="admin"
          onSuccess={(newSession) => {
            if (newSession.role === 'admin') setSession(newSession);
            else setMessage({ type: 'err', text: 'Please sign in as Administrator.' });
          }}
          onClose={() => undefined}
        />
        <a href="/draw" className="mt-6 text-xs font-bold text-white/50 hover:text-white">
          ← Back to public draw
        </a>
      </div>
    );
  }

  const canSpin =
    (status === 'ready' || status === 'in_progress') && !autoRunning && busy === null;
  const canStop = autoRunning && busy === 'spin';

  const statusPill =
    status === 'complete'
      ? { backgroundColor: DRAW_THEME.green, color: DRAW_THEME.white }
      : status === 'in_progress'
        ? { backgroundColor: '#F59E0B', color: '#0B0E14' }
        : status === 'ready'
          ? { backgroundColor: DRAW_THEME.blueLight, color: '#0B0E14' }
          : { backgroundColor: '#1F2937', color: DRAW_THEME.white };

  // ---- Admin terminal -----------------------------------------------------
  return (
    <div className="min-h-screen" style={pageStyle}>
      <header style={{ backgroundColor: '#0B0E14' }}>
        <div
          className="mx-auto flex max-w-[1600px] flex-col items-center gap-3 border-b-4 px-3 py-3 text-center sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:text-left"
          style={{ borderColor: DRAW_THEME.blue }}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-16 items-center justify-center rounded-xl bg-white px-2 shadow-md">
              <img src="/cpa%20logo%20final.svg" alt="CPA Padel" className="h-auto w-full" />
            </div>
            <div>
              <h1
                className="font-display text-lg font-bold uppercase italic leading-none"
                style={{ color: DRAW_THEME.blue }}
              >
                Draw Admin
              </h1>
              <p className="mt-1 font-mono text-[11px] text-white/60">
                {session.name} · Administrator
              </p>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center justify-center gap-2 sm:w-auto sm:justify-start">
            <span
              className="rounded-full px-4 py-1.5 font-mono text-sm font-black text-white"
              style={{ backgroundColor: DRAW_THEME.blue }}
            >
              DRAW: {state?.currentDrawIndex ?? 0} / {state?.totalPairs ?? TOTAL_PAIRS}
            </span>
            <a
              href="/draw"
              className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Public View
            </a>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] px-3 py-4 text-center sm:px-6 sm:py-6 sm:text-left">
        {/* Controls */}
        <div className="rounded-3xl p-4 sm:p-5" style={cardStyle}>
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <span
              className="rounded-full px-3 py-1 font-mono text-[11px] font-black uppercase tracking-wider"
              style={statusPill}
            >
              {status === 'setup'
                ? 'Not initialized'
                : status === 'ready'
                  ? 'Ready to spin'
                  : status === 'in_progress'
                    ? 'In progress'
                    : 'Draw complete'}
            </span>
            <span className="font-mono text-xs" style={{ color: DRAW_THEME.muted }}>
              {filledCount}/{TOTAL_PAIRS} pairs entered
            </span>
            {isDirty && !initialized && (
              <span className="font-mono text-xs" style={{ color: '#F59E0B' }}>
                • unsaved changes
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5 sm:justify-start">
            <button
              onClick={handleSpin}
              disabled={!canSpin}
              className="flex items-center gap-2 rounded-2xl px-7 py-3.5 font-display text-lg font-bold uppercase tracking-wide text-white shadow-lg transition-all"
              style={{
                backgroundColor: canSpin ? DRAW_THEME.blue : '#2A3348',
                cursor: canSpin ? 'pointer' : 'not-allowed',
                opacity: canSpin ? 1 : 0.6,
              }}
            >
              <Play className="h-5 w-5" />
              {busy === 'spin' ? 'Spinning…' : 'Spin'}
            </button>

            <button
              onClick={handleStopSpinning}
              disabled={!canStop}
              className="flex items-center gap-2 rounded-2xl px-7 py-3.5 font-display text-lg font-bold uppercase tracking-wide text-white shadow-lg transition-all"
              style={{
                backgroundColor: canStop ? DRAW_THEME.red : '#2A3348',
                cursor: canStop ? 'pointer' : 'not-allowed',
                opacity: canStop ? 1 : 0.5,
              }}
            >
              <Square className="h-5 w-5" />
              Stop Spinning
            </button>

            <button
              onClick={handleInitialize}
              disabled={busy !== null || initialized || filledCount !== TOTAL_PAIRS}
              className="flex items-center gap-2 rounded-2xl border-2 bg-white/5 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ borderColor: DRAW_THEME.blueLight }}
            >
              <Sparkles className="h-4 w-4" />
              Initialize Draw
            </button>

            <button
              onClick={handleUndo}
              disabled={busy !== null || revealedCount === 0}
              className="flex items-center gap-2 rounded-2xl border-2 border-white/25 bg-white/5 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Undo2 className="h-4 w-4" />
              Undo Last Draw
            </button>

            <button
              onClick={handleReset}
              disabled={busy !== null}
              className="flex items-center gap-2 rounded-2xl border-2 px-5 py-3 text-sm font-bold transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ borderColor: DRAW_THEME.red, color: '#FCA5A5' }}
            >
              <RotateCcw className="h-4 w-4" />
              Reset Draw
            </button>
          </div>

          {message && (
            <div
              className="mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-xs"
              style={
                message.type === 'ok'
                  ? { backgroundColor: 'rgba(34,197,94,0.12)', color: '#86EFAC' }
                  : { backgroundColor: 'rgba(239,68,68,0.12)', color: '#FCA5A5' }
              }
            >
              {message.type === 'ok' ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
          )}
          {error && (
            <div className="mt-2 text-xs" style={{ color: '#FCA5A5' }}>
              {error}
            </div>
          )}
        </div>

        {/* Pair editor */}
        <div className="mt-4 rounded-3xl p-4 sm:p-5" style={cardStyle}>
          <div className="mb-3 flex flex-wrap items-center justify-center gap-2 text-center sm:justify-between sm:text-left">
            <h2 className="font-display text-base font-bold uppercase tracking-wide text-white">
              Player Pairs ({TOTAL_PAIRS})
            </h2>
            {initialized && (
              <span className="font-mono text-[11px]" style={{ color: '#F59E0B' }}>
                Locked — reset the draw to edit pairs
              </span>
            )}
          </div>

          {!initialized && (
            <>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {formPairs.map((pair, i) => (
                  <div
                    key={i}
                    className="rounded-xl border p-2.5"
                    style={{ borderColor: DRAW_THEME.line, backgroundColor: DRAW_THEME.panelAlt }}
                  >
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color: DRAW_THEME.muted }}>
                        Pair {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="max-w-[60%] truncate font-mono text-[10px]" style={{ color: DRAW_THEME.blueLight }}>
                        {pair.player1.trim() && pair.player2.trim()
                          ? `${pair.player1.trim()} / ${pair.player2.trim()}`
                          : '—'}
                      </span>
                    </div>
                    <input
                      value={pair.player1}
                      onChange={(e) => updatePair(i, 'player1', e.target.value)}
                      placeholder="Player 1"
                      className="mb-1.5 w-full rounded-lg border px-2.5 py-1.5 text-sm placeholder:text-white/30 focus:outline-none"
                      style={inputStyle}
                    />
                    <input
                      value={pair.player2}
                      onChange={(e) => updatePair(i, 'player2', e.target.value)}
                      placeholder="Player 2"
                      className="w-full rounded-lg border px-2.5 py-1.5 text-sm placeholder:text-white/30 focus:outline-none"
                      style={inputStyle}
                    />
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5 sm:justify-start">
                <button
                  onClick={handleSavePairs}
                  disabled={busy !== null}
                  className="rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                  style={{ backgroundColor: DRAW_THEME.blue }}
                >
                  Save Pairs
                </button>
              </div>

              {/* CSV import */}
              <div
                className="mt-5 rounded-2xl border p-3"
                style={{ borderColor: DRAW_THEME.line, backgroundColor: DRAW_THEME.panelAlt }}
              >
                <div className="mb-2 flex items-center gap-2">
                  <Upload className="h-4 w-4" style={{ color: DRAW_THEME.blueLight }} />
                  <span className="font-display text-sm font-bold text-white">
                    Optional: Import from CSV
                  </span>
                </div>
                <p className="mb-2 font-mono text-[11px]" style={{ color: DRAW_THEME.muted }}>
                  One pair per line: <span className="text-white/80">Faham,Ansaf</span>
                </p>
                <textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  rows={4}
                  placeholder={'Player 1,Player 2\nFaham,Ansaf\nAhmed,Ali'}
                  className="w-full rounded-xl border px-3 py-2 font-mono text-xs placeholder:text-white/30 focus:outline-none"
                  style={inputStyle}
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    onClick={applyCsv}
                    className="rounded-xl border-2 bg-white/5 px-4 py-2 text-xs font-bold text-white hover:bg-white/10"
                    style={{ borderColor: DRAW_THEME.blueLight }}
                  >
                    Import from CSV
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv,text/plain"
                    onChange={onFileChosen}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 rounded-xl border-2 border-white/25 bg-white/5 px-4 py-2 text-xs font-bold text-white hover:bg-white/10"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Choose CSV file
                  </button>
                </div>
              </div>
            </>
          )}

          {initialized && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(state?.pairs ?? []).map((pair, i) => (
                <div
                  key={pair.id}
                  className="flex items-center gap-2 rounded-xl border px-3 py-2"
                  style={{ borderColor: DRAW_THEME.line, backgroundColor: DRAW_THEME.panelAlt }}
                >
                  <span className="font-mono text-[10px] font-bold" style={{ color: DRAW_THEME.muted }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="truncate text-sm font-semibold text-white">
                    {pairLabel(pair)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live preview */}
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <div
            className="flex flex-col items-center justify-center rounded-3xl p-2 sm:p-5"
            style={{ backgroundColor: '#0B0E14', border: `1px solid ${DRAW_THEME.line}` }}
          >
            <Wheel
              pairs={state?.pairs ?? []}
              drawnPairIds={drawnPairIds}
              targetPairId={animation?.result.pairId ?? null}
              idle={false}
              handleRef={wheelHandleRef}
            />
          </div>
          <div className="min-h-[280px] xl:min-h-0">
            <DrawHistory results={revealedResults} highlightPairId={highlightPairId} />
          </div>
        </div>

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
