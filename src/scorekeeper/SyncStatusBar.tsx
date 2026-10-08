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
      <div
        role="alert"
        className="rounded-2xl bg-white border-2 border-rose-400 px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-md"
      >
        <div className="flex items-start gap-2.5 text-sm font-semibold text-rose-800 min-w-0">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>
            Sign-in expired{pending > 0 ? ` — ${waiting}` : ''}. Sign in again and they will send
            automatically.
          </span>
        </div>
        <button
          onClick={onSignIn}
          className="min-h-10 px-4 rounded-full bg-[#0A0A0F] hover:bg-slate-800 text-[#CCFF00] text-[11px] font-mono font-bold uppercase tracking-widest flex items-center gap-1.5 cursor-pointer"
        >
          <LogIn className="w-3.5 h-3.5" />
          Sign in
        </button>
      </div>
    );
  }

  if (status === 'retrying') {
    return (
      <div
        role="status"
        className="rounded-2xl bg-white border-2 border-amber-400 px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-md"
      >
        <div className="flex items-start gap-2.5 text-sm font-semibold text-amber-900 min-w-0">
          <WifiOff className="w-5 h-5 text-amber-600 shrink-0" />
          <span>
            Not sent yet — {waiting}. {lastError || 'Retrying…'}
          </span>
        </div>
        <button
          onClick={onRetry}
          className="min-h-10 px-4 rounded-full border border-slate-900/30 bg-white text-[#0A0A0F] hover:bg-slate-900 hover:text-white text-[11px] font-mono font-bold uppercase tracking-widest flex items-center gap-1.5 cursor-pointer transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry now
        </button>
      </div>
    );
  }

  return null;
};
