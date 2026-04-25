/**
 * Web Audio synthesized SFX. No external assets, no licensing concerns.
 * The AudioContext is lazily created on first user interaction (browsers
 * require a gesture before allowing playback).
 */

let ctx: AudioContext | null = null;
let muted = false;

function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  const W = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  const Ctor = window.AudioContext ?? W.webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

export function unlockAudio(): void {
  const c = ensureContext();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
}

export function setMuted(value: boolean): void {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

interface ToneOptions {
  freq: number;
  duration: number;
  type?: OscillatorType;
  attack?: number;
  release?: number;
  gain?: number;
  detune?: number;
  sweepTo?: number;
}

function tone(opts: ToneOptions): void {
  if (muted) return;
  const c = ensureContext();
  if (!c) return;
  const now = c.currentTime;
  const osc = c.createOscillator();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.freq, now);
  if (opts.sweepTo) {
    osc.frequency.exponentialRampToValueAtTime(opts.sweepTo, now + opts.duration);
  }
  if (opts.detune) osc.detune.setValueAtTime(opts.detune, now);

  const gainNode = c.createGain();
  const peak = opts.gain ?? 0.18;
  const attack = opts.attack ?? 0.01;
  const release = opts.release ?? 0.08;
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(peak, now + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + opts.duration + release);

  osc.connect(gainNode).connect(c.destination);
  osc.start(now);
  osc.stop(now + opts.duration + release + 0.05);
}

function noise(duration: number, gain = 0.18, lowpass = 1200): void {
  if (muted) return;
  const c = ensureContext();
  if (!c) return;
  const sampleRate = c.sampleRate;
  const buffer = c.createBuffer(1, sampleRate * duration, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.6;

  const src = c.createBufferSource();
  src.buffer = buffer;

  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = lowpass;

  const env = c.createGain();
  const now = c.currentTime;
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(gain, now + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  src.connect(filter).connect(env).connect(c.destination);
  src.start(now);
  src.stop(now + duration + 0.02);
}

export const sfx = {
  pickup(): void {
    tone({ freq: 720, duration: 0.06, type: 'triangle', gain: 0.12, sweepTo: 880 });
  },
  place(): void {
    tone({ freq: 380, duration: 0.08, type: 'square', gain: 0.1 });
    tone({ freq: 540, duration: 0.08, type: 'square', gain: 0.07, attack: 0.02 });
  },
  invalid(): void {
    tone({ freq: 180, duration: 0.18, type: 'sawtooth', gain: 0.12, sweepTo: 90 });
  },
  miss(): void {
    noise(0.22, 0.16, 900);
    tone({ freq: 220, duration: 0.18, type: 'sine', gain: 0.07 });
  },
  hit(): void {
    tone({ freq: 220, duration: 0.18, type: 'square', gain: 0.18, sweepTo: 110 });
    noise(0.12, 0.1, 600);
  },
  sunk(): void {
    tone({ freq: 90, duration: 0.42, type: 'sawtooth', gain: 0.22, sweepTo: 40, release: 0.2 });
    noise(0.5, 0.2, 400);
  },
  mineExplode(): void {
    tone({ freq: 60, duration: 0.55, type: 'sawtooth', gain: 0.28, sweepTo: 22, release: 0.3 });
    noise(0.8, 0.26, 1600);
  },
  turnPing(): void {
    tone({ freq: 880, duration: 0.07, type: 'sine', gain: 0.1 });
    tone({ freq: 1320, duration: 0.07, type: 'sine', gain: 0.08, attack: 0.03 });
  },
  victory(): void {
    tone({ freq: 523, duration: 0.12, type: 'triangle', gain: 0.15 });
    tone({ freq: 659, duration: 0.12, type: 'triangle', gain: 0.15, attack: 0.13 });
    tone({ freq: 784, duration: 0.18, type: 'triangle', gain: 0.15, attack: 0.26 });
    tone({ freq: 1047, duration: 0.32, type: 'triangle', gain: 0.18, attack: 0.42 });
  },
  defeat(): void {
    tone({ freq: 440, duration: 0.16, type: 'sawtooth', gain: 0.18, sweepTo: 220 });
    tone({ freq: 220, duration: 0.32, type: 'sawtooth', gain: 0.18, sweepTo: 110, attack: 0.18 });
  },
};
