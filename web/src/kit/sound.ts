// Chiptune music and sound effects, synthesized with WebAudio (no audio files).
import { useSyncExternalStore } from 'react';

export type Sfx = 'tap' | 'join' | 'lot' | 'raise' | 'fold' | 'going' | 'sold' | 'unsold' | 'coin' | 'win' | 'lose';

type Wave = 'pulse50' | 'pulse25' | 'pulse12' | 'tri' | 'saw';

const MUTE_KEY = 'aah.muted';
const MUSIC_GAIN = 0.1;
const FX_GAIN = 0.25;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let fxBus: GainNode | null = null;
let noise: AudioBuffer | null = null;
const waves = new Map<Wave, PeriodicWave>();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

let snap = { muted: readMuted(), unlocked: false };
const listeners = new Set<() => void>();
function emit(next: Partial<typeof snap>) {
  snap = { ...snap, ...next };
  listeners.forEach((l) => l());
}

function running(): boolean {
  return !!ctx && ctx.state === 'running';
}

function build(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = snap.muted ? 0 : 1;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = MUSIC_GAIN;
    musicBus.connect(master);
    fxBus = ctx.createGain();
    fxBus.gain.value = FX_GAIN;
    fxBus.connect(master);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    ctx.onstatechange = () => emit({ unlocked: running() });
    return ctx;
  } catch {
    ctx = null;
    return null;
  }
}

// NES-style pulse waves: a narrow duty cycle is what makes it sound 8-bit rather than a plain square.
function periodic(c: AudioContext, wave: Wave): PeriodicWave | null {
  if (wave === 'tri' || wave === 'saw') return null;
  const hit = waves.get(wave);
  if (hit) return hit;
  const duty = wave === 'pulse50' ? 0.5 : wave === 'pulse25' ? 0.25 : 0.125;
  const n = 48;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let i = 1; i < n; i++) real[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty);
  const pw = c.createPeriodicWave(real, imag);
  waves.set(wave, pw);
  return pw;
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

interface Tone {
  at: number;
  f: number;
  dur: number;
  vol?: number;
  wave?: Wave;
  to?: number; // slide to this frequency by the end
  pluck?: boolean; // decay across the whole note instead of hold then release
  vib?: number; // vibrato depth in Hz
  bus?: AudioNode | null;
}

function tone({ at, f, dur, vol = 0.5, wave = 'pulse25', to, pluck, vib, bus = fxBus }: Tone) {
  if (!ctx || !bus) return;
  const osc = ctx.createOscillator();
  const pw = periodic(ctx, wave);
  if (pw) osc.setPeriodicWave(pw);
  else osc.type = wave === 'tri' ? 'triangle' : 'sawtooth';
  osc.frequency.setValueAtTime(f, at);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, at + dur);
  let lfo: OscillatorNode | null = null;
  if (vib) {
    lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 6;
    depth.gain.value = vib;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(at + dur * 0.3);
    lfo.stop(at + dur + 0.05);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.004);
  if (!pluck) g.gain.setValueAtTime(vol, at + Math.max(0.005, dur * 0.75));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(bus);
  osc.start(at);
  osc.stop(at + dur + 0.02);
  osc.onended = () => g.disconnect();
}

function hiss({ at, dur, vol = 0.4, type = 'highpass', freq = 7000, bus = fxBus }: { at: number; dur: number; vol?: number; type?: BiquadFilterType; freq?: number; bus?: AudioNode | null }) {
  if (!ctx || !bus || !noise) return;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(filter).connect(g).connect(bus);
  src.start(at, Math.random() * 0.5);
  src.stop(at + dur + 0.02);
  src.onended = () => g.disconnect();
}

// Call from any user gesture (click, tap). Browsers keep audio locked until then.
export function unlockAudio(): void {
  const c = build();
  if (!c) return;
  if (c.state !== 'running') {
    c.resume()
      .then(() => {
        emit({ unlocked: running() });
        if (wantMusic) startLoop();
      })
      .catch(() => {});
    return;
  }
  emit({ unlocked: true });
  if (wantMusic) startLoop();
}

export function isMuted(): boolean {
  return snap.muted;
}

export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // private mode or blocked storage: keep it in memory only
  }
  if (ctx && master) master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02);
  emit({ muted });
}

/** Live { muted, unlocked } for UI. unlocked = the AudioContext is running. */
export function useSound(): { muted: boolean; unlocked: boolean } {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snap,
    () => snap,
  );
}

export function useMuted(): [boolean, (muted: boolean) => void] {
  return [useSound().muted, setMuted];
}

// Plays one effect. pitch nudges it up (raise: pass 0..1 as the price climbs). No-op while muted or locked.
export function sfx(name: Sfx, opts?: { pitch?: number }): void {
  if (snap.muted || !running() || !ctx) return;
  try {
    play(name, ctx.currentTime + 0.01, Math.min(1, Math.max(0, opts?.pitch ?? 0)));
  } catch {
    // a failed effect must never break the room
  }
}

function play(name: Sfx, t: number, pitch: number) {
  switch (name) {
    case 'tap':
      tone({ at: t, f: 1760, dur: 0.035, vol: 0.25, wave: 'pulse50', pluck: true });
      break;
    case 'join':
      [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => tone({ at: t + i * 0.055, f: hz(m), dur: i === 6 ? 0.22 : 0.07, vol: 0.4, wave: 'pulse25' }));
      break;
    case 'lot':
      tone({ at: t, f: 330, to: 1320, dur: 0.14, vol: 0.3, wave: 'pulse12', pluck: true });
      tone({ at: t + 0.14, f: hz(88), dur: 0.5, vol: 0.45, wave: 'tri', pluck: true });
      tone({ at: t + 0.2, f: hz(95), dur: 0.6, vol: 0.35, wave: 'tri', pluck: true });
      tone({ at: t + 0.2, f: hz(95), dur: 0.35, vol: 0.12, wave: 'pulse12', pluck: true });
      break;
    case 'raise': {
      const f = 660 * Math.pow(2, pitch);
      tone({ at: t, f, to: f * 1.5, dur: 0.07, vol: 0.35, wave: 'pulse25', pluck: true });
      tone({ at: t + 0.06, f: f * 1.5, dur: 0.1, vol: 0.25, wave: 'pulse25', pluck: true });
      break;
    }
    case 'fold':
      tone({ at: t, f: 520, to: 130, dur: 0.18, vol: 0.35, wave: 'pulse50', pluck: true });
      break;
    case 'going':
      tone({ at: t, f: 1480, dur: 0.05, vol: 0.5, wave: 'tri', pluck: true });
      hiss({ at: t, dur: 0.02, vol: 0.2, freq: 4000 });
      tone({ at: t + 0.28, f: 990, dur: 0.05, vol: 0.5, wave: 'tri', pluck: true });
      hiss({ at: t + 0.28, dur: 0.02, vol: 0.2, freq: 3000 });
      break;
    case 'sold': {
      tone({ at: t, f: 220, to: 55, dur: 0.16, vol: 0.9, wave: 'tri', pluck: true });
      hiss({ at: t, dur: 0.09, vol: 0.6, type: 'lowpass', freq: 900 });
      const f0 = t + 0.22;
      [67, 72, 76].forEach((m, i) => tone({ at: f0 + i * 0.08, f: hz(m), dur: 0.08, vol: 0.4 }));
      tone({ at: f0 + 0.24, f: hz(79), dur: 0.12, vol: 0.4 });
      tone({ at: f0 + 0.38, f: hz(84), dur: 0.5, vol: 0.45, vib: 8 });
      tone({ at: f0 + 0.38, f: hz(76), dur: 0.5, vol: 0.2, wave: 'pulse12' });
      tone({ at: f0 + 0.38, f: hz(48), dur: 0.5, vol: 0.5, wave: 'tri' });
      break;
    }
    case 'unsold':
      [67, 66, 65].forEach((m, i) => tone({ at: t + i * 0.22, f: hz(m), dur: 0.2, vol: 0.35, wave: 'pulse25' }));
      tone({ at: t + 0.66, f: hz(64), to: hz(62), dur: 0.6, vol: 0.35, wave: 'pulse25', vib: 5 });
      tone({ at: t + 0.66, f: hz(40), dur: 0.6, vol: 0.4, wave: 'tri' });
      break;
    case 'coin':
      tone({ at: t, f: hz(81), dur: 0.06, vol: 0.4, wave: 'pulse50' });
      tone({ at: t + 0.06, f: hz(88), dur: 0.38, vol: 0.4, wave: 'pulse50', pluck: true });
      break;
    case 'win': {
      const seq: [number, number, number][] = [
        [67, 0, 0.09], [72, 0.1, 0.09], [76, 0.2, 0.09], [79, 0.3, 0.22],
        [76, 0.54, 0.09], [79, 0.64, 0.09], [84, 0.74, 0.6],
      ];
      seq.forEach(([m, d, len]) => tone({ at: t + d, f: hz(m), dur: len, vol: 0.4, vib: len > 0.3 ? 8 : 0 }));
      tone({ at: t + 0.74, f: hz(76), dur: 0.6, vol: 0.18, wave: 'pulse12' });
      tone({ at: t + 0.3, f: hz(43), dur: 0.22, vol: 0.5, wave: 'tri' });
      tone({ at: t + 0.74, f: hz(48), dur: 0.6, vol: 0.5, wave: 'tri' });
      break;
    }
    case 'lose':
      tone({ at: t, f: 150, to: 95, dur: 0.38, vol: 0.3, wave: 'pulse50' });
      tone({ at: t, f: 157, to: 99, dur: 0.38, vol: 0.25, wave: 'saw' });
      break;
  }
}

// ---------- theme ----------
// Original 8 bar loop in C at 140 BPM: C Am F G C Am F G. Steps are sixteenth notes.
const BPM = 140;
const STEP = 60 / BPM / 4;
const BARS = 8;
const ROOTS = [48, 45, 41, 43, 48, 45, 41, 43];
const CHORDS = [[64, 67], [64, 69], [65, 69], [67, 71], [64, 67], [64, 69], [65, 69], [67, 71]];
// [bar, step, midi, length in steps]
const LEAD: [number, number, number, number][] = [
  [0, 0, 76, 2], [0, 2, 79, 2], [0, 4, 84, 3], [0, 7, 79, 1], [0, 8, 81, 2], [0, 10, 79, 2], [0, 12, 76, 4],
  [1, 0, 72, 2], [1, 2, 76, 2], [1, 4, 81, 3], [1, 7, 79, 1], [1, 8, 76, 2], [1, 10, 74, 2], [1, 12, 72, 2], [1, 14, 74, 2],
  [2, 0, 77, 2], [2, 2, 81, 2], [2, 4, 84, 2], [2, 6, 81, 2], [2, 8, 79, 3], [2, 11, 77, 1], [2, 12, 76, 2], [2, 14, 77, 2],
  [3, 0, 79, 2], [3, 2, 83, 2], [3, 4, 86, 4], [3, 10, 83, 1], [3, 11, 84, 1], [3, 12, 86, 4],
  [4, 0, 84, 2], [4, 2, 83, 1], [4, 3, 81, 1], [4, 4, 79, 2], [4, 6, 76, 2], [4, 8, 79, 2], [4, 10, 84, 2], [4, 12, 88, 4],
  [5, 0, 86, 2], [5, 2, 84, 2], [5, 4, 81, 4], [5, 8, 76, 2], [5, 10, 81, 2], [5, 12, 84, 2], [5, 14, 83, 2],
  [6, 0, 81, 2], [6, 2, 77, 2], [6, 4, 81, 2], [6, 6, 84, 2], [6, 8, 83, 2], [6, 10, 81, 2], [6, 12, 79, 2], [6, 14, 77, 2],
  [7, 0, 79, 2], [7, 3, 79, 1], [7, 4, 79, 2], [7, 6, 81, 2], [7, 8, 83, 2], [7, 10, 86, 2], [7, 12, 83, 2], [7, 14, 74, 2],
];
const LEAD_AT = new Map<number, [number, number]>(LEAD.map(([b, s, m, l]) => [b * 16 + s, [m, l]]));

let wantMusic = false;
let timer: ReturnType<typeof setInterval> | null = null;
let session: GainNode | null = null;
let nextAt = 0;
let step = 0;

function scheduleStep(i: number, at: number) {
  const bar = Math.floor(i / 16) % BARS;
  const s = i % 16;
  const root = ROOTS[bar];
  const lead = LEAD_AT.get(bar * 16 + s);
  if (lead) tone({ at, f: hz(lead[0]), dur: lead[1] * STEP * 0.92, vol: 0.5, wave: 'pulse25', vib: lead[1] >= 4 ? 5 : 0, bus: session });
  if (s % 2 === 0) tone({ at, f: hz(s % 4 === 0 ? root : root + 12), dur: STEP * 1.6, vol: 0.9, wave: 'tri', bus: session });
  if (s % 4 === 2) CHORDS[bar].forEach((m) => tone({ at, f: hz(m), dur: STEP * 0.7, vol: 0.14, wave: 'pulse12', pluck: true, bus: session }));
  if (s === 0 || s === 8 || s === 10) tone({ at, f: 160, to: 45, dur: 0.1, vol: 0.9, wave: 'tri', pluck: true, bus: session });
  if (s === 4 || s === 12) hiss({ at, dur: 0.12, vol: 0.35, type: 'bandpass', freq: 1800, bus: session });
  if (s % 2 === 0) hiss({ at, dur: s % 4 === 2 ? 0.05 : 0.025, vol: 0.18, freq: 7500, bus: session });
}

function startLoop() {
  if (timer || !ctx || !musicBus || !running()) return;
  session = ctx.createGain();
  session.connect(musicBus);
  nextAt = ctx.currentTime + 0.08;
  step = 0;
  // Lookahead scheduling: the timer only wakes us up; every note is placed on the audio clock so it never drifts.
  timer = setInterval(() => {
    if (!ctx) return;
    while (nextAt < ctx.currentTime + 0.15) {
      scheduleStep(step, nextAt);
      nextAt += STEP;
      step = (step + 1) % (BARS * 16);
    }
  }, 25);
}

function stopLoop() {
  if (timer) clearInterval(timer);
  timer = null;
  if (ctx && session) {
    const s = session;
    s.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
    setTimeout(() => s.disconnect(), 400);
  }
  session = null;
}

// Background theme loop. Only the big screen starts it. Before unlockAudio it waits and starts on unlock.
// start() is a no-op while muted; unmuting through SoundButton withMusic starts it.
export const music = {
  start(): void {
    if (snap.muted) return;
    wantMusic = true;
    startLoop();
    emit({});
  },
  stop(): void {
    wantMusic = false;
    stopLoop();
    emit({});
  },
  playing(): boolean {
    return wantMusic;
  },
};
