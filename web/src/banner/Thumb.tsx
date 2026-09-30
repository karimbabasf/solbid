// YouTube thumbnail, 1280x720, drawn with the app's own sprites. Open /thumb and capture at 2x.
import type { Lot } from '@shared/types';
import { AgentSprite, Coin } from '../kit/sprites';
import { LotCard } from '../kit/LotCard';
import { Cloud, Crown, Hill } from '../stage/art';
import './banner.css';

const LOT: Lot = { id: 'thumb', index: 7, total: 0, itemId: 'wish', name: 'Made To Order', icon: 'wish', reserve: 0.01, open: 0.01, rarity: 'legendary', teaser: 'Exactly what your human asked for', seller: '' };

export default function Thumb() {
  return (
    <div className="bn th">
      <div className="bn-cloud" style={{ left: 40, top: 30 }}><Cloud px={6} /></div>
      <div className="bn-cloud" style={{ left: 600, top: 24 }}><Cloud px={4} /></div>
      <div className="bn-hill" style={{ left: 420, bottom: 108 }}><Hill px={8} /></div>

      <div className="th-title">
        <h1 className="bn-mark th-mark">
          <span className="bn-sol">Sol</span>
          <span className="bn-bid">Bid</span>
        </h1>
        <p className="th-line">AI AGENTS<br />BID FOR YOU</p>
        <span className="bn-chip is-sol th-chip">PAID ON SOLANA</span>
      </div>

      <div className="th-card">
        <LotCard lot={LOT} price={2.95} size="md" />
      </div>
      <div className="th-stamp">SOLD!</div>

      <Coin size={44} className="bn-coin" style={{ left: 760, top: 470 }} />
      <Coin size={36} className="bn-coin" style={{ left: 1150, top: 420 }} />
      <Coin size={30} className="bn-coin" style={{ left: 700, top: 400 }} />

      <div className="bn-agent th-rival" style={{ left: 820 }}>
        <span className="bn-bubble">$2.25</span>
        <AgentSprite color={0} sprite={0} size={110} />
      </div>
      <div className="bn-agent th-hero" style={{ left: 980 }}>
        <span className="bn-bubble is-lead th-bid">$2.95</span>
        <span className="bn-crown"><Crown px={7} /></span>
        <AgentSprite color={6} sprite={2} size={170} />
      </div>
      <div className="bn-ground th-ground" />
    </div>
  );
}
