import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Clock,
  Radio,
  Trophy,
  Calendar,
  ChevronRight,
  ArrowUpRight,
  Flame,
  XCircle,
} from 'lucide-react';
import { Group, StandingsRow, TournamentSettings } from '../types';
import { EnrichedMatch, SummaryData } from '../api';
import { PadelScoreBadge } from './PadelScoreBadge';
import { StickyHero } from './StickyHero';
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
  onGoToMatches?: () => void;
  onGoToStandings?: () => void;
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
  onGoToMatches,
  onGoToStandings,
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
    <div className="space-y-5 sm:space-y-8 animate-in fade-in duration-300">
      {/* LIVE PADEL SCORES hero: pins to the top while the card below
           scrolls over it, fading out (see StickyHero). */}
      <StickyHero
        id="section-live-scores-hero"
        className="text-center pt-4 sm:pt-6 px-2 pb-8 sm:pb-12"
      >
        <h1 className="font-display font-bold uppercase tracking-tight text-[#0A0A0F] leading-[0.85] text-7xl sm:text-8xl md:text-9xl lg:text-[10rem]">
          Live Padel
          <span className="block">Scores</span>
        </h1>
        <p className="mt-4 sm:mt-6 text-base sm:text-lg lg:text-xl font-mono font-bold text-slate-800">
          See live match scores from every CPA event.
        </p>
      </StickyHero>

      {/* 🔴 Live Matches card — normal flow at full scroll speed; once the
           hero text is pinned this card rises OVER it (z-10 above it). */}
      <div
        id="section-live-matches-card"
        className="relative z-10 overflow-hidden rounded-3xl bg-white shadow-xl text-slate-900"
      >
        {/* 1. Card header: heading + two stacked entry points (rankings on
               top of fixtures, mirroring the subnav hierarchy) */}
        <div className="flex items-start justify-between gap-4 px-5 sm:px-7 pt-7 sm:pt-9 pb-6 sm:pb-8">
          <h2 id="section-live-matches-title" className="font-display font-semibold text-[#0A0A0F] uppercase tracking-tight leading-[0.92] text-5xl sm:text-7xl">
            Live
            <span className="block">Matches</span>
          </h2>

          <div className="shrink-0 flex flex-col items-stretch gap-2.5 sm:gap-3">
            <button
              onClick={onGoToStandings ?? (() => {})}
              className="inline-flex items-center justify-center gap-1.5 px-5 py-2 sm:py-2.5 rounded-[1.5rem] border border-slate-900/40 bg-white text-[#0A0A0F] text-[11px] sm:text-xs font-mono font-bold uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-colors cursor-pointer"
            >
              <Trophy className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              Rankings
            </button>

            <button
              onClick={onGoToMatches ?? onGoToCourts}
              className="inline-flex items-center justify-center gap-1.5 px-5 py-2 sm:py-2.5 rounded-[1.5rem] border border-slate-900/40 bg-white text-[#0A0A0F] text-[11px] sm:text-xs font-mono font-bold uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-colors cursor-pointer"
            >
              <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              Fixtures
            </button>
          </div>
        </div>

        {/* 2. Full-width light band: tournament identity (like WTA's "WTA 125") */}
        <div className="bg-blue-50 border-y border-blue-100 px-5 sm:px-7 py-6 sm:py-7 flex items-center justify-between gap-4">
          <span className="text-3xl sm:text-5xl font-display font-semibold uppercase tracking-wide text-[#0A0A0F] leading-none">
            {settings?.name || 'CPA – INDIA PADEL TOUR QATAR'}
          </span>
          <span className="shrink-0 text-xs sm:text-sm font-mono font-bold uppercase tracking-widest text-blue-800/80">
            Season 1
          </span>
        </div>

        {/* 3. Status bar — a full-bleed black strip stretching edge to edge,
             flush with the band above (no gap) and the card's bottom edge,
             so its corners follow the card's rounding: rectangle with
             round corners, not a pill. */}
        <div className="w-full flex items-center justify-between bg-[#0A0A0F] border-t border-zinc-800 px-5 sm:px-8 py-4 sm:py-5 shadow-lg">
            {/* LIVE (clickable -> courts) */}
            <button
              onClick={onGoToCourts}
              className="flex items-center gap-2 sm:gap-2.5 min-w-0 cursor-pointer group"
            >
              <span className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-[#CCFF00] animate-pulse shrink-0" />
              <span className="text-[10px] sm:text-xs font-mono font-bold uppercase tracking-widest text-white/80 group-hover:text-white transition-colors">
                Live
              </span>
              <span className="text-xl sm:text-3xl font-display font-black text-[#CCFF00] leading-none">
                {summary?.liveMatches ?? 0}
              </span>
            </button>

            <span className="h-5 sm:h-7 w-px bg-white/15 shrink-0" aria-hidden="true" />

            {/* DONE */}
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <CheckCircle2 className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-white/60 shrink-0" />
              <span className="text-[10px] sm:text-xs font-mono font-bold uppercase tracking-widest text-white/80">
                Done
              </span>
              <span className="text-xl sm:text-3xl font-display font-black text-white leading-none">
                {summary?.completedMatches ?? 0}
              </span>
            </div>

            <span className="h-5 sm:h-7 w-px bg-white/15 shrink-0" aria-hidden="true" />

            {/* UPCOMING */}
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <Clock className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-white/60 shrink-0" />
              <span className="text-[10px] sm:text-xs font-mono font-bold uppercase tracking-widest text-white/80">
                Upcoming
              </span>
              <span className="text-xl sm:text-3xl font-display font-black text-white leading-none">
                {summary?.upcomingMatches ?? 0}
              </span>
            </div>
        </div>
      </div>

      {/* 21. Latest Results Section */}
      {latestResults.length > 0 && (
        <section id="section-latest-results">
          <div className="flex items-center justify-between mb-3 sm:mb-3 px-1">
            <h2 className="text-4xl sm:text-5xl font-display font-semibold text-[#0A0A0F] uppercase tracking-tight leading-[0.95]">
              Latest Match Results
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4">
            {latestResults.slice(0, 3).map((match) => {
              const g1 = match.padelState?.team1Games ?? match.team1Score ?? 0;
              const g2 = match.padelState?.team2Games ?? match.team2Score ?? 0;
              const winnerTeam =
                match.walkover === 'both' ? null : g1 > g2 ? match.team1 : match.team2;

              return (
                <div
                  key={match.id}
                  id={`latest-result-${match.id}`}
                  className="relative overflow-hidden rounded-3xl bg-white border border-blue-300/80 p-3.5 sm:p-5 hover:shadow-2xl transition-all shadow-lg group space-y-2.5 sm:space-y-3 text-slate-900"
                >
                  <div className="flex items-center justify-between text-xs pb-2 sm:pb-2.5 border-b border-slate-100">
                    <div className="flex items-center gap-1.5 font-bold text-[#0A0A0F]">
                      <Trophy className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-amber-500" />
                      <span className="text-[11px] sm:text-[11px] font-black uppercase tracking-wider">
                        {match.walkover ? 'WALKOVER' : 'MATCH COMPLETE'}
                      </span>
                    </div>
                    <span className="text-[11px] sm:text-[11px] font-mono text-slate-500 font-semibold">
                      {formatTimeAgo(match.completedAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    {/* Pair 1 — players stacked (mobile-friendly) */}
                    <div
                      onClick={() => match.team1?.id && onSelectTeam(match.team1.id)}
                      className="flex-1 cursor-pointer hover:text-blue-700 transition-colors"
                    >
                      <p
                        className={`text-sm sm:text-lg font-extrabold leading-snug ${
                          g1 > g2 ? 'text-[#0A0A0F]' : 'text-slate-500'
                        }`}
                      >
                        {match.team1?.player1 ?? 'TBD'}
                        <span className="block">{match.team1?.player2 ?? ''}</span>
                      </p>
                    </div>

                    {/* Games Score (WTA Style scoreboard badge) */}
                    <div className="flex-shrink-0 px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-2xl bg-[#0A0A0F] border border-zinc-700 font-mono font-black text-sm sm:text-base shadow-sm">
                      <span className={g1 > g2 ? 'text-yellow-300 font-black' : 'text-slate-400'}>{g1}</span>
                      <span className="text-zinc-400 mx-1.5">—</span>
                      <span className={g2 > g1 ? 'text-yellow-300 font-black' : 'text-slate-400'}>{g2}</span>
                    </div>

                    {/* Pair 2 — players stacked (mobile-friendly) */}
                    <div
                      onClick={() => match.team2?.id && onSelectTeam(match.team2.id)}
                      className="flex-1 text-right cursor-pointer hover:text-blue-700 transition-colors"
                    >
                      <p
                        className={`text-sm sm:text-lg font-extrabold leading-snug ${
                          g2 > g1 ? 'text-[#0A0A0F]' : 'text-slate-500'
                        }`}
                      >
                        {match.team2?.player1 ?? 'TBD'}
                        <span className="block">{match.team2?.player2 ?? ''}</span>
                      </p>
                    </div>
                  </div>

                  {/* Winner Banner */}
                  {winnerTeam && (
                    <div className="pt-2 sm:pt-2.5 border-t border-slate-100 flex items-center justify-between bg-blue-50/60 -mx-3.5 -mb-3.5 px-3.5 sm:-mx-5 sm:-mb-5 sm:px-5 py-2 sm:py-2.5 rounded-b-3xl">
                      <span className="text-slate-600 font-bold uppercase tracking-wider text-[10px]">Winner:</span>
                      <span className="text-blue-800 font-black truncate max-w-[140px] sm:max-w-[200px] flex items-center gap-1 text-xs sm:text-[11px]">
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
          <div className="flex items-center gap-2 mb-3 px-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0A0A0F] animate-ping" />
            <h2 className="text-4xl sm:text-5xl font-display font-semibold text-[#0A0A0F] uppercase tracking-tight leading-[0.95]">
              Live On Court Now
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-4">
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
                    className="rounded-3xl bg-[#0A0A0F] text-white border-2 border-blue-400 shadow-2xl relative overflow-hidden"
                  >
                    {/* Header — two-tone top band (dark blue strip over the ink card) */}
                    <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-3.5 bg-blue-800/50 border-b border-blue-400/40 rounded-t-2xl">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="px-3 py-1 rounded-full bg-[#CCFF00] text-slate-950 text-[10px] sm:text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm shrink-0">
                          <span className="w-2 h-2 rounded-full bg-slate-950 animate-pulse" />
                          LIVE
                        </span>
                        <span className="px-2.5 py-1 rounded-full bg-blue-500/20 border border-blue-400/40 text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-wider text-blue-200 truncate min-w-0">
                          {match.court?.name || 'Assigned Court'}
                        </span>
                      </div>
                      <span className="px-2.5 py-1 rounded-full bg-[#CCFF00]/10 border border-[#CCFF00]/30 text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-wider text-[#CCFF00] shrink-0">
                        {match.group?.name}
                      </span>
                    </div>

                    {/* Body */}
                    <div className="px-4 sm:px-6 py-3 sm:py-4 space-y-3 sm:space-y-4">
                    {/* Teams & Games Count */}
                    <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                      {/* Team 1 */}
                      <div
                        onClick={() => match.team1?.id && onSelectTeam(match.team1.id)}
                        className="p-3 sm:p-3.5 rounded-2xl bg-zinc-800/60 border border-zinc-700/80 text-center cursor-pointer hover:border-blue-400 transition-colors"
                      >
                        <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider text-blue-400 block mb-1.5 truncate">
                          PAIRING 1
                        </span>
                        <div className="text-sm sm:text-base font-bold text-white leading-snug mb-2.5">
                          {match.team1?.player1 ?? 'TBD'}
                          <span className="block">{match.team1?.player2 ?? ''}</span>
                        </div>
                        <div className="pt-2 border-t border-zinc-700">
                          <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 block">
                            GAMES
                          </span>
                          <span className="text-2xl sm:text-3xl font-display font-black text-[#CCFF00] leading-tight">
                            {g1}
                          </span>
                        </div>
                      </div>

                      {/* Team 2 */}
                      <div
                        onClick={() => match.team2?.id && onSelectTeam(match.team2.id)}
                        className="p-3 sm:p-3.5 rounded-2xl bg-zinc-800/60 border border-zinc-700/80 text-center cursor-pointer hover:border-blue-400 transition-colors"
                      >
                        <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider text-blue-400 block mb-1.5 truncate">
                          PAIRING 2
                        </span>
                        <div className="text-sm sm:text-base font-bold text-white leading-snug mb-2.5">
                          {match.team2?.player1 ?? 'TBD'}
                          <span className="block">{match.team2?.player2 ?? ''}</span>
                        </div>
                        <div className="pt-2 border-t border-zinc-700">
                          <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 block">
                            GAMES
                          </span>
                          <span className="text-2xl sm:text-3xl font-display font-black text-[#CCFF00] leading-tight">
                            {g2}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Current Game Point & Golden Point Banner */}
                    <div className="py-3.5 px-3 rounded-2xl bg-slate-950/90 border border-zinc-700 flex flex-col items-center justify-center gap-1 shadow-inner">
                      <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                        Current Game Points
                      </span>
                      {isGolden ? (
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-400 text-slate-950 text-xs font-black animate-pulse">
                          <Flame className="w-4 h-4 text-slate-950" />
                          <span>40 — 40 • GOLDEN POINT</span>
                          <Flame className="w-4 h-4 text-slate-950" />
                        </div>
                      ) : (
                        <div className="text-lg sm:text-xl font-black font-mono text-[#CCFF00] tracking-wide">
                          {padel
                            ? `${formatPointDisplay(padel.team1Points)} — ${formatPointDisplay(padel.team2Points)}`
                            : 'LOVE — LOVE'}
                        </div>
                      )}
                    </div>

                    {/* Status ticker */}
                    {/* (last-event ticker removed — the card ends after the
                        current-game points banner) */}
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* 4. Group Tabs: GROUP A | GROUP B | GROUP C | GROUP D | GROUP E */}
      <section id="section-groups-standings">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-4 px-1">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <Trophy className="w-6 h-6 sm:w-9 sm:h-9 text-[#0A0A0F] shrink-0" />
            <h2 className="text-4xl sm:text-5xl font-display font-semibold text-[#0A0A0F] uppercase tracking-tight leading-[0.95]">
              Group Stage Standings
            </h2>
          </div>

          {/* Group Tabs in WTA Pill Container */}
          <div
            id="group-tabs-selector"
            className="flex items-center gap-1.5 p-1.5 bg-white/90 backdrop-blur-md border border-blue-400/60 rounded-2xl overflow-x-auto max-w-full shadow-md"
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
                      ? 'bg-[#0A0A0F] text-[#CCFF00] shadow-md font-black'
                      : 'text-slate-800 hover:bg-blue-100 hover:text-slate-950 font-extrabold'
                  }`}
                >
                  {group.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Standings Table for Selected Group */}
        <div className="bg-white border border-blue-300/80 rounded-3xl overflow-hidden shadow-xl mb-8 text-slate-900">
          <div className="px-5 sm:px-7 py-5 sm:py-7 bg-[#0A0A0F] text-white flex items-center">
            <span className="text-2xl sm:text-4xl font-display font-semibold uppercase tracking-wide text-[#CCFF00] leading-none min-w-0">
              {currentGroup?.name || 'Group'} — Standings
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" id="table-group-standings">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-mono font-black uppercase tracking-wider text-slate-700">
                  <th className="py-3 px-2.5 w-10 text-center">Pos</th>
                  <th className="py-3 px-2.5">Players</th>
                  <th className="py-3 px-2 text-center">MP</th>
                  <th className="py-3 px-2 text-center">W</th>
                  <th className="py-3 px-2 text-center">L</th>
                  <th className="py-3 px-2 text-center font-bold text-slate-800">Diff</th>
                  <th className="py-3 px-2.5 text-center font-bold text-[#0A0A0F]">Pts</th>
                  <th className="py-3 px-2.5 text-center hidden sm:table-cell">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {currentStandings.map((row) => (
                  <tr
                    key={row.teamId}
                    id={`standings-row-${row.teamId}`}
                    onClick={() => onSelectTeam(row.teamId)}
                    className={`hover:bg-blue-50/60 cursor-pointer transition-colors group ${
                      row.qualified ? 'bg-blue-50/30' : row.eliminated ? 'opacity-60' : ''
                    }`}
                  >
                    {/* Pos */}
                    <td className="py-3 px-2.5 text-center font-display font-extrabold">
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs ${
                          row.qualified
                            ? 'bg-[#0A0A0F] text-[#CCFF00] font-black shadow-sm'
                            : 'text-slate-500 font-bold'
                        }`}
                      >
                        {row.position}
                      </span>
                    </td>

                    {/* Players — keep the "/" attached to a name (nbsp before the
                        slash) so it never floats alone on its own line; the
                        pairing may still wrap between the two names. */}
                    <td className="py-3 px-2.5">
                      <div className="font-extrabold text-slate-900 group-hover:text-blue-700 transition-colors">
                        {pairLabel(row, 'TBD').replace(' / ', '\u00A0/ ')}
                        {row.tossPending && (
                          <span
                            title={`Level on points and game difference: live toss pending (${row.tossPending})`}
                            className="ml-1.5 inline-block px-1.5 py-0.5 rounded-md bg-amber-300 text-slate-950 text-[9px] font-black uppercase tracking-wider align-middle"
                          >
                            Toss
                          </span>
                        )}
                        {row.eliminated && (
                          <span className="sm:hidden ml-1.5 inline-block px-1.5 py-0.5 rounded-md bg-slate-200 text-slate-600 text-[9px] font-black uppercase tracking-wider align-middle">
                            Out
                          </span>
                        )}
                      </div>
                    </td>

                    {/* MP */}
                    <td className="py-3 px-2 text-center text-slate-700 font-semibold font-mono">
                      {row.matchesPlayed}
                    </td>

                    {/* W */}
                    <td className="py-3 px-2 text-center font-bold text-blue-700 font-mono">
                      {row.wins}
                    </td>

                    {/* L */}
                    <td className="py-3 px-2 text-center text-slate-500 font-mono">{row.losses}</td>

                    {/* Diff */}
                    <td className="py-3 px-2 text-center font-semibold font-mono text-slate-700">
                      {row.scoreDiff > 0 ? `+${row.scoreDiff}` : row.scoreDiff}
                    </td>

                    {/* Pts — dark badge with light volt digits so the numbers read
                        clearly at a glance (matches the black pos/score badges). */}
                    <td className="py-3 px-2.5 text-center">
                      <span className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-1.5 rounded-xl bg-[#0A0A0F] border border-zinc-700 font-display font-black text-sm sm:text-base text-[#CCFF00] leading-none tabular-nums shadow-sm">
                        {row.points}
                      </span>
                    </td>

                    {/* Status — hidden on phones (the black pos badge marks
                        qualifiers, the "Out" tag eliminated teams), full pill from sm up. */}
                    <td className="py-3 px-2.5 text-center hidden sm:table-cell">
                      {row.qualified ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-900 border border-blue-300 shadow-sm">
                          <CheckCircle2 className="w-3 h-3 text-blue-700" />
                          QUALIFIED
                        </span>
                      ) : row.eliminated ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-300">
                          <XCircle className="w-3 h-3" />
                          ELIMINATED
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Completed Matches in Group */}
          <div className="bg-white border border-blue-300/80 rounded-3xl p-4 sm:p-5 shadow-xl text-slate-900">
            <h3 className="flex items-center justify-between gap-3 pb-3.5 mb-4 border-b border-slate-100">
              <span className="text-2xl sm:text-3xl font-display font-semibold uppercase tracking-tight leading-none text-[#0A0A0F]">
                Completed
              </span>
              <span className="inline-flex items-center gap-1.5 shrink-0 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-wider text-slate-700">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                {completedMatchesInGroup.length} {completedMatchesInGroup.length === 1 ? 'Match' : 'Matches'}
              </span>
            </h3>

            {completedMatchesInGroup.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-6 text-center font-mono">
                No completed matches in this group yet.
              </p>
            ) : (
              <div className="space-y-2.5 sm:space-y-3">
                {completedMatchesInGroup.map((match) => {
                  const t1Win = (match.team1Score ?? 0) > (match.team2Score ?? 0);
                  const t2Win = (match.team2Score ?? 0) > (match.team1Score ?? 0);
                  return (
                    <div
                      key={match.id}
                      id={`completed-match-${match.id}`}
                      className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-blue-400 transition-colors shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2 font-mono">
                        <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-blue-700 truncate min-w-0">
                          Match #{match.matchNumber} • {match.court?.name || 'Court'}
                        </span>
                        {match.completedAt && (
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {new Date(match.completedAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span
                          onClick={() => match.team1?.id && onSelectTeam(match.team1.id)}
                          className={`flex-1 text-sm sm:text-base font-extrabold leading-snug cursor-pointer hover:underline ${
                            t1Win ? 'text-[#0A0A0F]' : 'text-slate-400'
                          }`}
                        >
                          {pairLabel(match.team1, 'TBD').replace(' / ', '\u00A0/ ')}
                          {t1Win && <span className="ml-1">🏆</span>}
                        </span>
                        <div className="shrink-0">
                          <PadelScoreBadge match={match} />
                        </div>
                        <span
                          onClick={() => match.team2?.id && onSelectTeam(match.team2.id)}
                          className={`flex-1 text-right text-sm sm:text-base font-extrabold leading-snug cursor-pointer hover:underline ${
                            t2Win ? 'text-[#0A0A0F]' : 'text-slate-400'
                          }`}
                        >
                          {pairLabel(match.team2, 'TBD').replace(' / ', '\u00A0/ ')}
                          {t2Win && <span className="ml-1">🏆</span>}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Upcoming Matches in Group */}
          <div className="bg-white border border-blue-300/80 rounded-3xl p-4 sm:p-5 shadow-xl text-slate-900">
            <h3 className="flex items-center justify-between gap-3 pb-3.5 mb-4 border-b border-slate-100">
              <span className="text-2xl sm:text-3xl font-display font-semibold uppercase tracking-tight leading-none text-[#0A0A0F]">
                Upcoming
              </span>
              <span className="inline-flex items-center gap-1.5 shrink-0 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-wider text-slate-700">
                <Clock className="w-3.5 h-3.5 text-slate-600" />
                {upcomingMatchesInGroup.length} {upcomingMatchesInGroup.length === 1 ? 'Match' : 'Matches'}
              </span>
            </h3>

            {upcomingMatchesInGroup.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-6 text-center font-mono">
                All group matches completed!
              </p>
            ) : (
              <div className="space-y-2.5 sm:space-y-3">
                {upcomingMatchesInGroup.map((match) => (
                  <div
                    key={match.id}
                    id={`upcoming-match-${match.id}`}
                    className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-blue-400 transition-colors shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2 font-mono">
                      <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-blue-700 truncate min-w-0">
                        Match #{match.matchNumber} • {match.court?.name || 'TBD'}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#0A0A0F] text-[#CCFF00] shrink-0">
                        {match.scheduledTime || 'Upcoming'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        onClick={() => match.team1?.id && onSelectTeam(match.team1.id)}
                        className="flex-1 text-sm sm:text-base font-extrabold text-[#0A0A0F] leading-snug cursor-pointer hover:underline"
                      >
                        {pairLabel(match.team1, 'TBD').replace(' / ', '\u00A0/ ')}
                      </span>
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-blue-100 border border-blue-200 text-[9px] font-mono font-black text-blue-800 uppercase tracking-wider">
                        vs
                      </span>
                      <span
                        onClick={() => match.team2?.id && onSelectTeam(match.team2.id)}
                        className="flex-1 text-right text-sm sm:text-base font-extrabold text-[#0A0A0F] leading-snug cursor-pointer hover:underline"
                      >
                        {pairLabel(match.team2, 'TBD').replace(' / ', '\u00A0/ ')}
                      </span>
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
