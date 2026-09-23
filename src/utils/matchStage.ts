/**
 * Human-readable stage / round for a match, e.g. "Group A", "Quarterfinals",
 * "Grand Final". Used anywhere a match needs to say which part of the
 * tournament it belongs to.
 */

export interface MatchStageInfo {
  round?: string;
  stage?: string;
  groupId?: string;
  group?: { name?: string } | null;
}

const ROUND_LABELS: Record<string, string> = {
  r16: 'Round of 16',
  qf: 'Quarterfinals',
  sf: 'Semifinals',
  final: 'Grand Final',
  '3rd': '3rd Place Playoff',
};

export function stageLabel(match?: MatchStageInfo | null): string {
  if (!match) return 'Match';

  if (match.round) {
    return ROUND_LABELS[match.round] || match.round;
  }

  if (isKnockoutMatch(match)) return 'Knockout';

  return match.group?.name || 'Group Stage';
}

export function isKnockoutMatch(match?: MatchStageInfo | null): boolean {
  if (!match) return false;
  return match.stage === 'knockout' || match.round !== undefined || match.groupId === 'knockout';
}
