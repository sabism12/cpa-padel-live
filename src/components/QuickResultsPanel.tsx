import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Edit2, Loader2 } from 'lucide-react';
import { Court } from '../types';
import { EnrichedMatch, submitScoreResult } from '../api';
import { pairLabel } from '../utils/teamDisplay';
import { finalScoreError } from '../scoring/finalScore';
import {
  BandLabel,
  SectionCard,
  adminStageLabel as stageLabel,
  isKnockout,
  primaryButton,
  smallOutlineButton,
  outlineButton,
} from './AdminUI';

interface QuickResultsPanelProps {
  token: string;
  matches: EnrichedMatch[];
  courts: Court[];
  onRefreshData: () => void;
}

type Draft = { t1: string; t2: string };

/** Knockout slot still waiting for an earlier result. */
const isTbd = (m: EnrichedMatch) => !m.team1Id || !m.team2Id;
const isPlayed = (m: EnrichedMatch) => m.status === 'completed' || m.status === 'cancelled';

/** Minutes after midnight for "8:00–8:30" or "14:00", for schedule order. */
function startMinutes(time: string): number {
  const match = /(\d{1,2}):(\d{2})/.exec(time || '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.MAX_SAFE_INTEGER;
}

/** Current games of a match being scored point by point on a phone, e.g. "3–2". */
function liveGames(m: EnrichedMatch): string {
  const t1 = m.padelState?.team1Games ?? m.team1Score ?? 0;
  const t2 = m.padelState?.team2Games ?? m.team2Score ?? 0;
  return `${t1}–${t2}`;
}

/** Only digits, at most two (valid games are 0-6; "10" still gets a clear error). */
const cleanGames = (value: string) => value.replace(/\D/g, '').slice(0, 2);

/**
 * Admin "Quick results": type final games from the paper score sheets.
 * Saves through the scorekeeper's result path (submitScore), so knockout
 * winners and losers move on exactly as if the match had been scored live.
 */
export const QuickResultsPanel: React.FC<QuickResultsPanelProps> = ({
  token,
  matches,
  courts,
  onRefreshData,
}) => {
  const [unplayedOnly, setUnplayedOnly] = useState(false);
  const [courtFilter, setCourtFilter] = useState('all');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  // Completed rows opened for a correction.
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  // Results saved here that the refreshed match list has not caught up with yet.
  const [saved, setSaved] = useState<Record<string, { t1: number; t2: number }>>({});

  const firstInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const secondInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const courtOrder = useMemo(() => new Map(courts.map((c, i) => [c.id, c.order ?? i])), [courts]);

  // Schedule order: group stage, then knockouts; by start time, then court.
  const ordered = useMemo(
    () =>
      [...matches].sort(
        (a, b) =>
          Number(isKnockout(a)) - Number(isKnockout(b)) ||
          startMinutes(a.scheduledTime) - startMinutes(b.scheduledTime) ||
          (courtOrder.get(a.courtId ?? '') ?? 99) - (courtOrder.get(b.courtId ?? '') ?? 99) ||
          a.matchNumber - b.matchNumber
      ),
    [matches, courtOrder]
  );

  // Drop the local copy of a saved result once the server data shows it.
  useEffect(() => {
    setSaved((current) => {
      const stillPending = Object.entries(current).filter(([id, score]) => {
        const m = matches.find((x) => x.id === id);
        return !(m && m.status === 'completed' && m.team1Score === score.t1 && m.team2Score === score.t2);
      });
      return stillPending.length === Object.keys(current).length ? current : Object.fromEntries(stillPending);
    });
  }, [matches]);

  const onCourt = (m: EnrichedMatch) => courtFilter === 'all' || m.courtId === courtFilter;
  const isDone = (m: EnrichedMatch) => isPlayed(m) || !!saved[m.id];
  const canEnter = (m: EnrichedMatch) => !isDone(m) && !isTbd(m);

  const courtMatches = ordered.filter(onCourt);
  const visible = courtMatches.filter((m) => !unplayedOnly || !isDone(m));
  const doneCount = courtMatches.filter(isDone).length;

  const focusRow = (matchId: string) => {
    const input = firstInputs.current[matchId];
    if (!input) return;
    input.focus();
    input.select();
  };

  // Start on the first match still to enter (keyboard devices only, so a
  // phone keyboard does not pop up when the tab opens).
  useEffect(() => {
    if (!window.matchMedia?.('(pointer: fine)').matches) return;
    const first = ordered.find(canEnter);
    if (first) focusRow(first.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The next match still to enter after `matchId` (wrapping round), on this court filter. */
  const focusNextAfter = (matchId: string) => {
    const index = courtMatches.findIndex((m) => m.id === matchId);
    const open = (m: EnrichedMatch) => m.id !== matchId && canEnter(m);
    const next = courtMatches.slice(index + 1).find(open) ?? courtMatches.slice(0, Math.max(index, 0)).find(open);
    if (next) focusRow(next.id);
    else (document.activeElement as HTMLElement | null)?.blur();
  };

  const clearKey = <T,>(record: Record<string, T>, key: string) => {
    const { [key]: _removed, ...rest } = record;
    return rest;
  };

  const setDraft = (m: EnrichedMatch, side: 't1' | 't2', value: string) => {
    setDrafts((current) => ({
      ...current,
      [m.id]: { ...(current[m.id] ?? { t1: '', t2: '' }), [side]: cleanGames(value) },
    }));
    if (errors[m.id]) setErrors((current) => clearKey(current, m.id));
  };

  const startEdit = (m: EnrichedMatch) => {
    const known = m.walkover !== 'both' && m.team1Score !== null && m.team2Score !== null;
    const shown = saved[m.id];
    setDrafts((current) => ({
      ...current,
      [m.id]: shown
        ? { t1: String(shown.t1), t2: String(shown.t2) }
        : { t1: known ? String(m.team1Score) : '', t2: known ? String(m.team2Score) : '' },
    }));
    setEditing((current) => ({ ...current, [m.id]: true }));
  };

  const cancelEdit = (m: EnrichedMatch) => {
    setEditing((current) => clearKey(current, m.id));
    setDrafts((current) => clearKey(current, m.id));
    setErrors((current) => clearKey(current, m.id));
  };

  const saveRow = async (m: EnrichedMatch) => {
    if (saving[m.id]) return;
    const draft = drafts[m.id] ?? { t1: '', t2: '' };
    const formatError = finalScoreError(draft.t1, draft.t2);
    if (formatError) {
      setErrors((current) => ({ ...current, [m.id]: formatError }));
      return;
    }
    const t1 = Number(draft.t1);
    const t2 = Number(draft.t2);

    // A scorekeeper is scoring this match on a phone right now. Saving here
    // finishes it; the phone's later points are refused and it reloads.
    if (
      m.status === 'live' &&
      !window.confirm(
        `This match is being scored live${m.court ? ` on ${m.court.name}` : ''} (${liveGames(m)} now). Save ${t1}–${t2} as the final result anyway?`
      )
    ) {
      return;
    }

    // Changing a knockout winner after the next round has started also
    // changes who is in that next match, so ask first.
    if (isKnockout(m) && m.status === 'completed' && m.walkover !== 'both') {
      const winnerChanged = (m.team1Score ?? 0) > (m.team2Score ?? 0) !== (t1 > t2);
      const started = matches.find(
        (x) =>
          (x.id === m.nextMatchId || x.id === m.loserNextMatchId) &&
          (x.status === 'live' || x.status === 'completed')
      );
      if (
        winnerChanged &&
        started &&
        !window.confirm(
          `Changing the winner of ${stageLabel(m)} also changes who is in Match #${started.matchNumber}, which has already ${
            started.status === 'live' ? 'started' : 'been played'
          }. Save ${t1}–${t2} anyway?`
        )
      ) {
        return;
      }
    }

    setSaving((current) => ({ ...current, [m.id]: true }));
    try {
      await submitScoreResult(token, m.id, t1, t2);
      setSaved((current) => ({ ...current, [m.id]: { t1, t2 } }));
      setEditing((current) => clearKey(current, m.id));
      setDrafts((current) => clearKey(current, m.id));
      focusNextAfter(m.id);
      onRefreshData();
    } catch (err: any) {
      setErrors((current) => ({ ...current, [m.id]: err?.message || 'Could not save this result.' }));
    } finally {
      setSaving((current) => clearKey(current, m.id));
    }
  };

  const renderScoreInput = (m: EnrichedMatch, side: 't1' | 't2') => {
    const team = side === 't1' ? m.team1 : m.team2;
    const hasError = !!errors[m.id];
    return (
      <input
        ref={(el) => {
          (side === 't1' ? firstInputs : secondInputs).current[m.id] = el;
        }}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        enterKeyHint={side === 't1' ? 'next' : 'done'}
        autoFocus={side === 't1' && !!editing[m.id]}
        aria-label={`Games for ${pairLabel(team, 'pairing')} in match #${m.matchNumber}`}
        aria-invalid={hasError || undefined}
        value={drafts[m.id]?.[side] ?? ''}
        readOnly={!!saving[m.id]}
        onChange={(e) => setDraft(m, side, e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && editing[m.id]) {
            e.preventDefault();
            cancelEdit(m);
          }
          // Enter on pairing 1 jumps to pairing 2 until that has a value.
          if (e.key === 'Enter' && side === 't1') {
            e.preventDefault();
            if (!(drafts[m.id]?.t2 ?? '')) secondInputs.current[m.id]?.focus();
            else void saveRow(m);
          }
        }}
        placeholder="–"
        className={`w-14 h-12 sm:w-16 shrink-0 rounded-xl bg-white border-2 text-center text-3xl font-display font-bold leading-none text-[#0A0A0F] placeholder:text-slate-300 focus:outline-none focus:ring-4 transition-colors ${
          hasError
            ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/15'
            : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500/15'
        }`}
      />
    );
  };

  const renderRow = (m: EnrichedMatch) => {
    const tbd = isTbd(m);
    const isEditing = !!editing[m.id];
    const done = isDone(m) && !isEditing;
    const inputs = !done && !tbd && m.status !== 'cancelled';
    const result = saved[m.id] ?? (m.status === 'completed' ? { t1: m.team1Score, t2: m.team2Score } : null);
    const winner =
      done && result && m.walkover !== 'both' && result.t1 !== null && result.t2 !== null
        ? result.t1 > result.t2
          ? 1
          : 2
        : null;
    const error = errors[m.id];
    const isSaving = !!saving[m.id];

    const pairing = (side: 1 | 2) => {
      const team = side === 1 ? m.team1 : m.team2;
      const teamId = side === 1 ? m.team1Id : m.team2Id;
      const score = side === 1 ? result?.t1 : result?.t2;
      return (
        <div className="flex items-center gap-3">
          <span
            className={`flex-1 min-w-0 text-sm sm:text-base leading-snug break-words ${
              !teamId
                ? 'text-slate-400 italic font-medium'
                : winner === null || winner === side
                ? 'font-extrabold text-[#0A0A0F]'
                : 'font-semibold text-slate-400'
            }`}
          >
            {teamId ? pairLabel(team) : 'TBD'}
          </span>
          {inputs ? (
            renderScoreInput(m, side === 1 ? 't1' : 't2')
          ) : (
            <span
              className={`w-14 sm:w-16 shrink-0 text-center text-3xl font-display font-bold leading-none ${
                winner === side ? 'text-[#0A0A0F]' : 'text-slate-300'
              }`}
            >
              {done && m.walkover !== 'both' && score !== null && score !== undefined ? score : '–'}
            </span>
          )}
        </div>
      );
    };

    return (
      <form
        key={m.id}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (inputs) void saveRow(m);
        }}
        className={`rounded-2xl border p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 transition-colors ${
          error
            ? 'bg-white border-rose-400 ring-4 ring-rose-500/10'
            : isEditing
            ? 'bg-white border-blue-500 ring-4 ring-blue-500/10'
            : m.status === 'live' && inputs
            ? 'bg-[#CCFF00]/10 border-[#0A0A0F]'
            : done || tbd
            ? 'bg-slate-50 border-slate-200'
            : 'bg-white border-slate-200 focus-within:border-blue-400'
        }`}
      >
        {/* Match number, time, court */}
        <div className="flex flex-wrap sm:flex-col sm:w-40 shrink-0 items-baseline sm:items-start gap-x-2.5 gap-y-1">
          <span className="font-mono font-black text-[#0A0A0F] text-base leading-none">#{m.matchNumber}</span>
          <span className="text-xs font-mono font-bold text-slate-600">{m.scheduledTime}</span>
          <span className="text-xs text-slate-500 truncate">{m.court?.name || 'No court'}</span>
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-700">{stageLabel(m)}</span>
        </div>

        {/* Pairing 1 vs pairing 2 */}
        <div className="flex-1 min-w-0 space-y-2">
          {pairing(1)}
          {pairing(2)}
          {error && (
            <p role="alert" className="text-xs font-semibold text-rose-700">
              {error}
            </p>
          )}
        </div>

        {/* Status / actions */}
        <div className="sm:w-32 shrink-0 flex sm:flex-col items-center sm:items-stretch gap-2">
          {inputs ? (
            <>
              <button
                type="submit"
                disabled={isSaving}
                className={`${primaryButton} min-h-11 flex-1 sm:flex-none`}
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {isSaving ? 'Saving' : isEditing ? 'Save fix' : 'Save'}
              </button>
              {isEditing ? (
                <button type="button" onClick={() => cancelEdit(m)} className={`${outlineButton} flex-1 sm:flex-none`}>
                  Cancel
                </button>
              ) : m.status === 'live' ? (
                <span
                  title="Being scored point by point on a phone"
                  className="flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-black uppercase tracking-wider bg-[#CCFF00] text-[#0A0A0F] whitespace-nowrap"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0A0A0F] animate-pulse" />
                  Live {liveGames(m)}
                </span>
              ) : null}
            </>
          ) : m.status === 'cancelled' ? (
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-500">Cancelled</span>
          ) : tbd ? (
            <span className="text-xs italic text-slate-500 leading-snug">Waiting for earlier results</span>
          ) : (
            <>
              <span className="flex items-center justify-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-black uppercase tracking-wider bg-slate-200 text-slate-700 whitespace-nowrap">
                <CheckCircle2 className="w-3 h-3" />
                {m.walkover === 'both' ? 'W/O · both absent' : m.walkover ? 'Walkover' : 'Entered'}
              </span>
              <button
                type="button"
                onClick={() => startEdit(m)}
                aria-label={`Edit result of match #${m.matchNumber}`}
                className={smallOutlineButton}
              >
                <Edit2 className="w-3 h-3" />
                Edit
              </button>
            </>
          )}
        </div>
      </form>
    );
  };

  return (
    <SectionCard
      title="Quick results"
      aside={
        <BandLabel>
          <span className="text-[#CCFF00]">{doneCount}</span> / {courtMatches.length}
        </BandLabel>
      }
      strip="From the paper score sheets · first to 6 games, no tiebreak (6–0 to 6–5)"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <p className="text-sm text-slate-600 max-w-xl leading-relaxed">
          Type pairing 1's games,{' '}
          <kbd className="px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[11px] font-mono font-bold text-slate-700">Tab</kbd>,
          pairing 2's games,{' '}
          <kbd className="px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[11px] font-mono font-bold text-slate-700">Enter</kbd>{' '}
          to save and jump to the next match. Knockout winners move on automatically.
        </p>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            aria-pressed={unplayedOnly}
            onClick={() => setUnplayedOnly((value) => !value)}
            className={`min-h-10 px-3.5 rounded-full text-[11px] font-mono font-bold uppercase tracking-widest border transition-colors cursor-pointer whitespace-nowrap ${
              unplayedOnly
                ? 'bg-[#0A0A0F] border-[#0A0A0F] text-[#CCFF00]'
                : 'bg-white border-slate-900/20 text-[#0A0A0F] hover:bg-blue-50'
            }`}
          >
            {unplayedOnly ? '✓ ' : ''}Unplayed only
          </button>
          <select
            value={courtFilter}
            onChange={(e) => setCourtFilter(e.target.value)}
            aria-label="Filter by court"
            className="min-h-10 px-3.5 bg-slate-50 border border-slate-200 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="all">All courts</option>
            {courts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="py-8 rounded-2xl bg-slate-50 border border-slate-200 text-center text-sm text-slate-500">
          <CheckCircle2 className="w-6 h-6 text-blue-600 mx-auto mb-2" />
          {unplayedOnly ? 'Every result here is entered.' : 'No matches on this court.'}
        </div>
      ) : (
        <div className="space-y-2.5">{visible.map(renderRow)}</div>
      )}
    </SectionCard>
  );
};
