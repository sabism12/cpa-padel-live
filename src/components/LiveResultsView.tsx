import React, { useState, useRef, useEffect } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
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

  const perGroup = settings?.scoring.qualifiersPerGroup ?? 2;
  const wildcards = settings?.scoring.wildcardQualifiers ?? 0;

  // Reference-style hero transition, in two phases:
  //  1) the LIVE PADEL SCORES headline scrolls up at page speed until it
  //     reaches the top of the viewport (no early animation);
  //  2) it pins there, and the LIVE MATCHES card keeps rising over it —
  //     while the card covers the text, it shrinks and fades out gradually.
  // The pin point and cover distance are measured from the real layout, so
  // they stay correct on any screen size or mid-page reload.
  const pinRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [pinScroll, setPinScroll] = useState(0);
  const [coverDistance, setCoverDistance] = useState(1);
  useEffect(() => {
    const measure = () => {
      const pinEl = pinRef.current;
      const cardEl = cardRef.current;
      if (!pinEl || !cardEl) return;
      const y = window.scrollY;
      const pinTop = pinEl.getBoundingClientRect().top + y;
      const cardTop = cardEl.getBoundingClientRect().top + y;
      setPinScroll(Math.max(0, pinTop));
      setCoverDistance(Math.max(1, cardTop - pinTop));
    };
    measure();
    window.addEventListener('resize', measure);
    // Re-measure once webfonts settle (they change the hero text height).
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(measure).catch(() => undefined);
    }
    const t = window.setTimeout(measure, 600);
    return () => {
      window.removeEventListener('resize', measure);
      window.clearTimeout(t);
    };
  }, []);

  const { scrollY } = useScroll();
  // Phase 1: hero rides the page normally (y = 0). Phase 2 (after the text
  // has reached the top): keep it visually pinned by offsetting page scroll.
  const heroY = useTransform(scrollY, (v) => Math.max(0, v - pinScroll));
  // Covered depth of the pinned text, 0 -> 1 while the card rises over it.
  const cover = useTransform(scrollY, (v) =>
    Math.min(1, Math.max(0, (v - pinScroll) / coverDistance))
  );
  const heroOpacity = useTransform(cover, [0, 1], [1, 0]);
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
    <div className="space-y-5 sm:space-y-8 animate-in fade-in duration-300">
      {/* LIVE PADEL SCORES hero. Phase 1: scrolls normally to the top. The
           wrapper (pinRef) provides the layout anchor for the pin point. */}
      <div ref={pinRef} className="relative pb-8 sm:pb-12">
        <motion.section
          id="section-live-scores-hero"
          style={{ y: heroY, opacity: heroOpacity }}
          className="relative z-0 text-center pt-4 sm:pt-6 px-2 will-change-transform pointer-events-none"
        >
        <h1 className="font-display font-bold uppercase tracking-tight text-[#0A0A0F] leading-[0.85] text-7xl sm:text-8xl md:text-9xl lg:text-[10rem]">
          Live Padel
          <span className="block">Scores</span>
        </h1>
        <p className="mt-4 sm:mt-6 text-base sm:text-lg lg:text-xl font-mono font-bold text-slate-800">
          See live match scores from every CPA event.
        </p>
        </motion.section>
      </div>

      {/* 🔴 Live Matches card — normal flow at full scroll speed; once the
           hero text is pinned this card rises OVER it (z-10 above it). */}
      <div
        ref={cardRef}
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
            {settings?.name || 'CPA PADEL TOURNAMENT'}
          </span>
          <span className="shrink-0 text-xs sm:text-sm font-mono font-bold uppercase tracking-widest text-blue-800/80">
            Season 2026
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
              const winnerTeam = g1 > g2 ? match.team1 : match.team2;

              return (
                <div
                  key={match.id}
                  id={`latest-result-${match.id}`}
                  className="relative overflow-hidden rounded-3xl bg-white border border-blue-300/80 p-3.5 sm:p-5 hover:shadow-2xl transition-all shadow-lg group space-y-2.5 sm:space-y-3 text-slate-900"
                >
                  <div className="flex items-center justify-between text-xs pb-2 sm:pb-2.5 border-b border-slate-100">
                    <div className="flex items-center gap-1.5 font-bold text-[#0A0A0F]">
                      <Trophy className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-amber-500" />
                      <span className="text-[11px] sm:text-[11px] font-black uppercase tracking-wider">MATCH COMPLETE</span>
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
                    className="rounded-3xl bg-[#0A0A0F] text-white border-2 border-blue-400 p-4 sm:p-6 shadow-2xl relative overflow-hidden space-y-3 sm:space-y-4"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-zinc-700/60">
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 rounded-full bg-[#CCFF00] text-slate-950 text-[10px] sm:text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm shrink-0">
                          <span className="w-2 h-2 rounded-full bg-slate-950 animate-pulse" />
                          LIVE
                        </span>
                        <span className="px-2.5 py-1 rounded-full bg-blue-500/15 border border-blue-400/30 text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-wider text-blue-300 truncate min-w-0">
                          {match.court?.name || 'Assigned Court'}
                        </span>
                      </div>
                      <span className="px-2.5 py-1 rounded-full bg-[#CCFF00]/10 border border-[#CCFF00]/30 text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-wider text-[#CCFF00] shrink-0">
                        {match.group?.name}
                      </span>
                    </div>

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
                    {padel?.lastEventMessage && (
                      <div className="text-[11px] text-blue-300 text-center font-mono font-semibold bg-zinc-800/80 py-1.5 rounded-xl border border-zinc-700">
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
            <h2 className="text-xl sm:text-2xl font-display font-bold text-[#0A0A0F] uppercase tracking-tight flex items-center gap-2">
              <Trophy className="w-5 h-5 text-[#0A0A0F]" />
              Group Stage Standings & Matches
            </h2>
            <p className="text-xs font-mono font-bold text-slate-800">
              {qualificationText}
            </p>
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
          <div className="px-6 py-4 bg-[#0A0A0F] text-white flex items-center justify-between">
            <span className="text-sm sm:text-base font-bold text-[#CCFF00] font-display uppercase tracking-wider">
              {currentGroup?.name || 'Group'} — Official Standings Table
            </span>
            <span className="text-xs font-mono text-zinc-300">
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
                  <th className="py-3.5 px-4 text-center font-bold text-[#0A0A0F]">Pts</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {currentStandings.map((row) => (
                  <tr
                    key={row.teamId}
                    id={`standings-row-${row.teamId}`}
                    onClick={() => onSelectTeam(row.teamId)}
                    className={`hover:bg-blue-50/60 cursor-pointer transition-colors group ${
                      row.qualified ? 'bg-blue-50/30' : ''
                    }`}
                  >
                    {/* Pos */}
                    <td className="py-3.5 px-4 text-center font-display font-extrabold">
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

                    {/* Players */}
                    <td className="py-3.5 px-4">
                      <div className="font-extrabold text-slate-900 group-hover:text-blue-700 transition-colors">
                        {pairLabel(row, 'TBD')}
                      </div>
                    </td>

                    {/* MP */}
                    <td className="py-3.5 px-3 text-center text-slate-700 font-semibold font-mono">
                      {row.matchesPlayed}
                    </td>

                    {/* W */}
                    <td className="py-3.5 px-3 text-center font-bold text-blue-700 font-mono">
                      {row.wins}
                    </td>

                    {/* L */}
                    <td className="py-3.5 px-3 text-center text-slate-500 font-mono">{row.losses}</td>

                    {/* Diff */}
                    <td className="py-3.5 px-3 text-center font-semibold font-mono text-slate-700">
                      {row.scoreDiff > 0 ? `+${row.scoreDiff}` : row.scoreDiff}
                    </td>

                    {/* Pts */}
                    <td className="py-3.5 px-4 text-center font-display font-black text-base text-[#0A0A0F]">
                      {row.points}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4 text-center">
                      {row.qualified ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-900 border border-blue-300 shadow-sm">
                          <CheckCircle2 className="w-3 h-3 text-blue-700" />
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
          <div className="bg-white border border-blue-300/80 rounded-3xl p-5 sm:p-6 shadow-xl text-slate-900">
            <h3 className="text-sm font-display font-bold uppercase tracking-wider text-[#0A0A0F] mb-4 flex items-center justify-between pb-3 border-b border-slate-100">
              <span>Completed Matches ({completedMatchesInGroup.length})</span>
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
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
                    className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 hover:border-blue-400 transition-colors shadow-sm"
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
                              ? 'text-[#0A0A0F]'
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
                              ? 'text-[#0A0A0F]'
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
          <div className="bg-white border border-blue-300/80 rounded-3xl p-5 sm:p-6 shadow-xl text-slate-900">
            <h3 className="text-sm font-display font-bold uppercase tracking-wider text-[#0A0A0F] mb-4 flex items-center justify-between pb-3 border-b border-slate-100">
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
                    className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 hover:border-blue-400 transition-colors shadow-sm"
                  >
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-xs mb-1.5 font-mono">
                        <span className="text-slate-500 text-[11px] font-bold">
                          Match #{match.matchNumber} • {match.court?.name || 'TBD'}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#0A0A0F] text-[#CCFF00]">
                          {match.scheduledTime || 'Upcoming'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span
                          onClick={() => match.team1?.id && onSelectTeam(match.team1.id)}
                          className="font-extrabold text-[#0A0A0F] cursor-pointer hover:underline"
                        >
                          {pairLabel(match.team1, 'TBD')}
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-400 px-2 uppercase">vs</span>
                        <span
                          onClick={() => match.team2?.id && onSelectTeam(match.team2.id)}
                          className="font-extrabold text-[#0A0A0F] cursor-pointer hover:underline"
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
