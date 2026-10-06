/**
 * Sends scorekeeper events to the server, one at a time and in order.
 *
 * The venue has full Wi-Fi, so events are kept in memory only: no offline
 * storage and no local gateway. Each event carries a client-generated
 * `eventId`, so resending after a Wi-Fi blip can never double-count a point.
 *
 * The queue lives at module level (not in a component) so switching between
 * the Scorekeeper and Admin views never drops points that are still sending.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { ScoreEvent, ScoreEventResult } from '../scoring/eventTypes';
import { postScoreEvent } from './syncClient';

export type SenderStatus = 'idle' | 'sending' | 'retrying' | 'auth';

export interface AckedVersion {
  /** Match version the server reported after applying our latest event. */
  version: number;
  /** When it was reported (epoch ms). */
  at: number;
}

export interface SenderSnapshot {
  status: SenderStatus;
  /** Events not yet confirmed by the server. */
  pending: number;
  pendingByMatch: Record<string, number>;
  ackedByMatch: Record<string, AckedVersion>;
  lastError: string | null;
  /** Increments whenever the server refuses an event (so views can resync). */
  rejectedTick: number;
}

interface QueueItem {
  event: ScoreEvent;
  resolve: (result: ScoreEventResult) => void;
  reject: (error: Error) => void;
  attempts: number;
}

const RETRY_MS = [1000, 2000, 4000, 5000];

let queue: QueueItem[] = [];
let token: string | null = null;
let draining = false;
let retryTimer: number | null = null;
const ackedByMatch: Record<string, AckedVersion> = {};
const listeners = new Set<() => void>();

let snapshot: SenderSnapshot = {
  status: 'idle',
  pending: 0,
  pendingByMatch: {},
  ackedByMatch: {},
  lastError: null,
  rejectedTick: 0,
};

function publish(patch: Partial<SenderSnapshot> = {}) {
  const pendingByMatch: Record<string, number> = {};
  for (const item of queue) {
    pendingByMatch[item.event.matchId] = (pendingByMatch[item.event.matchId] ?? 0) + 1;
  }
  snapshot = {
    ...snapshot,
    ...patch,
    pending: queue.length,
    pendingByMatch,
    ackedByMatch: { ...ackedByMatch },
  };
  listeners.forEach((listener) => listener());
}

async function drain(): Promise<void> {
  if (draining) return;
  if (retryTimer !== null) {
    window.clearTimeout(retryTimer);
    retryTimer = null;
  }

  draining = true;
  try {
    while (queue.length > 0) {
      if (!token) {
        publish({ status: 'auth', lastError: 'Sign in to send scores.' });
        return;
      }

      const item = queue[0];
      publish({ status: item.attempts > 0 ? 'retrying' : 'sending' });
      const outcome = await postScoreEvent(token, item.event);

      if (outcome.kind === 'accepted') {
        queue.shift();
        if (typeof outcome.result.matchVersion === 'number') {
          ackedByMatch[item.event.matchId] = { version: outcome.result.matchVersion, at: Date.now() };
        }
        item.resolve(outcome.result);
        publish({ lastError: null });
        continue;
      }

      if (outcome.kind === 'auth') {
        // Keep everything queued; it sends as soon as a new token arrives.
        publish({ status: 'auth', lastError: outcome.error });
        return;
      }

      if (outcome.kind === 'rejected') {
        // Later events for the same match were based on the refused one, so
        // drop them too and let the view reload the match from the server.
        const matchId = item.event.matchId;
        const dropped = queue.filter((q) => q.event.matchId === matchId);
        queue = queue.filter((q) => q.event.matchId !== matchId);
        delete ackedByMatch[matchId];
        item.reject(new Error(outcome.error));
        for (const other of dropped) {
          if (other !== item) other.reject(new Error('Skipped because an earlier score was not accepted.'));
        }
        publish({ lastError: outcome.error, rejectedTick: snapshot.rejectedTick + 1 });
        continue;
      }

      // Transient failure: wait, then try the same event again.
      item.attempts += 1;
      const wait = RETRY_MS[Math.min(item.attempts - 1, RETRY_MS.length - 1)];
      publish({ status: 'retrying', lastError: outcome.error });
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        void drain();
      }, wait);
      return;
    }

    publish({ status: 'idle' });
  } finally {
    draining = false;
  }
}

/** Queue an event. Resolves once the server accepts it; rejects if refused. */
export function sendScoreEvent(event: ScoreEvent): Promise<ScoreEventResult> {
  return new Promise((resolve, reject) => {
    queue.push({ event, resolve, reject, attempts: 0 });
    publish();
    void drain();
  });
}

/** Retry immediately instead of waiting for the next backoff step. */
export function retryScoreEventsNow(): void {
  void drain();
}

function setSenderToken(next: string | null) {
  if (next === token) return;
  token = next;
  if (token && queue.length > 0) void drain();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return snapshot;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void drain());
  // Points still sending would be lost on refresh/close, so ask first.
  window.addEventListener('beforeunload', (e) => {
    if (queue.length > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

/** Subscribe a component to the sender and give it the current auth token. */
export function useScoreSender(authToken: string | null): SenderSnapshot {
  useEffect(() => {
    setSenderToken(authToken);
  }, [authToken]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
