/**
 * Live Group Draw colour theme, sampled from the reference artwork:
 * near-black background, vivid royal blue, white, with green / red accents.
 * Kept in one place so every draw screen stays consistent.
 */
export const DRAW_THEME = {
  black: '#070A12',
  panel: '#0E1422',
  panelAlt: '#141B2E',
  line: '#22304E',

  blue: '#2E6BFF',
  blueDark: '#12327A',
  blueLight: '#6E9BFF',

  white: '#FFFFFF',
  green: '#22C55E',
  red: '#EF4444',
  muted: '#8A97AD',
} as const;

/** Four-colour wheel segments, cycling blue -> black -> white -> deep blue. */
export const WHEEL_SEGMENTS = [
  { fill: DRAW_THEME.blue, text: DRAW_THEME.white },
  { fill: '#0B0E14', text: DRAW_THEME.white },
  { fill: DRAW_THEME.white, text: '#0B0E14' },
  { fill: '#1B4FD8', text: DRAW_THEME.white },
] as const;

/** Accent colour per group, kept in the reference's blue family. */
export const GROUP_ACCENTS: Record<string, string> = {
  A: '#2E6BFF',
  B: '#6E9BFF',
  C: '#1B4FD8',
  D: '#3D6FE0',
  E: '#86A9FF',
};
