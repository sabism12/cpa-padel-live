/**
 * Tiny optional sound helper built on the Web Audio API.
 * No dependency, no audio files. Off by default; the viewer opts in.
 */

let ctx: AudioContext | null = null;
let enabled = false;

const STORAGE_KEY = 'cpa_draw_sound';

export function loadSoundPreference(): boolean {
  try {
    enabled = localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    enabled = false;
  }
  return enabled;
}

export function isSoundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(value: boolean): void {
  enabled = value;
  try {
    localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off');
  } catch {
    // ignore storage errors
  }
  if (value) ensureContext();
}

function ensureContext(): void {
  if (typeof window === 'undefined') return;
  const AudioCtor =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return;
  if (!ctx) ctx = new AudioCtor();
  if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
}

function beep(frequency: number, duration: number, gain: number, type: OscillatorType): void {
  if (!enabled) return;
  ensureContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    amp.gain.setValueAtTime(gain, ctx.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // ignore audio errors
  }
}

/** Short mechanical tick played while the wheel spins. */
export function playTick(): void {
  beep(760, 0.035, 0.035, 'square');
}

/** Bright chime when a group is revealed. */
export function playReveal(): void {
  beep(660, 0.16, 0.08, 'sine');
  window.setTimeout(() => beep(990, 0.22, 0.07, 'sine'), 110);
}

/** Fanfare-ish tone when the draw completes. */
export function playComplete(): void {
  beep(523, 0.18, 0.07, 'sine');
  window.setTimeout(() => beep(659, 0.18, 0.07, 'sine'), 150);
  window.setTimeout(() => beep(784, 0.3, 0.08, 'sine'), 300);
}
