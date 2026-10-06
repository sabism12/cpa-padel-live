import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchBootstrap,
  fetchTournament,
  fetchSummary,
  fetchMatches,
  fetchStandings,
  fetchLatestResults,
  fetchTeams,
  checkAuth,
  EnrichedMatch,
  SummaryData,
} from './api';
import { DEFAULT_SETTINGS, INITIAL_GROUPS, INITIAL_COURTS, INITIAL_TEAMS } from '../server/seedData';
import { Group, Team, Court, TournamentSettings, StandingsRow, AuthSession } from './types';
import { Navbar, NavTab } from './components/Navbar';
import { LiveResultsView } from './components/LiveResultsView';
import { LiveCourtsView } from './components/LiveCourtsView';
import { StandingsView } from './components/StandingsView';
import { MatchesView } from './components/MatchesView';
import { KnockoutView } from './components/KnockoutView';
import { TeamSearchView } from './components/TeamSearchView';
import { StaffPortal } from './components/StaffPortal';
import { RefreshCw } from 'lucide-react';

function getStoredTournamentCache(): any | null {
  try {
    const saved = localStorage.getItem('cpa_tournament_cache');
    if (saved) return JSON.parse(saved);
  } catch {
    // ignore
  }
  return null;
}

/** Staff-only routes. These are never linked from the public spectator site. */
const STAFF_ROUTES = ['/staff', '/score', '/admin'];

function isStaffPath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  return STAFF_ROUTES.some((p) => path === p || path.startsWith(`${p}/`));
}

export default function App() {
  // Navigation state derived from URL or defaults
  const getInitialTab = (): NavTab => {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('/staff')) return 'score';
    if (path.includes('/score')) return 'score';
    if (path.includes('/admin')) return 'admin';
    if (path.includes('/knockout')) return 'knockout';
    if (path.includes('/matches')) return 'matches';
    if (path.includes('/teams')) return 'teams';
    if (path.includes('/standings')) return 'standings';
    if (path.includes('/courts')) return 'courts';
    return 'results';
  };

  const [activeTab, setActiveTabState] = useState<NavTab>(getInitialTab);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null);

  // Authentication session - spectators are always anonymous.
  // Staff privileges are only granted through the dedicated staff portal.
  const [session, setSession] = useState<AuthSession | null>(() => {
    try {
      const stored = localStorage.getItem('cpa_auth_session');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.token && (parsed.role === 'scorekeeper' || parsed.role === 'admin')) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return null;
  });

  // Load cached tournament state to eliminate cold-start empty screens
  const cachedStateRef = useRef<any>(getStoredTournamentCache());
  const cachedState = cachedStateRef.current;

  // Tournament Data State - initialize with cache or seed data for instant frame-1 rendering
  const [settings, setSettings] = useState<TournamentSettings>(
    cachedState?.settings || DEFAULT_SETTINGS
  );
  const [summary, setSummary] = useState<SummaryData | null>(
    cachedState?.summary || {
      totalMatches: 20,
      completedMatches: 0,
      liveMatches: 0,
      upcomingMatches: 20,
      lastUpdated: new Date().toISOString(),
      version: 1,
    }
  );
  const [groups, setGroups] = useState<Group[]>(cachedState?.groups || INITIAL_GROUPS);
  const [teams, setTeams] = useState<Team[]>(cachedState?.teams || INITIAL_TEAMS);
  const [courts, setCourts] = useState<Court[]>(cachedState?.courts || INITIAL_COURTS);
  const [matches, setMatches] = useState<EnrichedMatch[]>(cachedState?.matches || []);
  const [standings, setStandings] = useState<Record<string, StandingsRow[]>>(
    cachedState?.standings || {}
  );
  const [latestResults, setLatestResults] = useState<EnrichedMatch[]>(
    cachedState?.latestResults || []
  );
  // Never block the user with a full-screen spinner if we have immediate data
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date>(new Date());

  // Safe navigation with browser history sync
  const setActiveTab = (tab: NavTab) => {
    setActiveTabState(tab);
    const newPath = tab === 'results' ? '/' : tab === 'score' ? '/staff' : `/${tab}`;
    if (window.location.pathname !== newPath) {
      window.history.pushState(null, '', newPath);
    }
  };

  // Listen to popstate (browser back/forward)
  useEffect(() => {
    const handlePopState = () => {
      setActiveTabState(getInitialTab());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Reference to prevent concurrent overlapping fetches
  const isFetchingRef = useRef<boolean>(false);
  // Set when an update arrives mid-fetch, so we fetch once more afterwards
  // instead of dropping it (the in-flight response may predate the change).
  const refetchQueuedRef = useRef<boolean>(false);

  // Primary data fetcher: Uses high-speed single-request /api/bootstrap endpoint
  const loadAllData = useCallback(async (isInitial = false) => {
    if (isFetchingRef.current) {
      refetchQueuedRef.current = true;
      return;
    }
    isFetchingRef.current = true;

    try {
      if (isInitial) setIsSyncing(true);

      const data = await fetchBootstrap();

      setSettings(data.settings as TournamentSettings);
      setGroups(data.groups);
      setCourts(data.courts);
      setTeams(data.teams);
      setSummary(data.summary);
      setMatches(data.matches);
      setStandings(data.standings);
      setLatestResults(data.latestResults);
      setLastSynced(new Date());

      // Update local storage cache
      try {
        localStorage.setItem('cpa_tournament_cache', JSON.stringify(data));
      } catch {
        // ignore cache write quota
      }
    } catch (err: any) {
      console.warn('Bootstrap fetch notification:', err?.message || err);
      // Secondary fallback to individual endpoints
      try {
        const [tData, sData, mData, stdData, lrData, allTeams] = await Promise.all([
          fetchTournament(),
          fetchSummary(),
          fetchMatches(),
          fetchStandings(),
          fetchLatestResults(),
          fetchTeams(),
        ]);
        setSettings(tData.settings as TournamentSettings);
        setGroups(tData.groups);
        setCourts(tData.courts);
        setSummary(sData);
        setMatches(mData);
        setStandings(stdData);
        setLatestResults(lrData);
        setTeams(allTeams);
        setLastSynced(new Date());
      } catch (fallbackErr: any) {
        // Transient offline or server reconnect - preserve current UI state gracefully
        console.warn('Network sync temporary retry:', fallbackErr?.message || fallbackErr);
        if (isInitial) {
          setTimeout(() => {
            loadAllData(false);
          }, 2000);
        }
      }
    } finally {
      isFetchingRef.current = false;
      if (isInitial) {
        setLoading(false);
        setIsSyncing(false);
      }
      if (refetchQueuedRef.current) {
        refetchQueuedRef.current = false;
        void loadAllData(false);
      }
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadAllData(true);
  }, [loadAllData]);

  // Synchronize and validate session with server. An invalid/expired staff
  // token is dropped rather than silently upgraded.
  useEffect(() => {
    if (!session?.token) return;

    checkAuth(session.token)
      .then((verified) => {
        if (
          !verified ||
          !verified.authenticated ||
          (verified.role !== 'scorekeeper' && verified.role !== 'admin')
        ) {
          localStorage.removeItem('cpa_auth_session');
          setSession(null);
        } else {
          setSession((prev) => {
            if (!prev) return null;
            return {
              token: verified.token || prev.token,
              role: verified.role,
              name: verified.name || prev.name,
              expiresAt: prev.expiresAt || Date.now() + 48 * 60 * 60 * 1000,
            };
          });
        }
      })
      .catch(() => {
        // ignore transient offline fetch errors
      });
  }, [session?.token]);

  // Real-time updates. The server pushes a message over SSE whenever anything
  // changes; we then refetch once. Polling is only a fallback while the live
  // connection is down, so a crowd of spectators doesn't hammer the server.
  useEffect(() => {
    const SSE_DEBOUNCE_MS = 300;
    const FALLBACK_POLL_MS = 15000;
    const RECONNECT_MS = 5000;
    // Render's free plan sleeps without inbound requests; SSE heartbeats are
    // outbound, so make one quiet request every 5 minutes while visible.
    const KEEP_AWAKE_MS = 5 * 60 * 1000;

    let eventSource: EventSource | null = null;
    let debounceTimer: number | null = null;
    let reconnectTimer: number | null = null;
    let stopped = false;

    const isVisible = () => document.visibilityState === 'visible';
    const isLive = () => eventSource?.readyState === EventSource.OPEN;

    // Several updates in a burst (rapid taps) trigger a single refetch.
    const scheduleRefresh = () => {
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null;
        void loadAllData(false);
      }, SSE_DEBOUNCE_MS);
    };

    const connect = () => {
      if (stopped) return;
      try {
        eventSource = new EventSource('/api/live-events');
      } catch {
        eventSource = null;
        return;
      }
      // Fires on first connect and after every automatic reconnect: catch up
      // on anything missed while the connection was down.
      eventSource.onopen = () => scheduleRefresh();
      eventSource.onmessage = (event) => {
        try {
          if (JSON.parse(event.data)?.type === 'connected') return;
        } catch {
          // not JSON; still treat it as a change notification
        }
        scheduleRefresh();
      };
      eventSource.onerror = () => {
        // The browser reconnects by itself while readyState is CONNECTING.
        // It gives up only when CLOSED, so then we reconnect ourselves.
        if (eventSource?.readyState === EventSource.CLOSED && reconnectTimer === null) {
          reconnectTimer = window.setTimeout(() => {
            reconnectTimer = null;
            connect();
          }, RECONNECT_MS);
        }
      };
    };

    connect();

    const pollTimer = window.setInterval(() => {
      if (isVisible() && !isLive()) void loadAllData(false);
    }, FALLBACK_POLL_MS);

    const keepAwakeTimer = window.setInterval(() => {
      if (isVisible()) void loadAllData(false);
    }, KEEP_AWAKE_MS);

    // Coming back to the tab (phone unlocked, app switched): refresh at once.
    const onVisible = () => {
      if (isVisible()) void loadAllData(false);
    };
    const onOnline = () => void loadAllData(false);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);

    return () => {
      stopped = true;
      eventSource?.close();
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      window.clearInterval(pollTimer);
      window.clearInterval(keepAwakeTimer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [loadAllData]);

  const handleLogout = () => {
    localStorage.removeItem('cpa_auth_session');
    setSession(null);
  };

  const handleSelectTeam = (teamId: string) => {
    setSelectedTeamId(teamId);
    setActiveTab('teams');
  };

  const handleGoToScorekeeper = (courtId?: string) => {
    if (courtId) setSelectedCourtId(courtId);
    setActiveTab('score');
  };

  // -----------------------------------------------------------------
  // Staff portal (scorekeeper / admin) - separate, unlinked entry point
  // -----------------------------------------------------------------
  if (isStaffPath(window.location.pathname)) {
    return (
      <StaffPortal
        view={activeTab === 'admin' ? 'admin' : 'score'}
        session={session}
        courts={courts}
        matches={matches}
        teams={teams}
        groups={groups}
        settings={settings}
        standings={standings}
        selectedCourtId={selectedCourtId}
        onLogin={(newSession) => setSession(newSession)}
        onLogout={handleLogout}
        onChangeView={(view) => setActiveTab(view)}
        onExit={() => setActiveTab('results')}
        onRefreshData={() => loadAllData(false)}
      />
    );
  }

  // -----------------------------------------------------------------
  // Public spectator site
  // -----------------------------------------------------------------
  return (
    <div className="min-h-screen flex flex-col bg-transparent text-slate-950 selection:bg-[#0A0A0F] selection:text-[#CCFF00]">
      {/* Top Navbar in WTA Tour Style */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        teams={teams}
        matches={matches}
        courts={courts}
        onSelectTeam={handleSelectTeam}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        {isSyncing && matches.length === 0 && (
          <div className="mb-4 px-4 py-2.5 rounded-2xl bg-white/90 backdrop-blur-md border border-blue-400 text-xs text-slate-950 shadow-md flex items-center justify-between">
            <span className="flex items-center gap-2 font-bold">
              <span className="w-2 h-2 rounded-full bg-[#0A0A0F] animate-ping" />
              Connecting to live tournament courts...
            </span>
          </div>
        )}

        <>
          {activeTab === 'results' && (
              <LiveResultsView
                summary={summary}
                groups={groups}
                standings={standings}
                matches={matches}
                latestResults={latestResults}
                settings={settings}
                onSelectTeam={handleSelectTeam}
                onGoToCourts={() => setActiveTab('courts')}
                onGoToMatches={() => setActiveTab('matches')}
                onGoToStandings={() => setActiveTab('standings')}
              />
            )}

            {activeTab === 'courts' && (
              <LiveCourtsView
                courts={courts}
                matches={matches}
                onSelectTeam={handleSelectTeam}
              />
            )}

            {activeTab === 'standings' && (
              <StandingsView
                groups={groups}
                standings={standings}
                settings={settings}
                onSelectTeam={handleSelectTeam}
                onNavigateKnockout={() => setActiveTab('knockout')}
              />
            )}

            {activeTab === 'knockout' && (
              <KnockoutView
                matches={matches}
                teams={teams}
                courts={courts}
                groups={groups}
                standings={standings}
                settings={settings}
                session={session}
                onSelectTeam={handleSelectTeam}
                onGoToScorekeeper={session ? handleGoToScorekeeper : undefined}
                onNavigateTab={(tab) => setActiveTab(tab)}
                onRefreshData={() => loadAllData(false)}
              />
            )}

            {activeTab === 'matches' && (
              <MatchesView
                matches={matches}
                groups={groups}
                courts={courts}
                onSelectTeam={handleSelectTeam}
              />
            )}

            {activeTab === 'teams' && (
              <TeamSearchView
                teams={teams}
                groups={groups}
                matches={matches}
                standings={standings}
                initialSelectedTeamId={selectedTeamId}
              />
            )}
          </>
      </main>

      {/* Global Live Synchronization Footer Bar */}
      <footer className="border-t border-white/30 bg-transparent py-5 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono font-bold text-white/90">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#CCFF00] animate-pulse" />
            <span className="font-extrabold text-white">Official Live Scoring System Active</span>
            <span>&bull;</span>
            <span className="opacity-80">Synced: {lastSynced.toLocaleTimeString()}</span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => loadAllData(false)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-slate-950 hover:bg-slate-100 transition-colors shadow-sm cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Now</span>
            </button>
            <span>&bull;</span>
            <span className="uppercase tracking-wider">CPA – India Padel Tour Qatar &copy; 2026</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
