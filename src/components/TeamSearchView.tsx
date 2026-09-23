import React, { useState, useEffect } from 'react';
import { Team, Group, StandingsRow } from '../types';
import { EnrichedMatch } from '../api';
import { Search, Users, CheckCircle2, ChevronDown } from 'lucide-react';
import { pairLabel } from '../utils/teamDisplay';

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

  // Filtered teams list based on search term
  const filteredTeams = teams.filter((t) => {
    const q = searchTerm.toLowerCase();
    const player1 = t.player1.toLowerCase();
    const player2 = t.player2.toLowerCase();
    const group = groups.find((g) => g.id === t.groupId)?.name.toLowerCase() || '';
    return player1.includes(q) || player2.includes(q) || group.includes(q);
  });

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
      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
      <input
        type="text"
        id="team-search-input"
        placeholder="Search by player name..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full pl-9 pr-4 py-2.5 bg-white border border-emerald-300/80 rounded-2xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 shadow-md font-medium"
      />
    </div>
  );

  const renderTeamRow = (team: Team, isOpen: boolean, showChevron: boolean) => {
    const gName = groups.find((g) => g.id === team.groupId)?.name;

    return (
      <button
        type="button"
        id={`team-item-${team.id}`}
        onClick={() => handleSelectTeam(team.id)}
        aria-expanded={showChevron ? isOpen : undefined}
        className={`w-full text-left flex items-center justify-between gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all duration-200 shadow-sm ${
          isOpen
            ? 'bg-white border-2 border-[#170036] text-slate-950 shadow-md ring-2 ring-[#00DF81]/50'
            : 'bg-white/90 border-slate-200 hover:bg-white hover:border-emerald-400 text-slate-800'
        }`}
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-xs mb-1 font-mono">
            <span className="font-bold text-emerald-700">{gName}</span>
            <span className="text-[11px] text-slate-400">Padel Pair</span>
          </span>
          <span className="block font-black text-sm text-slate-900 leading-tight truncate">
            {pairLabel(team, 'TBD')}
          </span>
        </span>

        {showChevron && (
          <ChevronDown
            className={`w-4 h-4 shrink-0 transition-transform duration-300 ease-out ${
              isOpen ? 'rotate-180 text-[#170036]' : 'text-slate-400'
            }`}
          />
        )}
      </button>
    );
  };

  const renderTeamDetails = (team: Team) => {
    const group = groups.find((g) => g.id === team.groupId);
    const groupStandings = standings[team.groupId] || [];
    const teamStanding = groupStandings.find((r) => r.teamId === team.id);
    const teamMatches = matches.filter(
      (m) => m.team1Id === team.id || m.team2Id === team.id
    );

    return (
      <div className="space-y-4 sm:space-y-6">
        {/* Team Banner Card */}
        <div className="rounded-3xl bg-white border border-emerald-300/80 p-5 sm:p-6 shadow-xl relative overflow-hidden text-slate-900">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-300">
                  {group?.name || 'Group'}
                </span>
                {teamStanding?.qualified && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                    Qualified
                  </span>
                )}
              </div>
              <div className="font-sans text-xl sm:text-2xl font-bold text-[#170036] uppercase tracking-tight leading-tight">
                {pairLabel(team, 'TBD')}
              </div>
            </div>

            {/* Rank Badge */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center sm:min-w-[120px] shadow-sm">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 block mb-0.5">
                Group Position
              </span>
              <span className="text-3xl font-display font-black text-[#170036]">
                #{teamStanding?.position || '—'}
              </span>
            </div>
          </div>

          {/* Stats Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mt-5 sm:mt-6 pt-5 border-t border-slate-100">
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-center">
              <span className="text-[10px] text-slate-500 uppercase font-mono font-bold block">Played</span>
              <span className="text-lg font-mono font-black text-slate-900">{teamStanding?.matchesPlayed || 0}</span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-center">
              <span className="text-[10px] text-slate-500 uppercase font-mono font-bold block">Wins</span>
              <span className="text-lg font-mono font-black text-emerald-700">{teamStanding?.wins || 0}</span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-center">
              <span className="text-[10px] text-slate-500 uppercase font-mono font-bold block">Losses</span>
              <span className="text-lg font-mono font-black text-rose-600">{teamStanding?.losses || 0}</span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-center">
              <span className="text-[10px] text-slate-500 uppercase font-mono font-bold block">Diff</span>
              <span className="text-lg font-mono font-black text-slate-900">
                {(teamStanding?.scoreDiff || 0) > 0 ? `+${teamStanding?.scoreDiff}` : teamStanding?.scoreDiff || 0}
              </span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-center col-span-2 sm:col-span-1">
              <span className="text-[10px] text-slate-500 uppercase font-mono font-bold block">Points</span>
              <span className="text-lg font-display font-black text-[#170036]">
                {teamStanding?.points || 0}
              </span>
            </div>
          </div>
        </div>

        {/* Matches Log */}
        <div className="bg-white border border-emerald-300/80 rounded-3xl p-5 sm:p-6 shadow-xl text-slate-900">
          <h4 className="text-sm font-bold uppercase tracking-wider text-[#170036] mb-4 flex flex-wrap items-center justify-between gap-1">
            <span>Group Matches ({teamMatches.length})</span>
            <span className="text-[11px] font-mono font-bold text-slate-500">Opponent • Score • Outcome</span>
          </h4>

          <div className="space-y-3">
            {teamMatches.map((m) => {
              const isTeam1 = m.team1Id === team.id;
              const opponent = isTeam1 ? m.team2 : m.team1;
              const myScore = isTeam1 ? m.team1Score : m.team2Score;
              const oppScore = isTeam1 ? m.team2Score : m.team1Score;

              let outcomeBadge = (
                <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
                  Scheduled
                </span>
              );

              if (m.status === 'completed') {
                if ((myScore ?? 0) > (oppScore ?? 0)) {
                  outcomeBadge = (
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-black uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-300">
                      Win
                    </span>
                  );
                } else {
                  outcomeBadge = (
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-black uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200">
                      Loss
                    </span>
                  );
                }
              } else if (m.status === 'live') {
                outcomeBadge = (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-[#00DF81] text-slate-950 animate-pulse shadow-sm">
                    LIVE
                  </span>
                );
              }

              return (
                <div
                  key={m.id}
                  className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 hover:border-emerald-400 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 mb-1 flex-wrap">
                      <span>Match #{m.matchNumber}</span>
                      <span>•</span>
                      <span>{m.court?.name || 'Court'}</span>
                      <span>•</span>
                      <span>{m.scheduledTime}</span>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-slate-400 font-normal text-[10px] uppercase font-mono shrink-0">vs</span>
                      <span className="text-sm font-black text-slate-900 leading-tight">
                        {pairLabel(opponent, 'Opponent')}
                      </span>
                    </div>
                  </div>

                  <div className="text-center font-display font-extrabold text-base shrink-0">
                    {m.status === 'completed' || m.status === 'live' ? (
                      <div>
                        <span className="text-[#170036] font-black whitespace-nowrap">
                          {myScore} — {oppScore}
                        </span>
                        {m.scoreSummary && (
                          <div className="text-[10px] font-mono text-emerald-700 font-bold mt-0.5">
                            {m.scoreSummary}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs font-bold text-slate-400 uppercase font-mono">—</span>
                    )}
                  </div>

                  <div className="shrink-0">{outcomeBadge}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-emerald-400/40">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#170036] text-[#00DF81] text-xs font-black uppercase tracking-wider mb-2 shadow-sm">
            <Users className="w-3.5 h-3.5" />
            Player Portal
          </div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-[#170036] uppercase tracking-tight">
            Player Profiles &amp; Match Log
          </h2>
          <p className="text-xs font-mono font-bold text-slate-800 mt-0.5">
            {isDesktop
              ? 'Search your pairing to check scheduled fixtures, game scores, and current qualification rank'
              : 'Tap a pairing to open its fixtures, game scores and qualification rank'}
          </p>
        </div>
      </div>

      {isDesktop ? (
        /* Desktop: list on the left, profile permanently docked on the right */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-3">
            {searchInput}
            <div
              id="team-search-results-list"
              className="space-y-2 max-h-[600px] overflow-y-auto pr-1"
            >
              {filteredTeams.map((team) => (
                <div key={team.id}>
                  {renderTeamRow(team, team.id === desktopTeam?.id, false)}
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-8">
            {desktopTeam && renderTeamDetails(desktopTeam)}
          </div>
        </div>
      ) : (
        /* Mobile: one pairing open at a time, unfolding in place */
        <div className="space-y-3">
          {searchInput}

          <div id="team-search-results-list" className="space-y-2.5">
            {filteredTeams.length === 0 && (
              <div className="py-10 text-center text-sm text-slate-600 font-mono bg-white/80 rounded-2xl border border-emerald-300">
                No pairings match "{searchTerm}".
              </div>
            )}

            {filteredTeams.map((team) => {
              const isOpen = team.id === selectedTeamId;

              return (
                <div key={team.id}>
                  {renderTeamRow(team, isOpen, true)}

                  <div className={`accordion-panel ${isOpen ? 'is-open' : ''}`}>
                    <div className="accordion-panel-inner">
                      <div className="pt-2.5">{renderTeamDetails(team)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
