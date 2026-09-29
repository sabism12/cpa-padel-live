import React, { useState } from 'react';
import {
  Trophy,
  Award,
  Crown,
  Sparkles,
  Calendar,
  Clock,
  Radio,
  Shuffle,
  ChevronRight,
  Maximize2,
  ExternalLink,
  Flame,
  CheckCircle2,
  Shield,
  Layers,
  ListFilter,
  X,
  Zap,
} from 'lucide-react';
import { Match, Team, Court, Group, StandingsRow, TournamentSettings, AuthSession } from '../types';
import { EnrichedMatch } from '../api';
import { seedKnockoutFromStandings } from '../api';
import { pairLabel } from '../utils/teamDisplay';

interface KnockoutViewProps {
  matches: EnrichedMatch[];
  teams: Team[];
  courts: Court[];
  groups: Group[];
  standings: Record<string, StandingsRow[]>;
  settings?: TournamentSettings;
  session?: AuthSession | null;
  onSelectTeam: (teamId: string) => void;
  onGoToScorekeeper?: (courtId?: string) => void;
  onNavigateTab?: (tab: 'results' | 'courts' | 'standings' | 'matches' | 'teams') => void;
  onRefreshData?: () => void;
}

// Deterministic badge palette keyed off a stable label (the player pairing).
export function getTeamBadgeInfo(teamKey: string) {
  const name = teamKey || '';
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

  const colors = [
    { bg: 'from-rose-500 to-pink-700', border: 'border-rose-400', text: 'text-white', flag: '🔴' },
    { bg: 'from-sky-500 to-blue-700', border: 'border-sky-400', text: 'text-white', flag: '🔵' },
    { bg: 'from-blue-500 to-sky-700', border: 'border-blue-400', text: 'text-white', flag: '🟢' },
    { bg: 'from-amber-500 to-orange-700', border: 'border-amber-400', text: 'text-slate-950', flag: '🟡' },
    { bg: 'from-blue-500 to-blue-700', border: 'border-zinc-400', text: 'text-white', flag: '🟣' },
    { bg: 'from-cyan-500 to-sky-700', border: 'border-cyan-400', text: 'text-slate-950', flag: '💠' },
  ];

  return colors[hash % colors.length];
}

export const KnockoutView: React.FC<KnockoutViewProps> = ({
  matches,
  teams,
  courts,
  groups,
  standings,
  settings,
  session,
  onSelectTeam,
  onGoToScorekeeper,
  onNavigateTab,
  onRefreshData,
}) => {
  const [viewMode, setViewMode] = useState<'fotmob' | 'bracket' | 'list'>('fotmob');
  const [selectedMatch, setSelectedMatch] = useState<EnrichedMatch | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  // Filter knockout matches
  const knockoutMatches = matches.filter(
    (m) => m.stage === 'knockout' || m.groupId === 'knockout' || m.round !== undefined
  );

  // Match lookup by round & slot
  const qf1 = knockoutMatches.find((m) => m.id === 'match-ko-qf1' || (m.round === 'qf' && m.bracketPosition === 1));
  const qf2 = knockoutMatches.find((m) => m.id === 'match-ko-qf2' || (m.round === 'qf' && m.bracketPosition === 2));
  const qf3 = knockoutMatches.find((m) => m.id === 'match-ko-qf3' || (m.round === 'qf' && m.bracketPosition === 3));
  const qf4 = knockoutMatches.find((m) => m.id === 'match-ko-qf4' || (m.round === 'qf' && m.bracketPosition === 4));

  const sf1 = knockoutMatches.find((m) => m.id === 'match-ko-sf1' || (m.round === 'sf' && m.bracketPosition === 1));
  const sf2 = knockoutMatches.find((m) => m.id === 'match-ko-sf2' || (m.round === 'sf' && m.bracketPosition === 2));

  const finalMatch = knockoutMatches.find((m) => m.id === 'match-ko-final' || m.round === 'final');
  const thirdPlaceMatch = knockoutMatches.find((m) => m.id === 'match-ko-3rd' || m.round === '3rd');

  // Identify Champion
  let championTeam: Team | null = null;
  if (finalMatch && finalMatch.status === 'completed' && finalMatch.team1Score !== null && finalMatch.team2Score !== null) {
    if (finalMatch.team1Score > finalMatch.team2Score) {
      championTeam = finalMatch.team1 || null;
    } else {
      championTeam = finalMatch.team2 || null;
    }
  }

  // Handle Seeding Bracket from Standings (admin only)
  const handleSeedBracket = async () => {
    if (!session?.token) return;
    try {
      setIsSeeding(true);
      await seedKnockoutFromStandings(session.token);
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      alert(err.message || 'Failed to seed bracket');
    } finally {
      setIsSeeding(false);
    }
  };

  // Render Team Node inside Card (site aesthetic: stacked names, no avatars)
  const renderTeamNode = (
    team: Team | undefined,
    score: number | null,
    isWinner: boolean,
    isLoser: boolean,
    fallbackText = 'TBD',
    isDarkCard = false
  ) => {
    const names = team
      ? [team.player1, team.player2].filter(Boolean)
      : [fallbackText];

    const nameClasses = `text-[10px] sm:text-[11px] font-bold leading-tight text-center ${
      isDarkCard
        ? isWinner ? 'text-white' : 'text-zinc-400'
        : isWinner ? 'text-[#0A0A0F] font-black' : isLoser ? 'text-slate-400' : 'text-slate-700'
    }`;

    return (
      <div
        className={`flex flex-col items-center justify-center flex-1 transition-all ${
          isLoser ? 'opacity-35 line-through decoration-slate-400' : ''
        }`}
      >
        {/* Player names (first + second, stacked) */}
        {names.map((name, idx) => (
          <span key={idx} className={nameClasses}>
            {name}
          </span>
        ))}

        {/* Score */}
        <span
          className={`text-sm sm:text-base font-mono font-black mt-0.5 leading-none ${
            isDarkCard
              ? isWinner ? 'text-[#CCFF00] font-black' : 'text-zinc-400'
              : isWinner ? 'text-[#0A0A0F] font-black' : 'text-slate-500'
          }`}
        >
          {score !== null && score !== undefined ? score : '-'}
        </span>
      </div>
    );
  };

  // Render a Single FotMob Match Card
  const renderMatchCard = (
    match: EnrichedMatch | undefined,
    badgeType?: 'final' | '3rd' | 'qf' | 'sf',
    customLabel?: string
  ) => {
    if (!match) {
      return (
        <div className="w-full max-w-[9.5rem] h-20 rounded-2xl bg-zinc-900/60 border-2 border-dashed border-zinc-700 flex items-center justify-center text-xs font-mono font-bold text-zinc-500">
          Match TBD
        </div>
      );
    }

    const isLive = match.status === 'live';
    const isCompleted = match.status === 'completed';
    const t1Score = match.team1Score;
    const t2Score = match.team2Score;

    const t1Wins = isCompleted && t1Score !== null && t2Score !== null && t1Score > t2Score;
    const t2Wins = isCompleted && t1Score !== null && t2Score !== null && t2Score > t1Score;

    return (
      <div
        onClick={() => setSelectedMatch(match)}
        className={`group relative p-2 sm:p-2.5 rounded-2xl transition-all duration-200 cursor-pointer select-none flex flex-col justify-between bg-[#0A0A0F] text-white ${
          badgeType === 'final'
            ? 'w-full max-w-[13rem] border-2 border-amber-400 shadow-xl shadow-amber-500/25 hover:border-amber-300 hover:shadow-amber-400/40'
            : badgeType === '3rd'
            ? 'w-full max-w-[13rem] border-2 border-sky-400 shadow-lg shadow-sky-500/25 hover:border-sky-300 hover:shadow-sky-400/40'
            : isLive
            ? 'w-full max-w-[9.5rem] border-2 border-[#CCFF00] shadow-lg hover:scale-105'
            : 'w-full max-w-[9.5rem] border-2 border-zinc-700 shadow-lg hover:border-blue-400 hover:-translate-y-0.5'
        }`}
      >
        {/* Match Top Teams Container */}
        <div className="flex items-center justify-between gap-1">
          {renderTeamNode(match.team1, t1Score, t1Wins, t2Wins, 'T1', true)}
          
          <div className="text-[10px] text-zinc-500 font-mono font-bold px-0.5 self-center">
            vs
          </div>

          {renderTeamNode(match.team2, t2Score, t2Wins, t1Wins, 'T2', true)}
        </div>

        {/* Badge Indicator at Bottom */}
        <div className="mt-2 flex items-center justify-center">
          {badgeType === 'final' ? (
            <span className="px-3 py-1 rounded-full bg-amber-400 text-slate-950 font-black text-[10px] sm:text-[11px] uppercase tracking-wider shadow-md shadow-amber-500/40 flex items-center gap-1">
              <Crown className="w-3 h-3" />
              FINAL
            </span>
          ) : badgeType === '3rd' ? (
            <span className="px-3 py-1 rounded-full bg-sky-500 text-white font-black text-[10px] sm:text-[11px] uppercase tracking-wider shadow-md shadow-sky-500/40 flex items-center gap-1">
              <Award className="w-3 h-3" />
              3rd
            </span>
          ) : isLive ? (
            <span className="px-2 py-0.5 rounded-full bg-[#CCFF00] text-slate-950 font-black text-[9px] uppercase tracking-wider animate-pulse flex items-center gap-1 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-950 animate-ping" />
              LIVE
            </span>
          ) : isCompleted ? (
            <span className="text-[10px] font-mono font-bold text-slate-500">
              FT · {match.scheduledTime}
            </span>
          ) : (
            <span className="text-[10px] font-mono font-bold text-slate-500">
              {match.scheduledTime || 'Upcoming'}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300 max-w-6xl mx-auto">
      {/* 1. HEADER — huge hero like "Live Padel Scores" (no badge, no subtitle,
          no sub-nav tabs). The Tree/Bracket/List toggle is kept, restyled to
          the site's pill language. */}
      <div className="text-center pt-4 sm:pt-6 px-2 pb-4 sm:pb-8">
        <h2 className="font-display font-bold uppercase tracking-tight text-[#0A0A0F] leading-[0.85] text-7xl sm:text-8xl md:text-9xl lg:text-[10rem]">
          Knockout
          <span className="block">Stage</span>
        </h2>

        <div className="mt-6 sm:mt-8 flex items-center justify-center gap-1.5 p-1.5 bg-white/90 backdrop-blur-md border border-blue-400/60 rounded-2xl shadow-md w-max mx-auto">
          {session?.role === 'admin' && (
            <button
              onClick={handleSeedBracket}
              disabled={isSeeding}
              className="px-3 sm:px-4 py-2 rounded-xl bg-[#0A0A0F] text-[#CCFF00] text-xs sm:text-sm font-black tracking-wider uppercase transition-all cursor-pointer whitespace-nowrap"
              title="Seed bracket matches from current group standings"
            >
              <Shuffle className={`w-3.5 h-3.5 inline-block mr-1 ${isSeeding ? 'animate-spin' : ''}`} />
              {isSeeding ? 'Seeding...' : 'Seed'}
            </button>
          )}
          {([
            ['fotmob', 'Tree'],
            ['bracket', 'Bracket'],
            ['list', 'List'],
          ] as const).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-black tracking-wider uppercase transition-all whitespace-nowrap cursor-pointer ${
                viewMode === mode
                  ? 'bg-[#0A0A0F] text-[#CCFF00] shadow-md'
                  : 'text-slate-800 hover:bg-blue-100 hover:text-slate-950'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. MAIN KNOCKOUT DISPLAY — vertical tree (rounds stacked top to
          bottom) so it fits a phone screen with no horizontal scrolling.
          Dark ink panel matching the site's card language. */}
      {viewMode === 'fotmob' && (
        <div className="relative px-3 sm:px-6 py-6 sm:py-8 rounded-3xl bg-[#0A0A0F] border-2 border-blue-400/60 shadow-2xl text-white">
          <div className="relative max-w-md mx-auto flex flex-col items-center">
            {/* ROUND 1: QUARTER-FINALS (2x2 grid on phones, 4-up from sm) */}
            <div className="w-full grid grid-cols-2 gap-3 justify-items-center">
              {([
                ['QF 1', qf1],
                ['QF 2', qf2],
                ['QF 3', qf3],
                ['QF 4', qf4],
              ] as const).map(([label, match]) => (
                <div key={label} className="flex flex-col items-center w-full">
                  <span className="text-[10px] font-mono uppercase text-zinc-400 font-bold mb-1">{label}</span>
                  {renderMatchCard(match, 'qf')}
                </div>
              ))}
            </div>

            {/* Connector into semis */}
            <div className="w-px h-7 bg-blue-400/60 my-1" />

            {/* ROUND 2: SEMI-FINALS */}
            <div className="w-full grid grid-cols-2 gap-3 justify-items-center">
              {([
                ['Semi-Final 1', sf1],
                ['Semi-Final 2', sf2],
              ] as const).map(([label, match]) => (
                <div key={label} className="flex flex-col items-center w-full">
                  <span className="text-[10px] font-mono uppercase text-zinc-400 font-bold mb-1">{label}</span>
                  {renderMatchCard(match, 'sf')}
                </div>
              ))}
            </div>

            {/* Connector into finals */}
            <div className="w-px h-7 bg-blue-400/60 my-1" />

            {/* ROUND 3: 3RD PLACE + GRAND FINAL (stacked) */}
            <div className="w-full flex flex-col items-center gap-5">
              <div className="flex flex-col items-center">
                <div className="text-xs sm:text-sm font-mono uppercase text-sky-300 font-black mb-1.5 flex items-center gap-1.5 tracking-widest drop-shadow-[0_0_10px_rgba(56,189,248,0.6)]">
                  <Award className="w-4 h-4" />
                  <span>3rd Place Playoff</span>
                </div>
                {renderMatchCard(thirdPlaceMatch, '3rd')}
              </div>

              <div className="flex flex-col items-center">
                <div className="text-base sm:text-xl font-display uppercase text-amber-300 font-bold mb-2 flex items-center gap-2 tracking-widest drop-shadow-[0_0_12px_rgba(251,191,36,0.65)]">
                  <Crown className="w-5 h-5" />
                  <span>Tournament Final</span>
                </div>
                {renderMatchCard(finalMatch, 'final')}
              </div>
            </div>

            {/* Connector into champion */}
            <div className="w-px h-7 bg-blue-400/60 my-1" />

            {/* CHAMPION TROPHY SPOTLIGHT */}
            <div className="flex flex-col items-center justify-center p-5 rounded-3xl bg-gradient-to-b from-amber-400/15 via-zinc-900 to-amber-400/10 border-2 border-amber-400 shadow-xl shadow-amber-500/10 min-w-[160px] sm:min-w-[180px] text-center group hover:scale-105 transition-transform duration-300">
              {/* Cup Trophy Icon */}
              <div className="relative mb-2">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-600 p-0.5 shadow-xl shadow-amber-500/30 flex items-center justify-center">
                  <div className="w-full h-full bg-[#0A0A0F] rounded-2xl flex items-center justify-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-amber-500/10 animate-pulse" />
                    <Trophy className="w-9 h-9 sm:w-11 sm:h-11 text-yellow-300 drop-shadow-md" />
                  </div>
                </div>
                {/* Badge emblem overlay */}
                {championTeam && (
                  <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-gradient-to-br from-red-600 to-amber-600 border-2 border-white flex items-center justify-center shadow-lg">
                    <span className="text-[10px]">🏆</span>
                  </div>
                )}
              </div>

              {/* Champion Name */}
              <div className="font-sans text-base sm:text-lg font-bold text-white tracking-tight line-clamp-1">
                {championTeam ? pairLabel(championTeam) : 'TBD'}
              </div>

              {/* CHAMPION Label */}
              <div className="text-xs font-mono font-black text-amber-400 uppercase tracking-widest mt-0.5 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>CHAMPION</span>
              </div>

              {championTeam && (
                <div className="text-[10px] text-zinc-400 mt-1 font-mono font-bold">
                  Group {championTeam.groupId?.replace('group-', '').toUpperCase()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. CLASSIC HORIZONTAL BRACKET VIEW */}
      {viewMode === 'bracket' && (
        <div className="p-6 rounded-3xl bg-[#0A0A0F] border-2 border-blue-400/60 overflow-x-auto shadow-xl">
          <div className="min-w-[700px] grid grid-cols-3 gap-8 items-center">
            {/* Column 1: Quarter-Finals */}
            <div className="space-y-6">
              <div className="text-xs font-mono font-black uppercase text-[#CCFF00] tracking-wider flex items-center gap-2 pb-2 border-b border-zinc-800">
                <span className="w-2 h-2 rounded-full bg-[#CCFF00]" />
                Quarter-Finals
              </div>
              <div className="space-y-4">
                {renderMatchCard(qf1, 'qf')}
                {renderMatchCard(qf2, 'qf')}
                {renderMatchCard(qf3, 'qf')}
                {renderMatchCard(qf4, 'qf')}
              </div>
            </div>

            {/* Column 2: Semi-Finals */}
            <div className="space-y-12">
              <div className="text-xs font-mono font-black uppercase text-[#CCFF00] tracking-wider flex items-center gap-2 pb-2 border-b border-zinc-800">
                <span className="w-2 h-2 rounded-full bg-sky-400" />
                Semi-Finals
              </div>
              <div className="space-y-16">
                {renderMatchCard(sf1, 'sf')}
                {renderMatchCard(sf2, 'sf')}
              </div>
            </div>

            {/* Column 3: Finals & 3rd Place */}
            <div className="space-y-8">
              <div className="text-xs font-mono font-black uppercase text-amber-400 tracking-wider flex items-center gap-2 pb-2 border-b border-zinc-800">
                <Crown className="w-3.5 h-3.5" />
                Grand Final & 3rd Place
              </div>
              <div className="space-y-6">
                <div className="space-y-1">
                  <span className="text-[10px] font-mono text-amber-400 font-bold">CHAMPIONSHIP</span>
                  {renderMatchCard(finalMatch, 'final')}
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-mono text-sky-400 font-bold">3RD PLACE PLAYOFF</span>
                  {renderMatchCard(thirdPlaceMatch, '3rd')}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. LIST VIEW */}
      {viewMode === 'list' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {knockoutMatches.map((m) => {
              const court = courts.find((c) => c.id === m.courtId);
              const isFinal = m.round === 'final';
              const is3rd = m.round === '3rd';
              const isLive = m.status === 'live';
              const t1Wins = m.team1Score !== null && m.team2Score !== null && m.team1Score > m.team2Score;
              const t2Wins = m.team1Score !== null && m.team2Score !== null && m.team2Score > m.team1Score;

              return (
                <div
                  key={m.id}
                  onClick={() => setSelectedMatch(m)}
                  className={`p-4 rounded-2xl border shadow-xl transition-all cursor-pointer text-slate-900 ${
                    isFinal
                      ? 'bg-[#0A0A0F] text-white border-amber-400'
                      : is3rd
                      ? 'bg-[#0A0A0F] text-white border-sky-400'
                      : isLive
                      ? 'bg-[#0A0A0F] text-white border-[#CCFF00]'
                      : 'bg-white border-blue-300/80 hover:border-blue-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3 text-xs font-mono">
                    <span className={`font-bold uppercase tracking-wider ${isFinal || is3rd || isLive ? 'text-zinc-400' : 'text-blue-700'}`}>
                      Match #{m.matchNumber} · {m.round?.toUpperCase() || 'KO'}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={isFinal || is3rd || isLive ? 'text-zinc-400' : 'text-slate-500'}>
                        {court?.name || 'Center Court'}
                      </span>
                      {isFinal && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black">
                          FINAL
                        </span>
                      )}
                      {is3rd && (
                        <span className="px-2 py-0.5 rounded-full bg-sky-500 text-white text-[10px] font-black">
                          3RD
                        </span>
                      )}
                      {isLive && (
                        <span className="px-2 py-0.5 rounded-full bg-[#CCFF00] text-slate-950 text-[10px] font-black animate-pulse">
                          LIVE
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className={`font-bold text-sm ${isFinal || is3rd || isLive ? (t1Wins ? 'text-white' : 'text-zinc-400') : t1Wins ? 'text-[#0A0A0F]' : 'text-slate-400'}`}>
                        {pairLabel(m.team1, 'TBD').replace(' / ', '\u00A0/ ')}
                      </div>
                      <div className={`font-bold text-sm ${isFinal || is3rd || isLive ? (t2Wins ? 'text-white' : 'text-zinc-400') : t2Wins ? 'text-[#0A0A0F]' : 'text-slate-400'}`}>
                        {pairLabel(m.team2, 'TBD').replace(' / ', '\u00A0/ ')}
                      </div>
                    </div>

                    <div className="text-right font-mono font-black text-lg space-y-1">
                      <div className={(isFinal || is3rd || isLive) ? (t1Wins ? 'text-[#CCFF00]' : 'text-zinc-400') : t1Wins ? 'text-[#0A0A0F]' : 'text-slate-400'}>
                        {m.team1Score !== null ? m.team1Score : '-'}
                      </div>
                      <div className={(isFinal || is3rd || isLive) ? (t2Wins ? 'text-[#CCFF00]' : 'text-zinc-400') : t2Wins ? 'text-[#0A0A0F]' : 'text-slate-400'}>
                        {m.team2Score !== null ? m.team2Score : '-'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. MATCH DETAIL MODAL */}
      {selectedMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative animate-in zoom-in-95 duration-150">
            <button
              onClick={() => setSelectedMatch(null)}
              className="absolute top-5 right-5 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <span className="px-2.5 py-1 rounded-lg bg-slate-800 font-mono text-xs font-bold text-slate-300">
                Match #{selectedMatch.matchNumber}
              </span>
              <span className="text-xs font-mono text-slate-400">
                {selectedMatch.round?.toUpperCase() || 'Knockout'} · {selectedMatch.scheduledTime}
              </span>
            </div>

            {/* Matchup Header */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 mb-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 text-left">
                  <div className="font-bold text-sm text-white leading-tight">
                    {pairLabel(selectedMatch.team1, 'TBD')}
                  </div>
                </div>

                <div className="font-mono font-black text-2xl text-lime-400 px-3">
                  {selectedMatch.team1Score !== null && selectedMatch.team2Score !== null
                    ? `${selectedMatch.team1Score} - ${selectedMatch.team2Score}`
                    : 'vs'}
                </div>

                <div className="flex-1 text-right">
                  <div className="font-bold text-sm text-white leading-tight">
                    {pairLabel(selectedMatch.team2, 'TBD')}
                  </div>
                </div>
              </div>
            </div>

            {/* Match Details */}
            <div className="space-y-2 text-xs text-slate-300 mb-6">
              <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Court Assignment</span>
                <span className="font-semibold text-white">
                  {selectedMatch.court?.name || 'Court 1 (Center)'}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Status</span>
                <span className="font-semibold uppercase tracking-wider text-lime-400">
                  {selectedMatch.status}
                </span>
              </div>
              {selectedMatch.completedAt && (
                <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                  <span className="text-slate-400">Completed At</span>
                  <span className="font-mono text-slate-300">
                    {new Date(selectedMatch.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
              {selectedMatch.submittedBy && (
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">Official Official/Referee</span>
                  <span className="text-slate-300">{selectedMatch.submittedBy}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              {onGoToScorekeeper && (
                <button
                  onClick={() => {
                    const courtId = selectedMatch.courtId || 'court-1';
                    setSelectedMatch(null);
                    onGoToScorekeeper(courtId);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-lime-400/20"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Score in Terminal</span>
                </button>
              )}
              <button
                onClick={() => setSelectedMatch(null)}
                className="py-2.5 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
