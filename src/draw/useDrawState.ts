import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDraw } from './drawApi';
import { DrawApiState, DrawResultView } from './types';
import { GROUP_MS, PAIR_MS, SPIN_MS } from './constants';

/**
 * Subscribes to the authoritative draw state.
 *
 * Strategy: "initial fetch + realtime updates".
 *   1. Fetch the full snapshot on mount (so a late/refreshing viewer recovers
 *      the exact current state).
 *   2. Listen to the existing Server-Sent Events stream and refetch on change.
 *   3. Poll every 4s as a safety net.
 *
 * Reveals are queued and played back ONE AT A TIME. If the server is several
 * results ahead (e.g. a burst of reveals, a fast connection, or a reconnect),
 * the animation still plays each pair in order instead of skipping or
 * overlapping. The wheel always lands on the authoritative pair.
 */

export type DrawPhase = 'spinning' | 'pair' | 'group';

export interface DrawAnimation {
  phase: DrawPhase;
  result: DrawResultView;
  /** Increments per animation so the wheel knows when to start spinning. */
  token: number;
}

export function useDrawState() {
  const [state, setState] = useState<DrawApiState | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const [animation, setAnimation] = useState<DrawAnimation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const lastCountRef = useRef<number>(-1);
  const animatingRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const tokenRef = useRef(0);
  const stateRef = useRef<DrawApiState | null>(null);
  // Results that have arrived but not yet been animated.
  const queueRef = useRef<DrawResultView[]>([]);
  const revealedCountRef = useRef(0);

  const reportError = useCallback((message: string) => {
    setError(message);
    try {
      const body = JSON.stringify({
        message,
        url: typeof window !== 'undefined' ? window.location.href : '',
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        at: new Date().toISOString(),
      });
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon('/api/draw/client-error', body);
      } else {
        fetch('/api/draw/client-error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => undefined);
      }
    } catch {
      // reporting must never break the draw
    }
  }, []);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  }, []);

  /** Play one queued reveal, then immediately start the next one. */
  const playNext = useCallback(() => {
    const next = queueRef.current.shift();
    if (!next) {
      animatingRef.current = false;
      setAnimation(null);
      return;
    }

    animatingRef.current = true;
    tokenRef.current += 1;
    const token = tokenRef.current;
    setAnimation({ phase: 'spinning', result: next, token });

    timersRef.current.push(
      window.setTimeout(() => {
        setAnimation({ phase: 'pair', result: next, token });
        timersRef.current.push(
          window.setTimeout(() => {
            setAnimation({ phase: 'group', result: next, token });
            timersRef.current.push(
              window.setTimeout(() => {
                revealedCountRef.current = next.drawOrder;
                setRevealedCount(next.drawOrder);
                playNextRef.current();
              }, GROUP_MS)
            );
          }, PAIR_MS)
        );
      }, SPIN_MS)
    );
  }, []);
  const playNextRef = useRef(playNext);
  playNextRef.current = playNext;

  const applyState = useCallback(
    (next: DrawApiState, opts?: { animate?: boolean }) => {
      setState(next);
      stateRef.current = next;
      const count = next.results.length;

      // First load: adopt the current authoritative state instantly.
      if (lastCountRef.current < 0) {
        lastCountRef.current = count;
        revealedCountRef.current = count;
        setRevealedCount(count);
        return;
      }

      if (count > lastCountRef.current) {
        const added = next.results.slice(lastCountRef.current);
        lastCountRef.current = count;
        if (opts?.animate === false) {
          // Snap forward (e.g. after an explicit refresh).
          queueRef.current = [];
          clearTimers();
          animatingRef.current = false;
          setAnimation(null);
          revealedCountRef.current = count;
          setRevealedCount(count);
        } else {
          // Queue every new result so they play in order, one at a time.
          queueRef.current.push(...added);
          if (!animatingRef.current) playNextRef.current();
        }
        return;
      }

      if (count < lastCountRef.current) {
        // Undo or reset — snap the board back, no animation.
        lastCountRef.current = count;
        queueRef.current = [];
        clearTimers();
        animatingRef.current = false;
        setAnimation(null);
        revealedCountRef.current = count;
        setRevealedCount(count);
        return;
      }

      // Same count: only resync the board when nothing is mid-animation.
      if (!animatingRef.current) {
        revealedCountRef.current = count;
        setRevealedCount(count);
      }
    },
    [clearTimers]
  );

  const refresh = useCallback(
    async (opts?: { animate?: boolean }) => {
      try {
        const next = await fetchDraw();
        applyState(next, opts);
        setError(null);
      } catch (err: any) {
        reportError(err?.message || 'Failed to load the draw.');
      } finally {
        setLoading(false);
      }
    },
    [applyState, reportError]
  );

  // Initial snapshot (never animated).
  useEffect(() => {
    refresh({ animate: false });
  }, [refresh]);

  // Realtime updates + polling fallback.
  useEffect(() => {
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/live-events');
      // EventSource reconnects by itself. Refetch a complete snapshot after
      // every reconnect so updates missed while offline are recovered.
      eventSource.onopen = () => refresh({ animate: true });
      eventSource.onmessage = () => refresh({ animate: true });
    } catch {
      // polling fallback below still covers us
    }

    // SSE is the primary transport. Poll less frequently, and only while SSE
    // is disconnected, to keep traffic low for large spectator audiences.
    const poll = window.setInterval(() => {
      if (!eventSource || eventSource.readyState !== EventSource.OPEN) {
        refresh({ animate: true });
      }
    }, 15000);

    const onOnline = () => refresh({ animate: true });
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh({ animate: true });
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (eventSource) eventSource.close();
      window.clearInterval(poll);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      clearTimers();
    };
  }, [refresh, clearTimers]);

  return { state, revealedCount, animation, error, loading, refresh };
}
