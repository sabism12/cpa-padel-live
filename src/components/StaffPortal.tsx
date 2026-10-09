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
import { StaffRole } from '../staffSession';
import { ArrowLeft, ClipboardEdit, Lock, LogOut, RefreshCw, ShieldCheck } from 'lucide-react';
import { useUpdateReady } from '../appUpdate';

export type StaffView = 'score' | 'admin';

interface StaffPortalProps {
  view: StaffView;
  /** The signed-in session for this view's role (each panel has its own). */
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
  onExit: () => void;
  onRefreshData: () => void;
}

/**
 * Dedicated staff entry points, reached only by direct link and never linked
 * from the public spectator site. The two panels are kept fully separate:
 * /score (or /staff) is the scorekeeper terminal and only accepts the
 * scorekeeper PIN; /admin is the admin panel and only accepts the admin
 * password. Neither panel links to the other.
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
  onExit,
  onRefreshData,
}) => {
  // A new deploy took over while this panel was open (see appUpdate.ts).
  const updateReady = useUpdateReady();

  // AuthModal calls onSuccess() and then onClose() on a successful sign-in.
  // This flag lets us tell a real sign-in apart from the user dismissing the dialog.
  const loggedInRef = useRef(false);

  const role: StaffRole = view === 'admin' ? 'admin' : 'scorekeeper';
  const isAdmin = role === 'admin';
  // Defensive: a session for the other role never opens this panel.
  const panelSession = session?.role === role ? session : null;

  // ---------------------------------------------------------------
  // Unauthenticated: this panel's sign-in only (no public navigation here)
  // ---------------------------------------------------------------
  if (!panelSession) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] font-mono font-bold uppercase tracking-widest text-[#CCFF00]">
            <Lock className="w-3 h-3" />
            Restricted Area
          </div>
          <h1 className="mt-4 text-2xl sm:text-3xl font-display font-bold italic text-white">
            CPA PADEL <span className="text-[#CCFF00]">{isAdmin ? 'ADMIN' : 'SCOREKEEPER'}</span>
          </h1>
          <p className="mt-1 text-xs font-mono text-slate-500">
            {isAdmin ? 'Tournament administration access' : 'Scorekeeper terminal access'}
          </p>
        </div>

        <AuthModal
          isOpen
          role={role}
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
  // Authenticated staff panel (scorekeeper OR admin, never both)
  // ---------------------------------------------------------------
  return (
    // Both staff panels sit on the site's own page wash (the body gradient),
    // like the public pages.
    <div className="min-h-screen flex flex-col text-slate-950 bg-transparent">
      {/* Staff control bar — the public site's floating white bar, one row on phones */}
      <header className="px-3 sm:px-6 lg:px-8 pt-3 sm:pt-4">
        <div className="max-w-7xl mx-auto bg-white rounded-[1.6rem] sm:rounded-[2rem] shadow-xl border border-blue-400/40 pl-3 pr-2 sm:px-5 py-2 sm:py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
            <img
              src="/cpa%20logo%20final.svg"
              alt="CPA Padel"
              className="h-8 sm:h-10 w-auto shrink-0 select-none"
            />
            <span className="h-7 w-px bg-slate-200 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-display font-semibold uppercase tracking-wide text-xl sm:text-2xl leading-none text-[#0A0A0F]">
                {isAdmin ? (
                  <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                ) : (
                  <ClipboardEdit className="w-4 h-4 text-blue-600 shrink-0" />
                )}
                <span className="truncate">{isAdmin ? 'Admin Panel' : 'Scorekeeper'}</span>
              </div>
              <div className="text-[11px] font-mono font-bold text-slate-500 truncate mt-1">
                Signed in as {panelSession.name}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={onExit}
              aria-label="Back to the public site"
              className="h-10 min-w-10 px-2.5 sm:px-4 rounded-full border border-slate-900/20 bg-white text-[#0A0A0F] hover:bg-[#0A0A0F] hover:text-white text-[11px] font-mono font-bold uppercase tracking-widest inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Public site</span>
            </button>

            <button
              onClick={onLogout}
              aria-label="Sign out"
              className="h-10 min-w-10 px-2.5 sm:px-4 rounded-full border border-rose-300 bg-white text-rose-600 hover:bg-rose-600 hover:text-white text-[11px] font-mono font-bold uppercase tracking-widest inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* New deploy: staff pages never reload by themselves, so scores in
          flight or a half-typed result are never lost. */}
      {updateReady && (
        <div className="px-3 sm:px-6 lg:px-8 pt-3">
          <div
            role="status"
            className="max-w-7xl mx-auto rounded-2xl bg-white border-2 border-blue-300 shadow-md px-4 py-3 flex items-center gap-3"
          >
            <RefreshCw className="w-5 h-5 text-blue-600 shrink-0" />
            <p className="flex-1 min-w-0 text-sm font-semibold text-blue-900">
              A new version of the site is ready. Reload when you're between matches.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="shrink-0 min-h-10 px-4 rounded-full bg-[#0A0A0F] hover:bg-slate-800 text-[#CCFF00] text-[11px] font-mono font-bold uppercase tracking-widest cursor-pointer"
            >
              Reload
            </button>
          </div>
        </div>
      )}

      {/* Terminal content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        {isAdmin ? (
          <AdminView
            session={panelSession}
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
            session={panelSession}
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
