// The card for the item on sale: big pixel icon, name, rarity frame, what the winner gets, live price.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useReducedMotion } from 'motion/react';
import type { Lot, Rarity } from '@shared/types';
import { Coin, ItemSprite, usd } from './sprites';
import './kit.css';

const PIPS: Record<Rarity, number> = { common: 1, rare: 2, epic: 3, legendary: 4 };

const SIZES = {
  lg: { item: 108, coin: 32 },
  md: { item: 108, coin: 28 },
  sm: { item: 48, coin: 18 },
};

const cents = (n: number) => (n < 1 ? `${Math.round(n * 100)}¢` : usd(n));

function Price({ value, coin }: { value: number; coin: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduce || from.current === value) {
      setShown(value);
      from.current = value;
      return;
    }
    const run = animate(from.current, value, { duration: 0.35, ease: [0.16, 1, 0.3, 1], onUpdate: setShown });
    from.current = value;
    return () => run.stop();
  }, [value, reduce]);
  return (
    <motion.span
      key={value}
      className="kit-lot__amount"
      initial={reduce ? false : { scale: 1.3, y: -6 }}
      animate={{ scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 600, damping: 18 }}
    >
      <Coin size={coin} />
      {usd(shown)}
    </motion.span>
  );
}

export function LotCard(props: { lot: Lot; price?: number; going?: boolean; forName?: string; size?: 'lg' | 'md' | 'sm'; className?: string }) {
  const { lot, price = 0, going = false, forName, size = 'md', className } = props;
  const reduce = useReducedMotion();
  const dims = SIZES[size];

  return (
    <div className={['kit-lot-wrap', `is-${size}`, className].filter(Boolean).join(' ')}>
      <AnimatePresence mode="wait" initial>
        <motion.article
          key={lot.id}
          className={`kit-lot is-${lot.rarity}`}
          aria-label={`${lot.name}, ${lot.rarity}`}
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5, y: 60, rotate: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0, rotate: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85, y: -20 }}
          transition={reduce ? { duration: 0.15 } : { type: 'spring', stiffness: 360, damping: 20, mass: 0.9 }}
        >
          {forName && (
            <div className="kit-lot__ribbon">
              for <b>{forName}</b>
            </div>
          )}
          <div className="kit-lot__card">
            <div className="kit-lot__art">
              <div className="kit-lot__rays" aria-hidden />
              <motion.div
                className="kit-lot__item"
                initial={reduce || size === 'sm' ? false : { y: 48, scale: 0.4 }}
                animate={{ y: 0, scale: 1 }}
                transition={{ delay: 0.12, type: 'spring', stiffness: 300, damping: 14 }}
              >
                <ItemSprite icon={lot.icon} size={dims.item} className="kit-lot__sprite" />
              </motion.div>
              {size !== 'sm' && <div className="kit-lot__shadow" aria-hidden />}
            </div>
            <div className="kit-lot__body">
              <div className="kit-lot__rarity">
                <span className="kit-lot__pips" aria-hidden>
                  {[1, 2, 3, 4].map((n) => (
                    <i key={n} className={n <= PIPS[lot.rarity] ? 'on' : ''} />
                  ))}
                </span>
                {lot.rarity}
              </div>
              <h3 className="kit-lot__name">{lot.name}</h3>
              {size !== 'sm' && <p className="kit-lot__teaser">{lot.teaser}</p>}
              <div className="kit-lot__price" aria-live="polite">
                {price > 0 ? <Price value={price} coin={dims.coin} /> : <span className="kit-lot__opens">opens at {cents(lot.open || 0.01)}</span>}
                {going && <span className="kit-lot__going">GOING</span>}
              </div>
            </div>
            {lot.rarity === 'legendary' && <div className="kit-lot__holo" aria-hidden />}
          </div>
        </motion.article>
      </AnimatePresence>
    </div>
  );
}
