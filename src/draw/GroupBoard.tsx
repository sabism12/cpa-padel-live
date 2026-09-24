import React from 'react';
import { DrawGroup, DrawResultView } from './types';
import { pairLabel } from '../utils/teamDisplay';
import { DRAW_THEME, GROUP_ACCENTS } from './theme';

interface GroupBoardProps {
  groups: DrawGroup[];
  /** Only the results that have been visually revealed should be passed in. */
  results: DrawResultView[];
  groupSize: number;
  highlightPairId?: string | null;
}

export const GroupBoard: React.FC<GroupBoardProps> = ({
  groups,
  results,
  groupSize,
  highlightPairId,
}) => {
  return (
    <div className="mx-auto grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {groups.map((group) => {
        const filled = results
          .filter((r) => r.assignedGroup === group)
          .sort((a, b) => a.drawOrder - b.drawOrder);
        const accent = GROUP_ACCENTS[group] ?? DRAW_THEME.blue;

        return (
          <div
            key={group}
            className="min-w-0 overflow-hidden rounded-2xl border"
            style={{ backgroundColor: '#0B0E14', borderColor: DRAW_THEME.line }}
          >
            {/* Blue header bar */}
            <div
              className="flex items-center justify-between px-3 py-2"
              style={{ backgroundColor: DRAW_THEME.blue }}
            >
              <span className="font-display text-sm font-bold uppercase tracking-wide text-white">
                Group {group}
              </span>
              <span className="font-mono text-[11px] font-black text-white/80">
                {filled.length}/{groupSize}
              </span>
            </div>

            <div className="flex flex-col gap-1 p-1.5">
              {Array.from({ length: groupSize }).map((_, slot) => {
                const result = filled[slot];
                const isHighlight = !!result && result.pairId === highlightPairId;
                return (
                  <div
                    key={slot}
                    className="relative flex min-h-[42px] items-center overflow-hidden rounded-md"
                    style={{
                      backgroundColor: isHighlight ? 'rgba(46,107,255,0.22)' : result ? '#0F1626' : '#0A0E18',
                      boxShadow: isHighlight ? `inset 0 0 0 1.5px ${DRAW_THEME.blue}` : undefined,
                    }}
                  >
                    {/* Slanted rank block, echoing the reference table */}
                    <span
                      className="absolute left-0 top-0 h-full w-10"
                      style={{
                        backgroundColor: result ? accent : '#1F2937',
                        transform: 'skewX(-14deg)',
                        marginLeft: '-8px',
                      }}
                    />
                    <span className="relative z-10 w-8 text-center font-mono text-xs font-black text-white">
                      {slot + 1}
                    </span>
                    <span
                    className="relative z-10 min-w-0 flex-1 truncate pr-2 text-xs font-semibold"
                      style={{ color: result ? DRAW_THEME.white : DRAW_THEME.muted }}
                      title={result ? pairLabel(result) : undefined}
                    >
                      {result ? pairLabel(result) : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
