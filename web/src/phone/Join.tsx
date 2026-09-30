import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { GoalId, ItemIcon, JoinRequest, JoinResponse } from '@shared/types';
import { api } from '../lib/useAuction';
import { AgentSprite, ItemSprite } from '../kit/sprites';
import { InfoButton } from '../kit/Info';
import { SoundButton } from '../kit/SoundButton';
import { sfx, unlockAudio } from '../kit/sound';
import { Bricks, PipeSpot, Sky } from './bits';

const GOALS: { id: GoalId; word: string; icon: ItemIcon }[] = [
  { id: 'laugh', word: 'LAUGH', icon: 'joke' },
  { id: 'art', word: 'ART', icon: 'art' },
  { id: 'alpha', word: 'ALPHA', icon: 'price' },
  { id: 'weather', word: 'WEATHER', icon: 'weather' },
];

const NAMES = ['PIP', 'ZED', 'MOXY', 'BOLT', 'KIKI', 'RUNE', 'NOVA', 'TAKO', 'FIZZ', 'OKRA', 'JUNO', 'BEEP', 'DOT', 'LUMA', 'ACE', 'YOSHI'];
const cleanName = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
const DROP_MS = 820;
const rnd = (n: number, not?: number) => {
  let v = Math.floor(Math.random() * n);
  if (v === not) v = (v + 1 + Math.floor(Math.random() * (n - 1))) % n;
  return v;
};

type Status = 'idle' | 'busy' | 'failed' | 'drop';

export default function Join({ onSpawned, enterUrl }: { onSpawned: (id: string, key: string) => void; enterUrl?: string }) {
  const reduce = useReducedMotion();
  const [suggest] = useState(() => NAMES[rnd(NAMES.length)]);
  const [name, setName] = useState('');
  const [look, setLook] = useState(() => ({ color: rnd(8), sprite: rnd(4) }));
  const [hop, setHop] = useState(0);
  const [goal, setGoal] = useState<GoalId | null>(null);
  const [text, setText] = useState('');
  const [nudge, setNudge] = useState(0);
  const [status, setStatus] = useState<Status>('idle');
  const dropping = status === 'drop';

  const reroll = () => {
    if (dropping) return;
    setLook((l) => ({ color: rnd(8, l.color), sprite: rnd(4, l.sprite) }));
    setHop((h) => h + 1);
  };

  const pick = (id: GoalId) => {
    setGoal(id);
    setText('');
  };

  const type = (v: string) => {
    const t = v.slice(0, 40);
    setText(t);
    setGoal(t.trim() ? 'custom' : null);
  };

  const spawn = async () => {
    unlockAudio();
    if (status === 'busy' || dropping) return;
    if (!goal) return setNudge((n) => n + 1);
    sfx('join');
    setStatus('busy');
    const body: JoinRequest = { goal, text: goal === 'custom' ? text.trim() : undefined, color: look.color, sprite: look.sprite, name: name || suggest };
    const res = await api<JoinResponse>('/api/join', body);
    if (!res?.agentId) return setStatus('failed');
    setStatus('drop');
    setTimeout(() => onSpawned(res.agentId, res.key ?? ''), reduce ? 0 : DROP_MS);
  };

  return (
    <div className="ph-screen jn">
      <Sky>
        <p className="jn-brand">SOLBID</p>
        <span className="ph-tools">
          <InfoButton enterUrl={enterUrl} />
          <SoundButton />
        </span>
      </Sky>

      <main className="ph-main jn-main">
        <div className="jn-hero">
          <PipeSpot pipeW={112} pipeH={56} height={236}>
            <motion.button
              type="button"
              className="jn-me"
              onClick={reroll}
              aria-label="New look"
              animate={dropping ? { y: [0, -36, 220] } : { y: 0 }}
              transition={dropping ? { duration: DROP_MS / 1000, times: [0, 0.28, 1], ease: ['easeOut', 'easeIn'] } : { duration: 0 }}
            >
              <motion.span
                key={hop}
                className="jn-me-body"
                initial={false}
                animate={hop ? { y: [0, -44, 0, -8, 0], scaleY: [1, 1.06, 0.86, 1, 1], scaleX: [1, 0.95, 1.12, 1, 1] } : undefined}
                transition={{ duration: 0.52, times: [0, 0.38, 0.7, 0.86, 1], ease: 'easeOut' }}
              >
                <AgentSprite color={look.color} sprite={look.sprite} size={120} className="ph-idle" />
              </motion.span>
            </motion.button>
          </PipeSpot>
          {hop === 0 && !dropping && (
            <span className="jn-tap" aria-hidden>
              TAP ME
            </span>
          )}
        </div>

        <motion.div className="jn-form" animate={dropping ? { opacity: 0, y: 24 } : { opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: 'easeIn' }}>
          <label className="jn-name">
            <span className="jn-name-tag">NAME</span>
            <input
              value={name}
              onChange={(e) => setName(cleanName(e.target.value))}
              placeholder={suggest}
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              aria-label="Agent name, up to 7 letters or digits"
            />
          </label>
          <h1 className="jn-ask">WHAT DO YOU WANT?</h1>
          <motion.div
            key={nudge}
            className="jn-goals"
            role="radiogroup"
            aria-label="Goal"
            initial={false}
            animate={nudge ? { x: [0, -10, 10, -6, 6, 0] } : undefined}
            transition={{ duration: 0.36 }}
          >
            {GOALS.map((g) => {
              const on = goal === g.id;
              return (
                <button key={g.id} type="button" role="radio" aria-checked={on} className={`jn-goal${on ? ' is-on' : ''}`} onClick={() => pick(g.id)}>
                  <motion.span key={on ? 'on' : 'off'} className="jn-goal-art" initial={on ? { y: -10 } : false} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 700, damping: 14 }}>
                    <ItemSprite icon={g.icon} size={40} />
                  </motion.span>
                  <span className="jn-goal-word">{g.word}</span>
                </button>
              );
            })}
          </motion.div>
          <label className={`jn-type${goal === 'custom' ? ' is-on' : ''}`}>
            <span className="ph-sr">Or type what you want</span>
            <input
              value={text}
              onChange={(e) => type(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && spawn()}
              placeholder="or type it"
              maxLength={40}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
            />
            {text && <span className="jn-count">{40 - text.length}</span>}
          </label>
        </motion.div>
      </main>

      <footer className="jn-foot">
        <AnimatePresence>
          {status === 'failed' && (
            <motion.p className="jn-err" role="alert" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              HOUSE IS FULL. TRY AGAIN IN A MINUTE.
            </motion.p>
          )}
        </AnimatePresence>
        <button type="button" className={`ph-block jn-go${goal ? ' is-ready' : ''}`} onClick={spawn} disabled={dropping} aria-busy={status === 'busy'}>
          <span className="ph-block-rivets" aria-hidden />
          {status === 'busy' ? <span className="ph-dots" aria-label="Spawning"><i /><i /><i /></span> : status === 'failed' ? 'RETRY' : 'SPAWN'}
        </button>
        <Bricks />
      </footer>
    </div>
  );
}
