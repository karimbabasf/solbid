// The README banner, drawn with the app's own sprites. Open /banner and capture the 1280x640 frame at 2x.
import type { Lot } from '@shared/types';
import { AgentSprite, Coin } from '../kit/sprites';
import { LotCard } from '../kit/LotCard';
import { Cloud, Crown, Hill } from '../stage/art';
import './banner.css';

const LOT: Lot = { id: 'banner', index: 7, total: 0, itemId: 'wish', name: 'Made To Order', icon: 'wish', reserve: 0.01, open: 0.01, rarity: 'legendary', teaser: 'Exactly what your human asked for', seller: '' };

const CROWD: { color: number; sprite: number; x: number; bid?: string; lead?: boolean; out?: boolean }[] = [
  { color: 5, sprite: 1, x: 660, out: true },
  { color: 0, sprite: 0, x: 760, bid: '$2.25' },
  { color: 6, sprite: 2, x: 880, bid: '$2.95', lead: true },
  { color: 3, sprite: 3, x: 980 },
  { color: 7, sprite: 1, x: 1062, bid: '$1.85' },
];

export default function Banner() {
  return (
    <div className="bn">
      <div className="bn-cloud" style={{ left: 60, top: 44 }}><Cloud px={6} /></div>
      <div className="bn-cloud" style={{ left: 520, top: 30 }}><Cloud px={4} /></div>
      <div className="bn-cloud" style={{ left: 1110, top: 120 }}><Cloud px={5} /></div>
      <div className="bn-hill" style={{ left: 330 }}><Hill px={7} /></div>
      <div className="bn-hill" style={{ left: 1040 }}><Hill px={5} /></div>

      <div className="bn-title">
        <h1 className="bn-mark">
          <span className="bn-sol">Sol</span>
          <span className="bn-bid">Bid</span>
        </h1>
        <p className="bn-line">AI agents bid for you.</p>
        <p className="bn-sub">They pay each other on Solana with x402.</p>
        <div className="bn-chips">
          <span className="bn-chip is-sol">x402</span>
          <span className="bn-chip">SOLANA DEVNET</span>
          <span className="bn-chip">PAY.SH</span>
        </div>
      </div>

      <div className="bn-card">
        <LotCard lot={LOT} price={2.95} size="md" />
      </div>

      <Coin size={30} className="bn-coin" style={{ left: 842, top: 402 }} />
      <Coin size={26} className="bn-coin" style={{ left: 798, top: 356 }} />
      <Coin size={22} className="bn-coin" style={{ left: 1040, top: 380 }} />

      {CROWD.map((a) => (
        <div key={a.x} className={`bn-agent${a.out ? ' is-out' : ''}`} style={{ left: a.x }}>
          {a.bid && <span className={`bn-bubble${a.lead ? ' is-lead' : ''}`}>{a.bid}</span>}
          {a.lead && <span className="bn-crown"><Crown px={4} /></span>}
          {a.out && <span className="bn-bubble is-out">OUT</span>}
          <AgentSprite color={a.color} sprite={a.sprite} size={76} />
        </div>
      ))}

      <div className="bn-pipe" style={{ left: 1162 }}>
        <div className="bn-pipe-lip" />
        <div className="bn-pipe-body" />
      </div>
      <div className="bn-ground" />
    </div>
  );
}
