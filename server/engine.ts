import { randomBytes } from 'node:crypto';
import type { AgentPublic, AuctionState, Bid, Delivery, DeliveryContent, GoalId, JoinRequest, JoinResponse, Lot, MeState, Payment, Phase, Raise } from '../shared/types.ts';
import { START_BUDGET, decide, goalWords, limitFor, matchGoal, riskOf, type Mind, type Plan } from './brain.ts';
import { ITEMS, fits, itemById, type Item } from './items.ts';

// The payment rail, loaded at boot. A simulated rail stands in if the real one fails to load, so the show goes on.
export interface PayRail {
  initPayments(): Promise<{ network: 'devnet'; mode: 'x402' | 'transfer' | 'sim'; treasury: string; mint: string; reason?: string }>;
  payInfo(): { network: 'devnet'; mode: 'x402' | 'transfer' | 'sim'; treasury: string; mint: string; reason?: string };
  newWallet(): { pubkey: string; secret: string };
  fundAgent(pubkey: string, usd: number): Promise<{ status: 'confirmed' | 'failed' | 'simulated'; sig?: string }>;
  getBalance(pubkey: string): Promise<number | null>;
  setLotPrice(lotId: string, p: { usd: number; payTo?: string; payer?: string; description: string }): void;
  payX402(wallet: { pubkey: string; secret: string }, url: string): Promise<{ status: 'confirmed' | 'failed' | 'simulated'; sig?: string; body?: unknown; error?: string }>;
  explorer(sig: string): string;
}

interface Agent extends AgentPublic {
  secret: string;
  key: string; // signs act and leave from the guest's phone
  boldness: number;
  fits: string[]; // item ids a model matched to a custom goal
  servedAt: number; // last time a lot was picked for this guest
  deliveries: Delivery[];
}

const NAMES = ['PIP', 'ZED', 'MOXY', 'BOLT', 'KIKI', 'RUNE', 'NOVA', 'TAKO', 'FIZZ', 'OKRA', 'JUNO', 'BEEP', 'DOT', 'LUMA', 'ZIGGY', 'MOCHI', 'PRISM', 'RAVI', 'TOFU', 'VEGA', 'WREN', 'YUZU', 'KOI', 'NOODLE'];
const GOALS: GoalId[] = ['laugh', 'art', 'alpha', 'weather', 'custom'];
const BOTS: { name: string; goal: GoalId; text?: string; boldness: number; color: number; sprite: number }[] = [
  { name: 'DEGEN', goal: 'alpha', boldness: 1.05, color: 6, sprite: 2 },
  { name: 'POET', goal: 'art', boldness: 0.7, color: 4, sprite: 3 },
  { name: 'CLOWN', goal: 'laugh', boldness: 0.8, color: 1, sprite: 0 },
  { name: 'SCOUT', goal: 'weather', boldness: 0.7, color: 3, sprite: 1 },
  { name: 'BARISTA', goal: 'custom', text: 'keep me caffeinated', boldness: 0.85, color: 2, sprite: 3 },
  { name: 'ORACLE', goal: 'custom', text: 'tell me my future', boldness: 0.75, color: 5, sprite: 1 },
];
// A live demo stays readable: at most this many agents on stage. House bots give up their seats to guests.
const MAX_AGENTS = Number(process.env.MAX_AGENTS) || 12;
const MAX_PAYMENTS = 24;
const FUND_USD = START_BUDGET; // devnet test USDC from our own mint, so every agent starts with ten
const OPEN = 0.01; // every lot opens at one cent
const MIN_PLAYERS = Math.max(1, Number(process.env.MIN_PLAYERS) || 3); // a war needs rivals, so lots wait for a few people
const T = { intro: 2200, thinkingMin: 1500, decideMax: 6000, firstRaise: 450, hold: 1600, payingMin: 1500, sold: 4500, unsold: 2200 };

let rail: PayRail;
let port = 8787;
let joinUrl = '';

const agents = new Map<string, Agent>();
let phase: Phase = 'lobby';
let phaseEndsAt = 0;
let lot: Lot | null = null;
let winner: AuctionState['winner'] = null;
let payments: Payment[] = [];
let lotsSold = 0;
let lotCounter = 0;
let paused = false;
let recent: string[] = [];
let botCount = 0;
let generation = 0; // bumped by a restart; a lot from an older generation stops at its next await

// The bidding war for the current lot.
let plans = new Map<string, Plan>();
let ladder: Raise[] = [];
let out = new Set<string>();
let manual = new Map<string, 'bid' | 'pass'>();
let forced: string[] = [];
let going = false;
let nextAmt = OPEN;
let stepBase = 0.05;

// ---------- broadcast ----------

type Client = { agentId?: string; send: (event: string, data: string) => void };
const clients = new Set<Client>();
let flushTimer: NodeJS.Timeout | null = null;

// Lots (and their model calls) only run while someone is watching: an open stream or a recent poll.
let lastViewer = 0;
export const touchViewer = () => {
  lastViewer = Date.now();
};
const watched = () => clients.size > 0 || Date.now() - lastViewer < 45_000;

export function addClient(c: Client) {
  clients.add(c);
  c.send('state', JSON.stringify(snapshot()));
  if (c.agentId) c.send('me', JSON.stringify(meState(c.agentId)));
  return () => clients.delete(c);
}

function broadcast() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const s = JSON.stringify(snapshot());
    for (const c of clients) {
      c.send('state', s);
      if (c.agentId) c.send('me', JSON.stringify(meState(c.agentId)));
    }
  }, 40);
}

const pub = (a: Agent): AgentPublic => ({ id: a.id, name: a.name, color: a.color, sprite: a.sprite, goal: a.goal, goalText: a.goalText, wallet: a.wallet, balance: a.balance, funded: a.funded, house: a.house, wins: a.wins, spent: a.spent, joinedAt: a.joinedAt, via: a.via });

const price = () => ladder.at(-1)?.amount ?? 0;
function findLast<T>(xs: T[], f: (x: T) => boolean): T | undefined {
  for (let i = xs.length - 1; i >= 0; i--) if (f(xs[i])) return xs[i];
  return undefined;
}
const lastRaise = (id: string) => findLast(ladder, (r) => r.agentId === id)?.amount ?? null;

function bidsView(): Bid[] {
  const view: Bid[] = [];
  for (const p of plans.values()) {
    if (!agents.has(p.agentId)) continue;
    const amount = lastRaise(p.agentId);
    const m = manual.get(p.agentId);
    const state: Bid['state'] = out.has(p.agentId) ? (amount === null && m === 'pass' ? 'pass' : 'out') : p.max > 0 || amount !== null ? 'in' : 'pass';
    view.push({ agentId: p.agentId, amount, need: p.need, risk: p.risk, reason: p.reason, state, manual: m });
  }
  return view;
}

export function snapshot(): AuctionState {
  const info = rail.payInfo();
  const open = phase === 'reveal' || phase === 'paying' || phase === 'sold' || phase === 'unsold';
  return {
    phase,
    phaseEndsAt,
    lot,
    bids: open ? bidsView() : [],
    winner,
    ladder: open ? ladder.filter((r) => agents.has(r.agentId)) : [],
    price: open ? price() : 0,
    next: lot ? nextAmt : OPEN,
    going: phase === 'reveal' && going,
    agents: [...agents.values()].map(pub),
    payments,
    network: 'devnet',
    payMode: info.mode,
    joinUrl,
    enterUrl: process.env.ENTER_URL ? `${process.env.ENTER_URL.replace(/\/$/, '')}/enter` : undefined,
    lotsSold,
    minPlayers: MIN_PLAYERS,
    paused,
    serverTime: Date.now(),
  };
}

export function meState(id: string): MeState {
  const a = agents.get(id);
  return { agent: a ? pub(a) : null, deliveries: a ? a.deliveries : [] };
}

// ---------- timing ----------

let wake: (() => void) | null = null;
function sleep(ms: number) {
  return new Promise<void>((res) => {
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      if (wake === done) wake = null;
      res();
    }
    wake = done;
  });
}

// A war pause that a phone's BID cuts short. Resolves true when poked.
let poke: (() => void) | null = null;
function pause(ms: number) {
  return new Promise<boolean>((res) => {
    const t = setTimeout(() => finish(false), ms);
    const finish = (poked: boolean) => {
      clearTimeout(t);
      if (poke === hit) poke = null;
      res(poked);
    };
    const hit = () => finish(true);
    poke = hit;
  });
}

function setPhase(p: Phase, ms: number) {
  phase = p;
  phaseEndsAt = ms > 0 ? Date.now() + ms : 0;
  broadcast();
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

const round2 = (n: number) => Math.round(n * 100) / 100;
// Cut long text at a word boundary so a goal never ends mid-word.
const clip = (t: string, n: number) => {
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const sp = cut.lastIndexOf(' ');
  return sp > n * 0.6 ? cut.slice(0, sp) : cut;
};
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

// ---------- payments feed ----------

function pushPayment(p: Payment) {
  payments = [p, ...payments].slice(0, MAX_PAYMENTS);
  broadcast();
}

function patchPayment(id: string, patch: Partial<Payment>) {
  payments = payments.map((p) => (p.id === id ? { ...p, ...patch } : p));
  broadcast();
}

// ---------- agents ----------

function uniqueName(want?: string) {
  const clean = (want ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
  const taken = new Set([...agents.values()].map((a) => a.name));
  if (clean && !taken.has(clean)) return clean;
  if (clean) {
    for (let i = 2; i < 10; i++) if (!taken.has(`${clean.slice(0, 6)}${i}`)) return `${clean.slice(0, 6)}${i}`;
  }
  const free = NAMES.filter((n) => !taken.has(n));
  if (free.length) return free[Math.floor(Math.random() * free.length)];
  return `AG${agents.size + 1}`;
}

async function fund(a: Agent, refill = false) {
  const pid = `fund-${a.id}-${Date.now().toString(36)}`;
  pushPayment({ id: pid, kind: 'fund', agentId: a.id, amount: FUND_USD, status: 'pending', at: Date.now() });
  let r = await withTimeout(rail.fundAgent(a.wallet, FUND_USD), 30000, { status: 'failed' as const });
  if (r.status === 'failed') r = await withTimeout(rail.fundAgent(a.wallet, FUND_USD), 30000, { status: 'failed' as const });
  patchPayment(pid, { status: r.status, sig: r.sig, explorer: r.sig ? rail.explorer(r.sig) : undefined });
  if (refill && r.status !== 'failed') {
    // Read the chain rather than add locally, so a balance read racing this refill cannot count the money twice.
    const b = r.status === 'confirmed' ? await withTimeout(rail.getBalance(a.wallet), 8000, null) : null;
    a.balance = round2(b ?? a.balance + FUND_USD);
  }
  a.funded = true; // a failed fund still lets the agent play; its payments fall back down the rail
  broadcast();
}

function createAgent(o: { name?: string; goal: GoalId; text?: string; color?: number; sprite?: number; house?: boolean; boldness?: number }): Agent {
  const w = rail.newWallet();
  const id = `ag-${Math.random().toString(36).slice(2, 8)}`;
  const text = clip((o.text ?? '').replace(/[\u0000-\u001f<>]/g, '').trim(), 40);
  const goal: GoalId = GOALS.includes(o.goal) ? o.goal : 'custom';
  const a: Agent = {
    id,
    name: uniqueName(o.name),
    color: Number.isInteger(o.color) ? ((o.color! % 8) + 8) % 8 : Math.floor(Math.random() * 8),
    sprite: Number.isInteger(o.sprite) ? ((o.sprite! % 4) + 4) % 4 : Math.floor(Math.random() * 4),
    goal: goal === 'custom' && !text ? 'laugh' : goal,
    goalText: goalWords(goal, text),
    wallet: w.pubkey,
    secret: w.secret,
    key: randomBytes(12).toString('hex'),
    balance: FUND_USD,
    funded: false,
    house: !!o.house,
    wins: 0,
    spent: 0,
    joinedAt: Date.now(),
    boldness: o.boldness ?? 1 + Math.random() * 0.45, // guests out-bid the house bots more often than not
    fits: [],
    servedAt: 0, // a new guest is first in line for a lot picked for them
    deliveries: [],
  };
  agents.set(id, a);
  broadcast();
  void fund(a);
  if (a.goal === 'custom') void matchGoal(a.goalText).then((ids) => (a.fits = ids)).catch(() => {});
  return a;
}

function makeRoom() {
  if (agents.size < MAX_AGENTS) return true;
  const leader = ladder.at(-1)?.agentId;
  const bot = [...agents.values()].find((a) => a.house && a.id !== leader && a.id !== winner?.agentId);
  if (!bot) return false;
  agents.delete(bot.id);
  return true;
}

export function join(body: Partial<JoinRequest>): JoinResponse | { error: string } {
  if (!makeRoom()) return { error: 'The house is full. Try again in a minute.' };
  const a = createAgent({ goal: (body.goal as GoalId) ?? 'custom', text: body.text, color: body.color, sprite: body.sprite, name: body.name });
  return { agentId: a.id, key: a.key };
}

const keyOk = (a: Agent | undefined, key: unknown): a is Agent => !!a && typeof key === 'string' && key.length > 0 && key === a.key;

export function leave(id: string, key: unknown): { ok: boolean; error?: string } {
  const a = agents.get(id);
  if (!keyOk(a, key)) return { ok: false, error: 'Not your agent.' };
  agents.delete(id);
  forced = forced.filter((x) => x !== id);
  // Its raises go too, so the price, the leader and the next raise all fall back to whoever is still here.
  if (phase === 'reveal') {
    ladder = ladder.filter((r) => r.agentId !== id);
    nextAmt = computeNext();
  }
  broadcast();
  return { ok: true };
}

// The human takes over from their phone. Before the war BID means "I want this" and PASS means "skip it";
// during the war BID raises right now and PASS drops out.
export function act(id: string, key: unknown, action: unknown): { ok: boolean; error?: string } {
  const a = agents.get(id);
  if (!keyOk(a, key)) return { ok: false, error: 'Not your agent.' };
  if (action !== 'bid' && action !== 'pass') return { ok: false, error: 'Unknown action.' };
  if (phase === 'intro' || phase === 'thinking') {
    manual.set(id, action);
    broadcast();
    return { ok: true };
  }
  if (phase !== 'reveal') return { ok: false, error: 'Wait for the next lot.' };
  const leader = ladder.at(-1)?.agentId;
  if (action === 'pass') {
    if (leader === id) return { ok: false, error: 'You lead this one.' };
    manual.set(id, 'pass');
    out.add(id);
    forced = forced.filter((x) => x !== id);
    const p = plans.get(id);
    if (p) plans.set(id, { ...p, reason: 'You said pass.' });
    broadcast();
    return { ok: true };
  }
  if (leader === id) return { ok: false, error: 'You already lead.' };
  if (a.balance < nextAmt) return { ok: false, error: 'Not enough in the wallet.' };
  manual.set(id, 'bid');
  out.delete(id);
  const p = plans.get(id);
  plans.set(id, { agentId: id, need: Math.max(p?.need ?? 0, 90), reason: 'You told me to bid.', risk: riskOf(Math.max(p?.max ?? 0, nextAmt), a.balance), max: Math.max(p?.max ?? 0, nextAmt) });
  if (!forced.includes(id)) forced.push(id);
  poke?.();
  broadcast();
  return { ok: true };
}

// An outside agent paid for its seat through pay.sh: tag it and put the payment on the board.
export function markSeat(agentId: string, amount: number, receipt?: string) {
  const a = agents.get(agentId);
  if (!a) return;
  a.via = 'pay.sh';
  pushPayment({ id: `seat-${agentId}`, kind: 'seat', agentId, amount, status: 'confirmed', explorer: receipt, at: Date.now() });
}

export function addBots(n = 3) {
  for (let i = 0; i < n && agents.size < MAX_AGENTS - 2; i++) {
    const b = BOTS[botCount % BOTS.length];
    botCount++;
    createAgent({ ...b, house: true });
  }
}

// ---------- the auction ----------

const WEIGHT = { common: 4, rare: 3, epic: 2, legendary: 0 } as const;

// Most lots are picked for a guest, least recently served first, so everyone sees their kind of thing soon.
function nextItem(): { item: Item; forAgentId?: string } {
  const pool = ITEMS.filter((i) => !recent.includes(i.id));
  const guests = [...agents.values()].filter((a) => !a.house && a.funded && a.balance >= 0.05).sort((x, y) => x.servedAt - y.servedAt);
  if (guests.length && Math.random() < 0.75) {
    for (const g of guests) {
      const matching = pool.filter((i) => i.id !== 'wish' && fits(i, g.goal, g.goalText, g.fits));
      if (matching.length) {
        g.servedAt = Date.now();
        return { item: pick(matching), forAgentId: g.id };
      }
    }
  }
  const wish = itemById('wish')!;
  if (pool.includes(wish) && Math.random() < 0.15) return { item: wish };
  const bag = pool.flatMap((i) => Array<Item>(WEIGHT[i.rarity]).fill(i));
  return { item: pick(bag.length ? bag : ITEMS) };
}

function minds(): Mind[] {
  return [...agents.values()].map((a) => ({ id: a.id, goal: a.goalText, goalId: a.goal, balance: a.balance, boldness: a.boldness, ready: a.funded, fits: a.fits }));
}

const nice = (n: number) => (n < 1 ? Math.ceil(n * 100 - 1e-9) / 100 : Math.ceil(n * 20 - 1e-9) / 20);

function computeNext() {
  const p = price();
  if (p === 0) return OPEN;
  const step = Math.max(0.01, (stepBase + p * 0.08) * (0.7 + Math.random() * 0.7));
  return Math.max(nice(p + step), round2(p + 0.01));
}

// Apply what humans pressed before the war: WANT IT lifts the agent's limit, SKIP zeroes it.
function applyOverrides(item: Item) {
  for (const [id, m] of manual) {
    const a = agents.get(id);
    if (!a) continue;
    const p = plans.get(id) ?? { agentId: id, need: 0, reason: '', risk: 'low' as const, max: 0 }; // joined after the model call
    if (m === 'pass') plans.set(id, { ...p, max: 0, reason: 'You said skip.' });
    else {
      const max = Math.max(p.max, limitFor(item, 97, a.balance, Math.max(a.boldness, 1.2), OPEN));
      plans.set(id, { ...p, need: Math.max(p.need, 95), max, risk: riskOf(max, a.balance), reason: 'You said you want it.' });
    }
  }
}

const live = (id: string) => agents.has(id) && !out.has(id);

async function war(gen: number) {
  ladder = [];
  going = false;
  nextAmt = OPEN;
  const maxes = [...plans.values()].map((p) => p.max).filter((m) => m > 0).sort((x, y) => y - x);
  // Size the steps so a close fight takes about eight raises.
  stepBase = Math.min(0.4, Math.max(0.02, ((maxes[1] ?? maxes[0] ?? 0.2) - OPEN) / 9));
  setPhase('reveal', 3000);
  await pause(T.firstRaise);
  let raises = 0;
  for (let guard = 0; guard < 80; guard++) {
    while (paused && gen === generation) await sleep(250); // Space mid-war holds the war where it is
    if (gen !== generation) return;
    const leader = ladder.at(-1)?.agentId;
    let raiser: string | undefined;
    let byHand = false;
    while (forced.length && !raiser) {
      const id = forced.shift()!;
      const a = agents.get(id);
      if (a && id !== leader && a.balance >= nextAmt) {
        raiser = id;
        byHand = true;
      }
    }
    if (!raiser) {
      for (const p of plans.values()) if (p.agentId !== leader && p.max > 0 && p.max < nextAmt && live(p.agentId)) out.add(p.agentId);
      const rivals = [...plans.values()].filter((p) => p.agentId !== leader && p.max >= nextAmt && live(p.agentId)).map((p) => p.agentId);
      if (!rivals.length) {
        if (!ladder.some((r) => agents.has(r.agentId))) return;
        going = true;
        setPhase('reveal', T.hold);
        if (await pause(T.hold)) {
          going = false;
          continue;
        }
        return;
      }
      const fresh = rivals.filter((id) => lastRaise(id) === null);
      raiser = fresh.length && Math.random() < 0.7 ? pick(fresh) : pick(rivals);
    }
    ladder = [...ladder, { agentId: raiser, amount: nextAmt, at: Date.now(), ...(byHand ? { manual: true } : {}) }];
    going = false;
    raises++;
    nextAmt = computeNext();
    setPhase('reveal', 3000);
    await pause(raises < 3 ? 700 : raises < 7 ? 560 : 440);
  }
}

async function runLot() {
  const gen = generation;
  const stale = () => gen !== generation;
  const { item, forAgentId } = nextItem();
  recent = [item.id, ...recent].slice(0, 5);
  lotCounter++;
  const info = rail.payInfo();
  const current: Lot = { id: `lot-${lotCounter}-${Date.now().toString(36)}`, index: lotCounter, total: 0, itemId: item.id, name: item.name, icon: item.icon, reserve: OPEN, open: OPEN, rarity: item.rarity, teaser: item.teaser, forAgentId, seller: info.treasury };
  lot = current;
  plans = new Map();
  ladder = [];
  out = new Set();
  manual = new Map();
  forced = [];
  going = false;
  nextAmt = OPEN;
  winner = null;
  const started = Date.now();
  // The model starts judging while the lot is being introduced.
  const decided = withTimeout(decide(item, minds(), OPEN), T.decideMax, null);
  setPhase('intro', T.intro);
  await sleep(T.intro);
  if (stale()) return;

  setPhase('thinking', Math.max(T.thinkingMin, T.decideMax - T.intro)); // the fuse covers the longest the model may take
  const d = await decided;
  const minLeft = T.thinkingMin - (Date.now() - started - T.intro);
  if (minLeft > 0) await sleep(minLeft);
  if (stale()) return;
  for (const p of d?.plans ?? []) plans.set(p.agentId, p);
  applyOverrides(item);

  await war(gen);
  if (stale()) return;

  const top = findLast(ladder, (r) => agents.has(r.agentId));
  const agent = top ? agents.get(top.agentId) : undefined;
  if (!top || !agent) {
    setPhase('unsold', T.unsold);
    await sleep(T.unsold);
    return;
  }

  const amount = top.amount;
  winner = { agentId: agent.id, amount };
  setPhase('paying', 0);
  const pid = `x402-${current.id}`;
  pushPayment({ id: pid, kind: 'x402', agentId: agent.id, amount, status: 'pending', lotId: current.id, at: Date.now() });

  const content = withTimeout<DeliveryContent>(item.make({ name: agent.name, goal: agent.goalText }), 6000, { type: 'text', text: `${item.name}: delivered.` });
  rail.setLotPrice(current.id, { usd: amount, payer: agent.wallet, description: `${item.name}, SolBid lot ${current.index}` });
  const minShow = sleep(T.payingMin);
  const res = await withTimeout(rail.payX402({ pubkey: agent.wallet, secret: agent.secret }, `http://127.0.0.1:${port}/x402/lot/${current.id}`), 35000, { status: 'failed' as const, error: 'timeout' });
  await minShow;
  if (stale()) return; // a restart gave this agent a fresh wallet; the old wallet's payment is history
  const explorer = res.sig ? rail.explorer(res.sig) : undefined;
  patchPayment(pid, { status: res.status, sig: res.sig, explorer });

  if (res.status === 'failed') {
    console.warn(`[pay] lot ${current.id} failed: ${res.error ?? 'unknown'}`);
    // Trust the chain over our count: if the wallet cannot cover the price, stop this agent from winning lots it cannot pay for.
    // A wallet at zero that never spent means its first funding never landed (devnet rate limits), so fund it again.
    void withTimeout(rail.getBalance(agent.wallet), 8000, null).then((b) => {
      if (b === null || !Number.isFinite(b) || stale() || b >= amount) return;
      agent.balance = round2(b);
      if (b < OPEN && agent.spent === 0) void fund(agent, true);
      broadcast();
    });
    winner = null;
    setPhase('unsold', T.unsold);
    await sleep(T.unsold);
    return;
  }

  if (stale()) return;
  agent.balance = round2(Math.max(0, agent.balance - amount));
  agent.spent = round2(agent.spent + amount);
  agent.wins++;
  lotsSold++;
  const delivered = await content;
  if (stale()) return;
  const delivery: Delivery = { lotId: current.id, agentId: agent.id, icon: item.icon, name: item.name, price: amount, content: delivered, sig: res.sig, explorer, at: Date.now() };
  agent.deliveries = [delivery, ...agent.deliveries].slice(0, 30);
  setPhase('sold', T.sold);
  // House bots keep the room lively: when one runs low it gets another ten, on chain like everyone else.
  if (agent.house && agent.balance < 1.5) void fund(agent, true);
  if (res.status === 'confirmed') {
    void rail.getBalance(agent.wallet).then((b) => {
      if (b !== null && Number.isFinite(b) && !stale()) {
        agent.balance = round2(b);
        broadcast();
      }
    });
  }
  await sleep(T.sold);
}

const canPlay = () => [...agents.values()].filter((a) => a.funded && a.balance >= OPEN).length >= MIN_PLAYERS;

async function loop() {
  for (;;) {
    try {
      if (paused || !canPlay() || !watched()) {
        if (phase !== 'lobby') {
          lot = null;
          plans = new Map();
          ladder = [];
          winner = null;
          going = false;
          setPhase('lobby', 0);
        }
        await sleep(800);
        continue;
      }
      await runLot();
    } catch (e) {
      console.error('[engine] lot crashed, moving on', e);
      winner = null;
      going = false;
      setPhase('unsold', 2000);
      await sleep(2000);
    }
  }
}

// ---------- host ----------

// A new game with the same room: every agent gets a fresh wallet with $10 on chain, and the lot count and leaderboard start over.
function restart() {
  generation++;
  lot = null;
  plans = new Map();
  ladder = [];
  out = new Set();
  manual = new Map();
  forced = [];
  going = false;
  nextAmt = OPEN;
  winner = null;
  lotsSold = 0;
  lotCounter = 0;
  recent = [];
  payments = [];
  for (const a of agents.values()) {
    const w = rail.newWallet();
    Object.assign(a, { wallet: w.pubkey, secret: w.secret, balance: FUND_USD, funded: false, wins: 0, spent: 0, servedAt: 0 });
    void fund(a);
  }
  setPhase('lobby', 0);
  wake?.();
  poke?.();
}

export function host(action: string) {
  if (action === 'start') paused = false;
  else if (action === 'pause') paused = true;
  else if (action === 'next') wake?.();
  else if (action === 'bots') addBots(3);
  else if (action === 'restart') restart();
  else if (action === 'reset') {
    agents.clear();
    payments = [];
    lotsSold = 0;
    lotCounter = 0;
    recent = [];
    botCount = 0;
    wake?.();
  } else return false;
  broadcast();
  return true;
}

export function start(opts: { rail: PayRail; port: number; joinUrl: string; bots: number }) {
  rail = opts.rail;
  port = opts.port;
  joinUrl = opts.joinUrl;
  addBots(opts.bots);
  void loop();
}

export function setJoinUrl(url: string) {
  joinUrl = url;
  broadcast();
}
