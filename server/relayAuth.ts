/**
 * Dedicated low-privilege relay authentication for the Dell gateway (Option B).
 *
 * The gateway authenticates with its OWN secret (`GATEWAY_RELAY_SECRET`), which
 * is completely independent of SESSION_SECRET, the admin password, the
 * scorekeeper PIN, and every Supabase key. A relay credential can ONLY submit
 * score events; it cannot read admin data, change settings, run the draw, or
 * authenticate as admin/scorekeeper.
 *
 * The relay secret lives only in the server process and in the gateway's local
 * environment. It is never sent to a browser and never included in any API
 * response.
 */
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

export interface RelayIdentity {
  role: 'relay';
  /** Human name for logs, e.g. "Dell Gateway". */
  name: string;
}

const RELAY_NAME = process.env.GATEWAY_RELAY_NAME || 'Dell Gateway';

function relaySecret(): string | null {
  const secret = process.env.GATEWAY_RELAY_SECRET;
  return secret && secret.length > 0 ? secret : null;
}

/**
 * Tokens are `cpa_relay_<base64url({issuedAt})>_<hmac>`.
 * We sign with the relay secret only, so a leaked relay token cannot be used to
 * forge scorekeeper or admin sessions (different key entirely).
 */
export function createRelayToken(): string {
  const secret = relaySecret();
  if (!secret) throw new Error('GATEWAY_RELAY_SECRET is not configured on this server.');

  const issuedAt = Date.now();
  const b64Payload = Buffer.from(JSON.stringify({ role: 'relay', name: RELAY_NAME, issuedAt })).toString('base64url');
  const hmac = crypto.createHmac('sha256', secret).update(b64Payload).digest('hex');
  return `cpa_relay_${b64Payload}_${hmac}`;
}

export function verifyRelayToken(token?: string): RelayIdentity | null {
  const secret = relaySecret();
  if (!secret || !token) return null;

  const parts = token.split('_');
  // cpa_relay_<payload>_<hmac>  ->  ['cpa','relay','<payload>','<hmac>']
  if (parts.length !== 4 || parts[0] !== 'cpa' || parts[1] !== 'relay') return null;

  const b64Payload = parts[2];
  const providedHmac = parts[3];
  const expectedHmac = crypto.createHmac('sha256', secret).update(b64Payload).digest('hex');

  if (providedHmac.length !== expectedHmac.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(providedHmac), Buffer.from(expectedHmac))) return null;
    const payload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf8'));
    if (payload?.role !== 'relay') return null;
    // Relay tokens are intentionally short-lived and renewed by the gateway.
    if (typeof payload.issuedAt !== 'number' || Date.now() - payload.issuedAt > 12 * 60 * 60 * 1000) return null;
    return { role: 'relay', name: String(payload.name || RELAY_NAME) };
  } catch {
    return null;
  }
}

/**
 * Middleware: allow ONLY a valid relay credential. Deliberately does not accept
 * admin or scorekeeper tokens, so a relay route can never be driven by a
 * higher-privilege session (and vice versa: relay tokens fail requireAdmin).
 */
export function requireRelay(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;
  const relay = verifyRelayToken(token);

  if (!relay) {
    res.status(401).json({ error: 'Unauthorized. Gateway relay credential required.' });
    return;
  }

  (req as any).relay = relay;
  next();
}

export function isRelayConfigured(): boolean {
  return relaySecret() !== null;
}
