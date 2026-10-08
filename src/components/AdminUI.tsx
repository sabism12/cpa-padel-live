import React from 'react';
import { X } from 'lucide-react';
import { EnrichedMatch } from '../api';

/*
 * Building blocks for the admin panel, in the public site's design language:
 * white rounded cards with a black title band and volt display text, pill
 * buttons in small mono caps, and slate-50 form fields.
 */

const ROUND_LABELS: Record<string, string> = {
  r16: 'Round of 16',
  qf: 'Quarter-final',
  sf: 'Semi-final',
  '3rd': '3rd place',
  final: 'Final',
};

/** Knockout match (including old saves that only mark it by group id). */
export const isKnockout = (m: EnrichedMatch) => m.stage === 'knockout' || m.groupId === 'knockout';

/** "Group B", "Quarter-final 3", "Semi-final 1", "3rd place", "Final". */
export function adminStageLabel(m: EnrichedMatch): string {
  if (!isKnockout(m)) return m.group?.name || 'Group stage';
  const name = ROUND_LABELS[m.round || ''] || 'Knockout';
  return (m.round === 'qf' || m.round === 'sf') && m.bracketPosition ? `${name} ${m.bracketPosition}` : name;
}

const pill =
  'rounded-full font-mono font-bold uppercase tracking-widest inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap';

/** Main action: black pill with volt text. */
export const primaryButton = `${pill} min-h-10 px-4 text-[11px] bg-[#0A0A0F] hover:bg-slate-800 text-[#CCFF00]`;
/** Secondary action: white pill with an ink outline. */
export const outlineButton = `${pill} min-h-10 px-4 text-[11px] border border-slate-900/20 bg-white text-[#0A0A0F] hover:bg-[#0A0A0F] hover:text-white`;
/** Destructive action: white pill with a rose outline. */
export const dangerButton = `${pill} min-h-10 px-4 text-[11px] border border-rose-300 bg-white text-rose-600 hover:bg-rose-600 hover:text-white`;
/** Volt pill for actions placed on a black title band. */
export const bandButton = `${pill} min-h-9 px-3.5 text-[10px] bg-[#CCFF00] hover:bg-white text-[#0A0A0F]`;
/** Outline pill for actions placed on a black title band. */
export const bandOutlineButton = `${pill} min-h-9 px-3.5 text-[10px] border border-white/30 text-white hover:bg-white hover:text-[#0A0A0F]`;
/** Compact versions for table rows and tiles. */
export const smallOutlineButton = `${pill} min-h-8 px-3 text-[10px] border border-slate-900/15 bg-white text-[#0A0A0F] hover:bg-[#0A0A0F] hover:text-white`;
export const smallDangerButton = `${pill} min-h-8 px-3 text-[10px] border border-rose-300 bg-white text-rose-600 hover:bg-rose-600 hover:text-white`;
/** Row action that is destructive but repeated on every row: quiet until hovered. */
export const smallQuietDangerButton = `${pill} min-h-8 px-3 text-[10px] border border-slate-200 bg-white text-slate-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700`;

export const fieldLabel = 'block text-[10px] font-mono font-bold uppercase tracking-widest text-slate-500 mb-1.5';
export const fieldInput =
  'w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:opacity-50';

interface SectionCardProps {
  title: string;
  /** Right side of the black band: a count, a label or band buttons. */
  aside?: React.ReactNode;
  /** Light-blue strip under the band (counts, filters). */
  strip?: React.ReactNode;
  children: React.ReactNode;
  bodyClassName?: string;
}

/** The site's white card with a black title band (as the Fixtures court boards). */
export const SectionCard: React.FC<SectionCardProps> = ({ title, aside, strip, children, bodyClassName }) => (
  <section className="bg-white border border-blue-300/80 rounded-3xl shadow-xl overflow-hidden text-slate-900">
    <div className="px-5 sm:px-7 py-4 sm:py-5 bg-[#0A0A0F] flex items-center justify-between gap-3">
      <h2 className="text-2xl sm:text-4xl font-display font-semibold uppercase tracking-wide text-[#CCFF00] leading-none min-w-0 truncate">
        {title}
      </h2>
      {aside && <div className="shrink-0 flex items-center gap-2">{aside}</div>}
    </div>
    {strip && (
      <div className="px-5 sm:px-7 py-2.5 bg-blue-50 border-b border-blue-100 text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-widest text-blue-800/80">
        {strip}
      </div>
    )}
    <div className={bodyClassName ?? 'p-4 sm:p-6 space-y-4'}>{children}</div>
  </section>
);

/** White display text for the right side of a title band. */
export const BandLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-lg sm:text-2xl font-display font-semibold uppercase tracking-wide leading-none text-white">
    {children}
  </span>
);

/** Status pill for a match, in the same colours as the public match tiles. */
export const MatchStatusPill: React.FC<{ match: EnrichedMatch }> = ({ match }) => {
  const base = 'px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black uppercase tracking-wider whitespace-nowrap inline-flex items-center gap-1.5';
  switch (match.status) {
    case 'live':
      return (
        <span className={`${base} bg-[#CCFF00] text-[#0A0A0F]`}>
          <span className="w-1.5 h-1.5 rounded-full bg-[#0A0A0F] animate-pulse" />
          Live
        </span>
      );
    case 'completed':
      return <span className={`${base} bg-slate-200 text-slate-700`}>{match.walkover ? 'Walkover' : 'Finished'}</span>;
    case 'ready':
      return <span className={`${base} bg-blue-100 text-blue-800`}>Ready</span>;
    case 'cancelled':
      return <span className={`${base} bg-rose-100 text-rose-700`}>Cancelled</span>;
    default:
      return <span className={`${base} bg-slate-100 text-slate-600`}>Scheduled</span>;
  }
};

interface DialogProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Render the dialog as a <form> with this submit handler. */
  onSubmit?: (e: React.FormEvent) => void;
  maxWidth?: string;
}

/** Modal dialog: white card with the black title band. */
export const AdminDialog: React.FC<DialogProps> = ({ title, subtitle, onClose, children, onSubmit, maxWidth = 'max-w-lg' }) => {
  const body = (
    <>
      <div className="px-5 sm:px-6 py-4 bg-[#0A0A0F] flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-2xl sm:text-3xl font-display font-semibold uppercase tracking-wide text-[#CCFF00] leading-none">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-1.5 text-[11px] font-mono font-bold uppercase tracking-widest text-white/60 truncate">{subtitle}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 w-9 h-9 -mr-1 rounded-full text-white/80 hover:bg-white hover:text-[#0A0A0F] inline-flex items-center justify-center transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-5 sm:p-6 space-y-4 overflow-y-auto">{children}</div>
    </>
  );
  const className = `w-full ${maxWidth} max-h-[calc(100vh-2rem)] flex flex-col bg-white border border-blue-300/80 rounded-3xl shadow-2xl overflow-hidden text-slate-900`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0A0F]/60 backdrop-blur-sm animate-in fade-in duration-150"
    >
      {onSubmit ? (
        <form onSubmit={onSubmit} className={className}>
          {body}
        </form>
      ) : (
        <div className={className}>{body}</div>
      )}
    </div>
  );
};
