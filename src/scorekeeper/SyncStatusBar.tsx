import React from 'react';
import { AlertTriangle, LogIn, RefreshCw, WifiOff } from 'lucide-react';
import { SenderStatus } from './scoreSender';

interface SyncStatusBarProps {
  status: SenderStatus;
  pending: number;
  lastError: string | null;
  onRetry: () => void;
  onSignIn: () => void;
}

/**
 * Problem banner for the scorekeeper. Hidden while scores send normally; shown
 * when points are stuck retrying, sign-in has expired, or the server refused one.
 */
export const SyncStatusBar: React.FC<SyncStatusBarProps> = ({
  status,
  pending,
  lastError,
  onRetry,
  onSignIn,
}) => {
  const waiting = `${pending} point${pending === 1 ? '' : 's'} waiting to send`;

  if (status === 'auth') {
    return (
      <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-rose-200">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>
            Sign-in expired{pending > 0 ? ` — ${waiting}` : ''}. Sign in again and they will send
            automatically.
          </span>
        </div>
        <button
          onClick={onSignIn}
          className="px-3 py-1.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer"
        >
          <LogIn className="w-3.5 h-3.5" />
          Sign in
        </button>
      </div>
    );
  }

  if (status === 'retrying') {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-amber-200 min-w-0">
          <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="truncate">
            Not sent yet — {waiting}. {lastError || 'Retrying…'}
          </span>
        </div>
        <button
          onClick={onRetry}
          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry now
        </button>
      </div>
    );
  }

  return null;
};
