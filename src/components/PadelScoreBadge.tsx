import React from 'react';
import { Match } from '../types';
import { formatPointDisplay } from '../scoring/scoringEngine';
import { Flame, Trophy } from 'lucide-react';

interface PadelScoreBadgeProps {
  match: Match;
  size?: 'sm' | 'md' | 'lg';
}

export const PadelScoreBadge: React.FC<PadelScoreBadgeProps> = ({ match, size = 'md' }) => {
  const isLive = match.status === 'live';
  const isDone = match.status === 'completed';
  const padel = match.padelState;

  if (isLive && padel) {
    const isGolden = padel.isGoldenPoint;
    const p1Label = formatPointDisplay(padel.team1Points);
    const p2Label = formatPointDisplay(padel.team2Points);

    return (
      <div className="flex flex-col items-center gap-1.5">
        {/* Games + current game points, in the site's ink/volt palette */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0A0A0F] border border-zinc-700 shadow-md">
          <div className="flex items-center gap-1 font-display font-black text-base sm:text-lg text-[#CCFF00]">
            <span>{padel.team1Games}</span>
            <span className="text-zinc-500 text-xs">—</span>
            <span>{padel.team2Games}</span>
          </div>

          <span className="w-px h-4 bg-zinc-700" aria-hidden="true" />

          {/* Current game point (Love / 15 / 30 / 40) or Golden Point */}
          <div
            className={`flex items-center gap-1 text-[11px] font-mono font-black px-1.5 py-0.5 rounded-md ${
              isGolden ? 'bg-amber-400 text-[#0A0A0F]' : 'bg-white/10 text-white'
            }`}
          >
            {isGolden ? (
              <>
                <Flame className="w-3 h-3" />
                <span>GOLDEN</span>
              </>
            ) : (
              <span>
                {p1Label} - {p2Label}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isDone && match.walkover === 'both') {
    return (
      <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 font-display font-black text-xs text-slate-400 uppercase">
        W/O – both absent
      </div>
    );
  }

  if (isDone) {
    const g1 = padel?.team1Games ?? match.team1Score ?? 0;
    const g2 = padel?.team2Games ?? match.team2Score ?? 0;
    const team1Won = g1 > g2;

    return (
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 font-display font-black text-base">
          <span className={team1Won ? 'text-[#CCFF00] font-black' : 'text-slate-400'}>
            {g1}
          </span>
          <span className="text-slate-600">—</span>
          <span className={!team1Won ? 'text-[#CCFF00] font-black' : 'text-slate-400'}>
            {g2}
          </span>
        </div>
      </div>
    );
  }

  // Live without padelState
  if (isLive) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0A0A0F] border border-zinc-700 font-display font-black text-base text-[#CCFF00]">
        <span>{match.team1Score ?? 0}</span>
        <span className="text-slate-600">—</span>
        <span>{match.team2Score ?? 0}</span>
      </div>
    );
  }

  // Scheduled / Ready
  return (
    <div className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
      {match.scheduledTime || 'VS'}
    </div>
  );
};
