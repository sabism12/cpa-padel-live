import { AuthSession } from './types';

/**
 * Staff sign-ins are stored separately per role, so the scorekeeper panel and
 * the admin panel never share a session: an admin sign-in left on a device can
 * never surface on the scorekeeper screen, and signing in to one panel never
 * signs the other out.
 */
export type StaffRole = AuthSession['role'];

const STORAGE_KEYS: Record<StaffRole, string> = {
  scorekeeper: 'cpa_scorekeeper_session',
  admin: 'cpa_admin_session',
};

/** The single shared key used before the two panels were separated. */
const LEGACY_KEY = 'cpa_auth_session';

/** Move an old shared session under its own role's key (runs once). */
function migrateLegacySession() {
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (!legacy) return;
  localStorage.removeItem(LEGACY_KEY);
  const parsed = JSON.parse(legacy);
  const key = STORAGE_KEYS[parsed?.role as StaffRole];
  if (parsed?.token && key && !localStorage.getItem(key)) {
    localStorage.setItem(key, legacy);
  }
}

export function loadStaffSession(role: StaffRole): AuthSession | null {
  try {
    migrateLegacySession();
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS[role]) || 'null');
    if (parsed?.token && parsed.role === role) return parsed;
  } catch {
    // ignore unreadable storage
  }
  return null;
}

export function saveStaffSession(session: AuthSession) {
  try {
    localStorage.setItem(STORAGE_KEYS[session.role], JSON.stringify(session));
  } catch {
    // ignore storage quota / private mode
  }
}

export function clearStaffSession(role: StaffRole) {
  try {
    localStorage.removeItem(STORAGE_KEYS[role]);
  } catch {
    // ignore
  }
}
