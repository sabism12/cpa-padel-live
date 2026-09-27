/**
 * Resolves where a scorekeeper phone should send score events.
 *
 * Priority:
 *   1. A reachable Dell gateway on the local network (fast, works without
 *      Internet).
 *   2. Direct Render over the phone's own Internet connection.
 *   3. Offline — events keep queueing locally.
 *
 * The scorekeeper never chooses a mode; the UI only reports it.
 */

import { SyncHelloResponse } from '../scoring/eventTypes';

export type TargetKind = 'gateway' | 'server' | 'none';

export interface ResolvedTarget {
  kind: TargetKind;
  /** Absolute base URL, or '' when relative to the current origin. */
  baseUrl: string;
  /** Human label for the status UI. */
  label: string;
}

const GATEWAY_OVERRIDE_KEY = 'cpa_gateway_url';
const GATEWAY_CACHE_KEY = 'cpa_gateway_resolved';
const PROBE_TIMEOUT_MS = 1200;

/**
 * Candidate gateway addresses. Windows Mobile Hotspot normally uses
 * 192.168.137.1, but that is NOT guaranteed, so we probe several common
 * addresses plus any build-time hint and any manually saved URL.
 */
function candidateGateways(): string[] {
  const candidates: string[] = [];

  try {
    const saved = localStorage.getItem(GATEWAY_OVERRIDE_KEY);
    if (saved) candidates.push(saved.replace(/\/+$/, ''));
    const cached = localStorage.getItem(GATEWAY_CACHE_KEY);
    if (cached) candidates.push(cached.replace(/\/+$/, ''));
  } catch {
    // storage unavailable
  }

  const hint = (import.meta as any)?.env?.VITE_LOCAL_GATEWAY_URL as string | undefined;
  if (hint) candidates.push(hint.replace(/\/+$/, ''));

  // Common Windows ICS / hotspot gateway addresses.
  const common = [
    'http://192.168.137.1:3000',
    'http://192.168.137.1:3000/',
    'http://192.168.0.1:3000',
    'http://192.168.1.1:3000',
    'http://10.0.0.1:3000',
  ];
  // De-duplicate while preserving order.
  for (const url of common) {
    const clean = url.replace(/\/+$/, '');
    if (!candidates.includes(clean)) candidates.push(clean);
  }
  return candidates;
}

export function rememberGatewayUrl(url: string): void {
  try {
    const clean = url.trim().replace(/\/+$/, '');
    if (clean) localStorage.setItem(GATEWAY_OVERRIDE_KEY, clean);
    else localStorage.removeItem(GATEWAY_OVERRIDE_KEY);
  } catch {
    // ignore
  }
}

export function getSavedGatewayUrl(): string | null {
  try {
    return localStorage.getItem(GATEWAY_OVERRIDE_KEY);
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

/** Probe one candidate; returns the gateway URL if it really is a gateway. */
async function probe(url: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(`${url}/api/sync/hello`, PROBE_TIMEOUT_MS);
    if (!res.ok) return null;
    const hello = (await res.json()) as SyncHelloResponse;
    if (hello.role !== 'gateway') return null;
    try {
      localStorage.setItem(GATEWAY_CACHE_KEY, url);
    } catch {
      // ignore
    }
    return url;
  } catch {
    return null;
  }
}

/**
 * Resolve a target. `forceOnline` lets a caller re-check after a reconnect.
 */
export async function resolveTarget(): Promise<ResolvedTarget> {
  const candidates = candidateGateways();
  for (const candidate of candidates) {
    const ok = await probe(candidate);
    if (ok) return { kind: 'gateway', baseUrl: ok, label: 'Local Dell' };
  }

  // No gateway: fall back to same-origin (Render) when we have Internet.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { kind: 'none', baseUrl: '', label: 'Offline' };
  }
  return { kind: 'server', baseUrl: '', label: 'Direct Internet' };
}

/** Build the sync endpoints relative to a resolved target. */
export function syncUrls(target: ResolvedTarget) {
  const base = target.baseUrl;
  return {
    events: `${base}/api/sync/events`,
    state: `${base}/api/sync/state`,
    hello: `${base}/api/sync/hello`,
  };
}

/** True when a fetch failure looks like a network/transport problem. */
export function isNetworkError(error: unknown): boolean {
  if (!error) return false;
  const message = String((error as any)?.message || error).toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    (error as any)?.name === 'TypeError'
  );
}
