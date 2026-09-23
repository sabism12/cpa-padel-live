import React, { useRef } from 'react';
import { AuthModal } from './AuthModal';
import { ScorekeeperView } from './ScorekeeperView';
import { AdminView } from './AdminView';
import {
  AuthSession,
  Court,
  Group,
  Team,
  TournamentSettings,
  StandingsRow,
} from '../types';
import { EnrichedMatch } from '../api';
import { ArrowLeft, ClipboardEdit, Lock, LogOut, ShieldCheck } from 'lucide-react';

export type StaffView = 'score' | 'admin';

interface StaffPortalProps {
  view: StaffView;
  session: AuthSession | null;
  courts: Court[];
  matches: EnrichedMatch[];
  teams: Team[];
  groups: Group[];
  settings: TournamentSettings;
  standings: Record<string, StandingsRow[]>;
  selectedCourtId: string | null;
  onLogin: (session: AuthSession) => void;
  onLogout: () => void;
  onChangeView: (view: StaffView) => void;
  onExit: () => void;
  onRefreshData: () => void;
}

/**
 * Dedicated staff entry point (reached only by direct link, e.g. /staff).
 * Nothing here is linked from the public spectator site.
 */
export const StaffPortal: React.FC<StaffPortalProps> = ({
  view,
  session,
  courts,
  matches,
  teams,
  groups,
  settings,
  standings,
  selectedCourtId,
  onLogin,
  onLogout,
  onChangeView,
  onExit,
  onRefreshData,
}) => {
  // AuthModal calls onSuccess() and then onClose() on a successful sign-in.
  // This flag lets us tell a real sign-in apart from the user dismissing the dialog.
  const loggedInRef = useRef(false);

  // ---------------------------------------------------------------
  // Unauthenticated: staff sign-in only (no public navigation here)
  // ---------------------------------------------------------------
  if (!session) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] font-mono font-bold uppercase tracking-widest text-[#00DF81]">
            <Lock className="w-3 h-3" />
            Restricted Area
          </div>
          <h1 className="mt-4 text-2xl sm:text-3xl font-display font-bold italic text-white">
            CPA PADEL <span className="text-[#00DF81]">STAFF</span>
          </h1>
          <p className="mt-1 text-xs font-mono text-slate-500">
            Scorekeeper &amp; tournament administration access
          </p>
        </div>

        <AuthModal
          isOpen
          defaultRole={view === 'admin' ? 'admin' : 'scorekeeper'}
          onSuccess={(newSession) => {
            loggedInRef.current = true;
            onLogin(newSession);
          }}
          onClose={() => {
            // Dismissed without signing in -> leave the restricted area.
            if (!loggedInRef.current) onExit();
            loggedInRef.current = false;
          }}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------
  // Authenticated staff terminal
  // ---------------------------------------------------------------
  const isAdmin = session.role === 'admin';

  return (
    <div className="min-h-screen flex flex-col bg-[#00DF81] text-slate-950">
      {/* Staff-only control bar */}
      <header className="bg-slate-950 text-slate-100 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#00DF81] text-slate-950 font-bold flex items-center justify-center font-display italic text-lg shadow-md">
              CPA
            </div>
            <div>
              <div className="text-sm font-display font-bold text-white leading-none">
                Staff Access Portal
              </div>
              <div className="text-[11px] font-mono text-[#00DF81] mt-0.5">
                {session.name} · <span className="capitalize">{session.role}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Terminal switcher */}
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-0.5">
              <button
                onClick={() => onChangeView('score')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  view === 'score'
                    ? 'bg-lime-400 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ClipboardEdit className="w-3.5 h-3.5" />
                <span>Scorekeeper</span>
              </button>
              {isAdmin && (
                <button
                  onClick={() => onChangeView('admin')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    view === 'admin'
                      ? 'bg-purple-500 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Admin</span>
                </button>
              )}
            </div>

            <button
              onClick={onExit}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-900 border border-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Public Site</span>
            </button>

            <button
              onClick={onLogout}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-rose-300 hover:text-white hover:bg-rose-500/20 bg-slate-900 border border-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Terminal content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        {view === 'admin' && isAdmin ? (
          <AdminView
            session={session}
            onOpenAuth={onLogout}
            teams={teams}
            groups={groups}
            courts={courts}
            matches={matches}
            settings={settings}
            standings={standings}
            onRefreshData={onRefreshData}
          />
        ) : (
          <ScorekeeperView
            courts={courts}
            matches={matches}
            session={session}
            onOpenAuth={onLogout}
            onSessionUpdate={onLogin}
            selectedCourtId={selectedCourtId}
            onRefreshData={onRefreshData}
          />
        )}
      </main>
    </div>
  );
};
