import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import type { AgentPublic, AuctionState, Payment, Raise } from '@shared/types';
import { AgentSprite, Coin, shortSig, usd } from '../kit/sprites';
import { Check, Cross, Crown, Spinner } from './art';

const pad = (n: number) => String(Math.max(0, Math.floor(n || 0))).padStart(2, '0');
const safe = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

function HudCell({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <div className="hud-cell">
      <span className="hud-label">{label}</span>
      <span className="hud-value">
        {children}
        <motion.span key={value} initial={{ y: -10, opacity: 0.4 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 600, damping: 18 }}>
          {value}
        </motion.span>
      </span>
    </div>
  );
}

export function Hud({ state, online }: { state: AuctionState | null; online: boolean }) {
  const lot = state?.lot;
  return (
    <header className="hud">
      <HudCell label="AGENTS" value={pad(state?.agents.length ?? 0)} />
      <HudCell label="LOT" value={lot ? String(lot.index).padStart(2, '0') : '--'} />
      <HudCell label="SOLD" value={pad(state?.lotsSold ?? 0)} />
      <HudCell label="SOLANA" value={(state?.network ?? 'devnet').toUpperCase()}>
        <i className={`net-dot${online && state ? '' : ' is-off'}`} />
      </HudCell>
    </header>
  );
}

/** Splits a URL for the one-line agent strip: host shortened in the middle, path kept whole. */
function enterParts(url: string): [string, string] {
  const bare = url.replace(/^https?:\/\//, '');
  const cut = bare.indexOf('/');
  const host = cut < 0 ? bare : bare.slice(0, cut);
  const path = cut < 0 ? '' : bare.slice(cut);
  const max = 19;
  return [host.length > max ? `${host.slice(0, 9)}...${host.slice(-7)}` : host, path];
}

export function JoinSign({ url, enterUrl }: { url: string; enterUrl?: string }) {
  const [host, path] = enterUrl ? enterParts(enterUrl) : ['', ''];
  return (
    <div className="sign">
      <div className="panel sign-panel">
        <div className="qr">{url ? <QRCodeSVG value={url} size={296} bgColor="#fcfcfc" fgColor="#14121f" level="M" /> : <div className="qr-empty" />}</div>
        <div className="sign-title">SCAN TO PLAY</div>
        <div className="sign-url">{url.replace(/^https?:\/\//, '')}</div>
      </div>
      {enterUrl && (
        <div className="enter" title={enterUrl}>
          <span className="enter-label">AGENTS</span>
          <span className="enter-cmd">
            pay curl -X POST <span className="enter-host">{host}</span>
            {path}
          </span>
        </div>
      )}
      <div className="sign-post" />
    </div>
  );
}

/** Wins first; on a tie, whoever spent less ranks higher. */
export function Leaders({ agents }: { agents: AgentPublic[] }) {
  const top = agents
    .filter((a) => safe(a.wins) > 0)
    .sort((a, b) => safe(b.wins) - safe(a.wins) || safe(a.spent) - safe(b.spent))
    .slice(0, 5);
  return (
    <div className="panel leaders">
      <div className="leaders-head">
        <span>TOP 5</span>
        <span>WINS</span>
        <span>SPENT</span>
      </div>
      {top.length === 0 && <div className="leaders-empty">NO WINNERS YET</div>}
      {top.map((a, i) => (
        <motion.div layout key={a.id} className={`leader${i === 0 ? ' is-first' : ''}`} transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
          <span className="leader-face">
            {i === 0 && (
              <span className="leader-crown">
                <Crown px={3} />
              </span>
            )}
            <AgentSprite color={safe(a.color)} sprite={safe(a.sprite)} size={i === 0 ? 52 : 36} />
          </span>
          <span className="leader-name">
            <span className="leader-nm">{a.name}</span>
            {a.house && <span className="leader-bot">BOT</span>}
          </span>
          <span className="leader-wins">{safe(a.wins)}</span>
          <span className="leader-spent">{usd(safe(a.spent))}</span>
        </motion.div>
      ))}
    </div>
  );
}

/** The last few raises of the war, newest on top so the price reads as climbing. */
export function Ladder({ ladder, agents }: { ladder: Raise[]; agents: AgentPublic[] }) {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const rows = ladder
    .map((r, i) => ({ r, i, a: byId.get(r.agentId) }))
    .filter((x): x is { r: Raise; i: number; a: AgentPublic } => !!x.a)
    .slice(-5)
    .reverse();
  return (
    <div className="ladder" aria-live="polite">
      <AnimatePresence initial={false} mode="popLayout">
        {rows.map(({ r, i, a }, n) => (
          <motion.div
            key={`${r.at}-${i}`}
            layout
            className={`rung${n === 0 ? ' is-high' : ''}`}
            initial={{ y: -24, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1 - n * 0.14, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', stiffness: 700, damping: 30 }}
          >
            <AgentSprite color={safe(a.color)} sprite={safe(a.sprite)} size={28} />
            <span className="rung-name">{a.name}</span>
            {r.manual && <span className="human">HUMAN</span>}
            <span className="rung-amt">{usd(safe(r.amount))}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function Status({ s }: { s: Payment['status'] }) {
  if (s === 'pending') return <Spinner />;
  if (s === 'confirmed') return <Check />;
  if (s === 'failed') return <Cross />;
  return <span className="chip-sim">SIM</span>;
}

const KIND: Record<string, string> = { x402: 'x402', fund: 'FUND', seat: 'PAY.SH' };

function Chip({ p, agent }: { p: Payment; agent?: AgentPublic }) {
  const body = (
    <>
      {agent ? <AgentSprite color={safe(agent.color)} sprite={safe(agent.sprite)} size={36} /> : <Coin size={32} />}
      <span className="chip-amt">
        {p.kind === 'fund' ? '+' : ''}
        {usd(safe(p.amount))}
      </span>
      <span className={`chip-kind k-${p.kind}`}>{KIND[p.kind] ?? 'TX'}</span>
      <span className="chip-sig">{shortSig(p.sig) || (p.kind === 'seat' ? 'MPP' : p.status === 'pending' ? 'SIGNING' : '--------')}</span>
      <Status s={p.status} />
    </>
  );
  const cls = `chip panel s-${p.status}`;
  return p.explorer ? (
    <a className={cls} href={p.explorer} target="_blank" rel="noreferrer">
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Ticker({ payments, agents }: { payments: Payment[]; agents: AgentPublic[] }) {
  const byId = new Map(agents.map((a) => [a.id, a]));
  return (
    <div className="ticker">
      <AnimatePresence initial={false} mode="popLayout">
        {payments.slice(0, 7).map((p) => (
          <motion.div
            key={p.id}
            layout
            className="chip-slot"
            initial={{ x: -340, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          >
            <Chip p={p} agent={byId.get(p.agentId)} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
