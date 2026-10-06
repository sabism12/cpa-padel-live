import React, { useState, useEffect } from 'react';
import { Team, Group, StandingsRow } from '../types';
import { EnrichedMatch } from '../api';
import { Search, ChevronDown } from 'lucide-react';
import { pairLabel } from '../utils/teamDisplay';
import { stageLabel } from '../utils/matchStage';
import { StickyHero } from './StickyHero';

interface TeamSearchViewProps {
  teams: Team[];
  groups: Group[];
  matches: EnrichedMatch[];
  standings: Record<string, StandingsRow[]>;
  initialSelectedTeamId?: string | null;
}

/** Tailwind's lg breakpoint - below this the layout is a single column. */
const DESKTOP_QUERY = '(min-width: 1024px)';

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/** Keep the "/" glued to the first name so it never wraps onto its own line. */
const pairText = (pair?: { player1?: string; player2?: string } | null, fallback = 'TBD') =>
  pairLabel(pair, fallback).replace(' / ', ' / ');

export const TeamSearchView: React.FC<TeamSearchViewProps> = ({
  teams,
  groups,
  matches,
  standings,
  initialSelectedTeamId,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(
    initialSelectedTeamId ?? null
  );

  const isDesktop = useMediaQuery(DESKTOP_QUERY);

  useEffect(() => {
    if (initialSelectedTeamId) {
      setSelectedTeamId(initialSelectedTeamId);
    }
  }, [initialSelectedTeamId]);

  const standingOf = (team: Team) =>
    (standings[team.groupId] || []).find((r) => r.teamId === team.id);

  // Search by player or group name
  const q = searchTerm.trim().toLowerCase();
  const filteredTeams = teams.filter((t) => {
    if (!q) return true;
    const group = groups.find((g) => g.id === t.groupId)?.name.toLowerCase() || '';
    return t.player1.toLowerCase().includes(q) || t.player2.toLowerCase().includes(q) || group.includes(q);
  });

  // Teams grouped by group, each ordered by current group position
  const teamsByGroup = groups
    .map((group) => ({
      group,
      teams: filteredTeams
        .filter((t) => t.groupId === group.id)
        .sort((a, b) => (standingOf(a)?.position ?? 99) - (standingOf(b)?.position ?? 99)),
    }))
    .filter((g) => g.teams.length > 0);

  // Desktop always shows a profile; mobile starts fully collapsed.
  const desktopTeam = teams.find((t) => t.id === selectedTeamId) || teams[0];

  const handleSelectTeam = (teamId: string) => {
    if (isDesktop) {
      setSelectedTeamId(teamId);
      return;
    }
    // Accordion: tapping the open pairing closes it, tapping another swaps.
    setSelectedTeamId((current) => (current === teamId ? null : teamId));
  };

  const searchInput = (
    <div className="relative">
      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
      <input
        type="text"
        id="team-search-input"
        placeholder="Search by player name..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 font-medium"
      />
    </div>
  );

  /** One pairing row inside a group card (position badge, name, points). */
  const renderTeamRow = (team: Team, isOpen: boolean, showChevron: boolean) => {
    const row = standingOf(team);
    return (
      <button
        type="button"
        id={`team-item-${team.id}`}
        onClick={() => handleSelectTeam(team.id)}
        aria-expanded={showChevron ? isOpen : undefined}
        className={`w-full text-left flex items-center gap-3 px-4 sm:px-5 py-3.5 transition-colors cursor-pointer ${
          isOpen ? 'bg-blue-50' : 'hover:bg-blue-50/60'
        }`}
      >
        <span
          className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-display font-black shrink-0 ${
            row?.qualified ? 'bg-[#0A0A0F] text-[#CCFF00]' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {row?.position ?? '–'}
        </span>
        <span className="flex-1 min-w-0 font-extrabold text-sm sm:text-base text-[#0A0A0F] leading-snug">
          {pairText(team)}
        </span>
        <span className="shrink-0 text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 tabular-nums">
          {row?.points ?? 0} pts
        </span>
        {showChevron && (
          <ChevronDown
            className={`w-4 h-4 shrink-0 transition-transform duration-300 ease-out ${
              isOpen ? 'rotate-180 text-[#0A0A0F]' : 'text-slate-400'
            }`}
          />
        )}
      </button>
    );
  };

  /** Profile: stats strip + match log, in the site's tile language. */
  const renderTeamDetails = (team: Team, withName: boolean) => {
    const row = standingOf(team);
    const group = groups.find((g) => g.id === team.groupId);
    const teamMatches = matches
      .filter((m) => m.team1Id === team.id || m.team2Id === team.id)
      .sort((a, b) => a.matchNumber - b.matchNumber);
    const diff = row?.scoreDiff ?? 0;

    const stats: [string, React.ReactNode][] = [
      ['Pos', row?.position ? `#${row.position}` : '–'],
      ['MP', row?.matchesPlayed ?? 0],
      ['W', row?.wins ?? 0],
      ['L', row?.losses ?? 0],
      ['Diff', diff > 0 ? `+${diff}` : diff],
    ];

    return (
      <div className="space-y-3">
        {withName && (
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-widest text-blue-800/80">
                {group?.name}
              </div>
              <div className="text-3xl sm:text-4xl font-display font-semibold uppercase tracking-tight leading-[0.95] text-[#0A0A0F]">
                {pairText(team)}
              </div>
            </div>
            {row?.qualified && (
              <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-black uppercase tracking-wider bg-[#0A0A0F] text-[#CCFF00]">
                In a qualifying place
              </span>
            )}
          </div>
        )}

        {/* Stats strip — same numbers as the standings table, Pts as the ink badge */}
        <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
          {stats.map(([label, value]) => (
            <div key={label} className="py-2 rounded-xl bg-white border border-slate-200 text-center">
              <span className="block text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                {label}
              </span>
              <span className="block text-sm sm:text-base font-mono font-black text-[#0A0A0F] tabular-nums">
                {value}
              </span>
            </div>
          ))}
          <div className="py-2 rounded-xl bg-[#0A0A0F] text-center">
            <span className="block text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider text-white/60">
              Pts
            </span>
            <span className="block text-sm sm:text-base font-display font-black text-[#CCFF00] tabular-nums">
              {row?.points ?? 0}
            </span>
          </div>
        </div>

        {!withName && row?.qualified && (
          <div className="text-[10px] font-mono font-black uppercase tracking-widest text-blue-800/80">
            ● Currently in a qualifying place
          </div>
        )}

        {/* Match log — tiles like the Fixtures page */}
        <div className="space-y-2">
          <div className="text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-widest text-slate-500">
            Matches ({teamMatches.length})
          </div>
          {teamMatches.map((m) => {
            const isTeam1 = m.team1Id === team.id;
            const opponent = isTeam1 ? m.team2 : m.team1;
            const myScore = isTeam1 ? m.team1Score : m.team2Score;
            const oppScore = isTeam1 ? m.team2Score : m.team1Score;
            const isLive = m.status === 'live';
            const isDone = m.status === 'completed';
            const won = isDone && m.walkover !== 'both' && (myScore ?? 0) > (oppScore ?? 0);

            const pill = isLive ? (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black bg-[#CCFF00] text-[#0A0A0F] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0A0A0F] animate-pulse" />
                LIVE
              </span>
            ) : isDone ? (
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black uppercase ${
                  won ? 'bg-[#0A0A0F] text-[#CCFF00]' : 'bg-slate-200 text-slate-600'
                }`}
              >
                {won ? 'Win' : 'Loss'}
                {m.walkover ? ' · W/O' : ''}
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black bg-[#0A0A0F] text-[#CCFF00]">
                {m.scheduledTime || 'TBD'}
              </span>
            );

            return (
              <div key={m.id} className="p-3 rounded-2xl bg-white border border-slate-200">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-wider text-blue-700 truncate min-w-0">
                    Match #{m.matchNumber} • {stageLabel(m)}
                    {m.court?.name ? ` • ${m.court.name}` : ''}
                  </span>
                  <span className="shrink-0">{pill}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 text-sm font-extrabold text-[#0A0A0F] leading-snug">
                    <span className="text-[10px] font-mono font-bold uppercase text-slate-400 mr-1.5">vs</span>
                    {pairText(opponent, 'To be decided')}
                  </span>
                  {(isLive || isDone) && (
                    <span className="shrink-0 px-2.5 py-1 rounded-xl bg-[#0A0A0F] font-display font-black text-sm tabular-nums">
                      <span className={won || isLive ? 'text-[#CCFF00]' : 'text-zinc-400'}>{myScore ?? 0}</span>
                      <span className="text-zinc-500 mx-1">—</span>
                      <span className="text-zinc-400">{oppScore ?? 0}</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  /** A white group card with the ink band, holding its pairings. */
  const renderGroupCard = (group: Group, groupTeams: Team[], accordion: boolean) => (
    <section
      key={group.id}
      className="bg-white border border-blue-300/80 rounded-3xl overflow-hidden shadow-xl text-slate-900"
    >
      <div className="px-5 sm:px-6 py-4 sm:py-5 bg-[#0A0A0F] flex items-center justify-between gap-3">
        <span className="text-2xl sm:text-3xl font-display font-semibold uppercase tracking-wide text-[#CCFF00] leading-none">
          {group.name}
        </span>
        <span className="text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-widest text-white/60">
          {groupTeams.length} {groupTeams.length === 1 ? 'pair' : 'pairs'}
        </span>
      </div>
      <div className="divide-y divide-slate-100">
        {groupTeams.map((team) => {
          const isOpen = accordion ? team.id === selectedTeamId : team.id === desktopTeam?.id;
          return (
            <div key={team.id}>
              {renderTeamRow(team, isOpen, accordion)}
              {accordion && (
                <div className={`accordion-panel ${isOpen ? 'is-open' : ''}`}>
                  <div className="accordion-panel-inner">
                    <div className="px-3 sm:px-4 pb-4 pt-1 bg-blue-50">{renderTeamDetails(team, false)}</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );

  const noResults = (
    <div className="py-10 text-center text-xs italic font-mono text-slate-500 bg-white rounded-3xl border border-blue-300/80 shadow-xl">
      No pairings match "{searchTerm}".
    </div>
  );

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {/* Hero: pins to the top while the directory scrolls over it */}
      <StickyHero className="text-center pt-4 sm:pt-6 px-2 pb-4 sm:pb-8">
        <h2 className="font-display font-bold uppercase tracking-tight text-[#0A0A0F] leading-[0.85] text-7xl sm:text-8xl md:text-9xl lg:text-[10rem]">
          Team
          <span className="block">Directory</span>
        </h2>
      </StickyHero>

      <div className="relative z-10 space-y-4">
        {/* Search card */}
        <div className="rounded-3xl bg-white border border-blue-300/80 shadow-xl p-4 sm:p-5">{searchInput}</div>

        {isDesktop ? (
          /* Desktop: group cards on the left, profile docked on the right */
          <div className="grid grid-cols-12 gap-6 items-start">
            <div id="team-search-results-list" className="col-span-5 space-y-4">
              {teamsByGroup.length === 0 ? noResults : teamsByGroup.map(({ group, teams: groupTeams }) => renderGroupCard(group, groupTeams, false))}
            </div>
            <div className="col-span-7 sticky top-4 rounded-3xl bg-white border border-blue-300/80 shadow-xl p-5 sm:p-6">
              {desktopTeam && renderTeamDetails(desktopTeam, true)}
            </div>
          </div>
        ) : (
          /* Mobile: one pairing open at a time, unfolding inside its group card */
          <div id="team-search-results-list" className="space-y-4">
            {teamsByGroup.length === 0 ? noResults : teamsByGroup.map(({ group, teams: groupTeams }) => renderGroupCard(group, groupTeams, true))}
          </div>
        )}
      </div>
    </div>
  );
};
