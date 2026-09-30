import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

// Phone-only pixel art and small parts. Same grid language as kit/sprites.tsx.
const INK = '#14121f';

function Px({ rows, colors, size, className, style }: { rows: string[]; colors: Record<string, string>; size: number; className?: string; style?: CSSProperties }) {
  const w = rows[0].length;
  const h = rows.length;
  return (
    <svg className={className} style={style} width={size} height={(size * h) / w} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" aria-hidden>
      {rows.flatMap((r, y) => [...r].map((c, x) => (c === '.' || !colors[c] ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={colors[c]} />)))}
    </svg>
  );
}

const CLOUD = [
  '......kkkk......',
  '...kkkwwwwk.....',
  '..kwwwwwwwwkkk..',
  '.kwwwwwwwwwwwwk.',
  'kwwwwwwwwwwwwwwk',
  'kwwwwwwwwwwwwwwk',
  'kbwwwwbbwwwwwbbk',
  '.kbbbbkkbbbbbbk.',
  '..kkkk..kkkkkk..',
];

export const Cloud = ({ size = 64, className, style }: { size?: number; className?: string; style?: CSSProperties }) => (
  <Px rows={CLOUD} colors={{ k: INK, w: '#FCFCFC', b: '#A8C8FF' }} size={size} className={className} style={style} />
);

const Q_GLYPH = ['.wwww.', 'ww..ww', 'ww..ww', '....ww', '...ww.', '..ww..', '..ww..', '......', '..ww..', '..ww..'];

function block(used: boolean) {
  const g: string[][] = Array.from({ length: 16 }, (_, y) =>
    Array.from({ length: 16 }, (_, x) => (x === 0 || y === 0 || x === 15 || y === 15 ? 'k' : x === 14 || y === 14 ? 'd' : x === 1 || y === 1 ? 'l' : 'y')),
  );
  for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) g[y][x] = 'k';
  if (!used)
    Q_GLYPH.forEach((r, y) =>
      [...r].forEach((c, x) => {
        if (c !== 'w') return;
        g[y + 3][x + 5] = 'w';
        if (g[y + 4][x + 6] === 'y') g[y + 4][x + 6] = 'd';
      }),
    );
  return g.map((r) => r.join(''));
}
const QB = block(false);
const QB_USED = block(true);

export const QBlock = ({ size = 48, used = false, className }: { size?: number; used?: boolean; className?: string }) => (
  <Px
    rows={used ? QB_USED : QB}
    colors={used ? { k: INK, y: '#B0561A', d: '#7A2A04', l: '#D9803A', w: '#FCFCFC' } : { k: INK, y: '#F8C630', d: '#C8841A', l: '#FFE58A', w: '#FCFCFC' }}
    size={size}
    className={className}
  />
);

const ARROW = ['..kkkk', '....kk', '...k.k', '..k..k', '.k....', 'k.....'];
export const Arrow = ({ size = 10 }: { size?: number }) => <Px rows={ARROW} colors={{ k: 'currentColor' }} size={size} className="ph-arrow" />;

/** A green pipe drawn at 4px per art pixel. */
export function Pipe({ w = 112, h = 56 }: { w?: number; h?: number }) {
  const W = w / 4;
  const H = h / 4;
  const L = Math.min(6, H - 1);
  const f = (v: string): CSSProperties => ({ fill: `var(${v})` });
  return (
    <svg width={w} height={h} viewBox={`0 0 ${W} ${H}`} shapeRendering="crispEdges" aria-hidden>
      <rect x={2} y={L} width={W - 4} height={H - L} fill={INK} />
      <rect x={3} y={L} width={W - 6} height={H - L} style={f('--pipe')} />
      <rect x={5} y={L} width={2} height={H - L} style={f('--pipe-light')} />
      <rect x={W - 8} y={L} width={3} height={H - L} style={f('--pipe-dark')} />
      <rect x={3} y={L} width={W - 6} height={1} style={f('--pipe-dark')} />
      <rect x={0} y={0} width={W} height={L} fill={INK} />
      <rect x={1} y={1} width={W - 2} height={L - 2} style={f('--pipe')} />
      <rect x={3} y={1} width={2} height={L - 2} style={f('--pipe-light')} />
      <rect x={W - 6} y={1} width={3} height={L - 2} style={f('--pipe-dark')} />
    </svg>
  );
}

/** A rider standing on a pipe. The pipe paints over the rider and the box clips below, so a rider moved down disappears into it. */
export function PipeSpot({ children, pipeW, pipeH, height, className }: { children: ReactNode; pipeW: number; pipeH: number; height: number; className?: string }) {
  return (
    <div className={`ph-spot ${className ?? ''}`} style={{ height }}>
      <div className="ph-spot-rider" style={{ bottom: pipeH }}>
        {children}
      </div>
      <div className="ph-spot-pipe">
        <Pipe w={pipeW} h={pipeH} />
      </div>
    </div>
  );
}

export function Sky({ children }: { children?: ReactNode }) {
  return (
    <header className="ph-sky">
      <Cloud size={64} className="ph-cloud c1" />
      <Cloud size={40} className="ph-cloud c2" />
      {children}
    </header>
  );
}

export const Bricks = () => <div className="ph-bricks" aria-hidden />;

/** Digits roll to their new value; non-digits sit still. */
export function Roller({ value, className }: { value: string; className?: string }) {
  const chars = [...value];
  return (
    <span className={`ph-roll ${className ?? ''}`} aria-label={value}>
      {chars.map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={chars.length - i} className="ph-roll-d" aria-hidden>
            <span className="ph-roll-s" style={{ transform: `translateY(${-Number(ch) * 10}%)` }}>
              {'0123456789'.split('').map((d) => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        ) : (
          <span key={`c${chars.length - i}`} aria-hidden>
            {ch}
          </span>
        ),
      )}
    </span>
  );
}

/** Ten pixel blocks, 0..100. `scan` loops a sweep while the agent thinks. */
export function Meter({ value, scan }: { value: number | null; scan?: boolean }) {
  const on = value == null ? 0 : Math.max(0, Math.min(10, Math.round(value / 10)));
  return (
    <div className={`ph-meter${scan ? ' is-scan' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={scan ? undefined : (value ?? 0)}>
      {Array.from({ length: 10 }, (_, i) => (
        <i key={i} className={!scan && i < on ? 'on' : undefined} style={{ '--i': i } as CSSProperties} />
      ))}
    </div>
  );
}

/** Black squares grow from a point, hold, then shrink away. Swap screens under it at COVER_MS. */
export const WIPE_COVER_MS = 520;
export function Wipe({ ox = 0.5, oy = 0.35, onDone }: { ox?: number; oy?: number; onDone: () => void }) {
  const cell = 44;
  const [grid] = useState(() => {
    const cols = Math.ceil(innerWidth / cell);
    const rows = Math.ceil(innerHeight / cell);
    const cx = ox * cols;
    const cy = oy * rows;
    const max = Math.hypot(Math.max(cx, cols - cx), Math.max(cy, rows - cy));
    const delays = Array.from({ length: cols * rows }, (_, i) => Math.round((Math.hypot((i % cols) + 0.5 - cx, Math.floor(i / cols) + 0.5 - cy) / max) * 200));
    return { cols, delays };
  });
  useEffect(() => {
    const t = setTimeout(onDone, 1150);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="ph-wipe" style={{ gridTemplateColumns: `repeat(${grid.cols}, ${cell}px)` }} aria-hidden>
      {grid.delays.map((d, i) => (
        <i key={i} style={{ animationDelay: `${d}ms` }} />
      ))}
    </div>
  );
}
