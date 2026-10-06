import React, { useMemo, useState } from 'react';
import { Group, Court } from '../types';
import { EnrichedMatch } from '../api';
import { Search } from 'lucide-react';
import { PadelScoreBadge } from './PadelScoreBadge';
import { StickyHero } from './StickyHero';
import { pairLabel } from '../utils/teamDisplay';
import { stageLabel, isKnockoutMatch } from '../utils/matchStage';

interface MatchesViewProps {
  matches: EnrichedMatch[];
  groups: Group[];
  courts: Court[];
  onSelectTeam: (teamId: string) => void;
}

const UNASSIGNED = '__unassigned__';

type StatusFilter = 'all' | 'live' | 'upcoming' | 'completed';

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'completed', label: 'Finished' },
];

function matchesStatus(match: EnrichedMatch, filter: StatusFilter): boolean {
  if (filter === 'all') return match.status !== 'cancelled';
  if (filter === 'upcoming') return match.status === 'scheduled' || match.status === 'ready';
  return match.status === filter;
}

/** Keep the "/" glued to the first name so it never wraps onto its own line. */
const pairText = (team: EnrichedMatch['team1']) =>
  pairLabel(team, 'To be decided').replace(' / ', ' / ');

export const MatchesView: React.FC<MatchesViewProps> = ({
  matches,
  groups,
  courts,
  onSelectTeam,
}) => {
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedCourt, setSelectedCourt] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter matches
  const filteredMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return matches.filter((m) => {
      if (selectedGroup === 'knockout' && !isKnockoutMatch(m)) return false;
      if (selectedGroup !== 'all' && selectedGroup !== 'knockout' && m.groupId !== selectedGroup) {
        return false;
      }
      if (selectedCourt !== 'all' && m.courtId !== selectedCourt) return false;
      if (!matchesStatus(m, selectedStatus)) return false;
      if (q) {
        const p1 = `${m.team1?.player1 ?? ''} ${m.team1?.player2 ?? ''}`.toLowerCase();
        const p2 = `${m.team2?.player1 ?? ''} ${m.team2?.player2 ?? ''}`.toLowerCase();
        if (!p1.includes(q) && !p2.includes(q)) return false;
      }
      return true;
    });
  }, [matches, selectedGroup, selectedCourt, selectedStatus, searchQuery]);

  // Group the filtered fixtures by court, in the venue's court order
  const courtGroups = useMemo(() => {
    const order = new Map(courts.map((c, i) => [c.id, i]));
    const buckets = new Map<string, EnrichedMatch[]>();

    filteredMatches.forEach((m) => {
      const key = m.courtId || UNASSIGNED;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(m);
    });

    const rank = (key: string) => (key === UNASSIGNED ? 9999 : order.get(key) ?? 9998);

    return Array.from(buckets.entries())
      .map(([key, list]) => {
        const sorted = [...list].sort((a, b) => a.matchNumber - b.matchNumber);

        // In the group stage a court hosts exactly one group, so label the
        // board with it. Knockout boards keep the round names on each tile.
        let groupLabel: string | null = null;
        if (sorted.every((m) => isKnockoutMatch(m))) {
          groupLabel = 'Knockout';
        } else if (new Set(sorted.map((m) => m.groupId)).size === 1) {
          groupLabel = groups.find((g) => g.id === sorted[0]?.groupId)?.name ?? null;
        }

        return {
          courtId: key,
          court: key === UNASSIGNED ? null : courts.find((c) => c.id === key) || null,
          groupLabel,
          list: sorted,
          liveCount: sorted.filter((m) => m.status === 'live').length,
        };
      })
      .sort((a, b) => rank(a.courtId) - rank(b.courtId));
  }, [filteredMatches, courts, groups]);

  const renderMatchTile = (match: EnrichedMatch) => {
    const isLive = match.status === 'live';
    const isDone = match.status === 'completed';
    const bothAbsent = match.walkover === 'both';
    const t1Win = isDone && !bothAbsent && (match.team1Score ?? 0) > (match.team2Score ?? 0);
    const t2Win = isDone && !bothAbsent && (match.team2Score ?? 0) > (match.team1Score ?? 0);

    const nameClass = (won: boolean, lost: boolean) =>
      `text-sm sm:text-base font-extrabold leading-snug cursor-pointer hover:underline ${
        won ? 'text-[#0A0A0F]' : lost ? 'text-slate-400' : 'text-[#0A0A0F]'
      }`;

    return (
      <article
        key={match.id}
        id={`match-fixture-${match.id}`}
        className={`p-3.5 rounded-2xl border transition-colors shadow-sm ${
          isLive ? 'bg-[#0A0A0F]/[0.03] border-[#0A0A0F]' : 'bg-slate-50 border-slate-200 hover:border-blue-400'
        }`}
      >
        {/* Meta row: number + stage, status/time pill */}
        <div className="flex items-center justify-between gap-2 mb-2 font-mono">
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-blue-700 truncate min-w-0">
            Match #{match.matchNumber} • {stageLabel(match)}
          </span>
          {isLive ? (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#CCFF00] text-[#0A0A0F] shrink-0 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0A0A0F] animate-pulse" />
              LIVE
            </span>
          ) : isDone ? (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-slate-200 text-slate-700 uppercase shrink-0">
              {match.walkover ? 'Walkover' : 'Finished'}
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#0A0A0F] text-[#CCFF00] shrink-0">
              {match.scheduledTime || 'TBD'}
            </span>
          )}
        </div>

        {/* Pairings with score / vs in the middle */}
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <span
            onClick={() => match.team1?.id && onSelectTeam(match.team1.id)}
            className={`flex-1 ${nameClass(t1Win, t2Win)}`}
          >
            {pairText(match.team1)}
            {t1Win && <span className="ml-1">🏆</span>}
          </span>

          <div className="shrink-0">
            {isLive || isDone ? (
              <PadelScoreBadge match={match} />
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-blue-100 border border-blue-200 text-[9px] font-mono font-black text-blue-800 uppercase tracking-wider">
                vs
              </span>
            )}
          </div>

          <span
            onClick={() => match.team2?.id && onSelectTeam(match.team2.id)}
            className={`flex-1 text-right ${nameClass(t2Win, t1Win)}`}
          >
            {pairText(match.team2)}
            {t2Win && <span className="ml-1">🏆</span>}
          </span>
        </div>
      </article>
    );
  };

  const selectClass =
    'w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono font-bold uppercase tracking-wider text-slate-800 focus:outline-none focus:border-blue-500';

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {/* Hero: pins to the top while the filters and boards scroll over it */}
      <StickyHero className="text-center pt-4 sm:pt-6 px-2 pb-4 sm:pb-8">
        <h2 className="font-display font-bold uppercase tracking-tight text-[#0A0A0F] leading-[0.85] text-7xl sm:text-8xl md:text-9xl lg:text-[10rem]">
          Match
          <span className="block">Fixtures</span>
        </h2>
      </StickyHero>

      {/* Filters card */}
      <div className="relative z-10 rounded-3xl bg-white border border-blue-300/80 shadow-xl p-4 sm:p-5 space-y-3 text-slate-900">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by player name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 font-medium"
          />
        </div>

        {/* Status: pill tabs, same as the group tabs on the Scores page */}
        <div className="flex items-center gap-1.5 p-1.5 bg-white border border-blue-400/60 rounded-2xl overflow-x-auto scrollbar-none">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setSelectedStatus(f.id)}
              className={`flex-1 px-3 py-2 rounded-xl text-xs sm:text-sm font-black tracking-wider uppercase whitespace-nowrap transition-all cursor-pointer ${
                selectedStatus === f.id
                  ? 'bg-[#0A0A0F] text-[#CCFF00] shadow-md'
                  : 'text-slate-800 hover:bg-blue-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <select value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)} className={selectClass}>
            <option value="all">All groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
            <option value="knockout">Knockout</option>
          </select>
          <select value={selectedCourt} onChange={(e) => setSelectedCourt(e.target.value)} className={selectClass}>
            <option value="all">All courts</option>
            {courts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Court boards — same card as the "Group A — Standings" card */}
      {courtGroups.length === 0 ? (
        <div className="relative z-10 py-10 text-center text-xs italic font-mono text-slate-500 bg-white rounded-3xl border border-blue-300/80 shadow-xl">
          No matches match the selected filters.
        </div>
      ) : (
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {courtGroups.map(({ courtId, court, groupLabel, list, liveCount }) => (
            <section
              key={courtId}
              id={`court-fixtures-${courtId}`}
              className="bg-white border border-blue-300/80 rounded-3xl overflow-hidden shadow-xl text-slate-900"
            >
              {/* Black title band with volt display text */}
              <div className="px-5 sm:px-7 py-5 sm:py-6 bg-[#0A0A0F] text-white flex items-center justify-between gap-3">
                <span className="text-2xl sm:text-4xl font-display font-semibold uppercase tracking-wide text-[#CCFF00] leading-none truncate min-w-0">
                  {court?.name || 'Court TBD'}
                </span>
                {groupLabel && (
                  <span className="shrink-0 text-xl sm:text-3xl font-display font-semibold uppercase tracking-wide leading-none text-white">
                    {groupLabel}
                  </span>
                )}
              </div>

              {/* Count strip */}
              <div className="px-5 sm:px-7 py-2.5 bg-blue-50 border-b border-blue-100 flex items-center justify-between text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-widest text-blue-800/80">
                <span>
                  {list.length} {list.length === 1 ? 'Match' : 'Matches'}
                </span>
                {liveCount > 0 && (
                  <span className="flex items-center gap-1.5 text-[#0A0A0F]">
                    <span className="w-2 h-2 rounded-full bg-[#CCFF00] border border-[#0A0A0F] animate-pulse" />
                    {liveCount} live
                  </span>
                )}
              </div>

              <div className="p-3 sm:p-4 space-y-2.5 sm:space-y-3">{list.map(renderMatchTile)}</div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
