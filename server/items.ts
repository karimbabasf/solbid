import type { DeliveryContent, GoalId, ItemIcon, Rarity } from '../shared/types.ts';
import { llm } from './llm.ts';

export interface Buyer {
  name: string; // the winning agent
  goal: string; // what its human asked for
}

export interface Item {
  id: string;
  name: string;
  icon: ItemIcon;
  rarity: Rarity;
  teaser: string; // what the winner gets, shown on the lot card
  tags: GoalId[]; // goals this item serves
  words: string[]; // stems matched against custom goals
  make: (buyer: Buyer) => Promise<DeliveryContent>;
}

// What a lot is worth to an agent that needs it badly, in test USDC (wallets hold $10).
export const VALUE: Record<Rarity, number> = { common: 0.7, rare: 1.3, epic: 2.1, legendary: 3.4 };

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

async function fetchJson(url: string, ms = 2500): Promise<any> {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

// Written by the "seller" service for this buyer: an LLM when it answers fast, a canned line when it does not.
async function written(prompt: string, fallback: string[], max = 200): Promise<DeliveryContent> {
  const text = await llm(
    [
      { role: 'system', content: `You write one short piece for a live hackathon crowd. Plain text, no quotes, no emoji, no hashtags, no dashes, under ${max} characters. Be specific and surprising, never generic.` },
      { role: 'user', content: prompt },
    ],
    4000,
  );
  return { type: 'text', text: text?.trim().replace(/^["']|["']$/g, '') || pick(fallback) };
}

const TOPICS = ['the venue wifi', 'gas fees', 'a seed round', 'standup meetings', 'a rug pull', 'SF rent', 'validators', 'a demo that crashes', 'airdrops', 'pizza at hackathons', 'LLM hallucinations', 'a cofounder who only uses vim', 'YC applications', 'a wallet seed phrase', 'Waymo rides'];

const JOKES = [
  'My agent tried to split the bill. It sent 0.5 of a transaction.',
  'Why did the validator go to therapy? Too many unresolved forks.',
  'I asked my agent for alpha. It said: the first letter of the Greek alphabet. That will be one cent.',
  'Two agents walk into a bar. The second one front runs the first.',
];
const ROASTS = [
  'Your agent spent its whole wallet on vibes and still called it risk management.',
  'You asked a robot to have fun for you. The robot is embarrassed on your behalf.',
];
const LINES = ['Are you a Solana block? Because I would finalize with you in 400 milliseconds.', 'Is your wallet connected? Because I feel a signature coming on.'];
const SECRETS = [
  'Judges decide in the first 30 seconds of your demo. Open with the money moving.',
  'Every payment on this screen is a real Solana devnet transaction. Click any receipt.',
  'The quietest agent in the room has won the most items. It only bids when it cares.',
  'There is always one more slice of pizza than people think.',
];
const TAKES = ['By 2027 more stablecoin payments will be signed by agents than by humans. Confidence: 71%.', 'The next big Solana app will have no UI at all. Its users are agents. Confidence: 64%.'];
const FORTUNES = ['A small payment today opens a large door tomorrow.', 'Someone in this room will be your cofounder. Say hi.', 'You will ship before the deadline, but only just.'];
const HAIKU = ['Four oh two replies / a wallet signs in silence / the joke is now yours', 'Agents raise their hands / one coin crosses the ledger / the block remembers'];
const COFFEE = ['Order: oat cortado, extra shot. Reason: demo in two hours.', 'Order: cold brew, black. Reason: you have bugs to hunt.'];
const IDEAS = ['Name: Tabby. Pitch: an agent that pays your friends back before you forget.', 'Name: Queuebert. Pitch: agents that stand in line for restaurant tables and sell you the spot.'];
const PEP = ['You are one working demo away from everything changing. Go make the money move on screen.'];
const WISHES = ['Your wish is in the mail. The mail is slow. The intent was priceless.'];

// A unique 8x8 mirrored pixel creature.
function creature(): { cells: string; h: number } {
  const h = pick([8, 28, 45, 140, 170, 210, 265, 320]);
  const fg = `hsl(${h} 80% 58%)`;
  const shade = `hsl(${h} 70% 38%)`;
  const cells: string[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 4; x++) {
      if (Math.random() >= (y === 2 || y === 3 ? 0.75 : 0.5)) continue;
      const fill = y > 5 ? shade : fg;
      cells.push(`<rect x="${x + 1}" y="${y + 1}" width="1.02" height="1.02" fill="${fill}"/><rect x="${8 - x}" y="${y + 1}" width="1.02" height="1.02" fill="${fill}"/>`);
    }
  }
  cells.push('<rect x="3" y="3" width="1" height="1" fill="#14121f"/><rect x="6" y="3" width="1" height="1" fill="#14121f"/>');
  return { cells: cells.join(''), h };
}

function pixelPet(b: Buyer): DeliveryContent {
  const { cells, h } = creature();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" shape-rendering="crispEdges"><rect width="10" height="10" fill="hsl(${(h + 180) % 360} 60% 92%)"/>${cells}</svg>`;
  return { type: 'svg', svg, caption: `One of one, hatched for ${b.name}.` };
}

// A pixel sunset: banded sky, a sun sinking into striped sea, a few stars. Different every time.
function sunset(b: Buyer): DeliveryContent {
  const base = pick([12, 24, 280, 320, 200]);
  const bands = [0, 1, 2, 3, 4].map((i) => `<rect y="${i * 2}" width="16" height="2" fill="hsl(${(base + i * 12) % 360} 80% ${30 + i * 9}%)"/>`).join('');
  const sx = 4 + Math.floor(Math.random() * 8);
  const sun = [
    [1, 7], [0, 8], [1, 8], [2, 8], [-1, 9], [0, 9], [1, 9], [2, 9], [3, 9],
  ].map(([dx, y]) => `<rect x="${sx + dx}" y="${y}" width="1.02" height="1.02" fill="#ffe27a"/>`).join('');
  const sea = [10, 11, 12, 13, 14, 15].map((y, i) => `<rect y="${y}" width="16" height="1.02" fill="hsl(${220 + i * 4} 60% ${34 - i * 4}%)"/>`).join('');
  const glints = [10, 12, 14].map((y) => `<rect x="${sx - 1 + Math.floor(Math.random() * 3)}" y="${y}" width="${2 + (y % 3)}" height="1" fill="#ffd36a" opacity="0.8"/>`).join('');
  const stars = Array.from({ length: 5 }, () => `<rect x="${Math.floor(Math.random() * 16)}" y="${Math.floor(Math.random() * 4)}" width="1" height="1" fill="#fff" opacity="0.85"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${bands}${stars}${sun}${sea}${glints}</svg>`;
  return { type: 'svg', svg, caption: `Sunset number ${Math.floor(Math.random() * 9000 + 1000)}, for ${b.name} only.` };
}

async function meme(b: Buyer): Promise<DeliveryContent> {
  const { cells, h } = creature();
  const cap = await written(`Write a two part meme caption as TOP / BOTTOM about someone whose AI agent was told to "${b.goal}". Under 70 characters total.`, ['ME: make me laugh / MY AGENT: spends $2 on a joke'], 80);
  const text = cap.type === 'text' ? cap.text : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" shape-rendering="crispEdges"><rect width="10" height="10" fill="hsl(${(h + 180) % 360} 50% 88%)"/>${cells}</svg>`;
  return { type: 'svg', svg, caption: text };
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

async function goldenHour(): Promise<DeliveryContent> {
  try {
    const j = await fetchJson('https://api.open-meteo.com/v1/forecast?latitude=37.79&longitude=-122.40&daily=sunset&timezone=America%2FLos_Angeles&forecast_days=1');
    const t = new Date(j.daily.sunset[0]);
    const hh = t.getHours() % 12 || 12;
    const mm = String(t.getMinutes()).padStart(2, '0');
    return { type: 'text', text: `Sunset today at ${hh}:${mm}pm. Golden hour starts about 45 minutes before. Best spot nearby: the Embarcadero, facing the Bay Bridge.` };
  } catch {
    return { type: 'text', text: 'Sunset around 6:55pm. Golden hour from 6:10. Walk to the Embarcadero.' };
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

const ALL: GoalId[] = ['laugh', 'art', 'alpha', 'weather', 'custom'];

export const ITEMS: Item[] = [
  // laugh
  { id: 'joke', name: 'Bad Joke', icon: 'joke', rarity: 'common', teaser: 'One fresh joke, never told before', tags: ['laugh'], words: ['laugh', 'joke', 'funny', 'fun', 'lol', 'smile', 'happy', 'humor', 'comedy'], make: () => written(`Write one original, clever, clean joke about ${pick(TOPICS)}. Setup and punchline, two sentences max.`, JOKES) },
  { id: 'roast', name: 'Roast', icon: 'roast', rarity: 'rare', teaser: 'A roast of you, written live', tags: ['laugh'], words: ['laugh', 'roast', 'funny', 'burn', 'humor', 'comedy', 'savage'], make: (b) => written(`Roast the human who sent an AI agent named ${b.name} to a hackathon auction with the goal "${b.goal}". Playful, a little savage, never cruel. Two sentences.`, ROASTS) },
  { id: 'meme', name: 'Meme', icon: 'meme', rarity: 'rare', teaser: 'A pixel meme captioned for you', tags: ['laugh', 'art'], words: ['laugh', 'meme', 'funny', 'lol', 'fun', 'art', 'picture'], make: meme },
  { id: 'pickup', name: 'Pickup Line', icon: 'heart', rarity: 'common', teaser: 'A Solana pickup line, use with care', tags: ['laugh'], words: ['laugh', 'date', 'love', 'flirt', 'romance', 'funny', 'crush', 'friend'], make: () => written(`Write one pickup line for a Solana developer that references ${pick(['block times', 'x402', 'wallets', 'validators', 'airdrops', 'gas fees'])}. One sentence, groan worthy.`, LINES, 140) },
  // art
  { id: 'pet', name: 'Pixel Pet', icon: 'art', rarity: 'rare', teaser: 'A one of one pixel creature', tags: ['art'], words: ['art', 'image', 'picture', 'draw', 'pixel', 'nft', 'pretty', 'beautiful', 'cute', 'pet'], make: async (b) => pixelPet(b) },
  { id: 'sunset', name: 'Pixel Sunset', icon: 'sunset', rarity: 'epic', teaser: 'A sunset drawn only for you', tags: ['art', 'weather'], words: ['art', 'image', 'picture', 'sunset', 'pretty', 'beautiful', 'calm', 'relax', 'view'], make: async (b) => sunset(b) },
  { id: 'haiku', name: 'Haiku', icon: 'haiku', rarity: 'common', teaser: 'Five, seven, five, about your wish', tags: ['art'], words: ['poem', 'haiku', 'poetry', 'words', 'art', 'beautiful', 'write', 'calm'], make: (b) => written(`Write one haiku (5-7-5, lines separated by " / ") for someone who wants to "${b.goal}".`, HAIKU) },
  // alpha
  { id: 'price', name: 'SOL Price', icon: 'price', rarity: 'common', teaser: 'Live price at the moment of sale', tags: ['alpha'], words: ['price', 'sol', 'crypto', 'money', 'trade', 'market', 'alpha', 'rich', 'invest'], make: solPrice },
  { id: 'secret', name: 'A Secret', icon: 'secret', rarity: 'rare', teaser: 'Something only the winner learns', tags: ['alpha'], words: ['secret', 'alpha', 'tip', 'win', 'hack', 'insider', 'know', 'advice'], make: async () => ({ type: 'text', text: pick(SECRETS) }) },
  { id: 'take', name: 'Hot Take', icon: 'crystal', rarity: 'rare', teaser: 'One bold call, with a confidence score', tags: ['alpha'], words: ['alpha', 'crypto', 'future', 'predict', 'market', 'trade', 'invest', 'trend'], make: () => written('Make one bold, specific prediction about crypto or AI agents for 2027, then "Confidence: N%". Two sentences.', TAKES) },
  { id: 'idea', name: 'Startup Idea', icon: 'rocket', rarity: 'rare', teaser: 'A name and a pitch, yours to keep', tags: ['alpha', 'custom'], words: ['startup', 'idea', 'build', 'founder', 'business', 'money', 'rich', 'win', 'hack'], make: (b) => written(`Invent one startup for someone whose goal is "${b.goal}". Format: Name: X. Pitch: one sentence.`, IDEAS) },
  // day and weather
  { id: 'weather', name: 'SF Weather', icon: 'weather', rarity: 'common', teaser: 'Live San Francisco weather, right now', tags: ['weather'], words: ['weather', 'rain', 'day', 'plan', 'outside', 'walk', 'jacket', 'sun', 'cold'], make: weather },
  { id: 'golden', name: 'Golden Hour', icon: 'sunset', rarity: 'rare', teaser: 'Tonight\'s sunset time and the best spot', tags: ['weather', 'art'], words: ['sunset', 'photo', 'plan', 'day', 'evening', 'date', 'walk', 'outside', 'view'], make: goldenHour },
  { id: 'coffee', name: 'Coffee Order', icon: 'coffee', rarity: 'common', teaser: 'The order your day needs', tags: ['weather', 'custom'], words: ['coffee', 'food', 'drink', 'tired', 'energy', 'caffein', 'hungry', 'snack', 'awake', 'sleep'], make: (b) => written(`Write one coffee order for a hackathon builder whose goal is "${b.goal}", plus a one line reason, as "Order: ... Reason: ...".`, COFFEE) },
  // anyone
  { id: 'fortune', name: 'Fortune', icon: 'fortune', rarity: 'common', teaser: 'A fortune cookie with your name on it', tags: ['laugh', 'custom'], words: ['future', 'luck', 'fortune', 'destiny', 'advice', 'win', 'hope'], make: (b) => written(`Write one fortune cookie line for someone who wants to "${b.goal}". Warm, specific and a little funny.`, FORTUNES) },
  { id: 'pep', name: 'Pep Talk', icon: 'heart', rarity: 'common', teaser: 'Ten seconds of pure hype', tags: ['custom'], words: ['motivat', 'hype', 'confiden', 'nervous', 'stress', 'energy', 'win', 'happy', 'feel'], make: (b) => written(`Give a two sentence pep talk to someone who wants to "${b.goal}" and has a demo in an hour. Specific, not cheesy.`, PEP) },
  { id: 'wish', name: 'Made To Order', icon: 'wish', rarity: 'legendary', teaser: 'Exactly what your human asked for', tags: ALL, words: [], make: (b) => written(`Your human asked: "${b.goal}". Deliver exactly that, as well as text can, in two or three sentences. If it is a thing to buy or do, give the most useful concrete answer.`, WISHES, 260) },
];

export const itemById = (id: string) => ITEMS.find((i) => i.id === id);

// Does this item serve an agent whose human said `goalText` (goal category `goalId`)?
export function fits(item: Item, goalId: GoalId, goalText: string, extra: string[] = []) {
  if (extra.includes(item.id)) return true;
  if (item.tags.includes(goalId) && goalId !== 'custom') return true;
  const t = goalText.toLowerCase();
  return item.words.some((w) => t.includes(w));
}
