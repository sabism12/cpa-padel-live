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
import { pairLabel } from '../utils/teamDisplay';
import { StickyHero } from './StickyHero';

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

  // Short label for a knockout match, e.g. "QF1", "SF2" (no space, so it never wraps).
  const knockoutLabel = (m?: EnrichedMatch) =>
    !m ? '' : m.round === 'qf' ? `QF${m.bracketPosition}` : m.round === 'sf' ? `SF${m.bracketPosition}` : m.round === 'final' ? 'Final' : '3rd place';

  // Where an empty slot's team will come from ("Drawn by lot", "Winner SF1",
  // "Loser SF2"). Quarter-final and semi-final pairings are drawn by lot.
  const slotSource = (m: EnrichedMatch, slot: 'team1' | 'team2'): string => {
    if (m.round === 'qf' || m.round === 'sf') return 'Drawn by lot';
    const winnerFrom = knockoutMatches.find((x) => x.nextMatchId === m.id && x.nextMatchSlot === slot);
    if (winnerFrom) return `Winner ${knockoutLabel(winnerFrom)}`;
    const loserFrom = knockoutMatches.find((x) => x.loserNextMatchId === m.id && x.loserNextMatchSlot === slot);
    if (loserFrom) return `Loser ${knockoutLabel(loserFrom)}`;
    return 'To be decided';
  };

  const firstName = (name?: string) => (name || '').trim().split(/\s+/)[0] || '';

  // Bracket connector joining two boxes above (down) or below (up) into one.
  const renderJoin = (direction: 'down' | 'up') => (
    <div aria-hidden="true" className="flex flex-col items-center">
      {direction === 'up' && <div className="w-px h-4 bg-blue-500" />}
      <div
        className={`w-1/2 h-4 border-blue-500 ${
          direction === 'down'
            ? 'border-x border-b rounded-b-lg'
            : 'border-x border-t rounded-t-lg'
        }`}
      />
      {direction === 'down' && <div className="w-px h-4 bg-blue-500" />}
    </div>
  );

  // One match box: both pairs side by side, score under each, loser struck out.
  const renderNode = (
    match: EnrichedMatch | undefined,
    label: string,
    badge?: 'final' | '3rd'
  ) => {
    if (!match) {
      return (
        <div className="h-24 rounded-2xl border border-dashed border-zinc-700 flex items-center justify-center text-[10px] font-mono font-bold uppercase text-zinc-500">
          {label}
        </div>
      );
    }

    const isLive = match.status === 'live';
    const isDone = match.status === 'completed';
    const bothAbsent = match.walkover === 'both';
    const t1Won = isDone && !bothAbsent && (match.team1Score ?? 0) > (match.team2Score ?? 0);
    const t2Won = isDone && !bothAbsent && (match.team2Score ?? 0) > (match.team1Score ?? 0);
    const games = (slot: 'team1' | 'team2') =>
      slot === 'team1'
        ? match.padelState?.team1Games ?? match.team1Score
        : match.padelState?.team2Games ?? match.team2Score;

    const side = (slot: 'team1' | 'team2', won: boolean, lost: boolean) => {
      const raw = slot === 'team1' ? match.team1 : match.team2;
      const id = slot === 'team1' ? match.team1Id : match.team2Id;
      const team = id && (raw?.player1 || raw?.player2) ? raw : undefined;
      const score = isLive || isDone ? games(slot) ?? 0 : null;
      return (
        <div className="flex-1 min-w-0 flex flex-col items-center text-center">
          {team ? (
            <div
              className={`w-full text-[11px] sm:text-sm font-bold leading-tight ${
                lost ? 'text-zinc-500 line-through decoration-zinc-500' : 'text-white'
              }`}
            >
              <span className="block truncate">{firstName(team.player1)}</span>
              <span className="block truncate">{firstName(team.player2)}</span>
            </div>
          ) : (
            <div className="w-full text-[9px] sm:text-[10px] font-mono font-bold uppercase leading-tight text-zinc-500 py-0.5">
              {slotSource(match, slot)}
            </div>
          )}
          <div
            className={`mt-1 text-base sm:text-lg font-display font-black tabular-nums leading-none ${
              score === null ? 'text-zinc-700' : won || isLive ? 'text-[#CCFF00]' : 'text-zinc-500'
            }`}
          >
            {score === null ? '–' : score}
          </div>
        </div>
      );
    };

    return (
      <div className="relative pb-2.5">
        <button
          type="button"
          onClick={() => setSelectedMatch(match)}
          className={`w-full rounded-2xl px-2 pt-2 pb-2.5 text-left transition-colors cursor-pointer ${
            badge === 'final'
              ? 'bg-zinc-900 border-2 border-[#CCFF00]/70 hover:border-[#CCFF00]'
              : isLive
              ? 'bg-zinc-900 border-2 border-[#CCFF00]'
              : 'bg-zinc-900 border border-zinc-800 hover:border-blue-500'
          }`}
        >
          <div className="flex items-center justify-between gap-1 mb-1.5 px-0.5 text-[8px] sm:text-[9px] font-mono font-black uppercase tracking-wider">
            <span className="text-blue-400">{label}</span>
            {isLive ? (
              <span className="flex items-center gap-1 text-[#CCFF00]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#CCFF00] animate-pulse" />
                Live
              </span>
            ) : isDone ? (
              <span className="text-zinc-500">{match.walkover ? 'W/O' : 'FT'}</span>
            ) : (
              <span className="text-zinc-400">{match.scheduledTime || ''}</span>
            )}
          </div>
          <div className="flex items-start gap-1">
            {side('team1', t1Won, t2Won)}
            {side('team2', t2Won, t1Won)}
          </div>
        </button>
        {badge && (
          <span
            className={`absolute left-1/2 -translate-x-1/2 bottom-0 px-2.5 py-0.5 rounded-md text-[10px] sm:text-xs font-black uppercase ${
              badge === 'final' ? 'bg-[#CCFF00] text-[#0A0A0F]' : 'bg-blue-500 text-white'
            }`}
          >
            {badge === 'final' ? 'Final' : '3rd'}
          </span>
        )}
      </div>
    );
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
      {/* 1. HEADER — pins to the top while the bracket scrolls over it
          (StickyHero). The Tree/Bracket/List toggle is its own row below,
          so it stays tappable and scrolls over the heading too. */}
      <StickyHero className="text-center pt-4 sm:pt-6 px-2 pb-2 sm:pb-4">
        <h2 className="font-display font-bold uppercase tracking-tight text-[#0A0A0F] leading-[0.85] text-7xl sm:text-8xl md:text-9xl lg:text-[10rem]">
          Knockout
          <span className="block">Stage</span>
        </h2>
      </StickyHero>

      <div className="relative z-10 flex items-center justify-center gap-1.5 p-1.5 bg-white/90 backdrop-blur-md border border-blue-400/60 rounded-2xl shadow-md w-max mx-auto">
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

      {/* 2. MAIN KNOCKOUT DISPLAY — a real bracket tree (FotMob style),
          mirrored around the Final so it fits a phone screen:
            QF1 QF2  ->  SF1
                         FINAL  (3rd place left, champion right)
            QF3 QF4  ->  SF2
          Connector lines are plain bordered boxes, so they scale with the
          layout on any screen. */}
      {viewMode === 'fotmob' && (
        <div className="relative z-10 rounded-3xl bg-[#0A0A0F] border border-zinc-800 shadow-2xl px-2.5 sm:px-6 py-6 sm:py-8 text-white">
          <div className="max-w-xl mx-auto">
            {/* Top half: QF1 + QF2 -> SF1 */}
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              {renderNode(qf1, 'QF 1')}
              {renderNode(qf2, 'QF 2')}
            </div>
            {renderJoin('down')}
            <div className="flex justify-center">
              <div className="w-1/2 px-1 sm:px-2">{renderNode(sf1, 'SF 1')}</div>
            </div>
            <div className="mx-auto w-px h-5 bg-blue-500" />

            {/* Middle: 3rd place | FINAL | champion */}
            <div className="grid grid-cols-[1fr_1.25fr_0.75fr] gap-1.5 sm:gap-3 items-center">
              <div>{renderNode(thirdPlaceMatch, '3rd', '3rd')}</div>
              <div>{renderNode(finalMatch, 'Final', 'final')}</div>
              <div className="flex flex-col items-center text-center">
                <Trophy
                  className={`w-10 h-10 sm:w-16 sm:h-16 ${championTeam ? 'text-[#CCFF00] drop-shadow-[0_0_14px_rgba(204,255,0,0.45)]' : 'text-zinc-600'}`}
                  strokeWidth={1.6}
                />
                <div className={`mt-1.5 font-display font-semibold uppercase leading-[0.95] tracking-tight ${championTeam ? 'text-base sm:text-2xl text-white' : 'text-sm sm:text-xl text-zinc-500'}`}>
                  {championTeam ? (
                    <>
                      <span className="block">{firstName(championTeam.player1)}</span>
                      <span className="block">{firstName(championTeam.player2)}</span>
                    </>
                  ) : (
                    'TBD'
                  )}
                </div>
                <div className="mt-1 text-[9px] sm:text-[10px] font-mono font-black uppercase tracking-widest text-[#CCFF00]/80">
                  Champion
                </div>
              </div>
            </div>

            {/* Bottom half (mirrored): SF2 <- QF3 + QF4 */}
            <div className="mx-auto w-px h-5 bg-blue-500" />
            <div className="flex justify-center">
              <div className="w-1/2 px-1 sm:px-2">{renderNode(sf2, 'SF 2')}</div>
            </div>
            {renderJoin('up')}
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              {renderNode(qf3, 'QF 3')}
              {renderNode(qf4, 'QF 4')}
            </div>
          </div>
        </div>
      )}

      {/* 3. CLASSIC HORIZONTAL BRACKET VIEW */}
      {viewMode === 'bracket' && (
        <div className="relative z-10 p-6 rounded-3xl bg-[#0A0A0F] border-2 border-blue-400/60 overflow-x-auto shadow-xl">
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
        <div className="relative z-10 space-y-4">
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
