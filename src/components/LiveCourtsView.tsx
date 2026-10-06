import React from 'react';
import { Court } from '../types';
import { EnrichedMatch } from '../api';
import { formatPointDisplay } from '../scoring/scoringEngine';
import { pairLabel } from '../utils/teamDisplay';
import { StickyHero } from './StickyHero';

interface LiveCourtsViewProps {
  courts: Court[];
  matches: EnrichedMatch[];
  onSelectTeam: (teamId: string) => void;
}

export const LiveCourtsView: React.FC<LiveCourtsViewProps> = ({
  courts,
  matches,
  onSelectTeam,
}) => {
  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {/* Hero: pins to the top while the courts scroll over it (StickyHero) */}
      <StickyHero className="text-center pt-4 sm:pt-6 px-2 pb-4 sm:pb-8">
        <h2 className="font-display font-bold uppercase tracking-tight text-[#0A0A0F] leading-[0.85] text-7xl sm:text-8xl md:text-9xl lg:text-[10rem]">
          Live Court
          <span className="block">Status</span>
        </h2>
      </StickyHero>

      {/* Grid of Courts (z-10: scrolls over the hero) */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {courts.map((court) => {
          // Find currently live match on this court
          const liveMatch = matches.find(
            (m) => m.courtId === court.id && m.status === 'live'
          );

          // Find ready or scheduled match on this court
          const upcomingMatches = matches.filter(
            (m) =>
              m.courtId === court.id &&
              (m.status === 'ready' || m.status === 'scheduled')
          );
          const currentOrNext = liveMatch || upcomingMatches[0];

          return (
            <div
              key={court.id}
              id={`court-card-${court.id}`}
              className={`rounded-3xl border-2 shadow-2xl relative overflow-hidden transition-all ${
                liveMatch
                  ? 'bg-[#0A0A0F] text-white border-blue-400'
                  : 'bg-white text-slate-900 border-blue-300/80'
              }`}
            >
              {/* Header — top band: dark blue strip on live courts, light strip
                  on inactive ones. Court name sits on the left (no pill), the
                  group name on the right (no pill). */}
              <div
                className={`flex items-center justify-between px-5 sm:px-7 py-5 sm:py-7 border-b ${
                  liveMatch ? 'bg-blue-800/50 border-blue-400/40' : 'bg-slate-100 border-slate-200'
                }`}
              >
                <span
                  className={`font-display font-semibold uppercase tracking-wide text-2xl sm:text-4xl leading-none truncate min-w-0 ${
                    liveMatch ? 'text-white' : 'text-[#0A0A0F]'
                  }`}
                >
                  {court.name}
                </span>
                {currentOrNext && (
                  <span
                    className={`text-2xl sm:text-4xl font-display font-semibold uppercase tracking-wide leading-none shrink-0 ${
                      liveMatch ? 'text-[#CCFF00]' : 'text-blue-800'
                    }`}
                  >
                    {currentOrNext.group?.name || 'Group Stage'}
                  </span>
                )}
              </div>

              {/* Body */}
              <div className="px-4 sm:px-6 py-3 sm:py-4 space-y-3 sm:space-y-4">
                {currentOrNext ? (
                  <>
                    {/* Teams — two name tiles, no labels; live courts show the
                        games count underneath, inactive courts just the names. */}
                    <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                      {/* Team 1 */}
                      <div
                        onClick={() => currentOrNext.team1?.id && onSelectTeam(currentOrNext.team1.id)}
                        className={`p-3 sm:p-3.5 rounded-2xl border text-center cursor-pointer transition-colors ${
                          liveMatch
                            ? 'bg-zinc-800/60 border-zinc-700/80 hover:border-blue-400'
                            : 'bg-slate-50 border-slate-200 hover:border-blue-400'
                        }`}
                      >
                        <div
                          className={`text-sm sm:text-base font-bold leading-snug ${
                            liveMatch ? 'text-white' : 'text-[#0A0A0F]'
                          } ${liveMatch ? 'mb-2.5' : ''}`}
                        >
                          {currentOrNext.team1?.player1 ?? 'TBD'}
                          <span className="block">{currentOrNext.team1?.player2 ?? ''}</span>
                        </div>
                        {liveMatch && (
                          <div className="pt-2 border-t border-zinc-700">
                            <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 block">
                              GAMES
                            </span>
                            <span className="text-2xl sm:text-3xl font-display font-black text-[#CCFF00] leading-tight">
                              {currentOrNext.padelState?.team1Games ?? currentOrNext.team1Score ?? 0}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Team 2 */}
                      <div
                        onClick={() => currentOrNext.team2?.id && onSelectTeam(currentOrNext.team2.id)}
                        className={`p-3 sm:p-3.5 rounded-2xl border text-center cursor-pointer transition-colors ${
                          liveMatch
                            ? 'bg-zinc-800/60 border-zinc-700/80 hover:border-blue-400'
                            : 'bg-slate-50 border-slate-200 hover:border-blue-400'
                        }`}
                      >
                        <div
                          className={`text-sm sm:text-base font-bold leading-snug ${
                            liveMatch ? 'text-white' : 'text-[#0A0A0F]'
                          } ${liveMatch ? 'mb-2.5' : ''}`}
                        >
                          {currentOrNext.team2?.player1 ?? 'TBD'}
                          <span className="block">{currentOrNext.team2?.player2 ?? ''}</span>
                        </div>
                        {liveMatch && (
                          <div className="pt-2 border-t border-zinc-700">
                            <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 block">
                              GAMES
                            </span>
                            <span className="text-2xl sm:text-3xl font-display font-black text-[#CCFF00] leading-tight">
                              {currentOrNext.padelState?.team2Games ?? currentOrNext.team2Score ?? 0}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Current Game Point banner — only while live */}
                    {liveMatch && (
                      <div className="py-3.5 px-3 rounded-2xl bg-slate-950/90 border border-zinc-700 flex flex-col items-center justify-center gap-1 shadow-inner">
                        <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                          Current Game Points
                        </span>
                        <div className="text-lg sm:text-xl font-black font-mono text-[#CCFF00] tracking-wide">
                          {currentOrNext.padelState
                            ? `${formatPointDisplay(currentOrNext.padelState.team1Points)} — ${formatPointDisplay(currentOrNext.padelState.team2Points)}`
                            : 'LOVE — LOVE'}
                        </div>
                      </div>
                    )}

                    {/* Meta strip — match number / time */}
                    <div
                      className={`text-[11px] font-mono py-1.5 px-3 rounded-xl border flex items-center justify-between gap-2 ${
                        liveMatch
                          ? 'text-zinc-300 bg-zinc-800/80 border-zinc-700'
                          : 'text-slate-600 bg-slate-50 border-slate-200'
                      }`}
                    >
                      <span className="font-bold uppercase">Match #{currentOrNext.matchNumber}</span>
                      <span className="truncate">{currentOrNext.scheduledTime}</span>
                    </div>

                    {/* Next match up in queue if any */}
                    {upcomingMatches.length > 1 && (
                      <div
                        className={`text-[11px] text-center font-mono font-semibold py-1.5 px-3 rounded-xl border ${
                          liveMatch
                            ? 'text-blue-300 bg-zinc-800/80 border-zinc-700'
                            : 'text-blue-700 bg-slate-50 border-slate-200'
                        }`}
                      >
                        <span className={`font-bold uppercase ${liveMatch ? 'text-zinc-400' : 'text-slate-500'}`}>
                          Next:{' '}
                        </span>
                        {pairLabel(upcomingMatches[1].team1, 'TBD').replace(' / ', '\u00A0/ ')} vs{' '}
                        {pairLabel(upcomingMatches[1].team2, 'TBD').replace(' / ', '\u00A0/ ')} ({upcomingMatches[1].scheduledTime})
                      </div>
                    )}
                  </>
                ) : (
                  <div
                    className={`py-8 text-center text-xs italic font-mono ${
                      liveMatch ? 'text-slate-400' : 'text-slate-400'
                    }`}
                  >
                    No active or scheduled matches currently queued on this court.
                  </div>
                )}
              </div>

              {/* Court queue status */}
              {/* (queue counter removed) */}
            </div>
          );
        })}
      </div>
    </div>
  );
};
