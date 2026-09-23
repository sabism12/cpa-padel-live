/**
 * Teams in this tournament are identified by their two players, not by a
 * nickname. Every screen should render the pairing instead of `team.name`.
 */

/** Minimal shape needed to render a pairing (works for Team and StandingsRow). */
export interface PlayerPair {
  player1?: string;
  player2?: string;
}

/** e.g. "Hamood / Hossam" */
export function pairLabel(pair?: PlayerPair | null, fallback = 'TBD'): string {
  if (!pair) return fallback;
  const p1 = (pair.player1 || '').trim();
  const p2 = (pair.player2 || '').trim();
  if (p1 && p2) return `${p1} / ${p2}`;
  if (p1) return p1;
  if (p2) return p2;
  return fallback;
}

/** Surname only, for tight spaces such as the knockout bracket. */
export function lastName(fullName?: string): string {
  const name = (fullName || '').trim();
  if (!name) return '';
  const parts = name.split(/\s+/);
  return parts.length >= 2 ? parts[parts.length - 1] : name;
}

/** e.g. "Mendez / Silva" */
export function pairSurnames(pair?: PlayerPair | null, fallback = 'TBD'): string {
  if (!pair) return fallback;
  const s1 = lastName(pair.player1);
  const s2 = lastName(pair.player2);
  if (s1 && s2) return `${s1} / ${s2}`;
  return s1 || s2 || fallback;
}
