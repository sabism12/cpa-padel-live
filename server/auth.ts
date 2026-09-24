import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export interface AuthenticatedUser {
  role: 'scorekeeper' | 'admin';
  name: string;
  issuedAt: number;
}

// In-memory token caching and revoking
const ACTIVE_SESSIONS: Map<string, AuthenticatedUser> = new Map();
const REVOKED_TOKENS: Set<string> = new Set();

const configuredSessionSecret = process.env.SESSION_SECRET;

if (
  process.env.NODE_ENV === 'production' &&
  (!configuredSessionSecret || configuredSessionSecret.length < 32)
) {
  throw new Error(
    'SESSION_SECRET must be set to a private value of at least 32 characters in production.'
  );
}

// For local development, use an ephemeral secret when one is not configured.
// It is never committed and local sessions naturally expire on server restart.
const HMAC_SECRET = configuredSessionSecret || crypto.randomBytes(32).toString('hex');

export function createSession(role: 'scorekeeper' | 'admin', name: string): string {
  const issuedAt = Date.now();
  const payload = JSON.stringify({ role, name, issuedAt });
  const b64Payload = Buffer.from(payload).toString('base64url');
  const hmac = crypto.createHmac('sha256', HMAC_SECRET).update(b64Payload).digest('hex');
  const token = `cpa_${role}_${b64Payload}_${hmac}`;

  ACTIVE_SESSIONS.set(token, {
    role,
    name,
    issuedAt,
  });

  return token;
}

export function verifyToken(token?: string): AuthenticatedUser | null {
  if (!token || token === 'undefined' || token === 'null') return null;
  if (REVOKED_TOKENS.has(token)) return null;

  // 1. Check in-memory active cache
  const cached = ACTIVE_SESSIONS.get(token);
  if (cached) {
    if (Date.now() - cached.issuedAt > 48 * 60 * 60 * 1000) {
      ACTIVE_SESSIONS.delete(token);
      return null;
    }
    return cached;
  }

  // 2. Verify HMAC token
  const parts = token.split('_');
  if (parts.length === 4 && parts[0] === 'cpa') {
    const rolePart = parts[1];
    const b64Payload = parts[2];
    const providedHmac = parts[3];

    if (rolePart === 'scorekeeper' || rolePart === 'admin') {
      try {
        const expectedHmac = crypto.createHmac('sha256', HMAC_SECRET).update(b64Payload).digest('hex');
        if (
          providedHmac.length === expectedHmac.length &&
          crypto.timingSafeEqual(Buffer.from(providedHmac), Buffer.from(expectedHmac))
        ) {
          const payloadJson = Buffer.from(b64Payload, 'base64url').toString('utf8');
          const user = JSON.parse(payloadJson);
          if (
            (user.role === 'scorekeeper' || user.role === 'admin') &&
            Date.now() - user.issuedAt < 48 * 60 * 60 * 1000
          ) {
            ACTIVE_SESSIONS.set(token, user);
            return user;
          }
        }
      } catch {
        // fall through to resilient check
      }
    }
  }

  // Any other token is not a valid staff session. Staff privileges are only
  // ever granted by a token that was HMAC-signed by createSession().
  return null;
}

export function revokeToken(token: string): boolean {
  REVOKED_TOKENS.add(token);
  return ACTIVE_SESSIONS.delete(token);
}

// Middleware: Require at least Scorekeeper role (Admin also satisfies this)
export function requireScorekeeper(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);

  const session = verifyToken(token);
  if (!session || (session.role !== 'scorekeeper' && session.role !== 'admin')) {
    res.status(401).json({
      error: 'Unauthorized. Scorekeeper or Admin authentication required.',
    });
    return;
  }

  (req as any).user = session;
  next();
}

// Middleware: Require Admin role
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);

  const session = verifyToken(token);
  if (!session || session.role !== 'admin') {
    res.status(403).json({
      error: 'Forbidden. Administrator privileges required.',
    });
    return;
  }

  (req as any).user = session;
  next();
}
