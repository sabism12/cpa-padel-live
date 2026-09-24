import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  Search,
  Bell,
  X,
  Radio,
  Trophy,
  Calendar,
  Users,
  Layers,
  Zap,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { Court, Group, Team } from '../types';
import { EnrichedMatch } from '../api';
import actionSquareImg from '../assets/images/padel_action_square_1790159179818.jpg';
import { pairLabel } from '../utils/teamDisplay';

export type NavTab = 'results' | 'courts' | 'standings' | 'knockout' | 'matches' | 'teams' | 'score' | 'admin';

interface NavbarProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  liveMatchesCount: number;
  teams?: Team[];
  matches?: EnrichedMatch[];
  courts?: Court[];
  onSelectTeam?: (teamId: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  liveMatchesCount,
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

  // 17 realistic WTA-style tour notification items (matching badge 17 in screenshot)
  const notifications = [
    { id: '1', title: 'Grand Final Completed', desc: 'Hamood / Hossam defeat Jamshi / Hisham 6-3', time: '12m ago', type: 'final' },
    { id: '2', title: '3rd Place Playoff', desc: 'Derrick / Elvis edge Adil / Fawaz 6-4', time: '35m ago', type: 'result' },
    { id: '3', title: 'Court 1 Live Now', desc: 'Championship Trophy Ceremony underway', time: 'Just now', type: 'live' },
    { id: '4', title: 'Tournament MVP Announced', desc: 'Player of the 2026 Season awarded', time: '1h ago', type: 'news' },
    { id: '5', title: 'Semi-Final 2 Result', desc: 'Jamshi / Hisham def. Adil / Fawaz 6-4', time: '2h ago', type: 'result' },
    { id: '6', title: 'Semi-Final 1 Result', desc: 'Hamood / Hossam def. Derrick / Elvis 6-2', time: '2h ago', type: 'result' },
    { id: '7', title: 'Court 2 Match Ended', desc: 'Suhaim / Zubair finished final classification', time: '3h ago', type: 'court' },
    { id: '8', title: 'Group A Standings Locked', desc: 'Hamood / Hossam qualify as Seed #1', time: '4h ago', type: 'standings' },
    { id: '9', title: 'Group B Standings Locked', desc: 'Derrick / Elvis qualify as Seed #1', time: '4h ago', type: 'standings' },
    { id: '10', title: 'Group C Standings Locked', desc: 'Jamshi / Hisham top group with 12 points', time: '5h ago', type: 'standings' },
    { id: '11', title: 'Group D Standings Locked', desc: 'Adil / Fawaz advance to QF', time: '5h ago', type: 'standings' },
    { id: '12', title: 'Court 3 Scheduled Match', desc: 'Faisal / Muhammed vs Mohammed Jalil / Abdullah Mahmoud completed', time: '5h ago', type: 'court' },
    { id: '13', title: 'Fastest Smash Recorded', desc: '142 km/h smash logged', time: '6h ago', type: 'stat' },
    { id: '14', title: 'Attendance Record', desc: 'Full capacity of 4,200 spectators reached', time: '6h ago', type: 'news' },
    { id: '15', title: 'Official Scorekeeper Active', desc: 'Live electronic line scoring verified', time: '7h ago', type: 'system' },
    { id: '16', title: '1969 Indoor Padel Link Active', desc: 'Partner broadcast live stream ready', time: '8h ago', type: 'system' },
    { id: '17', title: 'Tournament Opened', desc: 'Official Welcome Ceremony complete', time: '9h ago', type: 'system' },
  ];

  const handleSelectNav = (tab: NavTab) => {
    setActiveTab(tab);
    setDrawerOpen(false);
  };

  return (
    <header className="w-full relative z-40">
      {/* 1. TOP WTA-STYLE CANOPY CANVAS
           Transparent so the document gradient runs straight through it
           (the gradient starts on this same emerald at the top). */}
      <div className="bg-transparent text-slate-950 pt-2 pb-5 sm:pb-6">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
          
          {/* A. Ticker Header Line */}
          <div className="overflow-hidden whitespace-nowrap mb-2 px-2 flex items-center justify-between text-[11px] sm:text-xs font-mono font-bold tracking-tight uppercase text-slate-900">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="font-extrabold truncate">CPA PADEL TOUR 2026</span>
              <span className="opacity-60">•</span>
              <span className="hidden sm:inline opacity-90">CPA PADEL FINALS</span>
              <span className="hidden sm:inline opacity-60">•</span>
              <span className="hidden md:inline text-slate-800">OFFICIAL LIVE SCORING</span>
            </div>

            <div className="hidden sm:flex items-center gap-2 text-[10px] font-display font-bold tracking-widest text-slate-900 shrink-0">
              <span className="italic">CPA</span>
              <span>|</span>
              <span className="tracking-wider">1969 padel</span>
            </div>
          </div>

          {/* B. Iconic Floating White Capsule Navigation Bar (Matching Screenshot) */}
          <div className="relative bg-white rounded-full sm:rounded-3xl shadow-xl px-3 sm:px-6 py-2 sm:py-2.5 flex items-center justify-between border border-emerald-400/40 select-none">
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
                className="h-9 sm:h-10 w-auto select-none transition-transform group-hover:scale-105 duration-150"
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
                  {/* Vibrant emerald circular badge matching screenshot */}
                  <span className="absolute top-1 right-0.5 min-w-4 h-4 sm:min-w-5 sm:h-5 px-1 bg-[#00DF81] text-slate-950 font-black text-[10px] sm:text-[11px] rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                    17
                  </span>
                </button>

                {/* Notifications Dropdown */}
                {notificationsOpen && (
                  <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-slate-950 text-slate-100 rounded-2xl shadow-2xl border border-slate-800 p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 px-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#00DF81]" />
                        <span className="font-display font-bold text-sm text-white">Live Tour Alerts</span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-[#00DF81] font-bold">
                        17 Updates
                      </span>
                    </div>

                    <div className="max-h-80 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800">
                      {notifications.map((n) => (
                        <div
                          key={n.id}
                          className="p-2 rounded-xl hover:bg-slate-900 transition-colors text-left text-xs cursor-pointer"
                        >
                          <div className="flex items-center justify-between text-[11px] font-bold text-white mb-0.5">
                            <span>{n.title}</span>
                            <span className="text-[10px] font-mono text-slate-500">{n.time}</span>
                          </div>
                          <p className="text-[11px] text-slate-400">{n.desc}</p>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 mt-2 border-t border-slate-800 text-center">
                      <button
                        onClick={() => setNotificationsOpen(false)}
                        className="text-[11px] font-bold text-[#00DF81] hover:underline"
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
                  className={`w-18 h-18 sm:w-20 sm:h-20 rounded-2xl p-2 bg-[#170036] border-2 transition-all duration-200 flex flex-col justify-between shadow-lg ${
                    activeTab === 'results'
                      ? 'border-yellow-300 scale-105 shadow-yellow-400/20'
                      : 'border-purple-900/50 hover:border-purple-500 hover:scale-102'
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

              {/* Widget 2: RANKINGS / STANDINGS (Mint card with CPA RANKINGS text) */}
              <div
                onClick={() => handleSelectNav('standings')}
                className="group flex flex-col items-center cursor-pointer select-none"
              >
                <div
                  className={`w-18 h-18 sm:w-20 sm:h-20 rounded-2xl p-2 bg-gradient-to-br from-emerald-100 to-teal-200 border-2 transition-all duration-200 flex flex-col items-center justify-center shadow-lg relative overflow-hidden text-center ${
                    activeTab === 'standings'
                      ? 'border-slate-900 scale-105'
                      : 'border-emerald-300/80 hover:border-emerald-500 hover:scale-102'
                  }`}
                >
                  <div className="absolute -right-2 -bottom-2 opacity-15">
                    <Trophy className="w-12 h-12 text-slate-950" />
                  </div>
                  <span className="text-[9px] font-mono font-black uppercase text-emerald-800 tracking-wider">
                    CPA
                  </span>
                  <span className="text-[10px] sm:text-[11px] font-display font-bold uppercase text-slate-950 leading-tight">
                    RANKINGS
                  </span>
                  <div className="mt-1 flex items-center gap-0.5">
                    <span className="w-1 h-3 bg-emerald-600 rounded-full" />
                    <span className="w-1 h-4 bg-emerald-800 rounded-full" />
                    <span className="w-1 h-2 bg-emerald-500 rounded-full" />
                  </div>
                </div>

                <div className="mt-1.5 text-[11px] font-mono font-extrabold uppercase tracking-wide text-slate-950">
                  RANKINGS
                </div>
              </div>

              {/* Widget 3: EXCLUSIVES / LIVE COURTS (Square action image with lock icon) */}
              <div
                onClick={() => handleSelectNav('courts')}
                className="group flex flex-col items-center cursor-pointer select-none"
              >
                <div
                  className={`w-18 h-18 sm:w-20 sm:h-20 rounded-2xl bg-slate-900 border-2 transition-all duration-200 shadow-lg relative overflow-hidden flex items-center justify-center ${
                    activeTab === 'courts'
                      ? 'border-slate-900 scale-105'
                      : 'border-emerald-300/80 hover:border-emerald-500 hover:scale-102'
                  }`}
                >
                  <img
                    src={actionSquareImg}
                    alt="Padel Court Action"
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-[1px] flex items-center justify-center">
                    <div className="w-7 h-7 rounded-full bg-[#00DF81] text-slate-950 flex items-center justify-center shadow-md">
                      <Radio className="w-3.5 h-3.5 animate-pulse" />
                    </div>
                  </div>
                </div>

                <div className="mt-1.5 text-[11px] font-mono font-extrabold uppercase tracking-wide text-slate-950">
                  COURTS
                </div>
              </div>

              {/* Widget 4: KNOCKOUTS (Violet card with CPA KNOCKOUTS) */}
              <div
                onClick={() => handleSelectNav('knockout')}
                className="group flex flex-col items-center cursor-pointer select-none"
              >
                <div
                  className={`w-18 h-18 sm:w-20 sm:h-20 rounded-2xl p-2 bg-white border-2 transition-all duration-200 flex flex-col items-center justify-center shadow-lg relative overflow-hidden text-center ${
                    activeTab === 'knockout'
                      ? 'border-purple-900 scale-105'
                      : 'border-purple-200 hover:border-purple-500 hover:scale-102'
                  }`}
                >
                  <div className="text-purple-900 mb-0.5">
                    <Trophy className="w-5 h-5 mx-auto" />
                  </div>
                  <span className="text-[10px] sm:text-[11px] font-display font-bold uppercase text-[#170036] leading-none">
                    CPA
                  </span>
                  <span className="text-[9px] sm:text-[10px] font-display font-bold uppercase text-purple-700 leading-none">
                    KNOCKOUTS
                  </span>
                </div>

                <div className="mt-1.5 text-[11px] font-mono font-extrabold uppercase tracking-wide text-slate-950">
                  KNOCKOUTS
                </div>
              </div>

              {/* Widget 5: FIXTURES (Matches) */}
              <div
                onClick={() => handleSelectNav('matches')}
                className="group flex flex-col items-center cursor-pointer select-none"
              >
                <div
                  className={`w-18 h-18 sm:w-20 sm:h-20 rounded-2xl p-2 bg-[#0e1628] border-2 transition-all duration-200 flex flex-col items-center justify-center shadow-lg text-center ${
                    activeTab === 'matches'
                      ? 'border-indigo-400 scale-105'
                      : 'border-slate-800 hover:border-indigo-400 hover:scale-102'
                  }`}
                >
                  <Calendar className="w-5 h-5 text-indigo-400 mb-1" />
                  <span className="text-[10px] font-mono font-black uppercase text-indigo-300 leading-none">
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
                  className={`w-18 h-18 sm:w-20 sm:h-20 rounded-2xl p-2 bg-gradient-to-br from-slate-900 to-teal-950 border-2 transition-all duration-200 flex flex-col items-center justify-center shadow-lg text-center ${
                    activeTab === 'teams'
                      ? 'border-teal-400 scale-105'
                      : 'border-slate-800 hover:border-teal-400 hover:scale-102'
                  }`}
                >
                  <Users className="w-5 h-5 text-teal-400 mb-1" />
                  <span className="text-[10px] font-mono font-black uppercase text-teal-300 leading-none">
                    20 TEAMS
                  </span>
                </div>

                <div className="mt-1.5 text-[11px] font-mono font-extrabold uppercase tracking-wide text-slate-950">
                  TEAMS
                </div>
              </div>

            </div>
          </div>

          {/* D. Tour Title & Status Banner Bar */}
          <div className="mt-4 pt-3.5 border-t border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1 pb-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xl sm:text-2xl font-display font-bold italic tracking-tight text-[#170036] uppercase leading-none">
                CPA PADEL TOUR
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-[#170036] text-white font-mono text-[10px] font-black uppercase tracking-wider">
                1969 INDOOR PADEL
              </span>
              <span className="hidden md:inline-block text-xs font-mono font-bold text-slate-900 opacity-80">
                • 5 Groups • 20 Teams • 5 Arenas
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#170036] text-[#00DF81] text-xs font-mono font-black tracking-wide shadow-sm">
                <span className="w-2 h-2 rounded-full bg-[#00DF81] animate-ping" />
                {liveMatchesCount > 0 ? `${liveMatchesCount} MATCHES LIVE` : 'ALL COURTS ACTIVE'}
              </span>
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
                <Search className="w-5 h-5 text-emerald-400 shrink-0" />
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
                              <div className="text-xs font-mono text-emerald-400 font-bold">
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
                  <div className="w-9 h-9 rounded-xl bg-[#00DF81] text-slate-950 font-bold flex items-center justify-center font-display italic text-lg shadow-md">
                    CPA
                  </div>
                  <div>
                    <div className="text-base font-display font-bold text-white">CPA Padel Tour</div>
                    <div className="text-[10px] font-mono text-[#00DF81]">2026 World Season</div>
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
                  { id: 'results', label: 'Live Results & Scores', icon: <Zap className="w-4 h-4 text-emerald-400" /> },
                  { id: 'courts', label: 'Live Courts (5 Arenas)', icon: <Radio className="w-4 h-4 text-sky-400" /> },
                  { id: 'standings', label: 'Tour Standings & Rankings', icon: <Trophy className="w-4 h-4 text-amber-400" /> },
                  { id: 'knockout', label: 'Knockout Bracket & Finals', icon: <Layers className="w-4 h-4 text-rose-400" /> },
                  { id: 'matches', label: 'Match Schedule & Fixtures', icon: <Calendar className="w-4 h-4 text-indigo-400" /> },
                  { id: 'teams', label: 'Teams & Player Directory', icon: <Users className="w-4 h-4 text-teal-400" /> },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleSelectNav(item.id as NavTab)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                      activeTab === item.id
                        ? 'bg-slate-900 text-[#00DF81] border border-slate-800'
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
                className="mt-4 flex items-center gap-3 rounded-xl border border-[#00DF81]/40 bg-[#00DF81]/10 px-3.5 py-2.5 text-xs font-bold text-[#00DF81] transition-colors hover:bg-[#00DF81]/20 sm:text-sm"
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
