/**
 * React hook that owns the offline-safe score event pipeline.
 *
 * Responsibilities:
 *  - enqueue events durably (IndexedDB) before any network attempt
 *  - drain the queue to the resolved target (Dell gateway or Render)
 *  - retry with backoff, and immediately on reconnect/visibility
 *  - expose connection mode and pending count for the UI
 *
 * It never stores or reads secrets; it only forwards the auth token it is given.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScoreEvent, SyncMode } from '../scoring/eventTypes';
import {
  enqueue,
  pendingEvents,
  pendingCount,
  markSynced,
  markRejected,
  recordAttempt,
  backoffMs,
  requestPersistentStorage,
  QueuedEvent,
} from './eventQueue';
import { resolveTarget, ResolvedTarget, rememberGatewayUrl, getSavedGatewayUrl } from './targetResolver';
import { sendEvents } from './syncClient';

export interface SyncState {
  mode: SyncMode;
  targetLabel: string;
  pending: number;
  syncing: boolean;
  lastError: string | null;
  /** Set when the server reconciled a late/offline batch. */
  reconciled: boolean;
}

export interface UseSyncQueueResult extends SyncState {
  /** Queue a score event. Returns once it is durably stored. */
  queue: (event: ScoreEvent) => Promise<void>;
  /** Attempt an immediate drain. */
  flush: () => Promise<void>;
  /** Re-resolve the target (e.g. after the user enters a gateway URL). */
  refreshTarget: () => Promise<void>;
  gatewayUrl: string | null;
  setGatewayUrl: (url: string) => void;
  /** Called when the server reports a match version mismatch. */
  lastVersions: Record<string, number>;
}

const DRAIN_DEBOUNCE_MS = 250;

export function useSyncQueue(token: string | null): UseSyncQueueResult {
  const [target, setTarget] = useState<ResolvedTarget>({ kind: 'none', baseUrl: '', label: 'Checking…' });
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [reconciled, setReconciled] = useState(false);
  const [lastVersions, setLastVersions] = useState<Record<string, number>>({});
  const [gatewayUrl, setGatewayUrlState] = useState<string | null>(() => getSavedGatewayUrl());

  const drainingRef = useRef(false);
  const tokenRef = useRef(token);
  const targetRef = useRef(target);
  const drainTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);

  tokenRef.current = token;
  targetRef.current = target;

  /** Refresh the pending count from IndexedDB. */
  const refreshCount = useCallback(async () => {
    try {
      setPending(await pendingCount());
    } catch {
      // IndexedDB may be unavailable in private mode; degrade gracefully.
    }
  }, []);

  const refreshTarget = useCallback(async () => {
    const resolved = await resolveTarget();
    setTarget(resolved);
    targetRef.current = resolved;
  }, []);

  /**
   * Drain pending events. Sends in the order they were created, per match, so
   * the authority's deterministic engine sees the intended sequence.
   */
  const flush = useCallback(async () => {
    if (drainingRef.current) return;
    const activeToken = tokenRef.current;
    const activeTarget = targetRef.current;

    if (!activeToken) return;
    if (activeTarget.kind === 'none') {
      await refreshTarget();
      if (targetRef.current.kind === 'none') {
        await refreshCount();
        return;
      }
    }

    drainingRef.current = true;
    setSyncing(true);
    try {
      const queued = await pendingEvents();
      if (queued.length === 0) {
        await refreshCount();
        return;
      }

      // Send one at a time so a failure stops the run and preserves order.
      for (const record of queued) {
        if (stoppedRef.current) break;

        // Respect backoff for events that have already failed.
        if (record.attempts > 0 && record.lastAttemptAt) {
          const wait = backoffMs(record.attempts) - (Date.now() - record.lastAttemptAt);
          if (wait > 0) break; // try again later
        }

        const result = await sendEvents(targetRef.current, activeToken, [record]);

        if (!result.ok) {
          if (result.networkError || result.status === 0) {
            // Transport failure: keep the event queued and stop draining.
            await recordAttempt(record.eventId, result.error);
            setLastError(result.error || 'Network unavailable');
            // If the gateway vanished, fall back to direct Internet.
            if (targetRef.current.kind === 'gateway') {
              await refreshTarget();
            }
            break;
          }
          // Non-network failure: likely auth or validation. Record and continue.
          await recordAttempt(record.eventId, result.error);
          setLastError(result.error || 'Event rejected');
          continue;
        }

        const outcome = result.results?.[0];
        if (outcome) {
          setLastVersions((prev) => ({
            ...prev,
            [outcome.eventId]: outcome.matchVersion ?? 0,
          }));
        }

        if (outcome && outcome.accepted === false) {
          // Server definitively refused (e.g. completed match). Do not retry.
          await markRejected(record.eventId, outcome.error || 'Rejected');
        } else {
          await markSynced(record.eventId);
        }
      }

      const remaining = await pendingEvents();
      setPending(remaining.length);
      setLastError(remaining.length === 0 ? null : lastError);
    } catch (error) {
      setLastError((error as any)?.message || 'Sync error');
    } finally {
      drainingRef.current = false;
      setSyncing(false);
      await refreshCount();
    }
  }, [lastError, refreshCount, refreshTarget]);

  /** Schedule a drain shortly after the last enqueue (batches rapid taps). */
  const scheduleDrain = useCallback(() => {
    if (drainTimerRef.current) window.clearTimeout(drainTimerRef.current);
    drainTimerRef.current = window.setTimeout(() => {
      void flush();
    }, DRAIN_DEBOUNCE_MS);
  }, [flush]);

  /** Durably store an event, then try to sync it. */
  const queue = useCallback(
    async (event: ScoreEvent) => {
      await enqueue(event);
      await refreshCount();
      scheduleDrain();
    },
    [refreshCount, scheduleDrain]
  );

  const setGatewayUrl = useCallback(
    (url: string) => {
      rememberGatewayUrl(url);
      setGatewayUrlState(url.trim() || null);
      void refreshTarget().then(() => flush());
    },
    [flush, refreshTarget]
  );

  // Initial setup: resolve target, ask for durable storage, load count, drain.
  useEffect(() => {
    stoppedRef.current = false;
    void (async () => {
      await requestPersistentStorage();
      await refreshTarget();
      await refreshCount();
      void flush();
    })();
    return () => {
      stoppedRef.current = true;
      if (drainTimerRef.current) window.clearTimeout(drainTimerRef.current);
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-drain whenever the token becomes available (e.g. after sign-in).
  useEffect(() => {
    if (token) scheduleDrain();
  }, [token, scheduleDrain]);

  // Recover automatically when connectivity returns or the tab is refocused.
  useEffect(() => {
    const onOnline = () => {
      void refreshTarget().then(() => flush());
    };
    const onOffline = () => {
      setTarget({ kind: 'none', baseUrl: '', label: 'Offline' });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshTarget().then(() => {
          void refreshCount();
          void flush();
        });
      }
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);

    // Periodic retry while anything is pending (gentle: 15s).
    const interval = window.setInterval(() => {
      void (async () => {
        const count = await pendingCount();
        if (count > 0) {
          await refreshTarget();
          void flush();
        }
      })();
    }, 15000);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(interval);
    };
  }, [flush, refreshCount, refreshTarget]);

  const mode: SyncMode = useMemo(() => {
    if (target.kind === 'none') return 'offline';
    return target.kind === 'gateway' ? 'online-local' : 'online-direct';
  }, [target.kind]);

  return {
    mode,
    targetLabel: target.label,
    pending,
    syncing,
    lastError,
    reconciled,
    queue,
    flush,
    refreshTarget,
    gatewayUrl,
    setGatewayUrl,
    lastVersions,
  };
}
