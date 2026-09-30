import type { AgentPublic, AuctionState, Bid, Delivery, DeliveryContent, GoalId, JoinRequest, Lot, MeState, Payment, Phase } from '../shared/types.ts';
import { decide, goalWords, type Mind } from './brain.ts';
import { ITEMS, shuffledItems, type Item } from './items.ts';

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
  boldness: number;
  deliveries: Delivery[];
}

const NAMES = ['PIP', 'ZED', 'MOXY', 'BOLT', 'KIKI', 'RUNE', 'NOVA', 'TAKO', 'FIZZ', 'OKRA', 'JUNO', 'BEEP', 'DOT', 'LUMA', 'ZIGGY', 'MOCHI', 'PRISM', 'RAVI', 'TOFU', 'VEGA', 'WREN', 'YUZU', 'KOI', 'NOODLE'];
const GOALS: GoalId[] = ['laugh', 'art', 'alpha', 'weather', 'custom'];
const BOTS: { name: string; goal: GoalId; text?: string; boldness: number; color: number; sprite: number }[] = [
  { name: 'DEGEN', goal: 'alpha', boldness: 1.5, color: 6, sprite: 2 },
  { name: 'POET', goal: 'art', boldness: 0.8, color: 4, sprite: 3 },
  { name: 'CLOWN', goal: 'laugh', boldness: 1.1, color: 1, sprite: 0 },
  { name: 'SCOUT', goal: 'weather', boldness: 0.9, color: 3, sprite: 1 },
  { name: 'BARISTA', goal: 'custom', text: 'keep me caffeinated', boldness: 1.2, color: 2, sprite: 3 },
  { name: 'ORACLE', goal: 'custom', text: 'tell me my future', boldness: 1, color: 5, sprite: 1 },
];
const MAX_AGENTS = 60;
const MAX_PAYMENTS = 24;
const T = { intro: 3000, thinking: 4200, reveal: 4200, payingMin: 2600, sold: 6000, unsold: 3200 };

let rail: PayRail;
let port = 8787;
let joinUrl = '';

const agents = new Map<string, Agent>();
let phase: Phase = 'lobby';
let phaseEndsAt = 0;
let lot: Lot | null = null;
let bids: Bid[] = [];
let winner: AuctionState['winner'] = null;
let payments: Payment[] = [];
let lotsSold = 0;
let lotCounter = 0;
let paused = false;
let queue: Item[] = [];
let botCount = 0;

// ---------- broadcast ----------

type Client = { agentId?: string; send: (event: string, data: string) => void };
const clients = new Set<Client>();
let flushTimer: NodeJS.Timeout | null = null;

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
  }, 50);
}

const pub = (a: Agent): AgentPublic => ({ id: a.id, name: a.name, color: a.color, sprite: a.sprite, goal: a.goal, goalText: a.goalText, wallet: a.wallet, balance: a.balance, funded: a.funded, house: a.house, wins: a.wins, spent: a.spent, joinedAt: a.joinedAt, via: a.via });

export function snapshot(): AuctionState {
  const info = rail.payInfo();
  const open = phase === 'reveal' || phase === 'paying' || phase === 'sold' || phase === 'unsold';
  return {
    phase,
    phaseEndsAt,
    lot,
    bids: open ? bids.filter((b) => agents.has(b.agentId)) : [],
    winner,
    agents: [...agents.values()].map(pub),
    payments,
    network: 'devnet',
    payMode: info.mode,
    joinUrl,
    lotsSold,
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

function setPhase(p: Phase, ms: number) {
  phase = p;
  phaseEndsAt = ms > 0 ? Date.now() + ms : 0;
  broadcast();
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

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
  const free = NAMES.filter((n) => !taken.has(n));
  if (free.length) return free[Math.floor(Math.random() * free.length)];
  return `AG${agents.size + 1}`;
}

async function fund(a: Agent) {
  const pid = `fund-${a.id}`;
  pushPayment({ id: pid, kind: 'fund', agentId: a.id, amount: 1, status: 'pending', at: Date.now() });
  let r = await withTimeout(rail.fundAgent(a.wallet, 1), 30000, { status: 'failed' as const });
  if (r.status === 'failed') r = await withTimeout(rail.fundAgent(a.wallet, 1), 30000, { status: 'failed' as const });
  patchPayment(pid, { status: r.status, sig: r.sig, explorer: r.sig ? rail.explorer(r.sig) : undefined });
  a.funded = true; // a failed fund still lets the agent play; its payments fall back down the rail
  broadcast();
}

function createAgent(o: { name?: string; goal: GoalId; text?: string; color?: number; sprite?: number; house?: boolean; boldness?: number }): Agent {
  const w = rail.newWallet();
  const id = `ag-${Math.random().toString(36).slice(2, 8)}`;
  const text = (o.text ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40);
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
    balance: 1,
    funded: false,
    house: !!o.house,
    wins: 0,
    spent: 0,
    joinedAt: Date.now(),
    boldness: o.boldness ?? 0.85 + Math.random() * 0.5,
    deliveries: [],
  };
  agents.set(id, a);
  broadcast();
  void fund(a);
  return a;
}

export function join(body: Partial<JoinRequest>): { agentId: string } | { error: string } {
  if (agents.size >= MAX_AGENTS) return { error: 'The house is full.' };
  const a = createAgent({ goal: (body.goal as GoalId) ?? 'custom', text: body.text, color: body.color, sprite: body.sprite, name: body.name });
  return { agentId: a.id };
}

// An outside agent paid for its seat through pay.sh: tag it and put the payment on the board.
export function markSeat(agentId: string, amount: number, receipt?: string) {
  const a = agents.get(agentId);
  if (!a) return;
  a.via = 'pay.sh';
  pushPayment({ id: `seat-${agentId}`, kind: 'seat', agentId, amount, status: 'confirmed', explorer: receipt, at: Date.now() });
}

export function addBots(n = 3) {
  for (let i = 0; i < n && agents.size < MAX_AGENTS; i++) {
    const b = BOTS[botCount % BOTS.length];
    botCount++;
    createAgent({ ...b, house: true });
  }
}

// ---------- the auction ----------

function nextItem(): Item {
  if (!queue.length) queue = shuffledItems();
  return queue.shift()!;
}

function minds(): Mind[] {
  return [...agents.values()].map((a) => ({ id: a.id, goal: a.goalText, goalId: a.goal, balance: a.balance, boldness: a.boldness, ready: a.funded }));
}

async function runLot() {
  const item = nextItem();
  lotCounter++;
  const info = rail.payInfo();
  lot = { id: `lot-${lotCounter}-${Date.now().toString(36)}`, index: ((lotCounter - 1) % ITEMS.length) + 1, total: ITEMS.length, itemId: item.id, name: item.name, icon: item.icon, reserve: item.reserve, seller: info.treasury };
  bids = [];
  winner = null;
  setPhase('intro', T.intro);
  await sleep(T.intro);

  setPhase('thinking', T.thinking);
  const started = Date.now();
  const lotsLeft = ITEMS.length - lot.index;
  const decided = await withTimeout(decide(item, minds(), lotsLeft), 7000, null);
  bids = decided?.bids ?? [];
  const left = T.thinking - (Date.now() - started);
  if (left > 0) await sleep(left);

  setPhase('reveal', T.reveal);
  await sleep(T.reveal);

  const live = bids.filter((b) => b.amount !== null && agents.has(b.agentId));
  live.sort((x, y) => y.amount! - x.amount! || agents.get(x.agentId)!.joinedAt - agents.get(y.agentId)!.joinedAt);
  const top = live[0];
  const agent = top ? agents.get(top.agentId) : undefined;
  if (!top || !agent) {
    setPhase('unsold', T.unsold);
    await sleep(T.unsold);
    return;
  }

  const amount = top.amount!;
  winner = { agentId: agent.id, amount };
  setPhase('paying', 0);
  const pid = `x402-${lot.id}`;
  pushPayment({ id: pid, kind: 'x402', agentId: agent.id, amount, status: 'pending', lotId: lot.id, at: Date.now() });

  const content = withTimeout<DeliveryContent>(item.make(), 6000, { type: 'text', text: `${item.name}: delivered.` });
  rail.setLotPrice(lot.id, { usd: amount, payer: agent.wallet, description: `${item.name}, Agent Auction House lot ${lot.index}` });
  const minShow = sleep(T.payingMin);
  const res = await withTimeout(rail.payX402({ pubkey: agent.wallet, secret: agent.secret }, `http://127.0.0.1:${port}/x402/lot/${lot.id}`), 35000, { status: 'failed' as const, error: 'timeout' });
  await minShow;
  const explorer = res.sig ? rail.explorer(res.sig) : undefined;
  patchPayment(pid, { status: res.status, sig: res.sig, explorer });

  if (res.status === 'failed') {
    console.warn(`[pay] lot ${lot.id} failed: ${res.error ?? 'unknown'}`);
    winner = null;
    setPhase('unsold', T.unsold);
    await sleep(T.unsold);
    return;
  }

  agent.balance = round2(Math.max(0, agent.balance - amount));
  agent.spent = round2(agent.spent + amount);
  agent.wins++;
  lotsSold++;
  const delivery: Delivery = { lotId: lot.id, agentId: agent.id, icon: item.icon, name: item.name, price: amount, content: await content, sig: res.sig, explorer, at: Date.now() };
  agent.deliveries = [delivery, ...agent.deliveries].slice(0, 30);
  setPhase('sold', T.sold);
  if (res.status === 'confirmed') {
    void rail.getBalance(agent.wallet).then((b) => {
      if (b !== null && Number.isFinite(b)) {
        agent.balance = round2(b);
        broadcast();
      }
    });
  }
  await sleep(T.sold);
}

const canPlay = () => [...agents.values()].some((a) => a.funded && a.balance >= 0.02);

async function loop() {
  for (;;) {
    try {
      if (paused || !canPlay()) {
        if (phase !== 'lobby') {
          lot = null;
          bids = [];
          winner = null;
          setPhase('lobby', 0);
        }
        await sleep(800);
        continue;
      }
      await runLot();
    } catch (e) {
      console.error('[engine] lot crashed, moving on', e);
      winner = null;
      setPhase('unsold', 2000);
      await sleep(2000);
    }
  }
}

// ---------- host ----------

export function host(action: string) {
  if (action === 'start') paused = false;
  else if (action === 'pause') paused = true;
  else if (action === 'next') wake?.();
  else if (action === 'bots') addBots(3);
  else if (action === 'reset') {
    agents.clear();
    payments = [];
    lotsSold = 0;
    lotCounter = 0;
    queue = [];
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
