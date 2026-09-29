import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Home, QrCode, Wifi, Radio } from 'lucide-react';

interface GatewayInfo {
  port: number;
  urls: string[];
  name: string;
}

interface GatewayStatus {
  upstreamConfigured: boolean;
  upstreamHost: string | null;
  upstreamReachable: boolean;
  pendingUpstream: number;
  lastUpstreamError: string | null;
}

/**
 * Shown on the Dell's own screen in gateway mode. Displays the LAN URL a
 * scorekeeper phone should open, plus a QR code, plus upstream sync health.
 * Contains no secrets and is only reachable on the local network.
 */
export const GatewayInfoPanel: React.FC = () => {
  const [info, setInfo] = useState<GatewayInfo | null>(null);
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [infoRes, statusRes] = await Promise.all([
          fetch('/api/gateway/info', { cache: 'no-store' }),
          fetch('/api/gateway/status', { cache: 'no-store' }),
        ]);
        if (cancelled) return;
        if (infoRes.ok) setInfo(await infoRes.json());
        if (statusRes.ok) setStatus(await statusRes.json());
      } catch {
        // ignore transient failures on the LAN
      }
    };

    void load();
    const interval = window.setInterval(load, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const target = info?.urls?.[0];
    if (!target) return;
    QRCode.toDataURL(target, { width: 280, margin: 2, color: { dark: '#070a12', light: '#ffffff' } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [info?.urls?.[0]]);

  if (!info) return null;

  const lanUrl = info.urls[0];

  return (
    <div className="mb-4 p-4 rounded-2xl bg-sky-500/10 border border-sky-500/30 space-y-3">
      <div className="flex items-center gap-2">
        <Home className="w-4 h-4 text-sky-300" />
        <span className="text-xs font-black uppercase tracking-wider text-sky-300">
          Local Gateway — {info.name}
        </span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {qrDataUrl && (
          <img
            src={qrDataUrl}
            alt="Scorekeeper URL QR code"
            className="w-32 h-32 rounded-xl bg-white p-1.5 shadow-md shrink-0"
          />
        )}
        <div className="space-y-1.5 min-w-0">
          <p className="text-[11px] text-slate-300">
            Scorekeepers on the Dell Wi-Fi should open this address in Chrome:
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-sky-300 text-xs font-mono break-all">
              {lanUrl || 'no LAN address detected'}
            </code>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400">
              <QrCode className="w-3 h-3" />
              scan or type
            </span>
          </div>

          {info.urls.length > 1 && (
            <p className="text-[10px] font-mono text-slate-500">
              other addresses: {info.urls.slice(1).join(', ')}
            </p>
          )}

          <div className="flex items-center gap-3 pt-1 text-[11px] flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-slate-300">
              <Wifi className="w-3.5 h-3.5" />
              {status?.upstreamConfigured ? 'Upstream configured' : 'Local-only (no upstream)'}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 font-bold ${
                status?.upstreamReachable ? 'text-blue-300' : 'text-amber-300'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              {status?.upstreamReachable ? 'Internet OK' : 'Internet unavailable — queueing'}
            </span>
            {(status?.pendingUpstream ?? 0) > 0 && (
              <span className="text-amber-300 font-bold">{status?.pendingUpstream} queued upstream</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
