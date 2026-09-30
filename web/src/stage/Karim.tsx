// Top-left KARIM button: two big QR codes for Karim's LinkedIn and X, sized to scan from the room.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { AgentSprite } from '../kit/sprites';
import { sfx, unlockAudio } from '../kit/sound';

const LINKS = [
  { label: 'LINKEDIN', handle: 'Karim Baba', url: 'https://www.linkedin.com/in/karim-baba-130547289/', tone: 'is-li' },
  { label: 'X / TWITTER', handle: '@karimbabasf', url: 'https://x.com/karimbabasf', tone: 'is-x' },
];

export function KarimButton() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const toggle = (v: boolean) => {
    unlockAudio();
    sfx('tap');
    setOpen(v);
  };
  return (
    <>
      <button type="button" className="karim-btn" onClick={() => toggle(true)} aria-label="Karim's socials">
        <AgentSprite color={0} sprite={0} size={36} />
        KARIM
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="karim-veil" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => toggle(false)}>
            <motion.div
              className="karim-sheet panel"
              initial={{ y: 40, scale: 0.94, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button type="button" className="karim-close" onClick={() => toggle(false)} aria-label="Close">
                ✕
              </button>
              <div className="karim-cards">
                {LINKS.map((l) => (
                  <div key={l.label} className={`karim-card ${l.tone}`}>
                    <span className="karim-label">{l.label}</span>
                    <div className="karim-qr">
                      <QRCodeSVG value={l.url} size={400} bgColor="#fcfcfc" fgColor="#14121f" level="M" marginSize={0} />
                    </div>
                    <span className="karim-handle">{l.handle}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
