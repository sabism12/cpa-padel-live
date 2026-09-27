/**
 * Durable browser-side score event queue (IndexedDB).
 *
 * A score event is written here BEFORE any network attempt, so a queued score
 * survives refresh, tab close, and Chrome restart. Each event has a stable
 * client-generated `eventId` (idempotency key) that is reused on every retry,
 * so multi-path delivery can never double-apply a point.
 */

import { ScoreEvent } from '../scoring/eventTypes';

const DB_NAME = 'cpa_padel_sync';
const DB_VERSION = 1;
const STORE = 'score_events';

export type QueueStatus = 'pending' | 'sending' | 'synced' | 'rejected';

export interface QueuedEvent {
  eventId: string;
  /** Serialized ScoreEvent payload. */
  event: ScoreEvent;
  status: QueueStatus;
  attempts: number;
  /** Epoch ms of the last send attempt, for backoff. */
  lastAttemptAt?: number;
  lastError?: string;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'eventId' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('matchId', 'event.matchId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = fn(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      })
  );
}

/** Persist a new event. Idempotent: an existing eventId is left untouched. */
export async function enqueue(event: ScoreEvent): Promise<QueuedEvent> {
  const existing = await getEvent(event.eventId);
  if (existing) return existing;

  const record: QueuedEvent = {
    eventId: event.eventId,
    event,
    status: 'pending',
    attempts: 0,
    createdAt: Date.now(),
  };
  await tx('readwrite', (store) => store.add(record));
  return record;
}

export function getEvent(eventId: string): Promise<QueuedEvent | undefined> {
  return tx<QueuedEvent | undefined>('readonly', (store) => store.get(eventId));
}

export function allEvents(): Promise<QueuedEvent[]> {
  return tx<QueuedEvent[]>('readonly', (store) => store.getAll());
}

export async function pendingEvents(): Promise<QueuedEvent[]> {
  const events = await allEvents();
  return events
    .filter((e) => e.status === 'pending' || e.status === 'sending')
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function pendingCount(): Promise<number> {
  return (await pendingEvents()).length;
}

export async function updateEvent(record: QueuedEvent): Promise<void> {
  await tx('readwrite', (store) => store.put(record));
}

export async function markSynced(eventId: string): Promise<void> {
  const record = await getEvent(eventId);
  if (!record) return;
  record.status = 'synced';
  await updateEvent(record);
}

export async function markRejected(eventId: string, error: string): Promise<void> {
  const record = await getEvent(eventId);
  if (!record) return;
  record.status = 'rejected';
  record.lastError = error;
  await updateEvent(record);
}

export async function recordAttempt(eventId: string, error?: string): Promise<QueuedEvent | undefined> {
  const record = await getEvent(eventId);
  if (!record) return undefined;
  record.attempts += 1;
  record.lastAttemptAt = Date.now();
  record.status = 'pending';
  if (error) record.lastError = error;
  await updateEvent(record);
  return record;
}

/** Remove events for a match that have already synced (keeps the store small). */
export async function pruneSynced(matchId?: string): Promise<void> {
  const events = await allEvents();
  const stale = events.filter(
    (e) => e.status === 'synced' && (!matchId || e.event.matchId === matchId)
  );
  for (const record of stale) {
    await tx('readwrite', (store) => store.delete(record.eventId));
  }
}

/**
 * Backoff schedule for a record that has failed `attempts` times.
 * Capped so a scorekeeper never waits excessively long when the signal returns.
 */
export function backoffMs(attempts: number): number {
  if (attempts <= 0) return 0;
  const schedule = [1000, 2500, 5000, 10000, 20000, 30000];
  return schedule[Math.min(attempts - 1, schedule.length - 1)];
}

/** Ask the browser to keep our storage durable (best-effort). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    // not supported or denied
  }
  return false;
}
