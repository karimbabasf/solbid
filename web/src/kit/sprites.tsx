import type { CSSProperties, JSX } from 'react';
import type { ItemIcon } from '@shared/types';

// Pixel sprites as tiny SVGs. One char = one pixel. '.' = empty.
// Agents: k ink, m main, d dark, l light, w eye white, e pupil, a gold accent.

export const AGENT_COLORS: { m: string; d: string; l: string; name: string }[] = [
  { m: '#E4513B', d: '#9E2B1F', l: '#FF8A6B', name: 'red' },
  { m: '#F28C28', d: '#B0561A', l: '#FFC070', name: 'orange' },
  { m: '#F2C12E', d: '#B58A10', l: '#FFE58A', name: 'gold' },
  { m: '#43B54A', d: '#237A2C', l: '#8FE38F', name: 'green' },
  { m: '#1FB5A8', d: '#12766E', l: '#7FE6DA', name: 'teal' },
  { m: '#3D7BE0', d: '#224C9C', l: '#8CB8FF', name: 'blue' },
  { m: '#8B5CF6', d: '#5B34B8', l: '#C4A8FF', name: 'purple' },
  { m: '#E85DA8', d: '#A0336F', l: '#FFA3D2', name: 'pink' },
];

const INK = '#14121f';

const AGENTS: string[][] = [
  // 0 blob
  ['....kkkk....', '..kkmmmmkk..', '.kmmllmmmmk.', '.kmlmmmmmmk.', 'kmmwwmmwwmmk', 'kmmwemmwemmk', 'kmmmmmmmmmmk', 'kmmmmkkmmmmk', 'kdmmmmmmmmdk', '.kddmmmmddk.', '..kdk..kdk..', '..kkk..kkk..'],
  // 1 antenna bot
  ['.....ka.....', '.....kk.....', '..kkkkkkkk..', '.kmmmmmmmmk.', '.kmllmmmmmk.', '.kmwwmmwwmk.', '.kmwemmwemk.', '.kmmmmmmmmk.', '.kmmkkkkmmk.', '.kddmmmmddk.', '..kkkkkkkk..', '..kdk..kdk..', '..kkk..kkk..'],
  // 2 crab
  ['...k....k...', '....k..k....', '..kkkkkkkk..', '.kmllmmmmmk.', 'kmmwwmmwwmmk', 'kmmwemmwemmk', 'kmmmmmmmmmmk', 'kkmmmkkmmmkk', 'kmkmmmmmmkmk', 'k.kddddddk.k', '...kk..kk...'],
  // 3 capped
  ['...kkkkkk...', '..kaaaaaak..', '.kkkkkkkkkk.', '.kmllmmmmmk.', 'kmmwwmmwwmmk', 'kmmwemmwemmk', 'kmmmmmmmmmmk', 'kmmmkmmkmmmk', 'kmmmmkkmmmmk', '.kdmmmmmmdk.', '..kdk..kdk..', '..kkk..kkk..'],
];

export function Grid({ rows, colors, size, className, style, title }: { rows: string[]; colors: Record<string, string>; size: number; className?: string; style?: CSSProperties; title?: string }) {
  const w = rows[0].length;
  const h = rows.length;
  const body: JSX.Element[] = [];
  const eyes: JSX.Element[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === '.' || !colors[c]) return;
      const r = <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={colors[c]} />;
      (c === 'w' || c === 'e' ? eyes : body).push(r);
    }),
  );
  return (
    <svg className={className} style={style} width={size} height={(size * h) / w} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {body}
      {eyes.length > 0 && <g className="px-eyes">{eyes}</g>}
    </svg>
  );
}

/** An agent character. `size` is the rendered width in px; keep it a multiple of 12 for crisp pixels. */
export function AgentSprite({ color = 0, sprite = 0, size = 48, className, style, title }: { color?: number; sprite?: number; size?: number; className?: string; style?: CSSProperties; title?: string }) {
  const c = AGENT_COLORS[((color % 8) + 8) % 8];
  const rows = AGENTS[((sprite % 4) + 4) % 4];
  return <Grid rows={rows} colors={{ k: INK, m: c.m, d: c.d, l: c.l, w: '#FCFCFC', e: INK, a: '#F8C630' }} size={size} className={className} style={style} title={title} />;
}

const COIN = ['..kkkk..', '.kyyyyk.', 'kyllyydk', 'kylyyydk', 'kylyyydk', 'kylyyydk', 'kyyyyddk', '.kyyddk.', '..kkkk..'];

export function Coin({ size = 16, className, style }: { size?: number; className?: string; style?: CSSProperties }) {
  return <Grid rows={COIN} colors={{ k: INK, y: '#F8C630', l: '#FFF1A8', d: '#C8841A' }} size={size} className={className} style={style} />;
}

const ICONS: Record<ItemIcon, { rows: string[]; colors: Record<string, string> }> = {
  joke: {
    rows: ['...kkkkkk...', '..kyyyyyyk..', '.kyyyyyyyyk.', 'kyykyyyykyyk', 'kyykyyyykyyk', 'kyyyyyyyyyyk', 'kykkkkkkkkyk', 'kykwwwwwwkyk', '.kykwwwwkyk.', '..kykkkkyk..', '...kkkkkk...'],
    colors: { k: INK, y: '#F8C630', w: '#FCFCFC' },
  },
  art: {
    rows: ['kkkkkkkkkkkk', 'kbbbbbbbbyyk', 'kbbbbbbbbyyk', 'kbbbbbbbbbbk', 'kbbbbgbbbbbk', 'kbbbgggbbbbk', 'kbbgggggbgbk', 'kbgggggggggk', 'kggggggggggk', 'kkkkkkkkkkkk'],
    colors: { k: INK, b: '#6FA8FF', y: '#F8C630', g: '#3DBE52' },
  },
  weather: {
    rows: ['......y.....', '...y..y..y..', '....yyyyy...', '...yyyyyyy..', '...yykkkkyy.', '..kkkwwwwkk.', '.kwwwwwwwwwk', 'kwwwwwwwwwwk', 'kwwwwwwwwwwk', '.kkkkkkkkkk.'],
    colors: { k: INK, y: '#F8C630', w: '#FCFCFC' },
  },
  secret: {
    rows: ['....kkkk....', '...k....k...', '..k......k..', '..k......k..', '.kkkkkkkkkk.', '.kyyyyyyyyk.', '.kyyykkyyyk.', '.kyyykkyyyk.', '.kyyyykyyyk.', '.kyyyyyyyyk.', '.kkkkkkkkkk.'],
    colors: { k: INK, y: '#F8C630' },
  },
  price: {
    rows: ['..........gg', '.........gg.', '........gg..', '...p...gg...', '..ppp.gg....', '.pp.ppg.....', 'pp...p......', '............', 'kkkkkkkkkkkk'],
    colors: { k: INK, p: '#9945FF', g: '#14F195' },
  },
  fortune: {
    rows: ['...kkkkkk...', '..kppppplk..', '.kppppppplk.', '.kppppppppk.', '.kppppppppk.', '..kppppppk..', '...kkkkkk...', '..kyyyyyyk..', '.kkkkkkkkkk.'],
    colors: { k: INK, p: '#8B5CF6', l: '#E6DBFF', y: '#F8C630' },
  },
  haiku: {
    rows: ['.kkkkkkkkkk.', '.kwwwwwwwwk.', '.kwkkkkkwwk.', '.kwwwwwwwwk.', '.kwkkkkkkwk.', '.kwwwwwwwwk.', '.kwkkkkwwwk.', '.kwwwwwwwwk.', '.kkkkkkkkkk.'],
    colors: { k: INK, w: '#F6EBD2' },
  },
  coffee: {
    rows: ['...w..w.....', '..w..w......', '...w..w.....', '.kkkkkkkk...', '.kbbbbbbkkk.', '.kbbbbbbk.k.', '.kbbbbbbkkk.', '.kbbbbbbk...', '..kbbbbk....', '...kkkk.....'],
    colors: { k: INK, b: '#8A5A3B', w: '#FCFCFC' },
  },
  roast: {
    rows: ['....k.......', '...krk......', '...krrk..k..', '..krrrk.krk.', '..krrrrkrrk.', '.krrorrrrrrk', '.krrooorrrrk', 'krrooyooorrk', 'krooyyyyoork', 'krooyyyyyork', '.kroyyyyork.', '..kkkkkkkk..'],
    colors: { k: INK, r: '#E4513B', o: '#F28C28', y: '#F8C630' },
  },
  meme: {
    rows: ['kkkkkkkkkkkk', 'kffffffffffk', 'kfbbkkkkbbfk', 'kfbkyyyykbfk', 'kfkyeyyeykfk', 'kfkyyyyyykfk', 'kfkykyykykfk', 'kfbkykkykbfk', 'kfbbkkkkbbfk', 'kffffffffffk', 'kkkkkkkkkkkk'],
    colors: { k: INK, f: '#C8841A', b: '#6FA8FF', y: '#F8C630', e: INK },
  },
  sunset: {
    rows: ['kkkkkkkkkkkk', 'kppppppppppk', 'kpppyyyypppk', 'kooyyyyyyook', 'koyyyyyyyyok', 'kbbbbbbbbbbk', 'kbbyyyyyybbk', 'kllllllllllk', 'kbbbyyyybbbk', 'kllllllllllk', 'kbbbbyybbbbk', 'kkkkkkkkkkkk'],
    colors: { k: INK, p: '#E85DA8', o: '#F28C28', y: '#F8C630', b: '#224C9C', l: '#3D7BE0' },
  },
  crystal: {
    rows: ['...kkkkkk...', '..kppppllk..', '.kppppppplk.', 'kppwpppppplk', 'kpwwwppppppk', 'kppwpppppppk', 'kppppppppppk', '.kdppppppdk.', '..kkddddkk..', '..kaaaaaak..', '.kaaaaaaaak.', '.kkkkkkkkkk.'],
    colors: { k: INK, p: '#8B5CF6', l: '#C4A8FF', d: '#5B34B8', w: '#FCFCFC', a: '#F8C630' },
  },
  rocket: {
    rows: ['.....kk.....', '....krrk....', '...krrrrk...', '...kssssk...', '...ksbbsk...', '...ksbbsk...', '...kssssk...', '..kksssskk..', '.krksssskrk.', '.krkkkkkkrk.', '.kk.oyyo.kk.', '.....oo.....'],
    colors: { k: INK, r: '#E4513B', s: '#FCFCFC', b: '#6FA8FF', o: '#F28C28', y: '#F8C630' },
  },
  heart: {
    rows: ['.kkkk..kkkk.', 'krrlrkkrrrrk', 'krlrrrrrrrrk', 'krrrrrrrrrrk', 'krrrrrrrrrdk', '.krrrrrrrdk.', '..krrrrrdk..', '...krrrdk...', '....krdk....', '.....kk.....'],
    colors: { k: INK, r: '#E85DA8', l: '#FFD1E8', d: '#A0336F' },
  },
  wish: {
    rows: ['.....kk.....', '....kyyk....', '....kyyk....', 'kkkkyyyykkkk', 'kyllyyyyyyyk', '.kyyyyyyyyk.', '..kyyyyyyk..', '..kyyyyyyk..', '.kyyykkyyyk.', '.kyyk..kyyk.', 'kyyk....kyyk', 'kkk......kkk'],
    colors: { k: INK, y: '#F8C630', l: '#FFF1A8' },
  },
};

export function ItemSprite({ icon, size = 48, className, style }: { icon: ItemIcon; size?: number; className?: string; style?: CSSProperties }) {
  const def = ICONS[icon] ?? ICONS.secret;
  return <Grid rows={def.rows} colors={def.colors} size={size} className={className} style={style} />;
}

export const shortSig = (s?: string) => (s ? `${s.slice(0, 4)}...${s.slice(-4)}` : '');
export const usd = (n: number) => `$${n.toFixed(2)}`;
