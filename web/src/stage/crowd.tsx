import { memo, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimate, type Easing } from 'motion/react';
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

export type BubbleKind = 'none' | 'think' | 'bid' | 'out';
export type Mark = 'pass' | 'out';
export interface Flash { key: string; text: string; delay: number; lift: number }

export interface CrowdView {
  bubble: Map<string, BubbleKind>;
  amount: Map<string, number>;
  manual: Set<string>;
  hop: Map<string, number>; // ladder index of this agent's latest raise; a new index makes it jump
  mark: Map<string, Mark>;
  flash: Map<string, Flash>;
  crownId: string | null;
  spotId: string | null;
  jumpId: string | null;
}

const TAIL = ['kbbbbk', '.kbbk.', '..kk..'];
const FILL: Record<BubbleKind, string> = { none: '#fcfcfc', think: '#fcfcfc', bid: '#f8c630', out: '#b9bdcc' };

function Bubble({ kind, amount, manual }: { kind: BubbleKind; amount: number; manual: boolean }) {
  return (
    <motion.div
      className={`bubble b-${kind}`}
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.4, opacity: 0, transition: { duration: 0.1 } }}
      transition={{ type: 'spring', stiffness: 800, damping: 22 }}
    >
      <div className="bubble-box">
        {kind === 'think' && (
          <span className="dots" aria-label="thinking">
            <i /><i /><i />
          </span>
        )}
        {kind === 'bid' && <span className="amt">{usd(amount)}</span>}
        {kind === 'out' && <span className="out">OUT</span>}
      </div>
      {kind === 'bid' && manual && <span className="human">HUMAN</span>}
      <Px rows={TAIL} colors={{ k: '#14121f', b: FILL[kind] }} px={4} className="bubble-tail" />
    </motion.div>
  );
}

/** A pass agent says why once, early in the war, then goes quiet. */
function PassFlash({ text, delay, lift }: { text: string; delay: number; lift: number }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => setOn(true), delay);
    const b = setTimeout(() => setOn(false), delay + 2200);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [delay]);
  return (
    <AnimatePresence>
      {on && (
        <motion.div
          className="flash"
          style={{ marginBottom: lift }}
          initial={{ opacity: 0, y: 10, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          transition={{ type: 'spring', stiffness: 600, damping: 24 }}
        >
          <div className="flash-box">{text}</div>
          <Px rows={TAIL} colors={{ k: '#14121f', b: '#dfe3ee' }} px={3} className="bubble-tail" />
        </motion.div>
      )}
    </AnimatePresence>
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
  manual: boolean;
  crowned: boolean;
  jumping: boolean;
  hop: number;
  mark: Mark | null;
  spot: boolean;
  flashKey: string;
  flashText: string;
  flashDelay: number;
  flashLift: number;
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
    const base = { delay: p.stagger, duration: 1, times: [0, 0.3, 0.42, 0.72, 1] };
    return {
      initial: { x: dx, y: lift + 110 },
      animate: { x: [dx, dx, dx, dx * 0.45, 0], y: [lift + 110, lift - 36, lift - 6, peak, 0] },
      transition: {
        x: { ...base, ease: ['linear', 'linear', hop, hop] as Easing[] },
        y: { ...base, ease: ['backOut', 'easeIn', 'easeOut', 'easeIn'] as Easing[] },
      },
    };
  });
  const [hopScope, animate] = useAnimate<HTMLDivElement>();
  const lastHop = useRef(p.hop);
  useEffect(() => {
    if (p.hop === lastHop.current) return;
    lastHop.current = p.hop;
    if (p.hop >= 0 && hopScope.current) animate(hopScope.current, { y: [0, -Math.round(p.size * 0.7), 0] }, { duration: 0.34, ease: ['easeOut', 'easeIn'], times: [0, 0.45, 1] });
  }, [p.hop, p.size, animate, hopScope]);
  const h = (p.size * 13) / 12;
  const mark = p.mark ? ` is-${p.mark}` : '';
  return (
    <motion.div
      className="agent"
      initial={false}
      animate={{ x: p.x, y: p.y }}
      transition={{ type: 'spring', stiffness: 170, damping: 22 }}
      exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.25 } }}
      style={{ zIndex: p.crowned ? 3 : p.flashText ? 2 : 1 }}
    >
      <motion.div className="agent-entry" initial={entry?.initial ?? false} animate={entry?.animate} transition={entry?.transition}>
        <div ref={hopScope} className="agent-hop">
          <div className={`agent-body${p.jumping ? ' is-jumping' : ''}${mark}`} style={{ animationDelay: `${-(p.index % 7) * 0.17}s` }}>
            <AgentSprite color={safe(p.agent.color)} sprite={safe(p.agent.sprite)} size={p.size} title={p.agent.name} />
            <AnimatePresence>
              {p.crowned && (
                <motion.div
                  className="crown"
                  initial={{ y: -40, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  transition={{ type: 'spring', stiffness: 600, damping: 18 }}
                >
                  <Crown px={p.size >= 60 ? 4 : 3} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        {p.tags && (
          <motion.div
            className={`tag${p.agent.house ? ' is-house' : ''}${p.spot ? ' is-spot' : ''}`}
            initial={entry ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ delay: entry ? p.stagger + 0.95 : 0, duration: 0.2 }}
          >
            {(p.agent.name || '???').slice(0, 8)}
            {p.agent.via === 'pay.sh' && <span className="via">PAY.SH</span>}
          </motion.div>
        )}
        <div className={`bubble-anchor${p.size < 60 ? ' is-dense' : ''}`} style={{ bottom: h + (p.crowned ? 34 : 12) }}>
          <AnimatePresence mode="popLayout">
            {p.bubble !== 'none' && <Bubble key={p.bubble} kind={p.bubble} amount={p.amount} manual={p.manual} />}
          </AnimatePresence>
          {p.flashText && <PassFlash key={p.flashKey} text={p.flashText} delay={p.flashDelay} lift={p.flashLift} />}
        </div>
      </motion.div>
    </motion.div>
  );
});

export function Crowd({ agents, layout, view }: { agents: AgentPublic[]; layout: CrowdLayout; view: CrowdView }) {
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
          const flash = view.flash.get(a.id);
          return (
            <Agent
              key={a.id}
              agent={a}
              x={s.x}
              y={s.y}
              size={s.size}
              index={i}
              stagger={first.current ? Math.max(spawnIndex, 0) * 0.1 : 0}
              spawn={spawnIndex >= 0}
              tags={layout.tags}
              bubble={view.bubble.get(a.id) ?? 'none'}
              amount={view.amount.get(a.id) ?? 0}
              manual={view.manual.has(a.id)}
              crowned={view.crownId === a.id}
              jumping={view.jumpId === a.id}
              hop={view.hop.get(a.id) ?? -1}
              mark={view.mark.get(a.id) ?? null}
              spot={view.spotId === a.id}
              flashKey={flash?.key ?? ''}
              flashText={flash?.text ?? ''}
              flashDelay={flash?.delay ?? 0}
              flashLift={flash?.lift ?? 0}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}
