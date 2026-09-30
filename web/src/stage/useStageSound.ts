import { useEffect, useRef } from 'react';
import type { AuctionState } from '@shared/types';
import { music, sfx, unlockAudio, type Sfx } from '../kit/sound';

const FOLD_GAP = 400;

/** Every sound-worthy event in a snapshot, as a stable id. An id plays once, the first time it shows up. */
function events(s: AuctionState): [string, Sfx][] {
  const out: [string, Sfx][] = [];
  for (const a of s.agents) out.push([`join:${a.id}`, 'join']);
  for (const p of s.payments) if (p.kind === 'x402' && p.status === 'confirmed') out.push([`coin:${p.id}`, 'coin']);
  const lot = s.lot;
  if (!lot) return out;
  if (s.phase === 'intro') out.push([`lot:${lot.id}`, 'lot']);
  (s.ladder ?? []).forEach((r) => out.push([`raise:${lot.id}:${r.at}:${r.agentId}`, 'raise']));
  for (const b of s.bids) if (b.state === 'out') out.push([`fold:${lot.id}:${b.agentId}`, 'fold']);
  if (s.going && s.phase === 'reveal') out.push([`going:${lot.id}:${s.ladder?.length ?? 0}`, 'going']);
  if ((s.phase === 'paying' || s.phase === 'sold') && s.winner) out.push([`sold:${lot.id}`, 'sold']);
  if (s.phase === 'unsold') out.push([`unsold:${lot.id}`, 'unsold']);
  return out;
}

export function useStageSound(state: AuctionState | null) {
  const seen = useRef<Set<string> | null>(null);
  const lastFold = useRef(0);

  useEffect(() => {
    const go = () => {
      unlockAudio();
      if (!music.playing()) music.start();
      off();
    };
    const off = () => {
      window.removeEventListener('pointerdown', go);
      window.removeEventListener('keydown', go);
    };
    window.addEventListener('pointerdown', go);
    window.addEventListener('keydown', go);
    return off;
  }, []);

  useEffect(() => {
    if (!state) return;
    const list = events(state);
    // The first snapshot is history: mark it heard so a reload never replays the room.
    if (!seen.current) {
      seen.current = new Set(list.map(([id]) => id));
      return;
    }
    const fresh = new Set<Sfx>();
    for (const [id, name] of list) {
      if (seen.current.has(id)) continue;
      seen.current.add(id);
      fresh.add(name);
    }
    for (const name of fresh) {
      if (name === 'raise') sfx('raise', { pitch: Math.min(1, Math.max(0, state.price || 0) / 3) });
      else if (name === 'fold') {
        const now = Date.now();
        if (now - lastFold.current < FOLD_GAP) continue;
        lastFold.current = now;
        sfx('fold');
      } else sfx(name);
    }
  }, [state]);
}
