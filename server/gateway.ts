/**
 * Dell gateway mode (Option B).
 *
 * The gateway is the SAME server codebase running in a low-privilege relay
 * role on the Dell. It:
 *   - serves the scorekeeper UI and accepts score events on the LAN
 *   - applies them locally so scoring works with no Internet
 *   - relays accepted events upstream to Render with a dedicated relay token
 *   - queues upstream failures locally and retries automatically
 *
 * It never holds SESSION_SECRET, SUPABASE_SERVICE_ROLE_KEY, or an admin
 * password. Its only credential is GATEWAY_RELAY_SECRET (its own relay key) and
 * the bootstrap secret used once to exchange for a relay token.
 *
 * The upstream token is kept in memory only and never exposed to a browser.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ScoreEvent } from '../src/scoring/eventTypes';

interface OutboxRecord {
  eventId: string;
  event: ScoreEvent;
  attempts: number;
  lastAttemptAt?: number;
  lastError?: string;
  createdAt: number;
}

export interface GatewayStatus {
  enabled: boolean;
  upstreamUrl: string | null;
  /** null = the upstream has not been probed yet (never reported as a failure). */
  upstreamReachable: boolean | null;
  /** null = no handshake attempted yet. */
  relayTokenValid: boolean | null;
  pendingUpstream: number;
  lastUpstreamError: string | null;
  lastUpstreamAt: string | null;
  /** Last time the gateway actually attempted the upstream handshake. */
  lastHandshakeAttemptAt: string | null;
}

const OUTBOX_FILE = path.resolve(
  process.env.GATEWAY_OUTBOX_FILE ||
    path.join(process.env.DATA_DIR || path.join(process.cwd(), 'data'), 'gateway_outbox.json')
);

const RETRY_INTERVAL_MS = Number.parseInt(process.env.GATEWAY_RETRY_MS || '10000', 10);
const UPSTREAM_TIMEOUT_MS = Number.parseInt(process.env.GATEWAY_UPSTREAM_TIMEOUT_MS || '8000', 10);

class GatewayRelay {
  private outbox: OutboxRecord[] = [];
  private relayToken: string | null = null;
  private tokenFetchedAt = 0;
  private timer: NodeJS.Timeout | null = null;
  private draining = false;

  status: GatewayStatus = {
    enabled: false,
    upstreamUrl: null,
    // null until a handshake/probe is actually attempted.
    upstreamReachable: null,
    relayTokenValid: null,
    pendingUpstream: 0,
    lastUpstreamError: null,
    lastUpstreamAt: null,
    lastHandshakeAttemptAt: null,
  };

  get upstreamUrl(): string | null {
    const raw = process.env.UPSTREAM_URL?.trim();
    return raw ? raw.replace(/\/+$/, '') : null;
  }

  /** Load any events that were queued while the Dell had no Internet. */
  start(): void {
    this.status.enabled = true;
    this.status.upstreamUrl = this.upstreamUrl;
    this.loadOutbox();

    if (!this.upstreamUrl) {
      console.warn('[gateway] UPSTREAM_URL is not set; running local-only (no upstream relay).');
      return;
    }
    if (!process.env.GATEWAY_RELAY_SECRET || !process.env.GATEWAY_BOOTSTRAP_SECRET) {
      console.warn('[gateway] GATEWAY_RELAY_SECRET / GATEWAY_BOOTSTRAP_SECRET missing; local-only mode.');
      return;
    }

    // Periodic upstream sync; also kicked after each accepted batch.
    this.timer = setInterval(() => void this.drainUpstream(), RETRY_INTERVAL_MS);
    // Don't hold the event loop open purely for retries.
    this.timer.unref?.();

    // Probe the upstream immediately so the status endpoint reports a real
    // handshake result instead of a misleading "not checked" value.
    void this.drainUpstream();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private loadOutbox(): void {
    try {
      if (!fs.existsSync(OUTBOX_FILE)) return;
      const parsed = JSON.parse(fs.readFileSync(OUTBOX_FILE, 'utf-8'));
      if (Array.isArray(parsed)) {
        this.outbox = parsed.filter((r) => r && r.eventId && r.event);
      }
    } catch (error) {
      console.warn('[gateway] Could not read outbox; starting empty.', (error as any)?.message);
      this.outbox = [];
    }
    this.status.pendingUpstream = this.outbox.length;
  }

  private persistOutbox(): void {
    try {
      fs.mkdirSync(path.dirname(OUTBOX_FILE), { recursive: true });
      const temporary = `${OUTBOX_FILE}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify(this.outbox, null, 2), { encoding: 'utf-8', mode: 0o600 });
      fs.renameSync(temporary, OUTBOX_FILE);
    } catch (error) {
      console.error('[gateway] Failed to persist outbox.', (error as any)?.message);
    }
    this.status.pendingUpstream = this.outbox.length;
  }

  /** Queue an accepted event for upstream relay (deduped by eventId). */
  enqueue(event: ScoreEvent): void {
    if (!this.upstreamUrl) return;
    if (this.outbox.some((r) => r.eventId === event.eventId)) return;
    this.outbox.push({ eventId: event.eventId, event, attempts: 0, createdAt: Date.now() });
    this.persistOutbox();
    void this.drainUpstream();
  }

  /** Exchange the bootstrap secret for a short-lived relay token. */
  private async ensureRelayToken(): Promise<string | null> {
    const fresh = this.relayToken && Date.now() - this.tokenFetchedAt < 11 * 60 * 60 * 1000;
    if (fresh) return this.relayToken;

    const upstream = this.upstreamUrl;
    const bootstrap = process.env.GATEWAY_BOOTSTRAP_SECRET;
    if (!upstream || !bootstrap) return null;

    try {
      const res = await this.fetchWithTimeout(`${upstream}/api/gateway/relay-token`, {
        method: 'POST',
        headers: { 'x-gateway-bootstrap': bootstrap },
      }, UPSTREAM_TIMEOUT_MS);

      if (!res.ok) {
        this.status.relayTokenValid = false;
        this.status.lastUpstreamError = `Relay token request failed (HTTP ${res.status}).`;
        return null;
      }
      const data = await res.json();
      if (typeof data?.token !== 'string') return null;
      this.relayToken = data.token;
      this.tokenFetchedAt = Date.now();
      this.status.relayTokenValid = true;
      return this.relayToken;
    } catch (error) {
      this.status.relayTokenValid = false;
      this.status.lastUpstreamError = this.describeError(error);
      return null;
    }
  }

  /** Push queued events upstream, oldest first, stopping on transport failure. */
  async drainUpstream(): Promise<void> {
    if (this.draining) return;
    const upstream = this.upstreamUrl;
    if (!upstream) return;

    this.draining = true;
    try {
      // Authenticate with the upstream FIRST, even when there is nothing to
      // send. This proves reachability and surfaces handshake failures (missing
      // relay route, bad bootstrap secret) in the status endpoint immediately.
      this.status.lastHandshakeAttemptAt = new Date().toISOString();
      const token = await this.ensureRelayToken();
      if (!token) return;

      // Handshake succeeded: the upstream is reachable even when the outbox is
      // empty. (ensureRelayToken sets relayTokenValid=true on success.)
      this.status.upstreamReachable = true;
      this.status.lastUpstreamError = null;

      while (this.outbox.length > 0) {
        const record = this.outbox[0];

        const res = await this.fetchWithTimeout(`${upstream}/api/sync/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ events: [record.event] }),
        }, UPSTREAM_TIMEOUT_MS);

        if (!res.ok) {
          record.attempts += 1;
          record.lastAttemptAt = Date.now();
          record.lastError = `HTTP ${res.status}`;
          this.status.upstreamReachable = false;
          this.status.lastUpstreamError = `Upstream rejected batch (HTTP ${res.status}).`;
          if (res.status === 401 || res.status === 403) {
            // Token may have expired; force a refresh on the next attempt.
            this.relayToken = null;
          }
          this.persistOutbox();
          return;
        }

        // Accepted (new or duplicate — either way the upstream now has it).
        this.outbox.shift();
        this.persistOutbox();
        this.status.upstreamReachable = true;
        this.status.lastUpstreamError = null;
        this.status.lastUpstreamAt = new Date().toISOString();
      }
    } catch (error) {
      this.status.upstreamReachable = false;
      this.status.lastUpstreamError = this.describeError(error);
    } finally {
      this.draining = false;
    }
  }

  /** Redacted error description: never includes tokens or headers. */
  private describeError(error: unknown): string {
    const e: any = error;
    const parts: string[] = [];
    if (e?.name) parts.push(String(e.name));
    if (e?.code) parts.push(`(${String(e.code)})`);
    const cause = e?.cause;
    if (cause?.code) parts.push(`cause:${String(cause.code)}`);
    else if (cause?.name) parts.push(`cause:${String(cause.name)}`);
    parts.push(String(e?.message || error).slice(0, 200));
    return parts.join(' ');
  }

  private async fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
    } finally {
      clearTimeout(timer);
    }
  }

  /** Safe, secret-free status for a local diagnostics endpoint. */
  getStatus(): GatewayStatus {
    return { ...this.status, pendingUpstream: this.outbox.length };
  }
}

export const gatewayRelay = new GatewayRelay();
