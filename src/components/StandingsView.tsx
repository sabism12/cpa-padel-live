import React from 'react';
import { Group, StandingsRow, TournamentSettings } from '../types';
import { CheckCircle2 } from 'lucide-react';
import { pairLabel } from '../utils/teamDisplay';
import { StickyHero } from './StickyHero';

interface StandingsViewProps {
  groups: Group[];
  standings: Record<string, StandingsRow[]>;
  settings?: TournamentSettings;
  onSelectTeam: (teamId: string) => void;
  onNavigateKnockout?: () => void;
}

export const StandingsView: React.FC<StandingsViewProps> = ({
  groups,
  standings,
  onSelectTeam,
}) => {
  // Extract all currently qualified teams across all groups
  const allQualifiedTeams: StandingsRow[] = [];
  groups.forEach((g) => {
    const rows = standings[g.id] || [];
    rows.forEach((r) => {
      if (r.qualified) {
        allQualifiedTeams.push(r);
      }
    });
  });

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {/* Header — same display treatment as the "Live Padel Scores" hero on
          the Scores page: huge two-line ink display type, no icon. */}
      <StickyHero className="text-center pt-4 sm:pt-6 px-2 pb-4 sm:pb-8">
        <h2 className="font-display font-bold uppercase tracking-tight text-[#0A0A0F] leading-[0.85] text-7xl sm:text-8xl md:text-9xl lg:text-[10rem]">
          Tournament
          <span className="block">Standings</span>
        </h2>
      </StickyHero>

      {/* Qualified Teams Spotlight Banner — mirrors the Live Matches card on
          the Scores page: big stacked display heading, then the team tiles.
          Two parts only: the heading block, then the teams grid. */}
      {allQualifiedTeams.length > 0 && (
        <div className="relative z-10 overflow-hidden rounded-3xl bg-white shadow-xl text-slate-900">
          {/* 1. Card header — black band with the display heading */}
          <div className="px-5 sm:px-7 py-6 sm:py-7 bg-[#0A0A0F] text-white flex items-center justify-center">
            <h3 className="font-display font-semibold text-white uppercase tracking-wide leading-none text-5xl sm:text-7xl text-center min-w-0">
              Qualifying Teams
            </h3>
          </div>

          {/* 2. White body — team tiles */}
          <div className="px-4 sm:px-5 py-4 sm:py-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
              {allQualifiedTeams.map((team) => (
                <div
                  key={team.teamId}
                  onClick={() => onSelectTeam(team.teamId)}
                  className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-blue-500 cursor-pointer transition-all group shadow-sm"
                >
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 mb-1">
                    <span className="font-bold text-blue-700">
                      {groups.find((g) => g.id === team.groupId)?.name}
                    </span>
                    <span className="font-black text-slate-600">#{team.position}</span>
                  </div>
                  <div className="font-black text-slate-900 text-xs sm:text-sm group-hover:text-blue-700 group-hover:underline transition-colors leading-tight">
                    {pairLabel(team, 'TBD').replace(' / ', '\u00A0/ ')}
                  </div>
                  <div className="text-[10px] font-mono text-slate-600 mt-1 flex items-center justify-between">
                    <span className="font-bold">{team.points} pts</span>
                    <span className="text-blue-700 font-black">{team.wins}W - {team.losses}L</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Full 5 Groups Tables — same card design as the Scores page standings card */}
      <div className="relative z-10 grid grid-cols-1 gap-6 sm:gap-8">
        {groups.map((group) => {
          const rows = standings[group.id] || [];

          return (
            <div
              key={group.id}
              id={`standings-group-panel-${group.id}`}
              className="bg-white border border-blue-300/80 rounded-3xl overflow-hidden shadow-xl text-slate-900"
            >
              {/* Black title bar — identical to the Scores page card */}
              <div className="px-5 sm:px-7 py-5 sm:py-7 bg-[#0A0A0F] text-white flex items-center">
                <span className="text-2xl sm:text-4xl font-display font-semibold uppercase tracking-wide text-[#CCFF00] leading-none min-w-0">
                  {group.name} — Standings
                </span>
              </div>

              {/* Table — identical structure to the Scores page card */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse" id={`table-standings-${group.id}`}>
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
                    {rows.map((row) => (
                      <tr
                        key={row.teamId}
                        onClick={() => onSelectTeam(row.teamId)}
                        className={`hover:bg-blue-50/60 cursor-pointer transition-colors group ${
                          row.qualified ? 'bg-blue-50/30' : ''
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

                        {/* Players — nbsp before the slash keeps it glued to the
                            first name so a lone "/" never wraps onto its own line. */}
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

                        {/* Pts — black badge with volt digits, same as the Scores card. */}
                        <td className="py-3 px-2.5 text-center">
                          <span className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-1.5 rounded-xl bg-[#0A0A0F] border border-zinc-700 font-display font-black text-sm sm:text-base text-[#CCFF00] leading-none tabular-nums shadow-sm">
                            {row.points}
                          </span>
                        </td>

                        {/* Status — hidden on phones (the black pos badge already marks
                            qualifiers), full pill from sm up. */}
                        <td className="py-3 px-2.5 text-center hidden sm:table-cell">
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
          );
        })}
      </div>
    </div>
  );
};
