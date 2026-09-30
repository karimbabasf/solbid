// STUB: the kit builder replaces the internals. Keep these exports and signatures.
// Chiptune music and sound effects, synthesized with WebAudio (no audio files).
export type Sfx = 'tap' | 'join' | 'lot' | 'raise' | 'fold' | 'going' | 'sold' | 'unsold' | 'coin' | 'win' | 'lose';

// Call from any user gesture (click, tap). Browsers keep audio locked until then.
export function unlockAudio(): void {}

// Plays one effect. pitch nudges it up (raise: pass 0..1 as the price climbs). No-op while muted or locked.
export function sfx(_name: Sfx, _opts?: { pitch?: number }): void {}

// Background theme loop. Only the big screen starts it.
export const music = {
  start(): void {},
  stop(): void {},
  playing(): boolean {
    return false;
  },
};
