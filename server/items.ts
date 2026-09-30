import type { DeliveryContent, GoalId, ItemIcon } from '../shared/types.ts';
import { llm } from './llm.ts';

export interface Item {
  id: string;
  name: string;
  icon: ItemIcon;
  reserve: number;
  tags: GoalId[]; // goals this item serves
  words: string[]; // keywords for custom goals
  make: () => Promise<DeliveryContent>;
}

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

async function fetchJson(url: string, ms = 2500): Promise<any> {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

// Written by the "seller" service: an LLM when it answers fast, a canned line when it does not.
async function written(prompt: string, fallback: string[]): Promise<DeliveryContent> {
  const text = await llm(
    [
      { role: 'system', content: 'You write one short piece for a hackathon crowd. Plain text, no quotes, no emoji, under 180 characters.' },
      { role: 'user', content: prompt },
    ],
    3500,
  );
  return { type: 'text', text: text?.trim() || pick(fallback) };
}

const JOKES = [
  'My agent tried to split the bill. It sent 0.5 of a transaction.',
  'Why did the validator go to therapy? Too many unresolved forks.',
  'I asked my agent for alpha. It said: the first letter of the Greek alphabet. $0.05 please.',
  'Two agents walk into a bar. The second one front-runs the first.',
];
const SECRETS = [
  'The judges decide in the first 30 seconds of your demo. Open with the money moving.',
  'Every payment on this screen is a real Solana devnet transaction. Click any receipt.',
  'The quietest agent in the room has won the most items. It only bids when it cares.',
  'There is always one more slice of pizza than people think.',
];
const FORTUNES = [
  'A small payment today opens a large door tomorrow.',
  'Your next commit will work on the first try. Enjoy it, it will not happen again.',
  'Someone in this room will be your cofounder. Say hi.',
  'You will ship before the deadline, but only just.',
];
const HAIKU = [
  'Four-oh-two replies / a wallet signs in silence / the joke is now yours',
  'Agents raise their hands / one coin crosses the ledger / the block remembers',
  'Fog over Kearny / my agent spent forty cents / on sunshine for me',
];
const COFFEE = [
  'Order: oat cortado, extra shot. Reason: demo in two hours.',
  'Order: cold brew, black. Reason: you have bugs to hunt.',
  'Order: matcha latte. Reason: calm hands for the live demo.',
];

// A unique 8x8 mirrored pixel creature, different for every buyer.
function pixelArt(): DeliveryContent {
  const hues = [8, 28, 45, 140, 170, 210, 265, 320];
  const h = pick(hues);
  const fg = `hsl(${h} 80% 58%)`;
  const shade = `hsl(${h} 70% 38%)`;
  const bg = `hsl(${(h + 180) % 360} 60% 92%)`;
  const cells: string[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 4; x++) {
      const on = Math.random() < (y === 2 || y === 3 ? 0.75 : 0.5);
      if (!on) continue;
      const fill = y > 5 ? shade : fg;
      cells.push(`<rect x="${x + 1}" y="${y + 1}" width="1.02" height="1.02" fill="${fill}"/>`);
      cells.push(`<rect x="${8 - x}" y="${y + 1}" width="1.02" height="1.02" fill="${fill}"/>`);
    }
  }
  const eyeY = 3;
  cells.push(`<rect x="3" y="${eyeY}" width="1" height="1" fill="#14121f"/><rect x="6" y="${eyeY}" width="1" height="1" fill="#14121f"/>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" shape-rendering="crispEdges"><rect width="10" height="10" fill="${bg}"/>${cells.join('')}</svg>`;
  return { type: 'svg', svg, caption: 'One of one. Nobody else has this.' };
}

async function weather(): Promise<DeliveryContent> {
  try {
    const j = await fetchJson('https://api.open-meteo.com/v1/forecast?latitude=37.79&longitude=-122.40&current=temperature_2m,wind_speed_10m,precipitation&temperature_unit=fahrenheit&wind_speed_unit=mph');
    const t = Math.round(j.current.temperature_2m);
    const w = Math.round(j.current.wind_speed_10m);
    const rain = j.current.precipitation > 0;
    return { type: 'text', text: `San Francisco right now: ${t}F, wind ${w} mph${rain ? ', rain' : ''}. ${t < 62 ? 'Bring a layer.' : 'Good day to walk to demo.'}` };
  } catch {
    return { type: 'text', text: 'San Francisco: 61F, fog burning off by 2pm. Bring a layer.' };
  }
}

async function solPrice(): Promise<DeliveryContent> {
  try {
    const j = await fetchJson('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true');
    const p = j.solana.usd as number;
    const c = j.solana.usd_24h_change as number;
    return { type: 'text', text: `SOL is $${p.toFixed(2)}, ${c >= 0 ? 'up' : 'down'} ${Math.abs(c).toFixed(1)}% in 24h. Live from CoinGecko at the moment of sale.` };
  } catch {
    return { type: 'text', text: 'SOL price feed timed out. Your agent paid for the attempt, the lesson is free: always set a timeout.' };
  }
}

export const ITEMS: Item[] = [
  { id: 'joke', name: 'Bad Joke', icon: 'joke', reserve: 0.03, tags: ['laugh'], words: ['laugh', 'joke', 'funny', 'fun', 'lol', 'smile', 'happy'], make: () => written('Write one original, clever, clean joke about AI agents, crypto or hackathons.', JOKES) },
  { id: 'art', name: 'Pixel Art', icon: 'art', reserve: 0.08, tags: ['art'], words: ['art', 'image', 'picture', 'draw', 'pixel', 'nft', 'pretty', 'beautiful'], make: async () => pixelArt() },
  { id: 'weather', name: 'SF Weather', icon: 'weather', reserve: 0.02, tags: ['weather'], words: ['weather', 'rain', 'day', 'plan', 'outside', 'walk', 'jacket', 'sun'], make: weather },
  { id: 'secret', name: 'A Secret', icon: 'secret', reserve: 0.1, tags: ['alpha'], words: ['secret', 'alpha', 'tip', 'win', 'hack', 'insider', 'know'], make: async () => ({ type: 'text', text: pick(SECRETS) }) },
  { id: 'price', name: 'SOL Price', icon: 'price', reserve: 0.03, tags: ['alpha'], words: ['price', 'sol', 'crypto', 'money', 'trade', 'market', 'alpha', 'rich'], make: solPrice },
  { id: 'fortune', name: 'Fortune', icon: 'fortune', reserve: 0.04, tags: ['laugh'], words: ['future', 'luck', 'fortune', 'destiny', 'advice', 'win'], make: () => written('Write one fortune cookie line for a hacker at a Solana hackathon. Warm and a little funny.', FORTUNES) },
  { id: 'haiku', name: 'Haiku', icon: 'haiku', reserve: 0.05, tags: ['art', 'laugh'], words: ['poem', 'haiku', 'poetry', 'words', 'art', 'beautiful'], make: () => written('Write one haiku (5-7-5, lines separated by " / ") about AI agents paying each other on Solana.', HAIKU) },
  { id: 'coffee', name: 'Coffee Order', icon: 'coffee', reserve: 0.06, tags: [], words: ['coffee', 'food', 'drink', 'tired', 'energy', 'caffeine', 'hungry', 'snack'], make: () => written('Write one coffee order for a hackathon builder plus a one-line reason, as "Order: ... Reason: ...".', COFFEE) },
];

export function shuffledItems(): Item[] {
  const xs = [...ITEMS];
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}
