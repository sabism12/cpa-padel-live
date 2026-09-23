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
        {/* Games & Current Game Points Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-rose-500/40 shadow-md">
          {/* Games Count */}
          <div className="flex items-center gap-1 font-display font-black text-white text-base sm:text-lg">
            <span className="text-lime-400">{padel.team1Games}</span>
            <span className="text-slate-600 text-xs">—</span>
            <span className="text-sky-400">{padel.team2Games}</span>
          </div>

          <span className="text-slate-600">|</span>

          {/* Current Game Point (Love / 15 / 30 / 40 or GOLDEN POINT) */}
          <div
            className={`flex items-center gap-1 text-xs font-black px-2 py-0.5 rounded-md ${
              isGolden
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-rose-500/15 text-rose-300'
            }`}
          >
            {isGolden ? (
              <>
                <Flame className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                <span>GOLDEN POINT</span>
              </>
            ) : (
              <span>{p1Label} - {p2Label}</span>
            )}
          </div>
        </div>
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
          <span className={team1Won ? 'text-lime-400 font-black' : 'text-slate-400'}>
            {g1}
          </span>
          <span className="text-slate-600">—</span>
          <span className={!team1Won ? 'text-lime-400 font-black' : 'text-slate-400'}>
            {g2}
          </span>
        </div>
      </div>
    );
  }

  // Live without padelState
  if (isLive) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-rose-500/40 font-display font-extrabold text-base text-rose-400">
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
