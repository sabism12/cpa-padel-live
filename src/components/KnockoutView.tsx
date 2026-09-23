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
import { pairLabel, lastName } from '../utils/teamDisplay';

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
    { bg: 'from-emerald-500 to-teal-700', border: 'border-emerald-400', text: 'text-white', flag: '🟢' },
    { bg: 'from-amber-500 to-orange-700', border: 'border-amber-400', text: 'text-slate-950', flag: '🟡' },
    { bg: 'from-purple-500 to-indigo-700', border: 'border-purple-400', text: 'text-white', flag: '🟣' },
    { bg: 'from-cyan-500 to-teal-700', border: 'border-cyan-400', text: 'text-slate-950', flag: '💠' },
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

  // Render Team Node inside Card (WTA / FotMob Style)
  const renderTeamNode = (
    team: Team | undefined,
    score: number | null,
    isWinner: boolean,
    isLoser: boolean,
    fallbackText = 'TBD',
    isDarkCard = false
  ) => {
    const badge = team
      ? getTeamBadgeInfo(pairLabel(team, fallbackText))
      : { bg: 'from-slate-700 to-slate-800', border: 'border-slate-600', text: 'text-slate-400', flag: '⚪' };

    const surnames = team
      ? [lastName(team.player1), lastName(team.player2)].filter(Boolean)
      : [fallbackText];

    const surnameClasses = `text-[10px] sm:text-[11px] font-bold leading-tight text-center ${
      isDarkCard
        ? isWinner ? 'text-white' : 'text-slate-400'
        : isWinner ? 'text-[#170036] font-black' : isLoser ? 'text-slate-400' : 'text-slate-700'
    }`;

    return (
      <div
        className={`flex flex-col items-center justify-center flex-1 transition-all ${
          isLoser ? 'opacity-35 line-through decoration-slate-400' : ''
        }`}
      >
        {/* Flag / Circular Avatar */}
        <div
          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br ${badge.bg} border ${badge.border} flex items-center justify-center shadow-md mb-1 relative`}
        >
          <span className="text-[11px] select-none">{badge.flag}</span>
        </div>

        {/* Player surnames */}
        {surnames.map((surname, idx) => (
          <span key={idx} className={surnameClasses}>
            {surname}
          </span>
        ))}

        {/* Score */}
        <span
          className={`text-sm sm:text-base font-mono font-black mt-0.5 leading-none ${
            isDarkCard
              ? isWinner ? 'text-yellow-300 font-black' : 'text-slate-400'
              : isWinner ? 'text-[#170036] font-black' : 'text-slate-500'
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
        <div className="w-32 sm:w-36 h-20 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-xs font-mono font-bold text-slate-400">
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
    const isDark = badgeType === 'final' || badgeType === '3rd' || isLive;

    return (
      <div
        onClick={() => setSelectedMatch(match)}
        className={`group relative w-32 sm:w-36 p-2 sm:p-2.5 rounded-2xl transition-all duration-200 cursor-pointer select-none flex flex-col justify-between ${
          badgeType === 'final'
            ? 'bg-[#170036] border-2 border-amber-400 shadow-xl text-white hover:border-amber-300'
            : badgeType === '3rd'
            ? 'bg-[#170036] border-2 border-sky-400 shadow-lg text-white hover:border-sky-300'
            : isLive
            ? 'bg-[#170036] border-2 border-emerald-400 shadow-lg text-white hover:scale-105'
            : 'bg-slate-50 border-2 border-slate-200 hover:border-emerald-500 shadow-md hover:-translate-y-0.5 text-slate-900'
        }`}
      >
        {/* Match Top Teams Container */}
        <div className="flex items-center justify-between gap-1">
          {renderTeamNode(match.team1, t1Score, t1Wins, t2Wins, 'T1', isDark)}
          
          <div className="text-[10px] text-slate-400 font-mono font-bold px-0.5 self-center">
            vs
          </div>

          {renderTeamNode(match.team2, t2Score, t2Wins, t1Wins, 'T2', isDark)}
        </div>

        {/* Badge Indicator at Bottom */}
        <div className="mt-2 flex items-center justify-center">
          {badgeType === 'final' ? (
            <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black text-[9px] uppercase tracking-wider shadow-sm flex items-center gap-1">
              <Crown className="w-2.5 h-2.5" />
              FINAL
            </span>
          ) : badgeType === '3rd' ? (
            <span className="px-2.5 py-0.5 rounded-full bg-sky-500 text-white font-black text-[9px] uppercase tracking-wider shadow-sm flex items-center gap-1">
              <Award className="w-2.5 h-2.5" />
              3rd
            </span>
          ) : isLive ? (
            <span className="px-2 py-0.5 rounded-full bg-[#00DF81] text-slate-950 font-black text-[9px] uppercase tracking-wider animate-pulse flex items-center gap-1 shadow-sm">
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
    <div className="space-y-6 animate-in fade-in duration-300 max-w-6xl mx-auto">
      {/* 1. TOP HEADER & SUB-NAV (Exact FotMob Style) */}
      <div className="space-y-3">
        {/* Season & Quick Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-emerald-400/40">
          <div className="flex items-center gap-3">
            <div className="px-3 py-1 rounded-xl bg-white border border-emerald-300 text-xs font-mono font-bold text-slate-900 flex items-center gap-2 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-[#00DF81]" />
              <span>{settings?.date || '2026 Season Finals'}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-display font-bold text-[#170036] tracking-tight uppercase">
              Knockout Stage
            </h1>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            {session?.role === 'admin' && (
              <button
                onClick={handleSeedBracket}
                disabled={isSeeding}
                className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-emerald-300 text-xs font-bold text-slate-900 transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                title="Seed bracket matches from current group standings"
              >
                <Shuffle className={`w-3.5 h-3.5 ${isSeeding ? 'animate-spin text-emerald-600' : 'text-slate-600'}`} />
                <span>{isSeeding ? 'Seeding...' : 'Seed from Standings'}</span>
              </button>
            )}

            {/* View Mode Toggle */}
            <div className="flex items-center bg-white border border-emerald-400/60 rounded-xl p-0.5 shadow-sm">
              <button
                onClick={() => setViewMode('fotmob')}
                className={`px-3 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                  viewMode === 'fotmob'
                    ? 'bg-[#170036] text-[#00DF81] shadow-sm'
                    : 'text-slate-700 hover:text-slate-950 font-bold'
                }`}
              >
                Tree
              </button>
              <button
                onClick={() => setViewMode('bracket')}
                className={`px-3 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                  viewMode === 'bracket'
                    ? 'bg-[#170036] text-[#00DF81] shadow-sm'
                    : 'text-slate-700 hover:text-slate-950 font-bold'
                }`}
              >
                Bracket
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-[#170036] text-[#00DF81] shadow-sm'
                    : 'text-slate-700 hover:text-slate-950 font-bold'
                }`}
              >
                List
              </button>
            </div>
          </div>
        </div>

        {/* FotMob Sub-Navigation Tabs */}
        <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto border-b border-emerald-400/40 pb-px scrollbar-none text-xs sm:text-sm font-bold">
          <button
            onClick={() => onNavigateTab && onNavigateTab('standings')}
            className="px-4 py-2 text-slate-800 hover:text-slate-950 transition-colors cursor-pointer border-b-2 border-transparent"
          >
            Table (Standings)
          </button>
          <button
            onClick={() => setViewMode('fotmob')}
            className="px-4 py-2 text-[#170036] font-black border-b-2 border-[#170036] flex items-center gap-1.5"
          >
            <span>Knockout</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#170036] animate-pulse" />
          </button>
          <button
            onClick={() => onNavigateTab && onNavigateTab('matches')}
            className="px-4 py-2 text-slate-800 hover:text-slate-950 transition-colors cursor-pointer border-b-2 border-transparent"
          >
            Fixtures (Matches)
          </button>
          <button
            onClick={() => onNavigateTab && onNavigateTab('courts')}
            className="px-4 py-2 text-slate-800 hover:text-slate-950 transition-colors cursor-pointer border-b-2 border-transparent"
          >
            Courts
          </button>
        </div>
      </div>

      {/* 2. MAIN KNOCKOUT DISPLAY */}
      {viewMode === 'fotmob' && (
        <div className="relative py-6 px-2 sm:px-6 rounded-3xl bg-white border border-emerald-300/80 shadow-2xl overflow-x-auto text-slate-900">
          {/* Subtle dark stadium background grid */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b0a_1px,transparent_1px),linear-gradient(to_bottom,#1e293b0a_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

          <div className="relative min-w-[620px] max-w-3xl mx-auto flex flex-col items-center gap-8 py-6">
            
            {/* ROW 1: TOP QUARTER-FINALS (QF1, QF2, QF3, QF4) */}
            <div className="w-full flex items-center justify-around px-2">
              {/* Pair 1: QF1 and QF2 */}
              <div className="flex items-center gap-4 sm:gap-6">
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-mono uppercase text-slate-500 font-bold mb-1">QF 1</span>
                  {renderMatchCard(qf1, 'qf')}
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-mono uppercase text-slate-500 font-bold mb-1">QF 2</span>
                  {renderMatchCard(qf2, 'qf')}
                </div>
              </div>

              {/* Pair 2: QF3 and QF4 */}
              <div className="flex items-center gap-4 sm:gap-6">
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-mono uppercase text-slate-500 font-bold mb-1">QF 3</span>
                  {renderMatchCard(qf3, 'qf')}
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-mono uppercase text-slate-500 font-bold mb-1">QF 4</span>
                  {renderMatchCard(qf4, 'qf')}
                </div>
              </div>
            </div>

            {/* CONNECTORS 1: Top Quarter-Finals down into Semi-Finals */}
            <div className="w-full flex items-center justify-around px-8 -my-5 pointer-events-none">
              <svg className="w-52 sm:w-64 h-8 text-sky-500" viewBox="0 0 240 32" fill="none">
                {/* Left fork */}
                <path
                  d="M 45 0 V 16 H 120 V 32 M 195 0 V 16 H 120"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="opacity-70"
                />
              </svg>

              <svg className="w-52 sm:w-64 h-8 text-sky-500" viewBox="0 0 240 32" fill="none">
                {/* Right fork */}
                <path
                  d="M 45 0 V 16 H 120 V 32 M 195 0 V 16 H 120"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="opacity-70"
                />
              </svg>
            </div>

            {/* ROW 2: SEMI-FINALS (SF1 & SF2) */}
            <div className="w-full flex items-center justify-around px-12 sm:px-20">
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-mono uppercase text-slate-400 font-bold mb-1">Semi-Final 1</span>
                {renderMatchCard(sf1, 'sf')}
              </div>

              <div className="flex flex-col items-center">
                <span className="text-[10px] font-mono uppercase text-slate-400 font-bold mb-1">Semi-Final 2</span>
                {renderMatchCard(sf2, 'sf')}
              </div>
            </div>

            {/* CONNECTORS 2: Semifinals down to Final & 3rd Place Match */}
            <div className="w-full flex items-center justify-center -my-5 pointer-events-none">
              <svg className="w-72 sm:w-96 h-10 text-sky-500" viewBox="0 0 320 40" fill="none">
                <path
                  d="M 50 0 V 20 H 160 V 40 M 270 0 V 20 H 160"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="opacity-80"
                />
                {/* Branch to 3rd place */}
                <path
                  d="M 160 20 H 20 V 40"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                  className="opacity-50"
                />
              </svg>
            </div>

            {/* ROW 3: CENTER CONVERGENCE (3rd Place Match | GRAND FINAL | CHAMPION TROPHY) */}
            <div className="w-full flex flex-col md:flex-row items-center justify-center gap-6 sm:gap-10 py-2">
              
              {/* 3rd Place Match on Left */}
              <div className="flex flex-col items-center">
                <div className="text-[10px] font-mono uppercase text-sky-400 font-bold mb-1 flex items-center gap-1">
                  <Award className="w-3 h-3" />
                  <span>3rd Place Playoff</span>
                </div>
                {renderMatchCard(thirdPlaceMatch, '3rd')}
              </div>

              {/* Grand Final in Center */}
              <div className="flex flex-col items-center">
                <div className="text-[11px] font-display uppercase text-amber-400 font-bold mb-1 flex items-center gap-1.5 tracking-wider">
                  <Crown className="w-3.5 h-3.5" />
                  <span>Tournament Final</span>
                </div>
                {renderMatchCard(finalMatch, 'final')}
              </div>

              {/* CHAMPION TROPHY SPOTLIGHT */}
              <div className="flex flex-col items-center justify-center p-5 rounded-3xl bg-gradient-to-b from-amber-50 via-white to-amber-50/50 border-2 border-amber-400 shadow-xl shadow-amber-500/10 min-w-[160px] sm:min-w-[180px] text-center group hover:scale-105 transition-transform duration-300">
                {/* Cup Trophy Icon */}
                <div className="relative mb-2">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-600 p-0.5 shadow-xl shadow-amber-500/30 flex items-center justify-center">
                    <div className="w-full h-full bg-[#170036] rounded-2xl flex items-center justify-center relative overflow-hidden">
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
                <div className="font-sans text-base sm:text-lg font-bold text-[#170036] tracking-tight line-clamp-1">
                  {championTeam ? pairLabel(championTeam) : 'TBD'}
                </div>

                {/* CHAMPION Label */}
                <div className="text-xs font-mono font-black text-amber-600 uppercase tracking-widest mt-0.5 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>CHAMPION</span>
                </div>

                {championTeam && (
                  <div className="text-[10px] text-slate-500 mt-1 font-mono font-bold">
                    Group {championTeam.groupId?.replace('group-', '').toUpperCase()}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 3. CLASSIC HORIZONTAL BRACKET VIEW */}
      {viewMode === 'bracket' && (
        <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 overflow-x-auto">
          <div className="min-w-[700px] grid grid-cols-3 gap-8 items-center">
            {/* Column 1: Quarter-Finals */}
            <div className="space-y-6">
              <div className="text-xs font-mono font-black uppercase text-slate-400 tracking-wider flex items-center gap-2 pb-2 border-b border-slate-800">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
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
              <div className="text-xs font-mono font-black uppercase text-slate-400 tracking-wider flex items-center gap-2 pb-2 border-b border-slate-800">
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
              <div className="text-xs font-mono font-black uppercase text-amber-400 tracking-wider flex items-center gap-2 pb-2 border-b border-slate-800">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {knockoutMatches.map((m) => {
              const court = courts.find((c) => c.id === m.courtId);
              const isFinal = m.round === 'final';
              const is3rd = m.round === '3rd';
              const isLive = m.status === 'live';

              return (
                <div
                  key={m.id}
                  onClick={() => setSelectedMatch(m)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    isFinal
                      ? 'bg-amber-950/20 border-amber-500/40 hover:border-amber-400'
                      : is3rd
                      ? 'bg-sky-950/20 border-sky-500/40 hover:border-sky-400'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3 text-xs">
                    <span className="font-mono font-bold text-slate-400">
                      Match #{m.matchNumber} · {m.round?.toUpperCase() || 'KO'}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 font-mono">{court?.name || 'Center Court'}</span>
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
                        <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black animate-pulse">
                          LIVE
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="font-bold text-sm text-white">
                        {pairLabel(m.team1, 'TBD')}
                      </div>
                      <div className="font-bold text-sm text-white">
                        {pairLabel(m.team2, 'TBD')}
                      </div>
                    </div>

                    <div className="text-right font-mono font-black text-lg space-y-1">
                      <div className={m.team1Score && m.team2Score && m.team1Score > m.team2Score ? 'text-lime-400' : 'text-slate-400'}>
                        {m.team1Score !== null ? m.team1Score : '-'}
                      </div>
                      <div className={m.team1Score && m.team2Score && m.team2Score > m.team1Score ? 'text-lime-400' : 'text-slate-400'}>
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
