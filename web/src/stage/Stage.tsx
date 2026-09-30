import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion, useAnimate } from 'motion/react';
import type { AuctionState, Lot, Phase, Raise } from '@shared/types';
import { api, useAuction } from '../lib/useAuction';
import { Coin, Grid, usd } from '../kit/sprites';
import { sfx, unlockAudio } from '../kit/sound';
import { LotCard } from '../kit/LotCard';
import { InfoButton } from '../kit/Info';
import { SoundButton } from '../kit/SoundButton';
import { Cloud, Hill, Px } from './art';
import { Crowd, GROUND, PIPES, PIPE_TOP, layoutCrowd, type BubbleKind, type CrowdView, type Flash, type Mark, type Slot } from './crowd';
import { Hud, JoinSign, Ladder, Leaders, Ticker } from './panels';
import { useStageSound } from './useStageSound';
import './stage.css';

const W = 1920;
const H = 1080;
const CARD_BASE = 554; // the card grows upward from this line
const CARD_MAX = { w: 460, h: CARD_BASE - 150 }; // never reaches up into the HUD
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

const RESTART_ICON = ['...kkkkk....', '..kk...kkk.k', '.kk.....kkkk', '.k.....kkkkk', 'kk..........', 'kk..........', 'kk..........', '.k.......kk.', '.kk.....kk..', '..kk...kk...', '...kkkkk....'];

/** New game, same room: fresh $10 wallets, lot count and leaderboard back to zero. Second tap within 3s confirms. */
function RestartButton() {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  const tap = () => {
    unlockAudio();
    sfx('tap');
    if (!armed) return setArmed(true);
    setArmed(false);
    void api('/api/host/restart', {});
  };
  return (
    <button type="button" className={`kit-block restart${armed ? ' is-armed' : ''}`} onClick={tap} aria-label={armed ? 'Tap again to restart' : 'Restart game'} title="Restart game">
      {armed ? <span className="restart-sure">SURE?</span> : <Grid rows={RESTART_ICON} colors={{ k: '#14121f' }} size={24} />}
    </button>
  );
}

/** Re-renders every 100ms while `on`, so server-timed labels move between snapshots. */
function useTick(on: boolean) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(t);
  }, [on]);
}

/** Server-anchored clock: 0..1 of the current phase left. */
function usePhaseLeft(state: AuctionState | null, on: boolean) {
  const skew = useRef(0);
  const start = useRef<{ phase: Phase | null; at: number }>({ phase: null, at: 0 });
  if (state) {
    skew.current = state.serverTime - Date.now();
    if (start.current.phase !== state.phase) start.current = { phase: state.phase, at: state.serverTime };
  }
  useTick(on);
  if (!state || !state.phaseEndsAt) return 1;
  const now = Date.now() + skew.current;
  const total = Math.max(1, state.phaseEndsAt - start.current.at);
  return Math.max(0, Math.min(1, (state.phaseEndsAt - now) / total));
}

/** 0 while the war is live, 1 for "going once", 2 for "going twice": halves of the hold before the hammer. */
function useGoing(state: AuctionState | null): 0 | 1 | 2 {
  const key = state?.going && state.phase === 'reveal' && state.lot ? `${state.lot.id}:${state.ladder?.length ?? 0}` : null;
  const since = useRef<{ key: string; at: number } | null>(null);
  if (key && since.current?.key !== key) since.current = { key, at: Date.now() };
  useTick(!!key);
  if (!key || !state || !since.current) return 0;
  const end = state.phaseEndsAt - (state.serverTime - Date.now());
  const span = Math.max(1, end - since.current.at);
  return (Date.now() - since.current.at) / span < 0.5 ? 1 : 2;
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

const cents = (n: number) => (n < 1 ? `${Math.round(n * 100)}¢` : usd(n));

type Target = { x: number; y: number } | null;

type PodiumProps = {
  lot: Lot | null;
  phase: Phase;
  winnerAt: Target;
  soldPrice: number;
  price: number;
  raises: number;
  going: 0 | 1 | 2;
  fuse: number;
  paused: boolean;
  empty: boolean;
};

function Podium({ lot, phase, winnerAt, soldPrice, price, raises, going, fuse, paused, empty }: PodiumProps) {
  const [bump, animateBump] = useAnimate<HTMLDivElement>();
  const live = !!lot && phase !== 'lobby';
  const hammer = phase === 'paying' || phase === 'sold';
  const early = phase === 'intro' || phase === 'thinking';

  // The kit owns the card's size; the stage scales it down to fit between the HUD and the block.
  const [fit, setFit] = useState(1);
  useLayoutEffect(() => {
    const el = bump.current;
    if (!el) return;
    const measure = () => el.offsetHeight && setFit(Math.min(1, CARD_MAX.h / el.offsetHeight, CARD_MAX.w / el.offsetWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [lot?.id, live, bump]);
  useEffect(() => {
    if (raises > 0 && bump.current) animateBump(bump.current, { scale: [1.06, 1], rotate: [raises % 2 ? -1.5 : 1.5, 0] }, { duration: 0.24, ease: 'easeOut' });
  }, [raises, animateBump, bump]);

  let cardAnim: Record<string, number | number[]> = { x: 0, y: 0, scale: 1, opacity: 1 };
  let cardTrans: object = { type: 'spring', stiffness: 460, damping: 20 };
  if (phase === 'sold' && winnerAt) {
    cardAnim = { x: winnerAt.x - CX, y: winnerAt.y - CARD_BASE, scale: 0.12, opacity: [1, 1, 0] };
    cardTrans = { delay: 0.3, duration: 0.55, ease: [0.5, 0, 0.3, 1] };
  } else if (phase === 'sold') {
    cardAnim = { x: 0, y: -40, scale: 0.9, opacity: 0 }; // the winner left the room
    cardTrans = { delay: 0.3, duration: 0.4, ease: 'easeIn' };
  } else if (phase === 'unsold') {
    cardAnim = { x: 0, y: 70, scale: 0.2, opacity: 0 };
    cardTrans = { duration: 0.32, ease: 'easeIn' };
  }

  return (
    <div className="podium">
      <div className="card-slot" style={{ bottom: H - CARD_BASE }}>
        <AnimatePresence>
          {live && lot && (
            <motion.div
              key={lot.id}
              className="card-pop"
              initial={false}
              animate={cardAnim}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={cardTrans}
            >
              <div className="card-fit" style={{ scale: fit }}>
                <div ref={bump}>
                  <LotCard lot={lot} price={price > 0 ? price : undefined} going={going > 0} size="lg" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {live && lot && early && (
          <motion.div key={`chips-${lot.id}`} className="block-chips" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }} transition={{ delay: 0.1, duration: 0.15 }}>
            <span className="chip-lot">LOT {lot.index}</span>
            <span className="chip-open">OPENS {cents(lot.open || lot.reserve || 0.01)}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {phase === 'paying' && !paused && (
          <motion.div key="pay" className="pay-slot" initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }} transition={{ delay: 0.25, type: 'spring', stiffness: 500, damping: 22 }}>
            <span className="pill pill-sol">
              <span className="pill-tag">x402</span>SETTLING
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fuse-slot">
        <AnimatePresence>
          {phase === 'thinking' && !paused && (
            <motion.div key="fuse" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.1 } }}>
              <Fuse left={fuse} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="status-slot">
        <AnimatePresence mode="wait">
          {paused ? (
            <motion.div key="paused" className="pill pill-ink" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}>PAUSED</motion.div>
          ) : going > 0 ? (
            <motion.div
              key={`going-${going}`}
              className={`going${going === 2 ? ' is-twice' : ''}`}
              initial={{ scale: 1.8, opacity: 0, rotate: going === 1 ? -8 : 6 }}
              animate={{ scale: 1, opacity: 1, rotate: going === 1 ? -4 : 3 }}
              exit={{ opacity: 0, transition: { duration: 0.08 } }}
              transition={{ type: 'spring', stiffness: 700, damping: 18 }}
            >
              GOING {going === 1 ? 'ONCE' : 'TWICE'}
            </motion.div>

          ) : phase === 'unsold' ? (
            <motion.div key="nosale" className="pill pill-grey" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ delay: 0.1 }}>NO SALE</motion.div>
          ) : !live && empty ? (
            <motion.div key="wait" className="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>WAITING FOR AGENTS</motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {hammer && lot && (
          <motion.div
            key={`stamp-${lot.id}`}
            className="stamp"
            initial={{ scale: 2.4, rotate: -16, opacity: 0 }}
            animate={{ scale: 1, rotate: -7, opacity: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 620, damping: 20 }}
          >
            <span className="stamp-word">SOLD</span>
            <span className="stamp-price">{usd(soldPrice || 0)}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Each raise tosses a coin from the raiser up into the lot card's price. */
function Toss({ from }: { from: { x: number; y: number } }) {
  const to = { x: CX - 16, y: CARD_BASE - 70 };
  const peak = Math.min(from.y, to.y) - 90;
  return (
    <motion.div
      className="coin"
      initial={{ x: from.x - 16, y: from.y, opacity: 1 }}
      animate={{ x: [from.x - 16, (from.x - 16 + to.x) / 2, to.x], y: [from.y, peak, to.y], opacity: [1, 1, 0], scaleX: [1, -1, 1] }}
      transition={{
        duration: 0.5,
        x: { duration: 0.5, ease: 'linear' },
        y: { duration: 0.5, times: [0, 0.5, 1], ease: ['easeOut', 'easeIn'] },
        opacity: { duration: 0.5, times: [0, 0.85, 1] },
        scaleX: { duration: 0.5, ease: 'linear' },
      }}
      aria-hidden
    >
      <Coin size={32} />
    </motion.div>
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
      transition={{ delay: 0.4, type: 'spring', stiffness: 460, damping: 22 }}
    >
      <div className="reason-box">{text}</div>
      <Px rows={TAIL} colors={{ k: '#14121f', b: '#fcfcfc' }} px={4} className="reason-tail" style={{ left: half + (at.x - cx) - 12 }} />
    </motion.div>
  );
}

const WAR: Phase[] = ['reveal', 'paying', 'sold'];

export default function Stage() {
  const { state, online } = useAuction();
  const scale = useFit();
  useHostKeys(state);
  useStageSound(state);
  const phase: Phase = state?.phase ?? 'lobby';
  const fuse = usePhaseLeft(state, phase === 'thinking');
  const going = useGoing(state);
  const agents = state?.agents ?? [];
  const layout = useMemo(() => layoutCrowd(agents), [agents]);
  const lot = state?.lot ?? null;

  const winner = state?.winner ?? null;
  const winnerSlot = winner ? layout.slots.get(winner.agentId) ?? null : null;
  const winnerBid = winner ? state?.bids.find((b) => b.agentId === winner.agentId) : undefined;

  // Raises from agents who already left are dropped here, so nothing below renders a missing agent.
  const ladder = useMemo<Raise[]>(() => {
    if (!state || !WAR.includes(state.phase)) return [];
    const present = new Set(state.agents.map((a) => a.id));
    return (state.ladder ?? []).filter((r) => present.has(r.agentId));
  }, [state]);

  const view = useMemo<CrowdView>(() => {
    const v: CrowdView = { bubble: new Map<string, BubbleKind>(), amount: new Map(), manual: new Set(), hop: new Map(), mark: new Map<string, Mark>(), flash: new Map<string, Flash>(), crownId: null, spotId: null, jumpId: null };
    if (!state) return v;
    const present = new Set(state.agents.map((a) => a.id));
    if (state.phase === 'thinking') for (const a of state.agents) v.bubble.set(a.id, 'think');
    if (!WAR.includes(state.phase)) return v;
    const top = state.winner && present.has(state.winner.agentId) ? state.winner.agentId : ladder.at(-1)?.agentId ?? null;
    v.crownId = top;
    if (state.phase === 'paying') v.jumpId = top;
    for (const r of ladder) v.hop.set(r.agentId, r.at);
    const last = ladder.at(-1);
    if (top && state.phase !== 'sold') {
      v.bubble.set(top, 'bid');
      v.amount.set(top, state.winner?.agentId === top ? state.winner.amount : last?.amount ?? 0);
      if (last?.agentId === top && last.manual) v.manual.add(top);
    }
    let passIndex = 0;
    for (const b of state.bids) {
      if (!present.has(b.agentId) || b.agentId === top) continue;
      if (b.state === 'out') {
        v.mark.set(b.agentId, 'out');
        if (state.phase === 'reveal') v.bubble.set(b.agentId, 'out');
      } else if (b.state === 'pass') {
        v.mark.set(b.agentId, 'pass');
        if (state.phase === 'reveal' && b.reason) {
          v.flash.set(b.agentId, { key: `${state.lot?.id}:${b.agentId}`, text: b.reason, delay: 150 + passIndex * 220, lift: passIndex % 2 ? 58 : 0 });
          passIndex++;
        }
      }
    }
    return v;
  }, [state, ladder]);

  const tosses = phase === 'reveal' ? ladder.slice(-3) : [];
  const head = (s: Slot) => ({ x: s.x, y: s.y - (s.size * 13) / 12 - 20 });

  return (
    <MotionConfig reducedMotion="user">
      <main className="stage-viewport">
        <div className="stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
          <Sky />
          <Hud state={state} online={online} />
          <div className="corner">
            <InfoButton enterUrl={state?.enterUrl} />
            <SoundButton withMusic />
            <RestartButton />
          </div>
          <JoinSign url={state?.joinUrl ?? ''} enterUrl={state?.enterUrl} />
          <Leaders agents={agents} />
          <Podium
            lot={lot}
            phase={phase}
            winnerAt={winnerSlot ? head(winnerSlot) : null}
            soldPrice={winner?.amount ?? state?.price ?? 0}
            price={state?.price ?? 0}
            raises={ladder.length}
            going={going}
            fuse={fuse}
            paused={!!state?.paused}
            empty={agents.length === 0}
          />
          {(phase === 'reveal' || phase === 'paying') && <Ladder ladder={ladder} agents={agents} />}
          <div className="ground" style={{ top: GROUND }} aria-hidden />
          <Crowd agents={agents} layout={layout} view={view} />
          <Pipes />
          <div className="coins">
            {tosses.map((r) => {
              const s = layout.slots.get(r.agentId);
              return s ? <Toss key={`${lot?.id}-${r.at}-${r.agentId}`} from={{ x: s.x, y: s.y - (s.size * 13) / 12 - 100 }} /> : null;
            })}
          </div>
          <AnimatePresence>
            {phase === 'sold' && winnerSlot && winnerBid?.reason && <Reason key={lot?.id ?? 'r'} at={winnerSlot} text={winnerBid.reason} />}
          </AnimatePresence>
          <Ticker payments={state?.payments ?? []} agents={agents} />
        </div>
      </main>
    </MotionConfig>
  );
}
