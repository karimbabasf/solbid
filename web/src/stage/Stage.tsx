import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion, useAnimate } from 'motion/react';
import type { AuctionState, Lot, Phase } from '@shared/types';
import { api, useAuction } from '../lib/useAuction';
import { Coin, ItemSprite, usd } from '../kit/sprites';
import { Cloud, Hill, Px, QBlock } from './art';
import { Crowd, GROUND, PIPES, PIPE_TOP, layoutCrowd, type BubbleKind, type CrowdBids, type Slot } from './crowd';
import { Hud, JoinSign, Leaders, Ticker } from './panels';
import './stage.css';

const W = 1920;
const H = 1080;
const BLOCK_TOP = 404;
const ITEM_Y = 300; // centre of the floating lot
const CX = W / 2;

function useFit() {
  const calc = () => Math.min(window.innerWidth / W, window.innerHeight / H);
  const [s, setS] = useState(calc);
  useEffect(() => {
    const on = () => setS(calc());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return s;
}

function useHostKeys(state: AuctionState | null) {
  const ref = useRef(state);
  ref.current = state;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const s = ref.current;
      if (e.code === 'Space') {
        e.preventDefault();
        const run = !s || s.paused || s.phase === 'lobby';
        api(run ? '/api/host/start' : '/api/host/pause', {});
      } else if (e.code === 'KeyN') api('/api/host/next', {});
      else if (e.code === 'KeyB') api('/api/host/bots', {});
      else if (e.code === 'KeyR') api('/api/host/reset', {});
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
}

/** Server-anchored clock: 0..1 of the current phase left, ticking only while `on`. */
function usePhaseLeft(state: AuctionState | null, on: boolean) {
  const skew = useRef(0);
  const start = useRef<{ phase: Phase | null; at: number }>({ phase: null, at: 0 });
  if (state) {
    skew.current = state.serverTime - Date.now();
    if (start.current.phase !== state.phase) start.current = { phase: state.phase, at: state.serverTime };
  }
  const [, tick] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(t);
  }, [on]);
  if (!state || !state.phaseEndsAt) return 1;
  const now = Date.now() + skew.current;
  const total = Math.max(1, state.phaseEndsAt - start.current.at);
  return Math.max(0, Math.min(1, (state.phaseEndsAt - now) / total));
}

function Sky() {
  return (
    <div className="sky" aria-hidden>
      <div className="cloud c1"><Cloud px={8} /></div>
      <div className="cloud c2"><Cloud px={6} /></div>
      <div className="cloud c3"><Cloud px={5} /></div>
      <div className="cloud c4"><Cloud px={7} /></div>
      <div className="hill h1"><Hill px={10} /></div>
      <div className="hill h2"><Hill px={7} /></div>
    </div>
  );
}

function Pipes() {
  return (
    <>
      {PIPES.map((x) => (
        <div key={x} className="pipe" style={{ transform: `translate(${x - 68}px, ${PIPE_TOP}px)` }} aria-hidden>
          <div className="pipe-lip" />
          <div className="pipe-body" />
        </div>
      ))}
    </>
  );
}

const SEGMENTS = 10;
function Fuse({ left }: { left: number }) {
  const lit = Math.ceil(left * SEGMENTS);
  return (
    <div className="fuse" aria-hidden>
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <i key={i} className={i < lit ? 'on' : ''} />
      ))}
    </div>
  );
}

type Target = { x: number; y: number } | null;

function Podium({ lot, phase, winnerAt, price, fuse, paused, empty }: { lot: Lot | null; phase: Phase; winnerAt: Target; price: number; fuse: number; paused: boolean; empty: boolean }) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const live = !!lot && phase !== 'lobby';
  const used = live && phase !== 'unsold';
  useEffect(() => {
    if (phase === 'intro' && scope.current) animate(scope.current, { y: [0, -32, 0] }, { duration: 0.28, ease: 'easeOut' });
  }, [phase, lot?.id, animate, scope]);

  let itemAnim: Record<string, number | number[]> = { x: 0, y: 0, scale: 1, opacity: 1 };
  let itemTrans: object = { type: 'spring', stiffness: 380, damping: 14 };
  if (phase === 'sold' && winnerAt) {
    itemAnim = { x: winnerAt.x - CX, y: winnerAt.y - ITEM_Y, scale: 0.3, opacity: [1, 1, 1, 0] };
    itemTrans = { delay: 0.55, duration: 0.8, ease: [0.5, 0, 0.3, 1] };
  } else if (phase === 'unsold') {
    itemAnim = { x: 0, y: 190, scale: 0.7, opacity: 1 };
    itemTrans = { duration: 0.6, ease: 'easeIn' };
  }

  return (
    <div className="podium">
      <AnimatePresence>
        {live && lot && (
          <motion.div
            key={lot.id}
            className="lot-item"
            initial={{ y: 190, scale: 0.6, opacity: 1 }}
            animate={itemAnim}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={itemTrans}
          >
            <div className={phase === 'sold' || phase === 'unsold' ? '' : 'float'}>
              <ItemSprite icon={lot.icon} size={144} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={scope} className={`block${live ? '' : ' is-idle'}`}>
        <QBlock used={used} />
      </div>

      <AnimatePresence mode="wait">
        {live && lot && (
          <motion.div key={lot.id} className="lot-label" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: 0.25, duration: 0.3 }}>
            <div className="lot-name">{lot.name.toUpperCase()}</div>
            <div className="lot-reserve">RESERVE {usd(lot.reserve || 0)}</div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="podium-status">
        <AnimatePresence mode="wait">
          {paused ? (
            <motion.div key="paused" className="pill pill-ink" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}>PAUSED</motion.div>
          ) : phase === 'thinking' ? (
            <motion.div key="fuse" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Fuse left={fuse} /></motion.div>
          ) : phase === 'paying' ? (
            <motion.div key="pay" className="pill pill-sol" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}>
              <span className="pill-tag">x402</span>SETTLING ON SOLANA
            </motion.div>
          ) : phase === 'unsold' ? (
            <motion.div key="nosale" className="pill pill-grey" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ delay: 0.4 }}>NO SALE</motion.div>
          ) : !live && empty ? (
            <motion.div key="wait" className="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>WAITING FOR AGENTS</motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {phase === 'sold' && (
          <motion.div
            key={`stamp-${lot?.id}`}
            className="stamp"
            initial={{ scale: 2.4, rotate: -16, opacity: 0 }}
            animate={{ scale: 1, rotate: -7, opacity: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 520, damping: 20 }}
          >
            <span className="stamp-word">SOLD</span>
            <span className="stamp-price">{usd(price || 0)}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Coins({ from }: { from: { x: number; y: number } }) {
  const to = { x: CX - 16, y: BLOCK_TOP + 40 };
  const peak = Math.min(from.y, to.y) - 160;
  return (
    <div className="coins" aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <motion.div
          key={i}
          className="coin"
          initial={{ x: from.x - 16, y: from.y, opacity: 0 }}
          animate={{ x: [from.x - 16, (from.x + to.x) / 2 - 16, to.x], y: [from.y, peak, to.y], opacity: [1, 1, 0] }}
          transition={{
            duration: 0.75,
            delay: 0.25 + i * 0.16,
            repeat: Infinity,
            repeatDelay: 0.2,
            times: [0, 0.5, 1],
            x: { duration: 0.75, delay: 0.25 + i * 0.16, repeat: Infinity, repeatDelay: 0.2, ease: 'linear' },
            y: { duration: 0.75, delay: 0.25 + i * 0.16, repeat: Infinity, repeatDelay: 0.2, times: [0, 0.5, 1], ease: ['easeOut', 'easeIn'] },
            opacity: { duration: 0.75, delay: 0.25 + i * 0.16, repeat: Infinity, repeatDelay: 0.2, times: [0, 0.85, 1] },
          }}
        >
          <Coin size={32} />
        </motion.div>
      ))}
    </div>
  );
}

const TAIL = ['kbbbbk', '.kbbk.', '..kk..'];

function Reason({ at, text }: { at: Slot; text: string }) {
  const half = 300;
  const cx = Math.max(half + 40, Math.min(W - half - 40, at.x));
  const head = at.y - (at.size * 13) / 12 - 30; // clear the crown
  return (
    <motion.div
      className="reason"
      style={{ left: cx - half, bottom: H - head + 18, width: half * 2 }}
      initial={{ opacity: 0, y: 16, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ delay: 1.1, type: 'spring', stiffness: 420, damping: 22 }}
    >
      <div className="reason-box">{text}</div>
      <Px rows={TAIL} colors={{ k: '#14121f', b: '#fcfcfc' }} px={4} className="reason-tail" style={{ left: half + (at.x - cx) - 12 }} />
    </motion.div>
  );
}

const PHASES_WITH_BIDS: Phase[] = ['reveal', 'paying', 'sold'];

export default function Stage() {
  const { state, online } = useAuction();
  const scale = useFit();
  useHostKeys(state);
  const phase: Phase = state?.phase ?? 'lobby';
  const fuse = usePhaseLeft(state, phase === 'thinking');
  const agents = state?.agents ?? [];
  const layout = useMemo(() => layoutCrowd(agents), [agents]);

  const winner = state?.winner ?? null;
  const winnerSlot = winner ? layout.slots.get(winner.agentId) ?? null : null;
  const winnerBid = winner ? state?.bids.find((b) => b.agentId === winner.agentId) : undefined;

  const bids = useMemo<CrowdBids>(() => {
    const kind = new Map<string, BubbleKind>();
    const amount = new Map<string, number>();
    const delay = new Map<string, number>();
    let topId: string | null = null;
    if (!state) return { kind, amount, delay, topId };
    const present = new Set(state.agents.map((a) => a.id));
    if (state.phase === 'thinking') for (const a of state.agents) kind.set(a.id, 'think');
    if (PHASES_WITH_BIDS.includes(state.phase)) {
      const valid = state.bids.filter((b) => present.has(b.agentId));
      // Ascending, so the top bid resolves last. On a tie the earlier bid wins, as on the server.
      const order = new Map(state.bids.map((b, i) => [b, i]));
      const ranked = [...valid].sort((a, b) => (a.amount ?? -1) - (b.amount ?? -1) || order.get(b)! - order.get(a)!);
      const best = ranked.filter((b) => b.amount !== null).at(-1);
      topId = state.winner?.agentId ?? best?.agentId ?? null;
      ranked.forEach((b, i) => {
        if (state.phase !== 'reveal' && b.agentId !== topId) return;
        if (state.phase === 'sold') return; // the reason bubble takes over
        kind.set(b.agentId, b.amount === null ? 'pass' : 'bid');
        amount.set(b.agentId, typeof b.amount === 'number' && Number.isFinite(b.amount) ? b.amount : 0);
        delay.set(b.agentId, state.phase === 'reveal' ? 200 + i * 120 : 0);
      });
    }
    return { kind, amount, delay, topId };
  }, [state]);

  const crownId = phase === 'reveal' || phase === 'paying' || phase === 'sold' ? bids.topId : null;
  const winnerHead = winnerSlot ? { x: winnerSlot.x, y: winnerSlot.y - winnerSlot.size * 1.5 } : null;

  return (
    <MotionConfig reducedMotion="user">
      <main className="stage-viewport">
        <div className="stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
          <Sky />
          <Hud state={state} online={online} />
          <JoinSign url={state?.joinUrl ?? ''} />
          <Leaders agents={agents} />
          <Podium
            lot={state?.lot ?? null}
            phase={phase}
            winnerAt={winnerSlot ? { x: winnerSlot.x, y: winnerSlot.y - winnerSlot.size * 1.6 } : null}
            price={winner?.amount ?? 0}
            fuse={fuse}
            paused={!!state?.paused}
            empty={agents.length === 0}
          />
          <div className="ground" style={{ top: GROUND }} aria-hidden />
          <Crowd agents={agents} layout={layout} bids={bids} crownId={crownId} jumpId={phase === 'paying' ? winner?.agentId ?? null : null} dimOthers={false} />
          <Pipes />
          {phase === 'paying' && winnerHead && <Coins key={state?.lot?.id} from={winnerHead} />}
          <AnimatePresence>
            {phase === 'sold' && winnerSlot && winnerBid?.reason && <Reason key={state?.lot?.id ?? 'r'} at={winnerSlot} text={winnerBid.reason} />}
          </AnimatePresence>
          <Ticker payments={state?.payments ?? []} agents={agents} />
        </div>
      </main>
    </MotionConfig>
  );
}
