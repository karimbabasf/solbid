import { memo, useMemo, type CSSProperties, type JSX } from 'react';

// Stage-only pixel art. Same one-char-per-pixel idea as the kit, plus an ink outline helper.
const INK = '#14121f';

type PxProps = { rows: string[]; colors: Record<string, string>; px: number; group?: string; groupClass?: string; className?: string; style?: CSSProperties };

export const Px = memo(function Px({ rows, colors, px, group = '', groupClass, className, style }: PxProps) {
  const w = rows[0]?.length ?? 0;
  const h = rows.length;
  const [base, top] = useMemo(() => {
    const a: JSX.Element[] = [];
    const b: JSX.Element[] = [];
    rows.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c === '.' || !colors[c]) return;
        const r = <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={colors[c]} />;
        (group.includes(c) ? b : a).push(r);
      }),
    );
    return [a, b];
  }, [rows, colors, group]);
  return (
    <svg className={className} style={style} width={w * px} height={h * px} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" aria-hidden>
      {base}
      {top.length > 0 && <g className={groupClass}>{top}</g>}
    </svg>
  );
});

/** Pads a sprite by one pixel and draws an ink outline around every filled pixel. */
function outline(rows: string[]): string[] {
  const w = rows[0].length + 2;
  const h = rows.length + 2;
  const at = (x: number, y: number) => rows[y - 1]?.[x - 1] ?? '.';
  const out: string[] = [];
  for (let y = 0; y < h; y++) {
    let s = '';
    for (let x = 0; x < w; x++) {
      const c = at(x, y);
      if (c !== '.') s += c;
      else s += [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some((n) => n !== '.') ? 'k' : '.';
    }
    out.push(s);
  }
  return out;
}

// The "?" block. 16x16, 8px per art pixel at 128px.
const GLYPH = ['.qqqq.', 'qq..qq', 'qq..qq', '...qq.', '..qq..', '..qq..', '......', '..qq..', '..qq..'];
function blockRows(used: boolean): string[] {
  const g = Array.from({ length: 16 }, (_, y) =>
    Array.from({ length: 16 }, (_, x): string => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return 'k';
      if (y === 1 || x === 1) return 'l';
      if (y === 14 || x === 14) return 'd';
      return 'y';
    }),
  );
  for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) g[y][x] = 'k';
  if (!used) {
    GLYPH.forEach((row, dy) => [...row].forEach((c, dx) => { if (c === 'q') g[4 + dy][6 + dx] = 's'; }));
    GLYPH.forEach((row, dy) => [...row].forEach((c, dx) => { if (c === 'q') g[3 + dy][5 + dx] = 'q'; }));
  }
  return g.map((r) => r.join(''));
}
const BLOCK_Q = blockRows(false);
const BLOCK_USED = blockRows(true);
const Q_COLORS = { k: INK, l: '#fff1a8', y: '#f8c630', d: '#c8841a', q: '#7a2a04', s: '#c8841a' };
const USED_COLORS = { k: INK, l: '#d9803a', y: '#b0561a', d: '#7a2a04' };

export function QBlock({ used, size = 128 }: { used: boolean; size?: number }) {
  return used ? <Px rows={BLOCK_USED} colors={USED_COLORS} px={size / 16} /> : <Px rows={BLOCK_Q} colors={Q_COLORS} px={size / 16} group="qs" groupClass="qb-glyph" />;
}

const CROWN = outline(['a...a...a', 'aa.aaa.aa', 'aaaaaaaaa', 'ajaaaaaja', 'aaaaaaaaa', 'ddddddddd']);
const CROWN_COLORS = { k: INK, a: '#f8c630', j: '#e4513b', d: '#c8841a' };
export const Crown = ({ px = 4 }: { px?: number }) => <Px rows={CROWN} colors={CROWN_COLORS} px={px} />;

const CHECK = outline(['.....g', '....gg', 'g..gg.', 'gggg..', '.gg...']);
export const Check = () => <Px rows={CHECK} colors={{ k: INK, g: '#43b54a' }} px={3} />;

const CROSS = outline(['r...r', '.r.r.', '..r..', '.r.r.', 'r...r']);
export const Cross = () => <Px rows={CROSS} colors={{ k: INK, r: '#e4513b' }} px={3} />;

/** Eight squares round a 3x3 ring, one lit at a time. */
export function Spinner() {
  const ring = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1]];
  return (
    <svg className="spin" width={21} height={21} viewBox="0 0 21 21" shapeRendering="crispEdges" aria-hidden>
      {ring.map(([x, y], i) => (
        <rect key={i} x={x * 7} y={y * 7} width={6} height={6} fill={INK} style={{ animationDelay: `${i * 100}ms` }} />
      ))}
    </svg>
  );
}

const CLOUD = [
  '......wwww..........',
  '....wwwwwwww..ww....',
  '...wwwwwwwwwwwwwww..',
  '.wwwwwwwwwwwwwwwwww.',
  'wwwwwwwwwwwwwwwwwwww',
  'wwwwwwwwwwwwwwwwwwww',
  '.ssssssssssssssssss.',
];
const CLOUD_COLORS = { w: '#ffffff', s: '#cfe0ff' };
export const Cloud = ({ px }: { px: number }) => <Px rows={CLOUD} colors={CLOUD_COLORS} px={px} />;

const HILL = [
  '..........kkkk..........',
  '........kkggggkk........',
  '......kkggggggggkk......',
  '.....kggggkgggggggk.....',
  '....kggggggggggkgggk....',
  '...kggggkgggggggggggk...',
  '..kggggggggggggkggggggk.',
  '.kggggggggkggggggggggggk',
  'kggggggggggggggggggggggk',
];
export const Hill = ({ px }: { px: number }) => <Px rows={HILL} colors={{ k: '#2e8a3c', g: '#58b85a' }} px={px} />;
