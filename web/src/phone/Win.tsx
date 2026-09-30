import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { AuctionState, ItemIcon, MeState, Rarity } from '@shared/types';
import { Coin, ItemSprite, shortSig, usd } from '../kit/sprites';
import { Arrow, Cloud, QBlock } from './bits';

/** The block gets bumped, the item rises out of it in its rarity light, coins fly. */
export function Celebrate({ icon, rarity, amount, onDone }: { icon: ItemIcon; rarity: Rarity; amount: number; onDone: () => void }) {
  const reduce = useReducedMotion();
  const [used, setUsed] = useState(false);
  const coins = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => {
        const a = (i / 18) * Math.PI * 2 + Math.random() * 0.3;
        const r = 100 + Math.random() * 90;
        return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.7 - 90, d: Math.random() * 0.14 };
      }),
    [],
  );

  useEffect(() => {
    const u = setTimeout(() => setUsed(true), 120);
    const t = setTimeout(onDone, reduce ? 1100 : 2100);
    return () => {
      clearTimeout(u);
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div className={`ph-win rar-${rarity}`} role="alert" aria-label={`You won a ${rarity} lot, paid ${usd(amount)}`} onClick={onDone} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
      <Cloud size={96} className="ph-cloud c1" />
      <Cloud size={56} className="ph-cloud c2" />
      <h1 className="ph-win-title" aria-hidden>
        {'YOU WON'.split('').map((ch, i) => (
          <motion.span key={i} initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.22 + i * 0.035, type: 'spring', stiffness: 560, damping: 18 }}>
            {ch === ' ' ? ' ' : ch}
          </motion.span>
        ))}
      </h1>
      <div className="ph-win-stage">
        <motion.span className="ph-win-rays" aria-hidden initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.14, type: 'spring', stiffness: 260, damping: 20 }} />
        {coins.map((c, i) => (
          <motion.span
            key={i}
            className="ph-win-coin"
            initial={{ x: 0, y: 0, scale: 0 }}
            animate={{ x: [0, c.x, c.x * 1.2], y: [0, c.y, c.y + 640], scale: [0, 1, 1] }}
            transition={{ duration: 1.3, delay: 0.12 + c.d, times: [0, 0.3, 1], ease: ['easeOut', 'easeIn'] }}
          >
            <Coin size={24} className="ph-spin" />
          </motion.span>
        ))}
        <motion.span className="ph-win-item" initial={{ y: 8, opacity: 0 }} animate={{ y: -92, opacity: 1 }} transition={{ delay: 0.1, type: 'spring', stiffness: 320, damping: 15 }}>
          <ItemSprite icon={icon} size={80} />
        </motion.span>
        <motion.span className="ph-win-block" initial={{ y: 0 }} animate={{ y: [0, -20, 0] }} transition={{ duration: 0.26, times: [0, 0.4, 1], ease: 'easeOut' }}>
          <QBlock size={96} used={used} />
        </motion.span>
      </div>
      <motion.p className="ph-win-amt" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
        <span className="ph-rar">{rarity.toUpperCase()}</span>
        <Coin size={20} /> {usd(amount)}
      </motion.p>
    </motion.div>
  );
}

/** The prize. Text or art, plus the payment receipt. */
export function DeliveryCard({ lotId, me, state, onClose }: { lotId: string; me: MeState | null; state: AuctionState | null; onClose: () => void }) {
  const d = me?.deliveries.find((x) => x.lotId === lotId);
  const lot = state?.lot?.id === lotId ? state.lot : null;
  const pay = state?.payments.find((p) => p.kind === 'x402' && p.lotId === lotId);
  const icon = d?.icon ?? lot?.icon ?? 'secret';
  const name = d?.name ?? lot?.name ?? 'Your item';
  const price = d?.price ?? pay?.amount ?? (lot && state?.winner ? state.winner.amount : 0);
  const sig = d?.sig ?? pay?.sig;
  const explorer = d?.explorer ?? pay?.explorer;
  const failed = !d && pay?.status === 'failed';

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);

  const receipt = (
    <>
      <span>{d || pay?.status === 'confirmed' || pay?.status === 'simulated' ? 'PAID' : 'PAYING'} {usd(price)}</span>
      <span className="ph-sep">·</span>
      <span>x402</span>
      {sig && (
        <>
          <span className="ph-sep">·</span>
          <span className="ph-mono">{shortSig(sig)}</span>
        </>
      )}
      {explorer && <Arrow size={10} />}
    </>
  );

  return (
    <motion.div className="ph-sheet" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
      <motion.section
        className="ph-panel is-paper ph-card"
        role="dialog"
        aria-modal="true"
        aria-label={name}
        onClick={(e) => e.stopPropagation()}
        initial={{ y: '110%' }}
        animate={{ y: 0 }}
        exit={{ y: '110%' }}
        transition={{ type: 'spring', stiffness: 420, damping: 36 }}
      >
        <header className="ph-card-head">
          <span className={`ph-card-art${lot ? ` rar-${lot.rarity}` : ''}`}>
            <ItemSprite icon={icon} size={48} />
          </span>
          <h2 className="ph-card-name">{name}</h2>
        </header>

        <div className="ph-card-body">
          {d ? (
            d.content.type === 'text' ? (
              <p className="ph-card-text">{d.content.text}</p>
            ) : (
              <figure className="ph-card-fig">
                <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(d.content.svg)}`} alt={d.content.caption ?? name} />
                {d.content.caption && <figcaption>{d.content.caption}</figcaption>}
              </figure>
            )
          ) : failed ? (
            <p className="ph-card-wait is-bad">Payment failed. Nothing was charged for this one.</p>
          ) : (
            <p className="ph-card-wait">
              <span className="ph-dots">
                <i />
                <i />
                <i />
              </span>
              {pay?.status === 'pending' ? 'Paying on Solana' : 'Delivering'}
            </p>
          )}
        </div>

        {!failed && price > 0 && (explorer ? (
          <a className="ph-receipt" href={explorer} target="_blank" rel="noreferrer">
            {receipt}
          </a>
        ) : (
          <p className="ph-receipt">{receipt}</p>
        ))}

        <button type="button" className="ph-block ph-card-ok" onClick={onClose}>
          <span className="ph-block-rivets" aria-hidden />
          OK
        </button>
      </motion.section>
    </motion.div>
  );
}
