import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Clock,
  Radio,
  Trophy,
  Calendar,
  ChevronRight,
  Sparkles,
  ArrowUpRight,
  Flame,
} from 'lucide-react';
import { Group, StandingsRow, TournamentSettings } from '../types';
import { EnrichedMatch, SummaryData } from '../api';
import { PadelScoreBadge } from './PadelScoreBadge';
import { formatPointDisplay } from '../scoring/scoringEngine';
import { pairLabel } from '../utils/teamDisplay';

interface LiveResultsViewProps {
  summary: SummaryData | null;
  groups: Group[];
  standings: Record<string, StandingsRow[]>;
  matches: EnrichedMatch[];
  latestResults: EnrichedMatch[];
  settings?: TournamentSettings;
  onSelectTeam: (teamId: string) => void;
  onGoToCourts: () => void;
}

export const LiveResultsView: React.FC<LiveResultsViewProps> = ({
  summary,
  groups,
  standings,
  matches,
  latestResults,
  settings,
  onSelectTeam,
  onGoToCourts,
}) => {
  const [selectedGroupId, setSelectedGroupId] = useState<string>(groups[0]?.id || 'group-a');

  // Filter matches for current selected group
  const groupMatches = matches.filter((m) => m.groupId === selectedGroupId);
  const liveMatchesInGroup = groupMatches.filter((m) => m.status === 'live');
  const completedMatchesInGroup = groupMatches.filter((m) => m.status === 'completed');
  const upcomingMatchesInGroup = groupMatches.filter(
    (m) => m.status === 'scheduled' || m.status === 'ready'
  );

  // Group standings
  const currentStandings = standings[selectedGroupId] || [];
  const currentGroup = groups.find((g) => g.id === selectedGroupId);

  const perGroup = settings?.scoring.qualifiersPerGroup ?? 2;
  const wildcards = settings?.scoring.wildcardQualifiers ?? 0;
  const qualificationSummary =
    perGroup === 1
      ? 'Group winners'
      : `Top ${perGroup} of each group`;
  const qualificationText =
    wildcards > 0
      ? `${qualificationSummary} plus the ${wildcards} best-placed wildcards advance to the Knockout Stage`
      : `${qualificationSummary} advance to the Knockout Stage`;

  // Format time since completion
  const formatTimeAgo = (isoString?: string) => {
    if (!isoString) return 'recently';
    const diffMs = Date.now() - new Date(isoString).getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'just now';
    if (minutes === 1) return '1 minute ago';
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {/* 🔴 Top LIVE RESULTS Header & Real-time Metrics Banner (White Floating Card) */}
      <div className="relative overflow-hidden rounded-3xl bg-white border border-emerald-300/80 p-6 sm:p-8 shadow-xl text-slate-900">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#170036] text-[#00DF81] text-xs font-black tracking-widest uppercase mb-3 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-[#00DF81] animate-ping" />
              <span className="w-2 h-2 rounded-full bg-[#00DF81] -ml-4" />
              LIVE TOURNAMENT ACTION
            </div>
            <h1 className="text-2xl sm:text-4xl font-display font-bold text-[#170036] tracking-tight uppercase">
              {settings?.name || 'CPA PADEL TOURNAMENT'}
            </h1>
            <p className="text-slate-600 text-xs sm:text-sm font-mono font-bold mt-1 flex items-center gap-2 flex-wrap">
              <span>{settings?.location || 'Central Arena'}</span>
              <span>•</span>
              <span className="text-slate-500">
                Last updated:{' '}
                {summary?.lastUpdated
                  ? new Date(summary.lastUpdated).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  : 'Syncing...'}
              </span>
            </p>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-3 gap-3 sm:gap-4 sm:w-auto w-full">
            <div className="p-3.5 sm:p-4 rounded-2xl bg-[#170036] border border-purple-900/60 text-center shadow-md">
              <div className="flex items-center justify-center gap-1.5 text-[#00DF81] mb-1">
                <Flame className="w-4 h-4 animate-pulse" />
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider">Live</span>
              </div>
              <div className="text-2xl sm:text-3xl font-display font-black text-[#00DF81]">
                {summary?.liveMatches ?? 0}
              </div>
            </div>

            <div className="p-3.5 sm:p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-center shadow-sm">
              <div className="flex items-center justify-center gap-1.5 text-emerald-700 mb-1">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider">Done</span>
              </div>
              <div className="text-2xl sm:text-3xl font-display font-black text-emerald-800">
                {summary?.completedMatches ?? 0}
              </div>
            </div>

            <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-100 border border-slate-200 text-center shadow-sm">
              <div className="flex items-center justify-center gap-1.5 text-slate-700 mb-1">
                <Clock className="w-4 h-4" />
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider">Upcoming</span>
              </div>
              <div className="text-2xl sm:text-3xl font-display font-black text-slate-900">
                {summary?.upcomingMatches ?? 0}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 21. Latest Results Section */}
      {latestResults.length > 0 && (
        <section id="section-latest-results">
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#170036]" />
              <h2 className="text-xl sm:text-2xl font-display font-bold text-[#170036] uppercase tracking-tight">
                Latest Match Results
              </h2>
            </div>
            <span className="text-xs font-mono font-bold text-slate-800">Live official scoring</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
            {latestResults.slice(0, 3).map((match) => {
              const g1 = match.padelState?.team1Games ?? match.team1Score ?? 0;
              const g2 = match.padelState?.team2Games ?? match.team2Score ?? 0;
              const winnerTeam = g1 > g2 ? match.team1 : match.team2;

              return (
                <div
                  key={match.id}
                  id={`latest-result-${match.id}`}
                  className="relative overflow-hidden rounded-3xl bg-white border border-emerald-300/80 p-5 hover:shadow-2xl transition-all shadow-lg group space-y-3 text-slate-900"
                >
                  <div className="flex items-center justify-between text-xs pb-2.5 border-b border-slate-100">
                    <div className="flex items-center gap-1.5 font-bold text-[#170036]">
                      <Trophy className="w-4 h-4 text-amber-500" />
                      <span className="text-[11px] font-black uppercase tracking-wider">MATCH COMPLETE</span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-500 font-semibold">
                      {formatTimeAgo(match.completedAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    {/* Pair 1 */}
                    <div
                      onClick={() => match.team1?.id && onSelectTeam(match.team1.id)}
                      className="flex-1 cursor-pointer hover:text-emerald-700 transition-colors"
                    >
                      <p
                        className={`text-xs sm:text-sm font-extrabold leading-tight ${
                          g1 > g2 ? 'text-[#170036]' : 'text-slate-500'
                        }`}
                      >
                        {pairLabel(match.team1, 'TBD')}
                      </p>
                    </div>

                    {/* Games Score (WTA Style scoreboard badge) */}
                    <div className="flex-shrink-0 px-3.5 py-1.5 rounded-2xl bg-[#170036] border border-purple-900 font-mono font-black text-base shadow-sm">
                      <span className={g1 > g2 ? 'text-yellow-300 font-black' : 'text-slate-400'}>{g1}</span>
                      <span className="text-purple-300 mx-1.5">—</span>
                      <span className={g2 > g1 ? 'text-yellow-300 font-black' : 'text-slate-400'}>{g2}</span>
                    </div>

                    {/* Pair 2 */}
                    <div
                      onClick={() => match.team2?.id && onSelectTeam(match.team2.id)}
                      className="flex-1 text-right cursor-pointer hover:text-emerald-700 transition-colors"
                    >
                      <p
                        className={`text-xs sm:text-sm font-extrabold leading-tight ${
                          g2 > g1 ? 'text-[#170036]' : 'text-slate-500'
                        }`}
                      >
                        {pairLabel(match.team2, 'TBD')}
                      </p>
                    </div>
                  </div>

                  {/* Winner Banner */}
                  {winnerTeam && (
                    <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] bg-emerald-50/60 -mx-5 -mb-5 px-5 py-2.5 rounded-b-3xl">
                      <span className="text-slate-600 font-bold uppercase tracking-wider text-[10px]">Winner:</span>
                      <span className="text-emerald-800 font-black truncate max-w-[200px] flex items-center gap-1">
                        {pairLabel(winnerTeam)} 🏆
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 🔴 Active LIVE Matches Highlight (if any) */}
      {matches.filter((m) => m.status === 'live').length > 0 && (
        <section id="section-live-matches">
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#170036] animate-ping" />
              <h2 className="text-xl sm:text-2xl font-display font-bold text-[#170036] uppercase tracking-tight">
                Live On Court Now
              </h2>
            </div>
            <button
              onClick={onGoToCourts}
              className="text-xs font-mono font-black text-[#170036] hover:underline flex items-center gap-1 transition-colors uppercase tracking-wider"
            >
              <span>View All Courts</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {matches
              .filter((m) => m.status === 'live')
              .map((match) => {
                const padel = match.padelState;
                const isGolden = padel?.isGoldenPoint;
                const g1 = padel?.team1Games ?? match.team1Score ?? 0;
                const g2 = padel?.team2Games ?? match.team2Score ?? 0;

                return (
                  <div
                    key={match.id}
                    id={`live-card-${match.id}`}
                    className="rounded-3xl bg-[#170036] text-white border-2 border-emerald-400 p-6 shadow-2xl relative overflow-hidden space-y-4"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-purple-900/60">
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 rounded-full bg-[#00DF81] text-slate-950 text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                          <span className="w-2 h-2 rounded-full bg-slate-950 animate-pulse" />
                          LIVE
                        </span>
                        <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-300">
                          {match.court?.name || 'Assigned Court'}
                        </span>
                      </div>
                      <span className="text-xs font-mono font-bold text-yellow-300">{match.group?.name}</span>
                    </div>

                    {/* Teams & Games Count */}
                    <div className="grid grid-cols-2 gap-3">
                      {/* Team 1 */}
                      <div
                        onClick={() => match.team1?.id && onSelectTeam(match.team1.id)}
                        className="p-3.5 rounded-2xl bg-purple-950/60 border border-purple-800/80 text-center cursor-pointer hover:border-emerald-400 transition-colors"
                      >
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400 block mb-1 truncate">
                          PAIRING 1
                        </span>
                        <div className="font-sans text-sm font-bold text-white leading-tight mb-2">
                          {pairLabel(match.team1, 'TBD')}
                        </div>
                        <div className="pt-1.5 border-t border-purple-900">
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-purple-300 block">
                            GAMES
                          </span>
                          <span className="text-3xl font-display font-black text-yellow-300">
                            {g1}
                          </span>
                        </div>
                      </div>

                      {/* Team 2 */}
                      <div
                        onClick={() => match.team2?.id && onSelectTeam(match.team2.id)}
                        className="p-3.5 rounded-2xl bg-purple-950/60 border border-purple-800/80 text-center cursor-pointer hover:border-emerald-400 transition-colors"
                      >
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400 block mb-1 truncate">
                          PAIRING 2
                        </span>
                        <div className="font-sans text-sm font-bold text-white leading-tight mb-2">
                          {pairLabel(match.team2, 'TBD')}
                        </div>
                        <div className="pt-1.5 border-t border-purple-900">
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-purple-300 block">
                            GAMES
                          </span>
                          <span className="text-3xl font-display font-black text-yellow-300">
                            {g2}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Current Game Point & Golden Point Banner */}
                    <div className="p-3 rounded-2xl bg-slate-950/90 border border-purple-900 flex flex-col items-center justify-center gap-1 shadow-inner">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                        Current Game Points
                      </span>
                      {isGolden ? (
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-400 text-slate-950 text-xs font-black animate-pulse">
                          <Flame className="w-4 h-4 text-slate-950" />
                          <span>40 — 40 • GOLDEN POINT</span>
                          <Flame className="w-4 h-4 text-slate-950" />
                        </div>
                      ) : (
                        <div className="text-base font-black font-mono text-[#00DF81] tracking-wide">
                          {padel
                            ? `${formatPointDisplay(padel.team1Points)} — ${formatPointDisplay(padel.team2Points)}`
                            : 'LOVE — LOVE'}
                        </div>
                      )}
                    </div>

                    {/* Status ticker */}
                    {padel?.lastEventMessage && (
                      <div className="text-[11px] text-emerald-300 text-center font-mono font-semibold bg-purple-950/80 py-1.5 rounded-xl border border-purple-900">
                        {padel.lastEventMessage}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* 4. Group Tabs: GROUP A | GROUP B | GROUP C | GROUP D | GROUP E */}
      <section id="section-groups-standings">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 px-1">
          <div>
            <h2 className="text-xl sm:text-2xl font-display font-bold text-[#170036] uppercase tracking-tight flex items-center gap-2">
              <Trophy className="w-5 h-5 text-[#170036]" />
              Group Stage Standings & Matches
            </h2>
            <p className="text-xs font-mono font-bold text-slate-800">
              {qualificationText}
            </p>
          </div>

          {/* Group Tabs in WTA Pill Container */}
          <div
            id="group-tabs-selector"
            className="flex items-center gap-1.5 p-1.5 bg-white/90 backdrop-blur-md border border-emerald-400/60 rounded-2xl overflow-x-auto max-w-full shadow-md"
          >
            {groups.map((group) => {
              const isSelected = selectedGroupId === group.id;
              return (
                <button
                  key={group.id}
                  id={`tab-group-${group.id}`}
                  onClick={() => setSelectedGroupId(group.id)}
                  className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-black tracking-wider uppercase transition-all whitespace-nowrap cursor-pointer ${
                    isSelected
                      ? 'bg-[#170036] text-[#00DF81] shadow-md font-black'
                      : 'text-slate-800 hover:bg-emerald-100 hover:text-slate-950 font-extrabold'
                  }`}
                >
                  {group.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Standings Table for Selected Group */}
        <div className="bg-white border border-emerald-300/80 rounded-3xl overflow-hidden shadow-xl mb-8 text-slate-900">
          <div className="px-6 py-4 bg-[#170036] text-white flex items-center justify-between">
            <span className="text-sm sm:text-base font-bold text-[#00DF81] font-display uppercase tracking-wider">
              {currentGroup?.name || 'Group'} — Official Standings Table
            </span>
            <span className="text-xs font-mono text-purple-200">
              Win = {settings?.scoring.pointsForWin ?? 3} pts • Loss ={' '}
              {settings?.scoring.pointsForLoss ?? 0} pt
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" id="table-group-standings">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-mono font-black uppercase tracking-wider text-slate-700">
                  <th className="py-3.5 px-4 w-12 text-center">Pos</th>
                  <th className="py-3.5 px-4">Players</th>
                  <th className="py-3.5 px-3 text-center">MP</th>
                  <th className="py-3.5 px-3 text-center">W</th>
                  <th className="py-3.5 px-3 text-center">L</th>
                  <th className="py-3.5 px-3 text-center font-bold text-slate-800">Diff</th>
                  <th className="py-3.5 px-4 text-center font-bold text-[#170036]">Pts</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {currentStandings.map((row) => (
                  <tr
                    key={row.teamId}
                    id={`standings-row-${row.teamId}`}
                    onClick={() => onSelectTeam(row.teamId)}
                    className={`hover:bg-emerald-50/60 cursor-pointer transition-colors group ${
                      row.qualified ? 'bg-emerald-50/30' : ''
                    }`}
                  >
                    {/* Pos */}
                    <td className="py-3.5 px-4 text-center font-display font-extrabold">
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs ${
                          row.qualified
                            ? 'bg-[#170036] text-[#00DF81] font-black shadow-sm'
                            : 'text-slate-500 font-bold'
                        }`}
                      >
                        {row.position}
                      </span>
                    </td>

                    {/* Players */}
                    <td className="py-3.5 px-4">
                      <div className="font-extrabold text-slate-900 group-hover:text-emerald-700 transition-colors">
                        {pairLabel(row, 'TBD')}
                      </div>
                    </td>

                    {/* MP */}
                    <td className="py-3.5 px-3 text-center text-slate-700 font-semibold font-mono">
                      {row.matchesPlayed}
                    </td>

                    {/* W */}
                    <td className="py-3.5 px-3 text-center font-bold text-emerald-700 font-mono">
                      {row.wins}
                    </td>

                    {/* L */}
                    <td className="py-3.5 px-3 text-center text-slate-500 font-mono">{row.losses}</td>

                    {/* Diff */}
                    <td className="py-3.5 px-3 text-center font-semibold font-mono text-slate-700">
                      {row.scoreDiff > 0 ? `+${row.scoreDiff}` : row.scoreDiff}
                    </td>

                    {/* Pts */}
                    <td className="py-3.5 px-4 text-center font-display font-black text-base text-[#170036]">
                      {row.points}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4 text-center">
                      {row.qualified ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-sm">
                          <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                          QUALIFIED
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500 font-mono font-medium">In Contention</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 5. Group Matches: Completed & Upcoming */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Completed Matches in Group */}
          <div className="bg-white border border-emerald-300/80 rounded-3xl p-5 sm:p-6 shadow-xl text-slate-900">
            <h3 className="text-sm font-display font-bold uppercase tracking-wider text-[#170036] mb-4 flex items-center justify-between pb-3 border-b border-slate-100">
              <span>Completed Matches ({completedMatchesInGroup.length})</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </h3>

            {completedMatchesInGroup.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-6 text-center font-mono">
                No completed matches in this group yet.
              </p>
            ) : (
              <div className="space-y-3">
                {completedMatchesInGroup.map((match) => (
                  <div
                    key={match.id}
                    id={`completed-match-${match.id}`}
                    className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 hover:border-emerald-400 transition-colors shadow-sm"
                  >
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-xs mb-1 font-mono">
                        <span className="text-slate-500 text-[11px] font-bold">
                          Match #{match.matchNumber} • {match.court?.name || 'Court'}
                        </span>
                        {match.completedAt && (
                          <span className="text-[10px] text-slate-400">
                            {new Date(match.completedAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span
                          onClick={() => match.team1?.id && onSelectTeam(match.team1.id)}
                          className={`font-extrabold cursor-pointer hover:underline ${
                            (match.team1Score ?? 0) > (match.team2Score ?? 0)
                              ? 'text-[#170036]'
                              : 'text-slate-500'
                          }`}
                        >
                          {pairLabel(match.team1, 'TBD')}
                        </span>
                        <div className="px-2">
                          <PadelScoreBadge match={match} />
                        </div>
                        <span
                          onClick={() => match.team2?.id && onSelectTeam(match.team2.id)}
                          className={`font-extrabold cursor-pointer hover:underline ${
                            (match.team2Score ?? 0) > (match.team1Score ?? 0)
                              ? 'text-[#170036]'
                              : 'text-slate-500'
                          }`}
                        >
                          {pairLabel(match.team2, 'TBD')}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Matches in Group */}
          <div className="bg-white border border-emerald-300/80 rounded-3xl p-5 sm:p-6 shadow-xl text-slate-900">
            <h3 className="text-sm font-display font-bold uppercase tracking-wider text-[#170036] mb-4 flex items-center justify-between pb-3 border-b border-slate-100">
              <span>Upcoming & Scheduled ({upcomingMatchesInGroup.length})</span>
              <Clock className="w-4 h-4 text-slate-600" />
            </h3>

            {upcomingMatchesInGroup.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-6 text-center font-mono">
                All group matches completed!
              </p>
            ) : (
              <div className="space-y-3">
                {upcomingMatchesInGroup.map((match) => (
                  <div
                    key={match.id}
                    id={`upcoming-match-${match.id}`}
                    className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 hover:border-emerald-400 transition-colors shadow-sm"
                  >
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-xs mb-1.5 font-mono">
                        <span className="text-slate-500 text-[11px] font-bold">
                          Match #{match.matchNumber} • {match.court?.name || 'TBD'}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#170036] text-[#00DF81]">
                          {match.scheduledTime || 'Upcoming'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span
                          onClick={() => match.team1?.id && onSelectTeam(match.team1.id)}
                          className="font-extrabold text-[#170036] cursor-pointer hover:underline"
                        >
                          {pairLabel(match.team1, 'TBD')}
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-400 px-2 uppercase">vs</span>
                        <span
                          onClick={() => match.team2?.id && onSelectTeam(match.team2.id)}
                          className="font-extrabold text-[#170036] cursor-pointer hover:underline"
                        >
                          {pairLabel(match.team2, 'TBD')}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
