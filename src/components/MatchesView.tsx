import React, { useMemo, useState } from 'react';
import { Group, Court } from '../types';
import { EnrichedMatch } from '../api';
import { Calendar, Clock, Search } from 'lucide-react';
import { PadelScoreBadge } from './PadelScoreBadge';
import { pairLabel } from '../utils/teamDisplay';
import { stageLabel } from '../utils/matchStage';

interface MatchesViewProps {
  matches: EnrichedMatch[];
  groups: Group[];
  courts: Court[];
  onSelectTeam: (teamId: string) => void;
}

const UNASSIGNED = '__unassigned__';

function statusLabel(match: EnrichedMatch): string {
  switch (match.status) {
    case 'live':
      return 'Live';
    case 'completed':
      return 'Finished';
    case 'ready':
      return 'Ready';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Upcoming';
  }
}

function statusClasses(match: EnrichedMatch): string {
  switch (match.status) {
    case 'live':
      return 'text-[#00DF81]';
    case 'completed':
      return 'text-slate-400';
    case 'ready':
      return 'text-amber-300';
    case 'cancelled':
      return 'text-rose-400';
    default:
      return 'text-purple-300';
  }
}

export const MatchesView: React.FC<MatchesViewProps> = ({
  matches,
  groups,
  courts,
  onSelectTeam,
}) => {
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedCourt, setSelectedCourt] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter matches
  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      if (selectedGroup !== 'all' && m.groupId !== selectedGroup) return false;
      if (selectedCourt !== 'all' && m.courtId !== selectedCourt) return false;
      if (selectedStatus !== 'all' && m.status !== selectedStatus) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const p1 = `${m.team1?.player1} ${m.team1?.player2}`.toLowerCase();
        const p2 = `${m.team2?.player1} ${m.team2?.player2}`.toLowerCase();
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

    const rank = (key: string) =>
      key === UNASSIGNED ? 9999 : order.get(key) ?? 9998;

    return Array.from(buckets.entries())
      .map(([key, list]) => {
        const sorted = [...list].sort((a, b) => a.matchNumber - b.matchNumber);

        // In the group stage a court hosts exactly one group, so label the
        // board with it. Knockout boards keep the round names on each card.
        const groupIds = new Set(sorted.map((m) => m.groupId));
        let groupLabel: string | null = null;
        if (groupIds.size === 1) {
          const only = sorted[0]?.groupId;
          if (only === 'knockout' || sorted[0]?.stage === 'knockout') {
            groupLabel = 'Knockout Stage';
          } else {
            groupLabel = groups.find((g) => g.id === only)?.name ?? null;
          }
        }

        return {
          courtId: key,
          court: key === UNASSIGNED ? null : courts.find((c) => c.id === key) || null,
          groupLabel,
          list: sorted,
        };
      })
      .sort((a, b) => rank(a.courtId) - rank(b.courtId));
  }, [filteredMatches, courts, groups]);

  const renderPlayerRow = (
    match: EnrichedMatch,
    side: 'team1' | 'team2'
  ) => {
    const team = side === 'team1' ? match.team1 : match.team2;
    const score = side === 'team1' ? match.team1Score : match.team2Score;
    const oppScore = side === 'team1' ? match.team2Score : match.team1Score;

    const isDone = match.status === 'completed';
    // Live matches surface their full state via the badge in the card footer,
    // so only completed results are shown inline next to each pairing.
    const showScore = isDone && score !== null && score !== undefined;

    const isWinner = isDone && score !== null && oppScore !== null && score > oppScore;
    const isLoser = isDone && score !== null && oppScore !== null && score < oppScore;

    return (
      <div
        onClick={() => team?.id && onSelectTeam(team.id)}
        className="flex items-center justify-between gap-3 cursor-pointer group/row"
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              match.status === 'live' ? 'bg-[#00DF81] animate-pulse' : 'bg-purple-500/70'
            }`}
          />
          <span
            className={`truncate text-sm sm:text-[15px] font-bold transition-colors group-hover/row:text-[#00DF81] ${
              isWinner
                ? 'text-white'
                : isLoser
                ? 'text-slate-500 line-through'
                : 'text-purple-100'
            }`}
          >
            {pairLabel(team, 'To be decided')}
          </span>
        </span>

        {showScore && (
          <span
            className={`shrink-0 font-display font-black text-base sm:text-lg tabular-nums ${
              isWinner ? 'text-[#00DF81]' : 'text-purple-300'
            }`}
          >
            {score}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-emerald-400/40">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#170036] text-[#00DF81] text-xs font-black uppercase tracking-wider mb-2 shadow-sm">
            <Calendar className="w-3.5 h-3.5" />
            Tournament Schedule
          </div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-[#170036] uppercase tracking-tight">
            All Match Fixtures
          </h2>
          <p className="text-xs font-mono font-bold text-slate-800 mt-0.5">
            Full round-robin group fixtures, listed court by court with live time slots
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 bg-white border border-emerald-300/80 rounded-3xl space-y-3 shadow-xl">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Filter by player name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 font-medium"
            />
          </div>

          {/* Group Filter */}
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm text-slate-800 font-bold focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All Groups &amp; Stages</option>
            <option value="knockout">🏆 Knockout Stage</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>

          {/* Court Filter */}
          <select
            value={selectedCourt}
            onChange={(e) => setSelectedCourt(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm text-slate-800 font-bold focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All Courts</option>
            {courts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm text-slate-800 font-bold focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All Statuses</option>
            <option value="live">🔴 Live Now</option>
            <option value="ready">🟢 Ready</option>
            <option value="scheduled">Scheduled / Upcoming</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {/* Court-grouped fixture boards */}
      {courtGroups.length === 0 ? (
        <div className="py-12 text-center text-slate-500 text-sm bg-white/80 rounded-3xl border border-emerald-300 shadow-md font-mono">
          No matches match the selected criteria.
        </div>
      ) : (
        <div className="space-y-6">
          {courtGroups.map(({ courtId, court, groupLabel, list }) => (
            <section
              key={courtId}
              id={`court-fixtures-${courtId}`}
              className="rounded-3xl bg-[#0b0725] border border-purple-900/60 p-3 sm:p-4 shadow-2xl"
            >
              {/* Court header bar */}
              <div className="rounded-2xl bg-[#00DF81] px-5 py-3 mb-3 shadow-md flex items-center justify-between gap-3">
                <div className="flex items-baseline gap-3 min-w-0">
                  <h3 className="font-display font-bold text-slate-950 text-lg sm:text-xl uppercase tracking-tight leading-none truncate">
                    {court?.name || 'Court To Be Assigned'}
                  </h3>
                  {groupLabel && (
                    <span className="text-[11px] font-mono font-black uppercase tracking-widest text-slate-900/70 shrink-0">
                      {groupLabel}
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-mono font-black uppercase tracking-widest text-slate-900/70 shrink-0">
                  {list.length} {list.length === 1 ? 'Match' : 'Matches'}
                </span>
              </div>

              {/* Match cards */}
              <div className="space-y-3">
                {list.map((match) => (
                  <article
                    key={match.id}
                    id={`match-fixture-${match.id}`}
                    className="rounded-2xl bg-[#170036] border border-purple-900/70 shadow-lg overflow-hidden"
                  >
                    {/* Round + Status */}
                    <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2">
                      <span className="text-[11px] font-mono font-black uppercase tracking-widest text-purple-300 truncate">
                        {stageLabel(match)}
                      </span>
                      <span
                        className={`text-[11px] font-mono font-black uppercase tracking-widest shrink-0 flex items-center gap-1.5 ${statusClasses(
                          match
                        )}`}
                      >
                        {match.status === 'live' && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#00DF81] animate-ping" />
                        )}
                        {statusLabel(match)}
                      </span>
                    </div>

                    {/* The two pairings */}
                    <div className="px-4 space-y-2">
                      {renderPlayerRow(match, 'team1')}
                      {renderPlayerRow(match, 'team2')}
                    </div>

                    {/* Footer: time + live point state */}
                    <div className="mt-3 border-t border-purple-900/70 px-4 py-3 flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-[11px] font-mono font-bold text-purple-200 min-w-0">
                        <Clock className="w-3.5 h-3.5 shrink-0 text-purple-400" />
                        <span className="truncate">
                          {match.status === 'completed'
                            ? 'Finished'
                            : `Starts: ${match.scheduledTime || 'TBD'}`}
                        </span>
                        <span className="text-purple-500 shrink-0">
                          #{match.matchNumber}
                        </span>
                      </span>

                      {match.status === 'live' ? (
                        <div className="shrink-0 scale-90 origin-right">
                          <PadelScoreBadge match={match} />
                        </div>
                      ) : match.scoreSummary ? (
                        <span className="shrink-0 text-[11px] font-mono font-bold text-emerald-300">
                          {match.scoreSummary}
                        </span>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
