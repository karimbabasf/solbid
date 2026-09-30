import { memo, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, type Easing } from 'motion/react';
import type { AgentPublic } from '@shared/types';
import { AgentSprite, usd } from '../kit/sprites';
import { Crown, Px } from './art';

// Stage geometry, in 1920x1080 stage pixels.
export const GROUND = 880;
export const LEDGE_Y = 700;
export const PIPE_TOP = 700;
export const PIPES = [110, 1810];
const X0 = 260;
const X1 = 1660;
const LEDGES: [number, number][] = [[260, 750], [1170, 1660]];

export interface Slot { x: number; y: number; size: number }
export interface CrowdLayout { slots: Map<string, Slot>; size: number; ledges: { x0: number; x1: number }[]; tags: boolean }

const snap = (n: number) => Math.max(24, Math.min(72, Math.floor(n / 12) * 12));

/** One ground row up to 14 agents; past that, two floating ledges take the late joiners. */
export function layoutCrowd(agents: AgentPublic[]): CrowdLayout {
  const n = agents.length;
  const slots = new Map<string, Slot>();
  const row = (list: AgentPublic[], x0: number, x1: number, y: number, pitch: number, size: number) => {
    const start = (x0 + x1) / 2 - (pitch * (list.length - 1)) / 2;
    list.forEach((a, i) => slots.set(a.id, { x: start + i * pitch, y, size }));
  };
  if (n <= 14) {
    const pitch = Math.min(112, (X1 - X0) / Math.max(n, 1));
    row(agents, X0, X1, GROUND, pitch, 72);
    return { slots, size: 72, ledges: [], tags: true };
  }
  const g = Math.ceil(n * 0.55);
  const l = Math.ceil((n - g) / 2);
  const ground = agents.slice(0, g);
  const left = agents.slice(g, g + l);
  const right = agents.slice(g + l);
  const pitch = Math.min(112, (X1 - X0) / g, (LEDGES[0][1] - LEDGES[0][0]) / Math.max(l, 1));
  const size = snap(pitch * 0.8);
  row(ground, X0, X1, GROUND, pitch, size);
  const ledges: CrowdLayout['ledges'] = [];
  [left, right].forEach((list, i) => {
    if (!list.length) return;
    const [a, b] = LEDGES[i];
    const half = (pitch * list.length) / 2 + 20;
    const mid = i === 0 ? b - half : a + half; // hug the gap under the block
    row(list, mid - half, mid + half, LEDGE_Y, pitch, size);
    ledges.push({ x0: mid - half, x1: mid + half });
  });
  return { slots, size, ledges, tags: pitch >= 52 };
}

export type BubbleKind = 'none' | 'think' | 'bid' | 'pass';

const TAIL = ['kbbbbk', '.kbbk.', '..kk..'];
function Bubble({ kind, amount, delay, top }: { kind: BubbleKind; amount: number; delay: number; top: boolean }) {
  const [shown, setShown] = useState(delay <= 0);
  useEffect(() => {
    if (delay <= 0) return setShown(true);
    setShown(false);
    const t = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(t);
  }, [delay, kind]);
  const k = kind !== 'think' && !shown ? 'think' : kind;
  const fill = k === 'bid' ? '#f8c630' : k === 'pass' ? '#dfe3ee' : '#fcfcfc';
  return (
    <motion.div
      key={k}
      className={`bubble b-${k}${top && k === 'bid' ? ' is-top' : ''}`}
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.4, opacity: 0, transition: { duration: 0.12 } }}
      transition={{ type: 'spring', stiffness: 700, damping: 22 }}
    >
      <div className="bubble-box">
        {k === 'think' && (
          <span className="dots" aria-label="thinking">
            <i /><i /><i />
          </span>
        )}
        {k === 'bid' && <span className="amt">{usd(amount)}</span>}
        {k === 'pass' && <span className="pass">PASS</span>}
      </div>
      <Px rows={TAIL} colors={{ k: '#14121f', b: fill }} px={4} className="bubble-tail" />
    </motion.div>
  );
}

type AgentProps = {
  agent: AgentPublic;
  x: number;
  y: number;
  size: number;
  index: number;
  stagger: number;
  spawn: boolean;
  tags: boolean;
  bubble: BubbleKind;
  amount: number;
  delay: number;
  top: boolean;
  crowned: boolean;
  jumping: boolean;
  dim: boolean;
};

const safe = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);
const hop = (t: number) => Math.round(t * 10) / 10; // quantized ease, reads as frames

const Agent = memo(function Agent(p: AgentProps) {
  // Everything about the entrance is fixed at mount so later reflows never restart it.
  const [entry] = useState(() => {
    if (!p.spawn) return null;
    const pipe = p.x < 960 ? PIPES[0] : PIPES[1];
    const dx = pipe - p.x;
    const lift = PIPE_TOP - p.y; // 0 on a ledge, -180 on the ground
    const peak = Math.min(lift, 0) - 90;
    const base = { delay: p.stagger, duration: 1.3, times: [0, 0.3, 0.42, 0.72, 1] };
    return {
      initial: { x: dx, y: lift + 110 },
      animate: { x: [dx, dx, dx, dx * 0.45, 0], y: [lift + 110, lift - 36, lift - 6, peak, 0] },
      transition: {
        x: { ...base, ease: ['linear', 'linear', hop, hop] as Easing[] },
        y: { ...base, ease: ['backOut', 'easeIn', 'easeOut', 'easeIn'] as Easing[] },
      },
    };
  });
  const h = (p.size * 13) / 12;
  return (
    <motion.div
      className="agent"
      initial={false}
      animate={{ x: p.x, y: p.y }}
      transition={{ type: 'spring', stiffness: 170, damping: 22 }}
      exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.3 } }}
      style={{ zIndex: p.crowned ? 3 : 1 }}
    >
      <motion.div className="agent-entry" initial={entry?.initial ?? false} animate={entry?.animate} transition={entry?.transition}>
        <div className={`agent-body${p.jumping ? ' is-jumping' : ''}${p.dim ? ' is-dim' : ''}`} style={{ animationDelay: `${-(p.index % 7) * 0.17}s` }}>
          <AgentSprite color={safe(p.agent.color)} sprite={safe(p.agent.sprite)} size={p.size} title={p.agent.name} />
          <AnimatePresence>
            {p.crowned && (
              <motion.div
                className="crown"
                initial={{ y: -40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 16 }}
              >
                <Crown px={p.size >= 60 ? 4 : 3} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {p.tags && (
          <motion.div className={`tag${p.agent.house ? ' is-house' : ''}`} initial={entry ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ delay: entry ? p.stagger + 1.25 : 0, duration: 0.2 }}>
            {(p.agent.name || '???').slice(0, 6)}
          </motion.div>
        )}
        <div className={`bubble-anchor${p.size < 60 ? ' is-dense' : ''}`} style={{ bottom: h + (p.crowned ? 34 : 12) }}>
          <AnimatePresence mode="popLayout">
            {p.bubble !== 'none' && <Bubble key={p.bubble} kind={p.bubble} amount={p.amount} delay={p.delay} top={p.top} />}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
});

export interface CrowdBids { kind: Map<string, BubbleKind>; amount: Map<string, number>; delay: Map<string, number>; topId: string | null }

export function Crowd({ agents, layout, bids, crownId, jumpId, dimOthers }: { agents: AgentPublic[]; layout: CrowdLayout; bids: CrowdBids; crownId: string | null; jumpId: string | null; dimOthers: boolean }) {
  const seen = useRef(new Set<string>());
  const first = useRef(true);
  const fresh: string[] = [];
  for (const a of agents) if (!seen.current.has(a.id)) fresh.push(a.id);
  useEffect(() => {
    for (const a of agents) seen.current.add(a.id);
    first.current = false;
  });
  return (
    <div className="crowd">
      {layout.ledges.map((l, i) => (
        <div key={i} className="ledge" style={{ transform: `translate(${l.x0}px, ${LEDGE_Y}px)`, width: l.x1 - l.x0 }} />
      ))}
      <AnimatePresence>
        {agents.map((a, i) => {
          const s = layout.slots.get(a.id);
          if (!s) return null;
          const spawnIndex = fresh.indexOf(a.id);
          return (
            <Agent
              key={a.id}
              agent={a}
              x={s.x}
              y={s.y}
              size={s.size}
              index={i}
              stagger={first.current ? Math.max(spawnIndex, 0) * 0.12 : 0}
              spawn={spawnIndex >= 0}
              tags={layout.tags}
              bubble={bids.kind.get(a.id) ?? 'none'}
              amount={bids.amount.get(a.id) ?? 0}
              delay={bids.delay.get(a.id) ?? 0}
              top={bids.topId === a.id}
              crowned={crownId === a.id}
              jumping={jumpId === a.id}
              dim={dimOthers && crownId !== a.id}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}
