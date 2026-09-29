import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Menu,
  Search,
  Bell,
  X,
  Radio,
  Trophy,
  Calendar,
  Swords,
  Users,
  Layers,
  Zap,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { Court, Group, Team } from '../types';
import { EnrichedMatch } from '../api';
import actionSquareImg from '../assets/images/padel_action_square_1790159179818.jpg';
import knockoutsIconSvgRaw from '../assets/knockouts-icon.svg?raw';
import courtsIconSvgRaw from '../assets/courts-icon.svg?raw';
import rankingsIconSvgRaw from '../assets/rankings-icon.svg?raw';
import { pairLabel } from '../utils/teamDisplay';

export type NavTab = 'results' | 'courts' | 'standings' | 'knockout' | 'matches' | 'teams' | 'score' | 'admin';

// Build the data URI in JS: the SVG ships inside the bundle, so no separate
// asset request can ever fail or get cached/stale independently.
const rankingsIconDataUri = `data:image/svg+xml,${encodeURIComponent(rankingsIconSvgRaw)}`;
const courtsIconDataUri = `data:image/svg+xml,${encodeURIComponent(courtsIconSvgRaw)}`;
const knockoutsIconDataUri = `data:image/svg+xml,${encodeURIComponent(knockoutsIconSvgRaw)}`;

interface NavbarProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  teams?: Team[];
  matches?: EnrichedMatch[];
  courts?: Court[];
  onSelectTeam?: (teamId: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  teams = [],
  matches = [],
  courts = [],
  onSelectTeam,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Search input focus ref
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  // Filtered search results
  const filteredTeams = searchQuery.trim()
    ? teams.filter(
        (t) =>
          t.player1.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.player2.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const filteredMatches = searchQuery.trim()
    ? matches.filter(
        (m) =>
          `${m.team1?.player1} ${m.team1?.player2}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
          `${m.team2?.player1} ${m.team2?.player2}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
          `match ${m.matchNumber}`.includes(searchQuery.toLowerCase())
      )
    : [];

  // Alerts derived from real match data, so they mirror the tournament:
  // live courts first, then latest results, then upcoming fixtures.
  const formatAge = (iso?: string) => {
    if (!iso) return 'recently';
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins === 1) return '1 minute ago';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const notifications = useMemo(() => {
    const items: { id: string; title: string; desc: string; time: string; live?: boolean }[] = [];

    // Live matches
    matches
      .filter((m) => m.status === 'live')
      .forEach((m) => {
        items.push({
          id: `live-${m.id}`,
          title: `${m.court?.name || 'Court'} — Live Now`,
          desc: `${pairLabel(m.team1, 'TBD')} vs ${pairLabel(m.team2, 'TBD')} • Games ${m.padelState?.team1Games ?? 0}–${m.padelState?.team2Games ?? 0}`,
          time: 'Live now',
          live: true,
        });
      });

    // Latest results (newest first)
    matches
      .filter((m) => m.status === 'completed')
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
      .slice(0, 8)
      .forEach((m) => {
        const winner =
          (m.team1Score ?? 0) > (m.team2Score ?? 0) ? m.team1 : m.team2;
        items.push({
          id: `result-${m.id}`,
          title: `Result • ${m.court?.name || 'Match ' + m.matchNumber}`,
          desc: `${pairLabel(m.team1, 'TBD')} ${m.team1Score ?? 0} – ${m.team2Score ?? 0} ${pairLabel(m.team2, 'TBD')} • ${winner ? pairLabel(winner, '') + ' won' : ''}`,
          time: formatAge(m.completedAt),
        });
      });

    // Upcoming fixtures
    matches
      .filter((m) => m.status === 'scheduled' || m.status === 'ready')
      .slice(0, 5)
      .forEach((m) => {
        items.push({
          id: `up-${m.id}`,
          title: `Upcoming • ${m.court?.name || 'Court'}`,
          desc: `${pairLabel(m.team1, 'TBD')} vs ${pairLabel(m.team2, 'TBD')} • ${m.scheduledTime || 'Time TBD'}`,
          time: 'Soon',
        });
      });

    return items.slice(0, 15);
  }, [matches]);

  const handleSelectNav = (tab: NavTab) => {
    setActiveTab(tab);
    setDrawerOpen(false);
  };

  // Live tournament ticker (WTA-style): just the brand + LIVE NOW, repeating.
  const tickerItems: { label: string; live?: boolean }[] = [
    { label: 'CPA PADEL' },
    { label: 'LIVE NOW', live: true },
  ];

  return (
    <header className="w-full relative z-40">
      {/* 1. TOP CANOPY CANVAS
           Transparent so the document gradient runs straight through it
           (the blue gradient starts at the top of the page). */}
      <div className="bg-transparent text-slate-950 pt-2 pb-5 sm:pb-6">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
          
          {/* A. Live Tournament Ticker — WTA-style: edge-faded, dot-separated
               marquee (10 copies so the -50% loop always covers the viewport),
               with vertical breathing room above the nav bar like the real
               WTA header. */}
          <div className="mb-3 sm:mb-4 ticker-fade overflow-hidden">
            <div className="py-1 flex items-center whitespace-nowrap animate-ticker will-change-transform">
              {Array.from({ length: 10 }).map((_, copy) => (
                <div key={copy} className="flex items-center shrink-0" aria-hidden={copy > 0}>
                  {tickerItems.map((item, i) => (
                    <span key={i} className="flex items-center pr-4 sm:pr-6">
                      <span className="mr-2 sm:mr-2.5 w-1.5 h-1.5 rounded-full bg-white/60" />
                      <span className="text-xs sm:text-[13px] font-mono font-medium uppercase tracking-[0.02em] text-white/90">
                        {item.label}
                      </span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* B. Floating White Navigation Bar — rectangle with round corners (NOT a pill) */}
          <div className="relative bg-white h-18 sm:h-20 lg:h-24 rounded-[1.6rem] sm:rounded-[2.4rem] shadow-xl px-3 sm:px-6 flex items-center justify-between border border-blue-400/40 select-none">
            {/* Left Controls: Menu (Hamburger) & Search */}
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={() => setDrawerOpen(true)}
                className="p-2 sm:p-2.5 rounded-full hover:bg-slate-100 text-slate-900 transition-colors cursor-pointer"
                aria-label="Open tour menu"
                title="Menu"
              >
                <Menu className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.2]" />
              </button>

              <button
                onClick={() => setSearchOpen(true)}
                className="p-2 sm:p-2.5 rounded-full hover:bg-slate-100 text-slate-900 transition-colors cursor-pointer"
                aria-label="Search players and matches"
                title="Search"
              >
                <Search className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.2]" />
              </button>
            </div>

            {/* Center Logo: the official CPA Padel mark, on its own.
                 Absolutely centred on the pill itself - with `justify-between`
                 the wider left control group (menu + search) would otherwise
                 push it off-centre on small screens.
                 public/cpa logo final.svg is tight to its viewBox at 1.515:1,
                 so a height with w-auto sizes it without distortion. */}
            <div
              onClick={() => handleSelectNav('results')}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer group flex items-center"
            >
              <img
                src="/cpa%20logo%20final.svg"
                alt="CPA Padel"
                className="h-10 sm:h-12 lg:h-14 w-auto select-none transition-transform group-hover:scale-105 duration-150"
              />
            </div>

            {/* Right Controls: Notification Bell with Green Badge + Profile Avatar */}
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Bell with Badge '17' */}
              <div className="relative">
                <button
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                  className="relative p-2 sm:p-2.5 rounded-full hover:bg-slate-100 text-slate-900 transition-colors cursor-pointer"
                  aria-label="View notifications"
                  title="Notifications"
                >
                  <Bell className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.2]" />
                  {/* Live alert count badge (real tournament data) */}
                  <span className="absolute top-1 right-0.5 min-w-4 h-4 sm:min-w-5 sm:h-5 px-1 bg-[#CCFF00] text-slate-950 font-black text-[10px] sm:text-[11px] rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                    {notifications.length}
                  </span>
                </button>

                {/* Notifications Dropdown */}
                {notificationsOpen && (
                  <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-slate-950 text-slate-100 rounded-2xl shadow-2xl border border-slate-800 p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 px-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#CCFF00]" />
                        <span className="font-display font-bold text-sm text-white">Live Tour Alerts</span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-[#CCFF00] font-bold">
                        {notifications.length} Updates
                      </span>
                    </div>

                    <div className="max-h-80 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800">
                      {notifications.length === 0 ? (
                        <div className="text-center py-6 text-[11px] text-slate-500 font-mono">
                          No match updates yet — check back soon.
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <div
                            key={n.id}
                            className="p-2 rounded-xl hover:bg-slate-900 transition-colors text-left text-xs cursor-pointer"
                          >
                            <div className="flex items-center justify-between text-[11px] font-bold text-white mb-0.5 gap-2">
                              <span className={`truncate flex items-center gap-1.5 ${n.live ? 'text-[#CCFF00]' : ''}`}>
                                {n.live && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#CCFF00] animate-pulse shrink-0" />
                                )}
                                {n.title}
                              </span>
                              <span className={`text-[10px] font-mono shrink-0 ${n.live ? 'text-[#CCFF00]' : 'text-slate-500'}`}>
                                {n.time}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400">{n.desc}</p>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="pt-2 mt-2 border-t border-slate-800 text-center">
                      <button
                        onClick={() => setNotificationsOpen(false)}
                        className="text-[11px] font-bold text-[#CCFF00] hover:underline"
                      >
                        Close Alerts
                      </button>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>

          {/* C. Quick Navigation Story Cards Carousel (Applet Widgets on Green Background) */}
          <div className="mt-4 sm:mt-5 overflow-x-auto pb-1 scrollbar-none">
            <div className="flex items-start gap-3 sm:gap-4 min-w-max px-1">
              
              {/* Widget 1: SCORES (Purple card with padel ball & live score) */}
              <div
                onClick={() => handleSelectNav('results')}
                className="group flex flex-col items-center cursor-pointer select-none"
              >
                <div
                  className={`w-18 h-18 sm:w-20 sm:h-20 rounded-2xl p-2 bg-[#0A0A0F] border-2 transition-all duration-200 flex flex-col justify-between shadow-lg ${
                    activeTab === 'results'
                      ? 'border-yellow-300 scale-105 shadow-yellow-400/20'
                      : 'border-zinc-700/50 hover:border-blue-500 hover:scale-102'
                  }`}
                >
                  {/* Neon Ball Icon & Top Score */}
                  <div className="flex items-center justify-between text-yellow-300 font-mono font-black text-xs">
                    {/* Stylized Padel/Tennis Ball */}
                    <div className="w-4 h-4 rounded-full bg-yellow-300 relative flex items-center justify-center overflow-hidden shadow-sm">
                      <div className="absolute inset-0 border border-slate-950 rounded-full opacity-60" />
                      <div className="w-3 h-0.5 bg-slate-950 rounded-full rotate-45" />
                    </div>
                    <span className="text-white text-xs font-mono">6</span>
                  </div>

                  {/* Score Matrix: 30 6 / 40 4 (Exactly matching screenshot) */}
                  <div className="flex items-center justify-between font-mono font-black text-sm leading-none">
                    <span className="text-yellow-300 text-base">30</span>
                    <span className="text-white text-base">6</span>
                  </div>
                  <div className="flex items-center justify-between font-mono font-black text-sm leading-none">
                    <span className="text-yellow-300 text-base">40</span>
                    <span className="text-white text-base">4</span>
                  </div>
                </div>

                <div className="mt-1.5 flex items-center gap-1 text-[11px] font-mono font-extrabold uppercase tracking-wide text-slate-950">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-300" />
                  <span>SCORES</span>
                </div>
              </div>

              {/* Widget 2: RANKINGS / STANDINGS (Mint card with leaderboard icon & CPA RANKINGS text) */}
              <div
                onClick={() => handleSelectNav('standings')}
                className="group flex flex-col items-center cursor-pointer select-none"
              >
                <div
                  className={`w-18 h-18 sm:w-20 sm:h-20 rounded-2xl p-0 bg-gradient-to-br from-[#CCFF00] to-lime-300 border-2 transition-all duration-200 flex flex-col shadow-lg relative overflow-hidden text-center ${
                    activeTab === 'standings'
                      ? 'border-slate-900 scale-105'
                      : 'border-white/80 hover:border-blue-500 hover:scale-102'
                  }`}
                >
                  {/* Custom rankings icon (bundled+hashed, cannot 404 from a
                      stale asset path). */}
                  <img
                    src={rankingsIconDataUri}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>

                <div className="mt-1.5 text-[11px] font-mono font-extrabold uppercase tracking-wide text-slate-950">
                  RANKINGS
                </div>
              </div>

              {/* Widget 3: LIVE COURTS (Square action image with live-broadcast badge) */}
              <div
                onClick={() => handleSelectNav('courts')}
                className="group flex flex-col items-center cursor-pointer select-none"
              >
                <div
                  className={`w-18 h-18 sm:w-20 sm:h-20 rounded-2xl bg-slate-900 border-2 transition-all duration-200 shadow-lg relative overflow-hidden ${
                    activeTab === 'courts'
                      ? 'border-slate-900 scale-105'
                      : 'border-blue-300/80 hover:border-blue-500 hover:scale-102'
                  }`}
                >
                  <img
                    src={courtsIconDataUri}
                    alt="CPA Padel Courts icon"
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="mt-1.5 text-[11px] font-mono font-extrabold uppercase tracking-wide text-slate-950">
                  COURTS
                </div>
              </div>

              {/* Widget 4: KNOCKOUTS (custom full-bleed icon) */}
              <div
                onClick={() => handleSelectNav('knockout')}
                className="group flex flex-col items-center cursor-pointer select-none"
              >
                <div
                  className={`w-18 h-18 sm:w-20 sm:h-20 rounded-2xl bg-white border-2 transition-all duration-200 shadow-lg relative overflow-hidden ${
                    activeTab === 'knockout'
                      ? 'border-zinc-700 scale-105'
                      : 'border-zinc-300 hover:border-blue-500 hover:scale-102'
                  }`}
                >
                  <img
                    src={knockoutsIconDataUri}
                    alt="CPA Padel Knockouts icon"
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="mt-1.5 text-[11px] font-mono font-extrabold uppercase tracking-wide text-slate-950">
                  KNOCKOUTS
                </div>
              </div>

              {/* Widget 5: FIXTURES (Dark card with match-day calendar icon) */}
              <div
                onClick={() => handleSelectNav('matches')}
                className="group flex flex-col items-center cursor-pointer select-none"
              >
                <div
                  className={`w-18 h-18 sm:w-20 sm:h-20 rounded-2xl p-2 bg-[#0e1628] border-2 transition-all duration-200 flex flex-col items-center justify-center shadow-lg text-center ${
                    activeTab === 'matches'
                      ? 'border-blue-400 scale-105'
                      : 'border-slate-800 hover:border-blue-400 hover:scale-102'
                  }`}
                >
                  {/* Match-day calendar mini-icon */}
                  <div className="w-9 h-9 rounded-lg border-[2px] border-white/80 bg-white/5 flex flex-col overflow-hidden mb-1">
                    {/* Calendar binder rings */}
                    <div className="flex items-center justify-between px-1 pt-[3px] pb-[2px] border-b-[2px] border-white/80 bg-[#CCFF00]">
                      <span className="w-[2px] h-[5px] rounded-full bg-[#0e1628]" />
                      <span className="w-[2px] h-[5px] rounded-full bg-[#0e1628]" />
                    </div>
                    {/* Grid with one marked match-day */}
                    <div className="flex-1 grid grid-cols-3 gap-[2px] p-[3px] items-center">
                      {[0, 1, 2, 3, 4, 5].map((cell) => (
                        <span
                          key={cell}
                          className={`w-[5px] h-[5px] rounded-[1.5px] ${
                            cell === 4 ? 'bg-[#CCFF00] shadow-[0_0_5px_#CCFF00]' : 'bg-white/30'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-black uppercase text-blue-300 leading-none">
                    ALL
                  </span>
                  <span className="text-[9px] font-mono uppercase text-slate-400">
                    MATCHES
                  </span>
                </div>

                <div className="mt-1.5 text-[11px] font-mono font-extrabold uppercase tracking-wide text-slate-950">
                  FIXTURES
                </div>
              </div>

              {/* Widget 6: TEAMS */}
              <div
                onClick={() => handleSelectNav('teams')}
                className="group flex flex-col items-center cursor-pointer select-none"
              >
                <div
                  className={`w-18 h-18 sm:w-20 sm:h-20 rounded-2xl p-2 bg-gradient-to-br from-slate-900 to-sky-950 border-2 transition-all duration-200 flex flex-col items-center justify-center shadow-lg text-center ${
                    activeTab === 'teams'
                      ? 'border-sky-400 scale-105'
                      : 'border-slate-800 hover:border-sky-400 hover:scale-102'
                  }`}
                >
                  {/* Squad formation mini-icon: 2x2 player dots */}
                  <div className="w-9 h-9 rounded-xl border-[2px] border-sky-400/70 bg-sky-500/10 grid grid-cols-2 gap-[3px] p-[4px] mb-1">
                    <span className="rounded-full bg-[#CCFF00] shadow-[0_0_5px_#CCFF00]" />
                    <span className="rounded-full bg-white/80" />
                    <span className="rounded-full bg-white/80" />
                    <span className="rounded-full bg-[#CCFF00] shadow-[0_0_5px_#CCFF00]" />
                  </div>
                  <span className="text-[10px] font-mono font-black uppercase text-sky-300 leading-none">
                    20 TEAMS
                  </span>
                </div>

                <div className="mt-1.5 text-[11px] font-mono font-extrabold uppercase tracking-wide text-slate-950">
                  TEAMS
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>

      {/* 3. SEARCH OVERLAY MODAL */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-start justify-center pt-16 px-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-5 shadow-2xl animate-in zoom-in-95 duration-150">
            {/* Search Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 flex-1 mr-2">
                <Search className="w-5 h-5 text-blue-400 shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search teams, players, courts, or match number..."
                  className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
                />
              </div>
              <button
                onClick={() => {
                  setSearchOpen(false);
                  setSearchQuery('');
                }}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Results */}
            <div className="mt-4 max-h-96 overflow-y-auto space-y-4">
              {searchQuery.trim() === '' ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  Type a player name (e.g. "Hamood"), pairing, or court to jump instantly.
                </div>
              ) : (
                <>
                  {filteredTeams.length > 0 && (
                    <div>
                      <div className="text-[11px] font-mono uppercase text-slate-400 font-bold mb-2">
                        Teams ({filteredTeams.length})
                      </div>
                      <div className="space-y-1.5">
                        {filteredTeams.map((team) => (
                          <div
                            key={team.id}
                            onClick={() => {
                              if (onSelectTeam) onSelectTeam(team.id);
                              setSearchOpen(false);
                              handleSelectNav('teams');
                            }}
                            className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800/80 flex items-center justify-between cursor-pointer transition-colors"
                          >
                            <div>
                              <div className="text-sm font-bold text-white">{team.name}</div>
                              <div className="text-xs text-slate-400">
                                {team.player1} & {team.player2}
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-500" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {filteredMatches.length > 0 && (
                    <div>
                      <div className="text-[11px] font-mono uppercase text-slate-400 font-bold mb-2">
                        Matches ({filteredMatches.length})
                      </div>
                      <div className="space-y-1.5">
                        {filteredMatches.slice(0, 5).map((match) => (
                          <div
                            key={match.id}
                            onClick={() => {
                              setSearchOpen(false);
                              handleSelectNav('matches');
                            }}
                            className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800/80 flex items-center justify-between cursor-pointer transition-colors"
                          >
                            <div>
                              <div className="text-xs font-mono text-blue-400 font-bold">
                                Match #{match.matchNumber} · {match.scheduledTime}
                              </div>
                              <div className="text-sm font-bold text-white">
                                {pairLabel(match.team1, 'TBD')} vs {pairLabel(match.team2, 'TBD')}
                              </div>
                            </div>
                            <div className="font-mono text-sm font-black text-lime-400">
                              {match.team1Score !== null && match.team2Score !== null
                                ? `${match.team1Score} - ${match.team2Score}`
                                : 'vs'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {filteredTeams.length === 0 && filteredMatches.length === 0 && (
                    <div className="text-center py-6 text-xs text-slate-500">
                      No teams or matches found for "{searchQuery}".
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. SLIDING TOUR MENU DRAWER */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
          />

          {/* Drawer Content */}
          <div className="relative w-80 sm:w-96 bg-slate-950 border-r border-slate-800 h-full p-6 flex flex-col justify-between shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            <div>
              {/* Drawer Brand */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-[#CCFF00] text-slate-950 font-bold flex items-center justify-center font-display italic text-lg shadow-md">
                    CPA
                  </div>
                  <div>
                    <div className="text-base font-display font-bold text-white">CPA Padel Tour</div>
                    <div className="text-[10px] font-mono text-[#CCFF00]">2026 World Season</div>
                  </div>
                </div>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Navigation Links */}
              <div className="space-y-1">
                {[
                  { id: 'results', label: 'Live Results & Scores', icon: <Zap className="w-4 h-4 text-blue-400" /> },
                  { id: 'courts', label: 'Live Courts (5 Arenas)', icon: <Radio className="w-4 h-4 text-sky-400" /> },
                  { id: 'standings', label: 'Tour Standings & Rankings', icon: <Trophy className="w-4 h-4 text-amber-400" /> },
                  { id: 'knockout', label: 'Knockout Bracket & Finals', icon: <Layers className="w-4 h-4 text-rose-400" /> },
                  { id: 'matches', label: 'Match Schedule & Fixtures', icon: <Calendar className="w-4 h-4 text-blue-400" /> },
                  { id: 'teams', label: 'Teams & Player Directory', icon: <Users className="w-4 h-4 text-sky-400" /> },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleSelectNav(item.id as NavTab)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                      activeTab === item.id
                        ? 'bg-slate-900 text-[#CCFF00] border border-slate-800'
                        : 'text-slate-300 hover:bg-slate-900/60 hover:text-white'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>

              {/* Live Group Draw — separate lazy-loaded presentation route */}
              <a
                href="/draw"
                className="mt-4 flex items-center gap-3 rounded-xl border border-[#CCFF00]/40 bg-[#CCFF00]/10 px-3.5 py-2.5 text-xs font-bold text-[#CCFF00] transition-colors hover:bg-[#CCFF00]/20 sm:text-sm"
              >
                <Sparkles className="w-4 h-4" />
                <span>Live Group Draw</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
