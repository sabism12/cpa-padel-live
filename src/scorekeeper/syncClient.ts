/**
 * Transport for score events.
 *
 * Sends queued events to whichever target the resolver chose (Dell gateway or
 * Render). The caller supplies the auth token; the transport never reads or
 * stores credentials itself.
 */

import { ScoreEvent, SyncBatchResponse, ScoreEventResult } from '../scoring/eventTypes';
import { QueuedEvent } from './eventQueue';
import { ResolvedTarget, syncUrls, isNetworkError } from './targetResolver';

export interface SendResult {
  ok: boolean;
  /** Per-event outcomes when the server responded. */
  results?: ScoreEventResult[];
  /** True when the failure was transport-level (retry) not rejection. */
  networkError?: boolean;
  error?: string;
  status?: number;
}

export async function sendEvents(
  target: ResolvedTarget,
  token: string,
  records: QueuedEvent[]
): Promise<SendResult> {
  if (records.length === 0) return { ok: true, results: [] };

  const urls = syncUrls(target);
  const events: ScoreEvent[] = records.map((r) => r.event);

  try {
    const res = await fetch(urls.events, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ events }),
      cache: 'no-store',
    });

    // Parse defensively: a proxy/HTML error page must not crash the queue.
    let data: SyncBatchResponse & { error?: string };
    try {
      data = await res.json();
    } catch {
      return { ok: false, networkError: true, error: `Unreadable response (HTTP ${res.status})`, status: res.status };
    }

    if (!res.ok) {
      return {
        ok: false,
        error: data?.error || `Sync failed (HTTP ${res.status})`,
        status: res.status,
        results: data?.results,
      };
    }

    return { ok: true, results: data.results, status: res.status };
  } catch (error) {
    return {
      ok: false,
      networkError: isNetworkError(error),
      error: (error as any)?.message || 'Network error',
    };
  }
}
