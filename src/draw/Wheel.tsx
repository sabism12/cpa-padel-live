import React, { useEffect, useRef, useState } from 'react';
import { DrawPair } from './types';
import { pairLabel, pairSurnames } from '../utils/teamDisplay';
import { SPIN_MS } from './constants';
import { DRAW_THEME, WHEEL_SEGMENTS } from './theme';

/**
 * The presentation wheel. It contains every player pair and is purely a
 * visual layer: the segment it lands on is always dictated by the
 * authoritative server result.
 *
 * Motion:
 *  - `idle` = true -> the wheel free-spins continuously.
 *  - a spin token  -> the wheel decelerates and stops on the authoritative
 *                     pair, then resumes free-spinning if `idle` is still on.
 *
 * Labels:
 *  - all sit at the same radius and run along their spoke;
 *  - when the wheel stops, any label that would read upside-down is flipped;
 *  - drawn pairs are dimmed AND struck through.
 */

const CX = 220;
const CY = 220;
const OUTER_R = 208;
const INNER_R = 66;
const LABEL_R = (INNER_R + OUTER_R) / 2; // every label is centred here

const IDLE_DEG_PER_SEC = 600;
const SPIN_TURNS = 3;

const DRAWN_FILL = '#1A2233';
const DRAWN_TEXT = '#4B5563';

function polar(radius: number, angleDeg: number): [number, number] {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [CX + radius * Math.cos(a), CY + radius * Math.sin(a)];
}

function sectorPath(r1: number, r2: number, a0: number, a1: number): string {
  const [x1, y1] = polar(r1, a0);
  const [x2, y2] = polar(r2, a0);
  const [x3, y3] = polar(r2, a1);
  const [x4, y4] = polar(r1, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x1} ${y1} L ${x2} ${y2} A ${r2} ${r2} 0 ${large} 1 ${x3} ${y3} L ${x4} ${y4} A ${r1} ${r1} 0 ${large} 0 ${x1} ${y1} Z`;
}

/** Ids of pairs whose label must be rotated to read inward instead of outward.
 *
 * Every label lies on its own spoke at LABEL_R and reads along that spoke.
 * Unrotated it reads outward: on-screen direction = (mid - 90 + wheelRotation).
 * When that direction falls in (90, 270) the name would be upside-down, so we
 * spin the label 180 degrees (still about its own anchor) to read inward.
 */
function computeFlips(list: DrawPair[], rotation: number): Set<string> {
  const n = list.length || 1;
  const seg = 360 / n;
  const flipped = new Set<string>();
  list.forEach((pair, i) => {
    const mid = i * seg + seg / 2;
    const outwardDirection = (((mid - 90 + rotation) % 360) + 360) % 360;
    if (outwardDirection > 90 && outwardDirection < 270) flipped.add(pair.id);
  });
  return flipped;
}

export interface WheelHandle {
  /** Run the landing animation onto the given pair. */
  spinTo: (pairId: string) => void;
}

interface WheelProps {
  pairs: DrawPair[];
  drawnPairIds: Set<string>;
  /** Pair to highlight as the current/last landed result. */
  targetPairId?: string | null;
  /** When true the wheel free-spins. */
  idle?: boolean;
  /** Increments to trigger a landing animation on targetPairId. */
  spinToken?: number;
  handleRef?: React.MutableRefObject<WheelHandle | null>;
}

export const Wheel: React.FC<WheelProps> = ({
  pairs,
  drawnPairIds,
  targetPairId,
  idle = false,
  spinToken = 0,
  handleRef,
}) => {
  const [flipped, setFlipped] = useState<Set<string>>(() => new Set());

  const wheelRef = useRef<HTMLDivElement>(null);
  const rotationRef = useRef(0);
  const modeRef = useRef<'idle' | 'landing' | 'stopped'>('stopped');
  const idleRef = useRef(idle);
  const landingRef = useRef({ from: 0, to: 0, start: 0 });
  const lastTsRef = useRef(0);

  const pairsRef = useRef(pairs);
  const targetRef = useRef(targetPairId);
  const mountedRef = useRef(false);
  const flipsInitRef = useRef(false);

  pairsRef.current = pairs;
  targetRef.current = targetPairId;

  const beginLanding = (pairId: string) => {
    const list = pairsRef.current;
    const index = list.findIndex((p) => p.id === pairId);
    if (index < 0) return;

    const n = list.length;
    const seg = 360 / n;
    const center = index * seg + seg / 2;
    const targetMod = (360 - center) % 360;
    const currentMod = ((rotationRef.current % 360) + 360) % 360;
    const delta = (((targetMod - currentMod) % 360) + 360) % 360;
    const from = rotationRef.current;
    const to = from + 360 * SPIN_TURNS + delta;

    setFlipped(computeFlips(list, to));
    landingRef.current = { from, to, start: performance.now() };
    modeRef.current = 'landing';
  };
  const beginLandingRef = useRef(beginLanding);
  beginLandingRef.current = beginLanding;

  // Expose an imperative spinTo() so a parent can drive the animation.
  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = { spinTo: (pairId: string) => beginLandingRef.current(pairId) };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef]);

  // Initial label orientation (wheel at rest).
  useEffect(() => {
    if (flipsInitRef.current || pairs.length === 0) return;
    flipsInitRef.current = true;
    setFlipped(computeFlips(pairs, 0));
  }, [pairs]);

  // Animation loop (drives the DOM directly for smooth 60fps without re-renders).
  useEffect(() => {
    let raf = 0;
    const loop = (ts: number) => {
      const dt = lastTsRef.current ? ts - lastTsRef.current : 16;
      lastTsRef.current = ts;

      if (modeRef.current === 'idle') {
        rotationRef.current += (IDLE_DEG_PER_SEC * dt) / 1000;
        if (wheelRef.current) {
          wheelRef.current.style.transform = `rotate(${rotationRef.current}deg)`;
        }
      } else if (modeRef.current === 'landing') {
        const { from, to, start } = landingRef.current;
        const p = Math.min(1, (ts - start) / SPIN_MS);
        const eased = 1 - Math.pow(1 - p, 3);
        rotationRef.current = from + (to - from) * eased;
        if (wheelRef.current) {
          wheelRef.current.style.transform = `rotate(${rotationRef.current}deg)`;
        }
        if (p >= 1) modeRef.current = idleRef.current ? 'idle' : 'stopped';
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Idle on/off from the parent.
  useEffect(() => {
    idleRef.current = idle;
    if (modeRef.current === 'landing') return;
    modeRef.current = idle ? 'idle' : 'stopped';
  }, [idle]);

  // Token-driven landing (used by the public viewer).
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (spinToken <= 0) return;
    if (targetRef.current) beginLandingRef.current(targetRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinToken]);

  const n = pairs.length || 1;
  const seg = 360 / n;
  const anchorY = CY - LABEL_R;

  return (
    <div className="relative mx-auto block aspect-square w-full max-w-[560px] select-none">
      <div
        ref={wheelRef}
        className="absolute inset-0"
        style={{ transform: 'rotate(0deg)', willChange: 'transform' }}
      >
        <svg viewBox="0 0 440 440" className="h-full w-full drop-shadow-xl">
          <circle cx={CX} cy={CY} r={OUTER_R + 7} fill={DRAW_THEME.white} />
          <circle cx={CX} cy={CY} r={OUTER_R + 7} fill="none" stroke={DRAW_THEME.blue} strokeWidth="3" />
          {pairs.map((pair, i) => {
            const a0 = i * seg;
            const a1 = (i + 1) * seg;
            const mid = a0 + seg / 2;
            const drawn = drawnPairIds.has(pair.id);
            const isTarget = targetPairId === pair.id;
            const swatch = WHEEL_SEGMENTS[i % WHEEL_SEGMENTS.length];
            const fill = drawn ? DRAWN_FILL : swatch.fill;

            // Long full names would run off the wedge: use surnames for the
            // wheel, then cap the rendered width to the wedge's radial space.
            const full = pairLabel(pair);
            const label = full.length <= 16 ? full : pairSurnames(pair);
            const fontSize = label.length > 16 ? 10 : label.length > 13 ? 11 : 12;
            const maxLen = OUTER_R - INNER_R - 18;
            const estWidth = label.length * fontSize * 0.65;
            const textLength = estWidth > maxLen ? maxLen : undefined;

            const textFill = drawn ? DRAWN_TEXT : swatch.text;
            const isFlipped = flipped.has(pair.id);

            return (
              <g key={pair.id}>
                <path
                  d={sectorPath(INNER_R, OUTER_R, a0, a1)}
                  fill={fill}
                  stroke={DRAW_THEME.blueLight}
                  strokeOpacity="0.5"
                  strokeWidth="1.5"
                />
                {isTarget && (
                  <path
                    d={sectorPath(INNER_R, OUTER_R, a0, a1)}
                    fill={DRAW_THEME.white}
                    fillOpacity="0.22"
                    stroke={DRAW_THEME.white}
                    strokeWidth="2.5"
                  />
                )}
                {/* Radial label: the text is centred on its own spoke (the
                    anchor at LABEL_R above centre) and rotated by `mid` to sit
                    on its wedge, then turned -90 degrees so it reads along the
                    spoke. Wedges that would end up upside-down read inward
                    instead: a 90-degree turn about the SAME anchor, which can
                    never mirror the letters or move the label off its spoke. */}
                <text
                  x={CX}
                  y={anchorY}
                  transform={`rotate(${mid} ${CX} ${CY}) rotate(${isFlipped ? 90 : -90} ${CX} ${anchorY})`}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={fontSize}
                  fontWeight={700}
                  textLength={textLength}
                  lengthAdjust={textLength ? 'spacingAndGlyphs' : undefined}
                  fill={textFill}
                  style={{
                    fontFamily: "'General Sans', system-ui, sans-serif",
                    textDecoration: drawn ? 'line-through' : 'none',
                  }}
                >
                  {label}
                </text>
              </g>
            );
          })}
          <circle cx={CX} cy={CY} r={INNER_R} fill={DRAW_THEME.white} />
          <circle cx={CX} cy={CY} r={INNER_R} fill="none" stroke={DRAW_THEME.blue} strokeWidth="2" />
        </svg>
      </div>

      {/* Pointer (fixed, does not rotate) */}
      <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-2">
        <svg width="36" height="44" viewBox="0 0 36 44">
          <polygon points="18,44 0,0 36,0" fill={DRAW_THEME.blue} stroke={DRAW_THEME.white} strokeWidth="2.5" />
        </svg>
      </div>

      {/* Centre hub with the existing CPA logo (fixed, does not rotate) */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          className="flex items-center justify-center rounded-full bg-white shadow-xl"
          style={{ width: '29%', height: '29%', boxShadow: `0 0 0 5px ${DRAW_THEME.blue}` }}
        >
          <img
            src="/cpa%20logo%20final.svg"
            alt="CPA Padel"
            className="h-auto w-[76%]"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
};
