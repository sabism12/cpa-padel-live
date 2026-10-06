/**
 * Transport for score events.
 *
 * Posts one event to the server and classifies the outcome so the sender knows
 * whether to move on, retry, ask for sign-in, or drop the event. The caller
 * supplies the auth token; the transport never reads or stores credentials.
 */

import { ScoreEvent, ScoreEventResult } from '../scoring/eventTypes';

const REQUEST_TIMEOUT_MS = 10000;

export type PostOutcome =
  /** The server applied the event (or had already applied it). */
  | { kind: 'accepted'; result: ScoreEventResult }
  /** The server refused the event for good (e.g. match already completed). */
  | { kind: 'rejected'; error: string }
  /** The sign-in token is missing or expired. */
  | { kind: 'auth'; error: string }
  /** Transient problem (Wi-Fi blip, timeout, server busy): safe to resend. */
  | { kind: 'retry'; error: string };

export async function postScoreEvent(token: string, event: ScoreEvent): Promise<PostOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch('/api/sync/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ events: [event] }),
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch {
    return { kind: 'retry', error: 'No connection — retrying…' };
  } finally {
    clearTimeout(timer);
  }

  // Parse defensively: a proxy/HTML error page must not crash the sender.
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // handled below
  }

  if (res.status === 401 || res.status === 403) {
    return { kind: 'auth', error: data?.error || 'Sign-in expired. Sign in again to send scores.' };
  }
  // Resending is always safe: the eventId makes the server ignore duplicates.
  if (res.status >= 500 || res.status === 429 || !data) {
    return { kind: 'retry', error: data?.error || `Server busy (HTTP ${res.status}) — retrying…` };
  }
  if (!res.ok) {
    return { kind: 'rejected', error: data.error || `Score not accepted (HTTP ${res.status}).` };
  }

  const result: ScoreEventResult = data.results?.[0] ?? {
    eventId: event.eventId,
    accepted: true,
    duplicate: false,
  };
  if (result.accepted === false) {
    return { kind: 'rejected', error: result.error || 'Score not accepted.' };
  }
  return { kind: 'accepted', result };
}
