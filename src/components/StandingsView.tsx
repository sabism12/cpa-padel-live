import React from 'react';
import { Group, StandingsRow, TournamentSettings } from '../types';
import { Trophy, CheckCircle2, Sparkles } from 'lucide-react';
import { pairLabel } from '../utils/teamDisplay';

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
  settings,
  onSelectTeam,
  onNavigateKnockout,
}) => {
  // Qualification format: group winners + best-placed wildcards fill the bracket.
  const perGroup = settings?.scoring.qualifiersPerGroup ?? 2;
  const wildcards = settings?.scoring.wildcardQualifiers ?? 0;
  const totalSlots = groups.length * perGroup + wildcards;

  const directLabel = perGroup === 1 ? 'Group winners' : `Top ${perGroup} of each group`;
  const qualificationSummary =
    wildcards > 0
      ? `${directLabel} plus the ${wildcards} best-placed wildcards advance to the knockout rounds`
      : `${directLabel} advance to the knockout rounds`;

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
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-emerald-400/40">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#170036] text-[#00DF81] text-xs font-black uppercase tracking-wider mb-2 shadow-sm">
            <Trophy className="w-3.5 h-3.5" />
            Official Standings
          </div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-[#170036] uppercase tracking-tight">
            Tournament Standings & Qualification
          </h2>
          <p className="text-xs font-mono font-bold text-slate-800 mt-1">
            {qualificationSummary}
          </p>
        </div>

        {/* Qualification Rule Pill & Quick Knockout Link */}
        <div className="flex items-center gap-2">
          {onNavigateKnockout && (
            <button
              onClick={onNavigateKnockout}
              className="px-4 py-2 rounded-2xl bg-[#170036] hover:bg-[#250052] text-[#00DF81] text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-lg flex items-center gap-1.5"
            >
              <span>View Knockout Bracket</span>
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          )}
          <div className="px-3.5 py-2 rounded-2xl bg-white border border-emerald-300 text-xs text-slate-800 font-bold flex items-center gap-2 shadow-sm">
            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Win: <strong>{settings?.scoring.pointsForWin ?? 3} pts</strong> · Loss:{' '}
              <strong>{settings?.scoring.pointsForLoss ?? 0} pt</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Qualified Teams Spotlight Banner */}
      {allQualifiedTeams.length > 0 && (
        <div className="rounded-3xl bg-white border border-emerald-300/80 p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <h3 className="text-base font-bold text-[#170036] font-display uppercase tracking-tight">
                Teams in Qualifying Positions ({allQualifiedTeams.length}/{totalSlots})
              </h3>
            </div>
            <span className="text-[11px] font-black text-[#170036] tracking-wider uppercase bg-emerald-100 px-3 py-1 rounded-full border border-emerald-300">
              Knockout Bound
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {allQualifiedTeams.map((team) => (
              <div
                key={team.teamId}
                onClick={() => onSelectTeam(team.teamId)}
                className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-emerald-500 cursor-pointer transition-all group shadow-sm"
              >
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 mb-1">
                  <span className="font-bold text-emerald-700">
                    {groups.find((g) => g.id === team.groupId)?.name}
                  </span>
                  <span className="font-black text-slate-600">#{team.position}</span>
                </div>
                <div className="font-black text-slate-900 text-xs sm:text-sm group-hover:text-[#170036] group-hover:underline transition-colors leading-tight">
                  {pairLabel(team, 'TBD')}
                </div>
                <div className="text-[10px] font-mono text-slate-600 mt-1 flex items-center justify-between">
                  <span className="font-bold">{team.points} pts</span>
                  <span className="text-emerald-700 font-black">{team.wins}W - {team.losses}L</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full 5 Groups Tables */}
      <div className="grid grid-cols-1 gap-8">
        {groups.map((group) => {
          const rows = standings[group.id] || [];

          return (
            <div
              key={group.id}
              id={`standings-group-panel-${group.id}`}
              className="bg-white border border-emerald-300/80 rounded-3xl overflow-hidden shadow-xl"
            >
              {/* Group Banner */}
              <div className="px-6 py-4 bg-white border-b border-emerald-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-[#170036] text-[#00DF81] font-display font-black text-sm shadow-sm">
                    {group.name.replace('Group ', '')}
                  </span>
                  <div>
                    <h3 className="font-display font-bold text-base text-[#170036] uppercase">{group.name}</h3>
                    <p className="text-xs font-mono font-bold text-slate-500">4 Teams • Round Robin (6 Matches)</p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-700 hidden sm:inline">
                  {perGroup === 1 ? 'Winner advances' : `Top ${perGroup} advance`}
                  {wildcards > 0 ? ` + ${wildcards} wildcard${wildcards === 1 ? '' : 's'}` : ''}
                </span>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-600 font-mono">
                      <th className="py-3.5 px-4 w-12 text-center">Pos</th>
                      <th className="py-3.5 px-4">Players</th>
                      <th className="py-3.5 px-3 text-center">MP</th>
                      <th className="py-3.5 px-3 text-center text-emerald-700">W</th>
                      <th className="py-3.5 px-3 text-center text-rose-600">L</th>
                      <th
                        className="py-3.5 px-3 text-center"
                        title="Game Difference (Games Won minus Games Lost)"
                      >
                        +/-
                      </th>
                      <th className="py-3.5 px-4 text-center text-[#170036]">Pts</th>
                      <th className="py-3.5 px-4 text-center">Qualification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {rows.map((row) => (
                      <tr
                        key={row.teamId}
                        onClick={() => onSelectTeam(row.teamId)}
                        className="hover:bg-emerald-50/50 cursor-pointer transition-colors group"
                      >
                        {/* Pos */}
                        <td className="py-3.5 px-4 text-center font-display font-extrabold">
                          <span
                            className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-mono font-black ${
                              row.qualified
                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                : 'text-slate-400 bg-slate-100'
                            }`}
                          >
                            {row.position}
                          </span>
                        </td>

                        {/* Players */}
                        <td className="py-3.5 px-4">
                          <div className="font-black text-slate-900 group-hover:text-[#170036] transition-colors leading-tight">
                            {pairLabel(row, 'TBD')}
                          </div>
                        </td>

                        {/* MP */}
                        <td className="py-3.5 px-3 text-center font-mono font-bold text-slate-700">
                          {row.matchesPlayed}
                        </td>

                        {/* W */}
                        <td className="py-3.5 px-3 text-center font-mono font-black text-emerald-700">
                          {row.wins}
                        </td>

                        {/* L */}
                        <td className="py-3.5 px-3 text-center font-mono font-semibold text-slate-400">{row.losses}</td>

                        {/* Diff */}
                        <td className="py-3.5 px-3 text-center font-mono font-black text-slate-700">
                          {row.scoreDiff > 0 ? `+${row.scoreDiff}` : row.scoreDiff}
                        </td>

                        {/* Pts */}
                        <td className="py-3.5 px-4 text-center font-display font-black text-base text-[#170036]">
                          {row.points}
                        </td>

                        {/* Qualification badge */}
                        <td className="py-3.5 px-4 text-center">
                          {row.qualified ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-300">
                              <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                              QUALIFIED
                            </span>
                          ) : (
                            <span className="text-[11px] font-mono text-slate-300">—</span>
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
