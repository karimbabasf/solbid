// Pixel speaker toggle. withMusic: the button also starts and stops the theme (big screen).
import { useEffect, useRef } from 'react';
import { Grid } from './sprites';
import { isMuted, music, setMuted, sfx, unlockAudio, useSound } from './sound';
import './kit.css';

const INK = '#14121f';
const SPEAKER_ON = ['.....k......', '....kk....k.', '...kkk..k..k', 'kkkkkk...k.k', 'kkkkkk.k.k.k', 'kkkkkk.k.k.k', 'kkkkkk...k.k', '...kkk..k..k', '....kk....k.', '.....k......'];
const SPEAKER_OFF = ['.....k......', '....kk......', '...kkk.x...x', 'kkkkkk..x.x.', 'kkkkkk...x..', 'kkkkkk..x.x.', 'kkkkkk.x...x', '...kkk......', '....kk......', '.....k......'];

export function SoundButton({ withMusic, className }: { withMusic?: boolean; className?: string }) {
  const { muted, unlocked } = useSound();
  const ref = useRef<HTMLButtonElement>(null);
  const on = unlocked && !muted;

  // Any first gesture on the page unlocks audio, so the room is not silent until someone finds this button.
  useEffect(() => {
    const first = (e: Event) => {
      if (ref.current?.contains(e.target as Node)) return;
      unlockAudio();
      if (withMusic && !isMuted()) music.start();
      off();
    };
    const off = () => {
      window.removeEventListener('pointerdown', first);
      window.removeEventListener('keydown', first);
    };
    window.addEventListener('pointerdown', first);
    window.addEventListener('keydown', first);
    return off;
  }, [withMusic]);

  const toggle = () => {
    unlockAudio();
    const next = unlocked ? !muted : false;
    setMuted(next);
    if (withMusic) {
      if (next) music.stop();
      else music.start();
    }
    if (!next) setTimeout(() => sfx('tap'), 60);
  };

  return (
    <button
      ref={ref}
      type="button"
      className={['kit-block', on ? '' : 'is-off', className].filter(Boolean).join(' ')}
      onClick={toggle}
      aria-pressed={on}
      aria-label="Sound"
      title={on ? 'Mute' : 'Sound on'}
    >
      <Grid rows={on ? SPEAKER_ON : SPEAKER_OFF} colors={{ k: INK, x: '#fcfcfc' }} size={24} className="kit-block__icon" />
    </button>
  );
}
