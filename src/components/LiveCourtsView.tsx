import React from 'react';
import { Court, Match } from '../types';
import { EnrichedMatch } from '../api';
import { Radio, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { PadelScoreBadge } from './PadelScoreBadge';
import { pairLabel } from '../utils/teamDisplay';

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
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-emerald-400/40">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#170036] text-[#00DF81] text-xs font-black uppercase tracking-wider mb-2 shadow-sm">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            Arena Tracker
          </div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-[#170036] uppercase tracking-tight">
            Live Court Status
          </h2>
          <p className="text-xs font-mono font-bold text-slate-800 mt-0.5">
            Real-time status for spectators walking around the tournament venue
          </p>
        </div>
      </div>

      {/* Grid of Courts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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

          // Determine status visual theme
          let statusBadge = (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-slate-100 text-slate-700 border border-slate-200">
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              <span>Available</span>
            </div>
          );

          let borderColor = 'border-emerald-300/80';
          let bgColor = 'bg-white text-slate-900';

          if (liveMatch) {
            statusBadge = (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-[#00DF81] text-slate-950 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-slate-950 animate-ping" />
                <span>LIVE MATCH</span>
              </div>
            );
            borderColor = 'border-2 border-emerald-400';
            bgColor = 'bg-[#170036] text-white shadow-2xl';
          } else if (currentOrNext && currentOrNext.status === 'ready') {
            statusBadge = (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                <span>Ready / Starting Soon</span>
              </div>
            );
            borderColor = 'border-emerald-300/80';
          } else if (currentOrNext) {
            statusBadge = (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-slate-100 text-slate-800 border border-slate-200">
                <Clock className="w-3.5 h-3.5" />
                <span>{currentOrNext.scheduledTime}</span>
              </div>
            );
          }

          return (
            <div
              key={court.id}
              id={`court-card-${court.id}`}
              className={`rounded-3xl ${borderColor} ${bgColor} p-6 shadow-xl flex flex-col justify-between transition-all`}
            >
              <div>
                {/* Court Header */}
                <div className={`flex items-center justify-between pb-3.5 mb-3.5 border-b ${liveMatch ? 'border-purple-900/60' : 'border-slate-100'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`font-display font-bold text-xl uppercase ${liveMatch ? 'text-white' : 'text-[#170036]'}`}>
                      {court.name}
                    </span>
                  </div>
                  {statusBadge}
                </div>

                {/* Match Details */}
                {currentOrNext ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className={`font-bold ${liveMatch ? 'text-yellow-300' : 'text-emerald-700'}`}>
                        {currentOrNext.group?.name || 'Group Stage'}
                      </span>
                      <span className={liveMatch ? 'text-purple-300' : 'text-slate-500'}>
                        Match #{currentOrNext.matchNumber} • {currentOrNext.scheduledTime}
                      </span>
                    </div>

                    <div className={`p-4 rounded-2xl ${liveMatch ? 'bg-purple-950/70 border border-purple-800' : 'bg-slate-50 border border-slate-200'} space-y-2`}>
                      {/* Pair 1 */}
                      <div className="flex items-center justify-between">
                        <div
                          onClick={() => currentOrNext.team1?.id && onSelectTeam(currentOrNext.team1.id)}
                          className={`font-black text-sm cursor-pointer hover:underline transition-colors ${liveMatch ? 'text-white' : 'text-[#170036]'}`}
                        >
                          {pairLabel(currentOrNext.team1, 'TBD')}
                        </div>
                      </div>

                      <div className={`border-t my-1.5 ${liveMatch ? 'border-purple-900' : 'border-slate-200'}`} />

                      {/* Pair 2 */}
                      <div className="flex items-center justify-between">
                        <div
                          onClick={() => currentOrNext.team2?.id && onSelectTeam(currentOrNext.team2.id)}
                          className={`font-black text-sm cursor-pointer hover:underline transition-colors ${liveMatch ? 'text-white' : 'text-[#170036]'}`}
                        >
                          {pairLabel(currentOrNext.team2, 'TBD')}
                        </div>
                      </div>

                      {/* Live or Final Score Badge */}
                      <div className={`pt-2 border-t flex justify-center ${liveMatch ? 'border-purple-900' : 'border-slate-200'}`}>
                        <PadelScoreBadge match={currentOrNext} />
                      </div>
                    </div>

                    {/* Next match up in queue if any */}
                    {upcomingMatches.length > 1 && (
                      <div className={`text-[11px] font-mono pt-1 ${liveMatch ? 'text-purple-200' : 'text-slate-500'}`}>
                        <span className="font-bold uppercase">Next: </span>
                        <span>
                          {pairLabel(upcomingMatches[1].team1, 'TBD')} vs{' '}
                          {pairLabel(upcomingMatches[1].team2, 'TBD')} ({upcomingMatches[1].scheduledTime})
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-8 text-center text-slate-400 text-xs italic font-mono">
                    No active or scheduled matches currently queued on this court.
                  </div>
                )}
              </div>

              {/* Court queue status */}
              <div className={`pt-4 mt-3 border-t ${liveMatch ? 'border-purple-900/60' : 'border-slate-100'}`}>
                <span className={`text-[11px] font-mono font-bold ${liveMatch ? 'text-purple-300' : 'text-slate-500'}`}>
                  {currentOrNext ? `${upcomingMatches.length} matches queued` : 'Court ready'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
