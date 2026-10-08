/**
 * Final-score rules for this tournament: first to 6 games, golden point at
 * 40-40 and no tiebreak, so the only valid finals are 6-0 ... 6-5 (either way
 * round). Shared by the admin Quick results screen and the server.
 */
export const GAMES_TO_WIN = 6;

/** Error message for an invalid final score, or null when it is valid. */
export function finalScoreError(team1Games: unknown, team2Games: unknown): string | null {
  const blank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
  if (blank(team1Games) || blank(team2Games)) return 'Enter the games for both pairings.';

  const t1 = Number(team1Games);
  const t2 = Number(team2Games);
  if (!Number.isInteger(t1) || !Number.isInteger(t2) || t1 < 0 || t2 < 0) {
    return 'Games must be whole numbers from 0 to 6.';
  }
  if (t1 > GAMES_TO_WIN || t2 > GAMES_TO_WIN) {
    return `No tiebreak: a match ends as soon as a pairing reaches ${GAMES_TO_WIN} games (${t1}–${t2} is not possible).`;
  }
  if (t1 === GAMES_TO_WIN && t2 === GAMES_TO_WIN) {
    return `${GAMES_TO_WIN}–${GAMES_TO_WIN} is not possible: the match ends at ${GAMES_TO_WIN}–${GAMES_TO_WIN - 1}.`;
  }
  if (t1 !== GAMES_TO_WIN && t2 !== GAMES_TO_WIN) {
    return `The winner needs ${GAMES_TO_WIN} games (${t1}–${t2} is not a finished match).`;
  }
  return null;
}
