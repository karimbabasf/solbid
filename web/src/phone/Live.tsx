import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { AgentPublic, AuctionState, Bid, ItemIcon, MeState, Phase, Rarity } from '@shared/types';
import { api } from '../lib/useAuction';
import { AgentSprite, Coin, ItemSprite, usd } from '../kit/sprites';
import { LotCard } from '../kit/LotCard';
import { InfoButton } from '../kit/Info';
import { SoundButton } from '../kit/SoundButton';
import { sfx, unlockAudio } from '../kit/sound';
import { Arrow, Bricks, Chevron, Door, Meter, QBlock, Roller, Sky } from './bits';
import { Celebrate, DeliveryCard } from './Win';

const PHASE: Record<Phase, { word: string; tone: string }> = {
  lobby: { word: 'WAITING', tone: 'dim' },
  intro: { word: 'UP NEXT', tone: 'sky' },
  thinking: { word: 'THINKING', tone: 'gold' },
  reveal: { word: 'BIDDING', tone: 'paper' },
  paying: { word: 'PAYING', tone: 'sol' },
  sold: { word: 'SOLD', tone: 'green' },
  unsold: { word: 'NO SALE', tone: 'dim' },
};
const WAR: Phase[] = ['reveal', 'paying', 'sold'];
const RISK = { low: 'LOW', mid: 'MID', high: 'HIGH' } as const;
const DRAWER = 'aah.manual';

type Tone = 'gold' | 'bad' | 'dim' | 'sky' | 'think' | 'green';
type Status = { id: string; word: string; amount?: number; tone: Tone; sub?: string };
type Toast = { id: number; text: string } | null;

type Props = {
  agentId: string;
  agentKey: string | null;
  state: AuctionState | null;
  me: MeState | null;
  online: boolean;
  rise: boolean;
  onLeft: () => void;
};

const nameOf = (state: AuctionState | null, id?: string) => (id ? state?.agents.find((a) => a.id === id)?.name : undefined);

function statusOf(agentId: string, agent: AgentPublic | null, state: AuctionState | null, bid: Bid | undefined, won: boolean): Status {
  if (!state) return { id: 'connecting', word: 'CONNECTING', tone: 'dim' };
  const lot = state.lot;
  const phase = state.phase;
  if (agent && !agent.funded) return { id: 'funding', word: 'FUNDING', tone: 'think', sub: 'Filling your wallet on Solana' };
  if (!lot || phase === 'lobby') return { id: 'waiting', word: 'WAITING', tone: 'dim', sub: 'Next lot soon' };
  if (won && state.winner) return { id: 'won', word: 'YOU WON', amount: state.winner.amount, tone: 'gold', sub: phase === 'paying' ? 'Paying on Solana with x402' : 'Paid. It is in your bag.' };
  if (phase === 'intro') return { id: 'looking', word: 'LOOKING', tone: 'sky', sub: agent?.goalText ? `Wants: ${agent.goalText}` : undefined };
  if (phase === 'thinking') return { id: 'thinking', word: 'THINKING', tone: 'think', sub: 'Weighing it against your goal' };
  if (!bid) return { id: 'watching', word: 'WATCHING', tone: 'dim', sub: 'Joined mid lot. Next one.' };
  if (bid.state === 'pass') return { id: 'passed', word: 'PASSED', tone: 'dim', sub: bid.reason };
  const top = state.ladder.at(-1);
  if (phase === 'reveal' && bid.state === 'in' && top?.agentId === agentId)
    return { id: 'lead', word: 'YOU LEAD', amount: state.price, tone: 'gold', sub: state.going ? 'Going once, going twice' : 'Nobody has topped you' };
  if (bid.state === 'out') return { id: 'out', word: 'OUT', tone: 'dim', sub: bid.reason };
  if (phase === 'unsold') return { id: 'nosale', word: 'NO SALE', tone: 'dim' };
  if (bid.amount != null) {
    const who = nameOf(state, top?.agentId ?? state.winner?.agentId);
    const at = state.winner?.amount ?? state.price;
    return { id: 'outbid', word: 'OUTBID', tone: 'bad', sub: who ? `${who} took it to ${usd(at)}` : `Top bid ${usd(at)}` };
  }
  return { id: 'ready', word: 'READY', tone: 'green', sub: 'In the war, waiting for its moment' };
}

export default function Live({ agentId, agentKey, state, me, online, rise, onLeft }: Props) {
  const agent = me?.agent ?? state?.agents.find((a) => a.id === agentId) ?? null;
  const lot = state?.lot ?? null;
  const phase: Phase = state?.phase ?? 'lobby';
  const won = !!lot && state?.winner?.agentId === agentId;
  const bid = state?.bids.find((b) => b.agentId === agentId);
  const deliveries = me?.deliveries ?? [];
  const status = statusOf(agentId, agent, state, bid, won);

  const [party, setParty] = useState<{ lotId: string; icon: ItemIcon; rarity: Rarity; amount: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  const say = useCallback((text: string) => setToast({ id: Date.now(), text }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // Lots already delivered before this page opened never celebrate again.
  const seen = useRef<Set<string> | null>(null);
  if (me && !seen.current) seen.current = new Set(me.deliveries.map((d) => d.lotId));
  useEffect(() => {
    if (!won || !lot || !state?.winner || !seen.current || seen.current.has(lot.id)) return;
    seen.current.add(lot.id);
    setOpen(null);
    setParty({ lotId: lot.id, icon: lot.icon, rarity: lot.rarity, amount: state.winner.amount });
    sfx('win');
    try {
      navigator.vibrate?.([60, 40, 120]);
    } catch {}
  }, [won, lot, state?.winner]);

  // Sounds come from the ladder, not single events: one poll can carry several raises.
  const heard = useRef<{ lotId?: string; n: number }>({ n: 0 });
  useEffect(() => {
    if (!state?.lot) return;
    const ladder = state.ladder;
    if (heard.current.lotId !== state.lot.id || ladder.length < heard.current.n) heard.current = { lotId: state.lot.id, n: ladder.length };
    const mine = ladder.slice(heard.current.n).filter((r) => r.agentId === agentId);
    heard.current.n = ladder.length;
    if (mine.length) sfx('raise', { pitch: Math.min(1, mine[mine.length - 1].amount / 3) });
  }, [state?.lot, state?.ladder, agentId]);

  const was = useRef(status.id);
  useEffect(() => {
    if (status.id === 'outbid' && was.current !== 'outbid' && was.current !== 'connecting') sfx('lose');
    was.current = status.id;
  }, [status.id]);

  const paid = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!state) return;
    const mine = state.payments.filter((p) => p.kind === 'x402' && p.agentId === agentId && (p.status === 'confirmed' || p.status === 'simulated'));
    if (!paid.current) {
      paid.current = new Set(mine.map((p) => p.id));
      return;
    }
    const fresh = mine.filter((p) => !paid.current!.has(p.id));
    fresh.forEach((p) => paid.current!.add(p.id));
    if (fresh.length) sfx('coin');
  }, [state, agentId]);

  const leave = async () => {
    unlockAudio();
    sfx('tap');
    if (!agentKey) return onLeft();
    setLeaving(true);
    const r = await api<{ ok: boolean }>(`/api/agent/${encodeURIComponent(agentId)}/leave`, { key: agentKey });
    setLeaving(false);
    if (!r) {
      setAsking(false);
      return say('No signal. Try leaving again.');
    }
    onLeft();
  };

  const enter = (i: number) => (rise ? { initial: { y: 24, opacity: 0 }, animate: { y: 0, opacity: 1 }, transition: { delay: 0.5 + i * 0.07, type: 'spring' as const, stiffness: 320, damping: 26 } } : {});

  return (
    <div className="ph-screen lv">
      <Sky>
        <TopBar
          agent={agent}
          state={state}
          onLeave={() => {
            unlockAudio();
            sfx('tap');
            setAsking(true);
          }}
        />
      </Sky>

      <AnimatePresence>
        {!online && (
          <motion.p className="ph-offline" role="status" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <i aria-hidden /> RECONNECTING
          </motion.p>
        )}
      </AnimatePresence>

      <main className="ph-main lv-main">
        <motion.div {...enter(0)}>
          <StatusBanner s={status} />
          {agentKey && <Manual agentId={agentId} agentKey={agentKey} agent={agent} state={state} bid={bid} lead={status.id === 'lead'} say={say} />}
        </motion.div>
        <motion.div {...enter(1)}>
          {state && lot ? (
            <section className="lv-lot" aria-label="Lot on sale">
              <LotCard lot={lot} price={WAR.includes(phase) && state.price > 0 ? state.price : undefined} going={state.going} size="md" />
              <LotFoot state={state} youId={agentId} />
            </section>
          ) : (
            <section className="ph-panel is-paper lv-empty" aria-live="polite">
              <QBlock size={48} className="ph-bump" />
              <p>{state ? 'Next lot soon. Watch the big screen.' : 'Connecting to the room'}</p>
            </section>
          )}
        </motion.div>
        <motion.div {...enter(2)}>
          <AgentPanel agent={agent} state={state} bid={bid} phase={phase} won={won} showReason={status.id !== 'passed' && status.id !== 'out'} />
        </motion.div>
      </main>

      <footer className="lv-foot">
        <motion.section className="lv-bag" aria-label="Bag" {...enter(3)}>
          <h2 className="ph-label">
            BAG <span className="lv-bag-n">{deliveries.length}</span>
          </h2>
          {deliveries.length === 0 ? (
            <p className="lv-bag-empty">Wins land here.</p>
          ) : (
            <ul className="lv-bag-row">
              <AnimatePresence initial={false}>
                {deliveries.map((d) => (
                  <motion.li key={d.lotId} layout initial={{ scale: 0, y: -24 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 520, damping: 20 }}>
                    <button type="button" className="lv-bag-item" onClick={() => setOpen(d.lotId)} aria-label={`Open ${d.name}`}>
                      <ItemSprite icon={d.icon} size={36} />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </motion.section>
        <Bricks />
      </footer>

      <AnimatePresence>
        {toast && (
          <motion.p key={toast.id} className="ph-toast" role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ type: 'spring', stiffness: 520, damping: 34 }}>
            {toast.text}
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {party && (
          <Celebrate
            key={party.lotId}
            icon={party.icon}
            rarity={party.rarity}
            amount={party.amount}
            onDone={() => {
              setOpen(party.lotId);
              setParty(null);
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>{open && !party && <DeliveryCard key={open} lotId={open} me={me} state={state} onClose={() => setOpen(null)} />}</AnimatePresence>
      <AnimatePresence>{asking && <LeaveSheet busy={leaving} keyless={!agentKey} onStay={() => setAsking(false)} onLeave={leave} />}</AnimatePresence>
    </div>
  );
}

function TopBar({ agent, state, onLeave }: { agent: AgentPublic | null; state: AuctionState | null; onLeave: () => void }) {
  const fundUrl = useRef<string | null>(null);
  const fund = agent && state?.payments.find((p) => p.kind === 'fund' && p.agentId === agent.id && p.explorer);
  if (fund?.explorer) fundUrl.current = fund.explorer;
  const net = state?.network ?? 'devnet';
  const href = fundUrl.current ?? (agent ? `https://explorer.solana.com/address/${agent.wallet}${net === 'devnet' ? '?cluster=devnet' : ''}` : undefined);
  const bal = agent ? agent.balance.toFixed(2) : '0.00';

  return (
    <div className="lv-top">
      <div className="lv-me">
        <span className="lv-me-face">{agent && <AgentSprite color={agent.color} sprite={agent.sprite} size={32} />}</span>
        <span className="lv-me-text">
          <span className="lv-name-row">
            <b className="lv-name">{agent?.name ?? '....'}</b>
            {agent?.via === 'pay.sh' && <span className="lv-via">PAY.SH</span>}
          </span>
          {!agent || !agent.funded ? (
            <span className="lv-fund">FUNDING</span>
          ) : (
            <a className="lv-bal" href={href} target="_blank" rel="noreferrer" aria-label={`Balance ${usd(agent.balance)} on ${net}, open in Solana Explorer`}>
              <span key={bal} className="lv-bal-coin">
                <Coin size={14} />
              </span>
              <Roller value={bal} className="lv-bal-n" />
              <Arrow size={8} />
            </a>
          )}
        </span>
      </div>
      <span className="ph-tools">
        <InfoButton enterUrl={state?.enterUrl} />
        <SoundButton />
        <button type="button" className="kit-block ph-tool" onClick={onLeave} aria-label="Leave the room">
          <Door size={18} />
        </button>
      </span>
    </div>
  );
}

function StatusBanner({ s }: { s: Status }) {
  return (
    <section className={`lv-status is-${s.tone}`} aria-live="polite" aria-atomic="true">
      <motion.p
        key={`${s.id}-${s.amount ?? ''}`}
        className="lv-status-word"
        initial={{ scale: 0.82, y: -6 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 800, damping: 26 }}
      >
        <span>{s.word}</span>
        {s.amount != null && <span className="lv-status-amt">{usd(s.amount)}</span>}
        {s.tone === 'think' && (
          <span className="ph-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        )}
      </motion.p>
      <p className="lv-status-sub">{s.sub ?? ''}</p>
    </section>
  );
}

function readDrawer() {
  try {
    return sessionStorage.getItem(DRAWER) === '1';
  } catch {
    return false;
  }
}

function Manual({ agentId, agentKey, agent, state, bid, lead, say }: { agentId: string; agentKey: string; agent: AgentPublic | null; state: AuctionState | null; bid?: Bid; lead: boolean; say: (t: string) => void }) {
  const [open, setOpen] = useState(readDrawer);
  const [busy, setBusy] = useState<'bid' | 'pass' | null>(null);
  const [said, setSaid] = useState<{ lotId: string; action: 'bid' | 'pass' } | null>(null);
  const lot = state?.lot ?? null;
  const phase = state?.phase;
  const live = !!lot && (phase === 'intro' || phase === 'thinking' || phase === 'reveal');
  const war = phase === 'reveal';
  const next = state?.next ?? 0;
  const broke = (agent?.balance ?? 0) < next;
  const mine = said && lot && said.lotId === lot.id ? said.action : null;
  const done = bid?.state === 'pass' || bid?.state === 'out' || (!war && mine === 'pass');
  const canBid = live && !lead && !broke && !busy && !(!war && mine === 'bid');
  const canPass = live && !done && !busy;

  const toggle = () => {
    unlockAudio();
    sfx('tap');
    setOpen((o) => {
      try {
        sessionStorage.setItem(DRAWER, o ? '0' : '1');
      } catch {}
      return !o;
    });
  };

  const act = async (action: 'bid' | 'pass') => {
    if (!lot) return;
    unlockAudio();
    sfx('tap');
    setBusy(action);
    const r = await api<{ ok: boolean; error?: string }>(`/api/agent/${encodeURIComponent(agentId)}/act`, { key: agentKey, action });
    setBusy(null);
    if (!r) return say('No signal. Tap again.');
    if (!r.ok) return say(r.error || 'The house said no. Try the next one.');
    setSaid({ lotId: lot.id, action });
  };

  const bidWord = !war ? (mine === 'bid' ? 'WANTED' : 'WANT IT') : `BID ${usd(next)}`;
  const passWord = !war ? (mine === 'pass' ? 'SKIPPED' : 'SKIP') : bid?.state === 'out' ? 'OUT' : bid?.state === 'pass' ? 'PASSED' : 'PASS';

  return (
    <div className="lv-manual">
      <button type="button" className={`lv-pill${open ? ' is-open' : ''}`} onClick={toggle} aria-expanded={open} aria-controls="lv-drawer">
        MANUAL
        <Chevron size={12} className="lv-pill-chev" />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="lv-drawer"
            className="lv-drawer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
          >
            <div className="lv-drawer-in">
              <button type="button" className="ph-block lv-act is-bid" disabled={!canBid} onClick={() => act('bid')} aria-busy={busy === 'bid'}>
                <span className="ph-block-rivets" aria-hidden />
                {busy === 'bid' ? (
                  <span className="ph-dots" aria-label="Sending">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  bidWord
                )}
              </button>
              <button type="button" className="lv-act is-pass" disabled={!canPass} onClick={() => act('pass')} aria-busy={busy === 'pass'}>
                {busy === 'pass' ? (
                  <span className="ph-dots" aria-label="Sending">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  passWord
                )}
              </button>
            </div>
            {live && broke && !lead && <p className="lv-drawer-note">Not enough USDC for {usd(next)}.</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LotFoot({ state, youId }: { state: AuctionState; youId: string }) {
  const phase = state.phase;
  const p = state.going && phase === 'reveal' ? { word: 'GOING', tone: 'gold' } : PHASE[phase];
  const winner = state.winner ? state.agents.find((a) => a.id === state.winner!.agentId) : null;
  const raises = state.ladder.filter((r) => state.agents.some((a) => a.id === r.agentId)).slice(-4).reverse();

  return (
    <div className="lv-lot-foot">
      <div className="lv-lot-row">
        <span className={`ph-phase t-${p.tone}`}>
          <motion.span key={p.word} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.18 }}>
            {p.word}
          </motion.span>
        </span>
        {phase === 'sold' && winner && state.winner ? (
          <span className="lv-sold">
            <AgentSprite color={winner.color} sprite={winner.sprite} size={20} />
            <b>{winner.id === youId ? 'YOU' : winner.name}</b>
            <span>{usd(state.winner.amount)}</span>
          </span>
        ) : (
          <Timer state={state} />
        )}
      </div>
      {WAR.includes(phase) && raises.length > 0 && (
        <ol className="lv-ladder" aria-label="Latest raises">
          <AnimatePresence initial={false}>
            {raises.map((r, i) => {
              const a = state.agents.find((x) => x.id === r.agentId)!;
              return (
                <motion.li
                  key={`${r.agentId}-${r.at}-${r.amount}`}
                  layout
                  className={`lv-rung${r.agentId === youId ? ' is-me' : ''}${i === 0 ? ' is-top' : ''}`}
                  initial={{ x: -24, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 32 }}
                >
                  <AgentSprite color={a.color} sprite={a.sprite} size={18} />
                  <span>{usd(r.amount)}</span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}
    </div>
  );
}

function Timer({ state }: { state: AuctionState }) {
  if (!state.phaseEndsAt || state.paused) return <span className="lv-timer" />;
  const left = Math.max(0, state.phaseEndsAt - state.serverTime);
  return (
    <span className="lv-timer" aria-hidden>
      <Drain key={`${state.phase}-${state.phaseEndsAt}`} ms={left} />
    </span>
  );
}

function Drain({ ms }: { ms: number }) {
  const [d] = useState(ms);
  return <i style={{ animationDuration: `${d}ms` }} />;
}

function AgentPanel({ agent, state, bid, phase, won, showReason }: { agent: AgentPublic | null; state: AuctionState | null; bid?: Bid; phase: Phase; won: boolean; showReason: boolean }) {
  const hasLot = !!state?.lot;
  const thinking = hasLot && phase === 'thinking';
  const shown = hasLot && (WAR.includes(phase) || phase === 'unsold');
  const line = shown ? (bid?.reason ?? '') : agent?.goalText ? `Wants: ${agent.goalText}` : '';

  return (
    <section className={`ph-panel lv-agent${won ? ' is-won' : ''}`} aria-label="Your agent">
      <div className="lv-agent-row">
        <span className="lv-agent-hero">
          <motion.span key={won ? 'won' : 'idle'} className="lv-agent-body" initial={false} animate={won ? { y: [0, -18, 0, -8, 0] } : undefined} transition={{ duration: 0.6 }}>
            {agent && <AgentSprite color={agent.color} sprite={agent.sprite} size={44} className="ph-idle" />}
          </motion.span>
        </span>
        <dl className="lv-stats">
          <div className="lv-stat">
            <dt className="ph-label">NEED</dt>
            <dd>
              <Meter value={shown ? (bid?.need ?? 0) : null} scan={thinking} />
              <span className="lv-need-n">{shown && bid ? bid.need : thinking ? '..' : ''}</span>
            </dd>
          </div>
          <div className="lv-stat">
            <dt className="ph-label">RISK</dt>
            <dd>
              {thinking ? (
                <span className="lv-risk is-scan" aria-label="Weighing risk">
                  <span className="lv-reel">
                    <b className="r-low">LOW</b>
                    <b className="r-mid">MID</b>
                    <b className="r-high">HIGH</b>
                    <b className="r-low">LOW</b>
                  </span>
                </span>
              ) : shown && bid && bid.state !== 'pass' ? (
                <motion.span key={bid.risk} className={`lv-risk r-${bid.risk}`} initial={{ scale: 1.4 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 600, damping: 16 }}>
                  {RISK[bid.risk]}
                </motion.span>
              ) : (
                <span className="lv-risk r-none">{shown ? 'NONE' : '...'}</span>
              )}
            </dd>
          </div>
        </dl>
      </div>
      {showReason && line && <p className="lv-reason">{line}</p>}
    </section>
  );
}

function LeaveSheet({ busy, keyless, onStay, onLeave }: { busy: boolean; keyless: boolean; onStay: () => void; onLeave: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onStay();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onStay]);

  return (
    <motion.div className="ph-sheet" onClick={onStay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
      <motion.section
        className="ph-panel lv-leave"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lv-leave-t"
        onClick={(e) => e.stopPropagation()}
        initial={{ y: '110%' }}
        animate={{ y: 0 }}
        exit={{ y: '110%' }}
        transition={{ type: 'spring', stiffness: 460, damping: 38 }}
      >
        <h2 id="lv-leave-t" className="lv-leave-t">
          <Door size={22} /> LEAVE?
        </h2>
        <p className="lv-leave-p">{keyless ? 'This phone forgets the agent. It stays in the room.' : 'Your agent stops bidding and walks out of the room.'}</p>
        <div className="lv-leave-row">
          <button type="button" className="lv-act is-pass" onClick={onStay} autoFocus>
            STAY
          </button>
          <button type="button" className="lv-act is-leave" onClick={onLeave} disabled={busy} aria-busy={busy}>
            {busy ? (
              <span className="ph-dots" aria-label="Leaving">
                <i />
                <i />
                <i />
              </span>
            ) : (
              'LEAVE'
            )}
          </button>
        </div>
      </motion.section>
    </motion.div>
  );
}
