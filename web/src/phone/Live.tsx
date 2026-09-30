import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { AgentPublic, AuctionState, Bid, ItemIcon, MeState, Phase } from '@shared/types';
import { AgentSprite, Coin, ItemSprite, usd } from '../kit/sprites';
import { Arrow, Bricks, Meter, PipeSpot, QBlock, Roller, Sky } from './bits';
import { Celebrate, DeliveryCard } from './Win';

const PHASE: Record<Phase, { word: string; tone: string }> = {
  lobby: { word: 'WAITING', tone: 'dim' },
  intro: { word: 'UP NEXT', tone: 'sky' },
  thinking: { word: 'THINKING', tone: 'gold' },
  reveal: { word: 'BIDS IN', tone: 'paper' },
  paying: { word: 'PAYING', tone: 'sol' },
  sold: { word: 'SOLD', tone: 'green' },
  unsold: { word: 'NO SALE', tone: 'dim' },
};
const SHOWN: Phase[] = ['reveal', 'paying', 'sold', 'unsold'];
const RISK = { low: 'LOW', mid: 'MID', high: 'HIGH' } as const;

type Props = { agentId: string; state: AuctionState | null; me: MeState | null; online: boolean; rise: boolean };

export default function Live({ agentId, state, me, online, rise }: Props) {
  const agent = me?.agent ?? state?.agents.find((a) => a.id === agentId) ?? null;
  const lot = state?.lot ?? null;
  const phase: Phase = state?.phase ?? 'lobby';
  const won = !!lot && state?.winner?.agentId === agentId;
  const deliveries = me?.deliveries ?? [];

  const [party, setParty] = useState<{ lotId: string; icon: ItemIcon; amount: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  // Lots already delivered before this page opened never celebrate again.
  const seen = useRef<Set<string> | null>(null);
  if (me && !seen.current) seen.current = new Set(me.deliveries.map((d) => d.lotId));
  useEffect(() => {
    if (!won || !lot || !state?.winner || !seen.current || seen.current.has(lot.id)) return;
    seen.current.add(lot.id);
    setOpen(null);
    setParty({ lotId: lot.id, icon: lot.icon, amount: state.winner.amount });
  }, [won, lot, state?.winner]);

  const enter = (i: number) => (rise ? { initial: { y: 24 }, animate: { y: 0 }, transition: { delay: 0.5 + i * 0.08, type: 'spring' as const, stiffness: 320, damping: 26 } } : {});

  return (
    <div className="ph-screen lv">
      <Sky>
        <TopBar agent={agent} state={state} />
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
          <LotCard state={state} youId={agentId} />
        </motion.div>
        <motion.div {...enter(1)}>
          <AgentPanel agent={agent} state={state} bid={state?.bids.find((b) => b.agentId === agentId)} phase={phase} won={won} rise={rise} />
        </motion.div>
      </main>

      <footer className="lv-foot">
        <motion.section className="lv-bag" aria-label="Bag" {...enter(2)}>
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
        {party && (
          <Celebrate
            key={party.lotId}
            icon={party.icon}
            amount={party.amount}
            onDone={() => {
              setOpen(party.lotId);
              setParty(null);
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>{open && !party && <DeliveryCard key={open} lotId={open} me={me} state={state} onClose={() => setOpen(null)} />}</AnimatePresence>
    </div>
  );
}

function TopBar({ agent, state }: { agent: AgentPublic | null; state: AuctionState | null }) {
  const fundUrl = useRef<string | null>(null);
  const fund = agent && state?.payments.find((p) => p.kind === 'fund' && p.agentId === agent.id && p.explorer);
  if (fund?.explorer) fundUrl.current = fund.explorer;
  const net = state?.network ?? 'devnet';
  const href = fundUrl.current ?? (agent ? `https://explorer.solana.com/address/${agent.wallet}${net === 'devnet' ? '?cluster=devnet' : ''}` : undefined);
  const bal = agent ? agent.balance.toFixed(2) : '0.00';

  return (
    <div className="lv-top">
      <div className="lv-me">
        <span className="lv-me-face">{agent && <AgentSprite color={agent.color} sprite={agent.sprite} size={36} />}</span>
        <span className="lv-me-text">
          <b className="lv-name">{agent?.name ?? '....'}</b>
          <span className="lv-tags">
            {!agent || !agent.funded ? (
              <span className="lv-fund">FUNDING</span>
            ) : (
              <a className="lv-net" href={href} target="_blank" rel="noreferrer">
                {net.toUpperCase()} <Arrow size={8} />
              </a>
            )}
            {agent?.via === 'pay.sh' && <span className="lv-via">PAY.SH</span>}
          </span>
        </span>
      </div>
      <div className="lv-bal" aria-label={`Balance ${usd(agent?.balance ?? 0)}`}>
        <span key={bal} className="lv-bal-coin">
          <Coin size={24} />
        </span>
        <Roller value={bal} className="lv-bal-n" />
      </div>
    </div>
  );
}

function LotCard({ state, youId }: { state: AuctionState | null; youId: string }) {
  const lot = state?.lot ?? null;
  const phase = state?.phase ?? 'lobby';
  const p = PHASE[phase];
  const winner = state?.winner ? state.agents.find((a) => a.id === state.winner!.agentId) : null;

  if (!state || !lot)
    return (
      <section className="ph-panel is-paper lv-lot is-empty" aria-live="polite">
        <QBlock size={56} className="ph-bump" />
        <div>
          <p className="lv-lot-name">{state ? 'Next item soon' : 'Connecting'}</p>
          <p className="lv-lot-sub">{state ? 'Watch the big screen' : 'One sec'}</p>
        </div>
      </section>
    );

  return (
    <section className="ph-panel is-paper lv-lot" aria-live="polite">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={lot.id}
          className="lv-lot-body"
          initial={{ x: 80, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        >
          <span className="lv-lot-art">
            <ItemSprite icon={lot.icon} size={72} className="ph-idle" />
          </span>
          <div className="lv-lot-text">
            <p className="lv-lot-count">
              LOT {lot.index}/{lot.total}
            </p>
            <h2 className="lv-lot-name">{lot.name}</h2>
            <p className="lv-lot-sub">
              MIN <b>{usd(lot.reserve)}</b>
            </p>
          </div>
        </motion.div>
      </AnimatePresence>
      <div className="lv-lot-foot">
        <span className={`ph-phase t-${p.tone}`}>
          <motion.span key={phase} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.18 }}>
            {p.word}
          </motion.span>
        </span>
        {phase === 'sold' && winner && state.winner ? (
          <span className="lv-sold">
            <AgentSprite color={winner.color} sprite={winner.sprite} size={24} />
            <b>{winner.id === youId ? 'YOU' : winner.name}</b>
            <span>{usd(state.winner.amount)}</span>
          </span>
        ) : (
          <Timer state={state} />
        )}
      </div>
    </section>
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

function AgentPanel({ agent, state, bid, phase, won, rise }: { agent: AgentPublic | null; state: AuctionState | null; bid?: Bid; phase: Phase; won: boolean; rise: boolean }) {
  const hasLot = !!state?.lot;
  const thinking = hasLot && phase === 'thinking';
  const shown = hasLot && SHOWN.includes(phase);
  const top = shown && bid?.amount != null && state!.bids.every((b) => b.amount == null || b.amount <= bid.amount!);
  const lost = shown && !won && bid?.amount != null && (phase === 'sold' || phase === 'paying');

  let status = 'READY';
  if (!agent?.funded) status = 'FUNDING';
  else if (thinking) status = 'THINKING';
  else if (won) status = 'WON';
  else if (shown && !bid) status = 'MISSED';
  else if (shown) status = bid?.amount == null ? 'PASSED' : lost ? 'OUTBID' : 'BID';
  else if (phase === 'intro' && hasLot) status = 'LOOKING';

  const line = shown ? (bid ? bid.reason : 'Joined mid lot. Next one.') : agent?.goalText ? `Wants: ${agent.goalText}` : '';

  return (
    <section className={`ph-panel lv-agent${won ? ' is-won' : ''}`} aria-label="Your agent" aria-live="polite">
      <div className="lv-agent-top">
        <h2 className="ph-label">YOUR AGENT</h2>
        <span className={`lv-status s-${status.toLowerCase()}`}>{status}</span>
      </div>
      <div className="lv-agent-body">
        <div className="lv-agent-hero">
          <PipeSpot pipeW={64} pipeH={28} height={112}>
            <motion.span
              className="lv-agent-rider"
              initial={rise ? { y: 90 } : false}
              animate={{ y: 0 }}
              transition={{ delay: 0.62, type: 'spring', stiffness: 240, damping: 16 }}
            >
              <motion.span key={won ? 'won' : 'idle'} initial={false} animate={won ? { y: [0, -24, 0, -12, 0] } : undefined} transition={{ duration: 0.7 }}>
                {agent && <AgentSprite color={agent.color} sprite={agent.sprite} size={60} className="ph-idle" />}
              </motion.span>
            </motion.span>
          </PipeSpot>
          <AnimatePresence>
            {thinking && (
              <motion.span className="lv-think" initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.4 }} transition={{ type: 'spring', stiffness: 520, damping: 22 }} aria-hidden>
                <span className="ph-dots">
                  <i />
                  <i />
                  <i />
                </span>
              </motion.span>
            )}
          </AnimatePresence>
        </div>

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
              ) : shown && bid && bid.amount != null ? (
                <motion.span key={bid.risk} className={`lv-risk r-${bid.risk}`} initial={{ scale: 1.4 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 600, damping: 16 }}>
                  {RISK[bid.risk]}
                </motion.span>
              ) : (
                <span className="lv-risk r-none">{shown ? 'NONE' : '...'}</span>
              )}
            </dd>
          </div>
          <div className="lv-stat is-bid">
            <dt className="ph-label">BID</dt>
            <dd>
              {thinking ? (
                <span className="lv-chip is-scan" aria-label="Deciding">
                  $0.
                  <span className="lv-slot">
                    <span>0123456789</span>
                  </span>
                  <span className="lv-slot s2">
                    <span>0123456789</span>
                  </span>
                </span>
              ) : shown && bid ? (
                <motion.span
                  key={`${state?.lot?.id}-${bid.amount}`}
                  className={`lv-chip${bid.amount == null ? ' is-pass' : ''}${lost ? ' is-lost' : ''}`}
                  initial={{ y: -12, scale: 0.8 }}
                  animate={{ y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 600, damping: 18 }}
                >
                  {bid.amount == null ? 'PASS' : (
                    <>
                      <Coin size={16} /> {usd(bid.amount)}
                    </>
                  )}
                </motion.span>
              ) : (
                <span className="lv-chip is-idle">{shown ? 'NONE' : '...'}</span>
              )}
              {top && !won && phase === 'reveal' && <span className="lv-top-tag">TOP</span>}
            </dd>
          </div>
        </dl>
      </div>
      <p className="lv-reason">{line}</p>
    </section>
  );
}
