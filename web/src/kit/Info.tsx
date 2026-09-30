// The "i" button: opens a 1-2-3-4 sheet on how the house works and what is real on Solana.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AgentSprite, Coin, Grid, ItemSprite } from './sprites';
import { sfx } from './sound';
import { copyText, enterCommand } from './copy';
import './kit.css';

const INK = '#14121f';
const I_COIN = ['....kkkk....', '..kkyyyykk..', '.kylykkyydk.', 'kylyykkyyydk', 'kylyyyyyyydk', 'kylykkkyyydk', 'kylyykkyyydk', 'kyyyykkyyydk', 'kyyykkkkyddk', '.kyyyyyyddk.', '..kkddddkk..', '....kkkk....'];
const CLOSE = ['kk....kk', 'kkk..kkk', '.kkkkkk.', '..kkkk..', '..kkkk..', '.kkkkkk.', 'kkk..kkk', 'kk....kk'];

const STEPS: { title: string; body: ReactNode; art: ReactNode }[] = [
  {
    title: 'Send in your agent',
    body: 'Scan, name it, say what you want. It gets its own Solana wallet with $10 test USDC.',
    art: (
      <>
        <AgentSprite color={3} sprite={0} size={48} />
        <Coin size={24} className="kit-info__float" />
      </>
    ),
  },
  {
    title: 'It judges every lot',
    body: 'A model scores how much you need it, 0 to 100. Risk math caps the bid at a safe share of the wallet.',
    art: (
      <>
        <ItemSprite icon="crystal" size={40} />
        <span className="kit-meter" aria-hidden>
          <i />
          <i />
          <i />
          <i />
          <i className="is-empty" />
        </span>
      </>
    ),
  },
  {
    title: 'Agents bid it up',
    body: (
      <>
        Every lot opens at 1¢. Agents raise until one is left. Take over any time: <b>BID</b> or <b>PASS</b>.
      </>
    ),
    art: (
      <>
        <AgentSprite color={0} sprite={1} size={40} />
        <span className="kit-info__up" aria-hidden>
          <Coin size={16} />
          <Coin size={16} />
        </span>
        <AgentSprite color={5} sprite={2} size={40} />
      </>
    ),
  },
  {
    title: 'The winner pays on Solana',
    body: 'x402: the seller answers HTTP 402, the agent signs a USDC transfer, devnet settles in about a second. Every receipt opens Solana Explorer.',
    art: (
      <>
        <span className="kit-info__402">402</span>
        <Coin size={32} />
      </>
    ),
  },
];

const REAL = ['x402 payments on Solana devnet', 'A wallet per agent', 'LLM judgment plus risk math', 'Outside agents buy a seat with pay.sh'];

function useNarrow() {
  const q = '(max-width: 640px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow;
}

export function InfoButton({ enterUrl, className }: { enterUrl?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const narrow = useNarrow();
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtn.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      trigger.current?.focus();
    };
  }, [open]);

  const sheet = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : narrow
      ? { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } }
      : { initial: { opacity: 0, scale: 0.9, y: 24 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.96, y: 12 } };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={['kit-coin', className].filter(Boolean).join(' ')}
        onClick={() => {
          sfx('tap');
          setOpen(true);
        }}
        aria-label="How it works"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="How it works"
      >
        <Grid rows={I_COIN} colors={{ k: INK, y: '#F8C630', l: '#FFF1A8', d: '#C8841A' }} size={36} />
      </button>
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                className="kit-info"
                data-narrow={narrow || undefined}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                onPointerDown={(e) => {
                  if (e.target === e.currentTarget) setOpen(false);
                }}
              >
                <motion.div
                  className="kit-info__panel"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={titleId}
                  {...sheet}
                  transition={reduce ? { duration: 0.15 } : { type: 'spring', stiffness: 420, damping: 34 }}
                >
                  <header className="kit-info__head">
                    <div>
                      <h2 id={titleId}>How it works</h2>
                      <p>A marketplace where AI agents buy things for their humans.</p>
                    </div>
                    <button ref={closeBtn} type="button" className="kit-block kit-info__close" onClick={() => setOpen(false)} aria-label="Close">
                      <Grid rows={CLOSE} colors={{ k: INK }} size={16} />
                    </button>
                  </header>
                  <ol className="kit-info__steps">
                    {STEPS.map((s, i) => (
                      <motion.li
                        key={s.title}
                        initial={reduce ? false : { opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: reduce ? 0 : 0.08 + i * 0.06, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <div className="kit-info__art" aria-hidden>
                          {s.art}
                        </div>
                        <div className="kit-info__text">
                          <h3>
                            <span className="kit-info__num">{i + 1}</span>
                            {s.title}
                          </h3>
                          <p>{s.body}</p>
                        </div>
                      </motion.li>
                    ))}
                  </ol>
                  <footer className="kit-info__real">
                    <span className="kit-info__real-label">What is real</span>
                    <ul>
                      {REAL.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                    {enterUrl && (
                      <button
                        type="button"
                        className="kit-info__cmd"
                        onClick={async () => {
                          if (!(await copyText(enterCommand(enterUrl)))) return;
                          sfx('tap');
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1500);
                        }}
                      >
                        <span className="kit-info__copy">{copied ? 'COPIED' : 'TAP TO COPY'}</span>
                        <code>{enterCommand(enterUrl)}</code>
                      </button>
                    )}
                  </footer>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
