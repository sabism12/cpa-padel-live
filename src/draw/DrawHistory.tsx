import React, { useEffect, useRef } from 'react';
import { DrawResultView } from './types';
import { pairLabel } from '../utils/teamDisplay';
import { DRAW_THEME } from './theme';

interface DrawHistoryProps {
  results: DrawResultView[];
  highlightPairId?: string | null;
}

export const DrawHistory: React.FC<DrawHistoryProps> = ({ results, highlightPairId }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [results.length]);

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-2xl border"
      style={{ backgroundColor: '#0B0E14', borderColor: DRAW_THEME.line }}
    >
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ backgroundColor: DRAW_THEME.blue }}
      >
        <span className="font-display text-sm font-bold uppercase tracking-wide text-white">
          Draw History
        </span>
        <span className="font-mono text-[11px] font-bold text-white/80">{results.length}</span>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {results.length === 0 && (
          <p className="px-2 py-6 text-center text-xs" style={{ color: DRAW_THEME.muted }}>
            No draws yet.
          </p>
        )}
        {results.map((r) => {
          const isHighlight = r.pairId === highlightPairId;
          return (
            <div
              key={r.drawOrder}
              className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm"
              style={{
                backgroundColor: isHighlight ? 'rgba(46,107,255,0.22)' : '#0F1626',
                boxShadow: isHighlight ? `inset 0 0 0 1.5px ${DRAW_THEME.blue}` : undefined,
              }}
            >
              <span className="font-mono text-xs font-bold" style={{ color: DRAW_THEME.blueLight }}>
                {String(r.drawOrder).padStart(2, '0')}
              </span>
              <span className="flex-1 truncate font-semibold text-white">{pairLabel(r)}</span>
              <span className="font-mono text-xs font-bold" style={{ color: DRAW_THEME.blueLight }}>
                Group {r.assignedGroup}
              </span>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
};
