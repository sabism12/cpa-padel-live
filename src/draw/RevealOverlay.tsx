import React from 'react';
import { DrawAnimation } from './useDrawState';
import { pairLabel } from '../utils/teamDisplay';
import { DRAW_THEME } from './theme';

interface RevealOverlayProps {
  animation: DrawAnimation | null;
}

/**
 * Dramatic full-screen reveal shown after the wheel stops.
 * Appears only for the "pair" and "group" phases so the wheel itself is
 * never obscured while spinning.
 */
export const RevealOverlay: React.FC<RevealOverlayProps> = ({ animation }) => {
  if (!animation || animation.phase === 'spinning') return null;

  const { phase, result } = animation;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-x-hidden overflow-y-auto px-3 py-6 text-center backdrop-blur-md sm:px-4"
      style={{ backgroundColor: 'rgba(7,10,18,0.92)' }}
    >
      {phase === 'pair' ? (
        <div className="draw-reveal-pop mx-auto w-full max-w-[1200px] text-center">
          <p
            className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] sm:text-sm sm:tracking-[0.35em]"
            style={{ color: DRAW_THEME.blueLight }}
          >
            Pair {String(result.drawOrder).padStart(2, '0')} of 20
          </p>
          <h2
            className="mx-auto w-full max-w-[calc(100vw-2rem)] font-display text-[clamp(1.25rem,6vw,4.5rem)] font-bold uppercase leading-tight tracking-normal text-white drop-shadow-lg sm:max-w-full sm:text-6xl sm:tracking-wide lg:text-7xl"
            style={{ overflowWrap: 'anywhere' }}
          >
            <span className="block sm:inline">{result.player1}</span>
            <span className="block text-[0.65em] sm:inline sm:px-3">/</span>
            <span className="block sm:inline">{result.player2}</span>
          </h2>
          <div
            className="draw-pulse mt-6 font-display text-3xl"
            style={{ color: DRAW_THEME.blue }}
          >
            ↓
          </div>
        </div>
      ) : (
        <div className="draw-reveal-pop mx-auto w-full max-w-[1200px] text-center">
          <p
            className="mb-4 font-mono text-[10px] font-bold uppercase tracking-[0.25em] sm:text-sm sm:tracking-[0.35em]"
            style={{ color: 'rgba(255,255,255,0.6)' }}
          >
            {pairLabel(result)}
          </p>
          <div
            className="draw-glow mx-auto inline-flex max-w-full items-center justify-center rounded-3xl px-6 py-5 sm:px-16 sm:py-10"
            style={{ backgroundColor: DRAW_THEME.blue }}
          >
            <h2 className="break-words font-display text-4xl font-bold uppercase tracking-wide text-white sm:text-7xl lg:text-8xl">
              Group {result.assignedGroup}
            </h2>
          </div>
        </div>
      )}
    </div>
  );
};
