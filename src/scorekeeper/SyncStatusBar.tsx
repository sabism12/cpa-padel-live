import React, { useState } from 'react';
import { Wifi, WifiOff, Server, Home, Cloud, RefreshCw, AlertTriangle, CheckCircle2, Settings2 } from 'lucide-react';
import { SyncMode } from '../scoring/eventTypes';

interface SyncStatusBarProps {
  mode: SyncMode;
  targetLabel: string;
  pending: number;
  syncing: boolean;
  lastError: string | null;
  gatewayUrl: string | null;
  onSetGatewayUrl: (url: string) => void;
  onFlush: () => void;
}

/**
 * Connection + queue indicator for the scorekeeper.
 *
 * Shows where scores are going (Local Dell / Direct Internet / Offline) and how
 * many events are still waiting. Also offers a manual gateway URL so the
 * scorekeeper is never stuck if automatic discovery fails.
 */
export const SyncStatusBar: React.FC<SyncStatusBarProps> = ({
  mode,
  targetLabel,
  pending,
  syncing,
  lastError,
  gatewayUrl,
  onSetGatewayUrl,
  onFlush,
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [draftUrl, setDraftUrl] = useState(gatewayUrl || '');

  const isOffline = mode === 'offline';
  const allSynced = pending === 0 && !isOffline;

  const modeVisual = isOffline
    ? { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-300', Icon: WifiOff, label: 'Offline' }
    : mode === 'online-local'
      ? { bg: 'bg-sky-500/10', border: 'border-sky-500/30', text: 'text-sky-300', Icon: Home, label: 'Local Dell' }
      : { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-300', Icon: Cloud, label: 'Direct Internet' };

  const { Icon } = modeVisual;

  return (
    <div className={`rounded-2xl border ${modeVisual.bg} ${modeVisual.border} px-3 py-2.5 space-y-2`}>
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider ${modeVisual.text}`}>
            <Icon className="w-3.5 h-3.5" />
            {modeVisual.label}
          </span>

          {syncing ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-300">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Syncing…
            </span>
          ) : allSynced ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-300">
              <CheckCircle2 className="w-3.5 h-3.5" />
              All scores synced
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5" />
              {pending} pending
            </span>
          )}

          <span className="text-[11px] font-mono text-slate-400">{targetLabel}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onFlush}
            disabled={syncing}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold border border-slate-700 disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
            title="Retry syncing now"
          >
            <RefreshCw className="w-3 h-3" />
            Retry now
          </button>
          <button
            onClick={() => setShowSettings((v) => !v)}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold border border-slate-700 cursor-pointer flex items-center gap-1.5"
            title="Connection settings"
          >
            <Settings2 className="w-3 h-3" />
            Connection
          </button>
        </div>
      </div>

      {lastError && (
        <div className="text-[11px] text-rose-300/90 font-mono truncate" title={lastError}>
          {lastError}
        </div>
      )}

      {showSettings && (
        <div className="pt-2 border-t border-slate-700/50 space-y-2">
          <p className="text-[11px] text-slate-400">
            Scores are sent to the local Dell gateway when reachable, otherwise straight to the
            internet. You normally don't need to change this.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              placeholder="http://192.168.137.1:3000"
              className="flex-1 min-w-[200px] px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs font-mono focus:outline-none focus:border-lime-400"
            />
            <button
              onClick={() => {
                onSetGatewayUrl(draftUrl);
                setShowSettings(false);
              }}
              className="px-3 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-black uppercase tracking-wider cursor-pointer"
            >
              Save & reconnect
            </button>
            {gatewayUrl && (
              <button
                onClick={() => {
                  setDraftUrl('');
                  onSetGatewayUrl('');
                  setShowSettings(false);
                }}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
