import type { AgentPublic, AuctionState, Bid, Delivery, GoalId, ItemIcon, Lot, MeState, Payment, Phase, Raise, Rarity } from '@shared/types';

// Scripted auction for UI work with no server. Loops forever, runs a real bidding war, answers join/act/leave.
const NAMES = ['PIP', 'ZED', 'MOXY', 'BOLT', 'KIKI', 'RUNE', 'NOVA', 'TAKO', 'FIZZ', 'OKRA', 'JUNO', 'BEEP'];
const GOALS: [GoalId, string][] = [['laugh', 'make me laugh'], ['art', 'make me art'], ['alpha', 'give me alpha'], ['weather', 'plan my day'], ['custom', 'find me coffee']];
const LOTS: [string, ItemIcon, Rarity, string][] = [
  ['Roast', 'roast', 'rare', 'A roast of you, written live'],
  ['Pixel Sunset', 'sunset', 'epic', 'A one of one sunset, drawn for you'],
  ['Made To Order', 'wish', 'legendary', 'Whatever your human asked for'],
  ['Bad Joke', 'joke', 'common', 'One fresh joke, never told before'],
  ['SOL Price', 'price', 'common', 'Live price at the moment of sale'],
  ['Hot Take', 'crystal', 'rare', 'One bold call on crypto'],
  ['Startup Idea', 'rocket', 'rare', 'A name and a pitch, yours to keep'],
  ['Meme', 'meme', 'rare', 'A pixel meme with your caption'],
  ['Coffee Order', 'coffee', 'common', 'The order your day needs'],
];
const T = { lobby: 2500, intro: 2200, thinking: 1800, hold: 1600, paying: 1800, sold: 4200, unsold: 2200 };
const sig = () => Array.from({ length: 88 }, () => '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[Math.floor(Math.random() * 58)]).join('');
const wallet = () => sig().slice(0, 44);
const nice = (n: number) => (n < 1 ? Math.round(n * 100) / 100 : Math.round(n * 20) / 20);
const EXPLORER = 'https://explorer.solana.com/?cluster=devnet';

type MockApi = (path: string, body: unknown) => unknown;
let handler: MockApi | null = null;
export const mockApi: MockApi = (path, body) => handler?.(path, body) ?? null;

export function startMock(setState: (s: AuctionState) => void, setMe: (m: MeState) => void, meId?: string) {
  const agents: AgentPublic[] = [];
  const payments: Payment[] = [];
  const deliveries: Delivery[] = [];
  let phase: Phase = 'lobby';
  let lotIdx = 0;
  let lot: Lot | null = null;
  let bids: Bid[] = [];
  let maxes = new Map<string, number>();
  let ladder: Raise[] = [];
  let going = false;
  let winner: AuctionState['winner'] = null;
  let lotsSold = 0;
  let phaseEndsAt = Date.now() + T.lobby;
  let nextRaiseAt = 0;
  let me = meId;

  const addAgent = (id?: string, name?: string) => {
    const i = agents.length;
    const [goal, goalText] = GOALS[i % GOALS.length];
    const a: AgentPublic = { id: id ?? `a${i}`, name: name || NAMES[i % NAMES.length], color: i % 8, sprite: i % 4, goal, goalText, wallet: wallet(), balance: 10, funded: true, house: i < 3 && !id, wins: 0, spent: 0, joinedAt: Date.now() };
    agents.push(a);
    payments.unshift({ id: `p${Date.now()}${i}`, kind: 'fund', agentId: a.id, amount: 10, status: 'confirmed', sig: sig(), explorer: EXPLORER, at: Date.now() });
    return a;
  };
  if (me) addAgent(me);
  addAgent(); addAgent(); addAgent();

  const price = () => ladder.at(-1)?.amount ?? 0;
  const leader = () => ladder.at(-1)?.agentId;
  const nextPrice = () => (price() === 0 ? lot!.open : nice(price() + Math.max(0.01, price() * 0.18 + 0.03)));
  const raise = (agentId: string, manual = false) => {
    const amount = nextPrice();
    ladder = [...ladder, { agentId, amount, at: Date.now(), manual: manual || undefined }];
    bids = bids.map((b) => (b.agentId === agentId ? { ...b, amount, state: 'in' } : b));
    going = false;
  };

  handler = (path, body) => {
    const b = (body ?? {}) as { action?: string; name?: string };
    if (path === '/api/join') {
      const a = addAgent(`me${Date.now().toString(36)}`, b.name?.toUpperCase().slice(0, 7));
      me = a.id;
      return { agentId: a.id, key: 'mock' };
    }
    const m = path.match(/^\/api\/agent\/([^/]+)\/(act|leave)$/);
    if (!m) return null;
    const id = m[1];
    if (m[2] === 'leave') {
      const i = agents.findIndex((a) => a.id === id);
      if (i >= 0) agents.splice(i, 1);
      if (me === id) me = undefined;
      return { ok: true };
    }
    if (b.action === 'pass') {
      maxes.set(id, 0);
      bids = bids.map((x) => (x.agentId === id ? { ...x, state: x.amount === null ? 'pass' : 'out', manual: 'pass', reason: 'You said pass.' } : x));
      return { ok: true };
    }
    if (b.action === 'bid') {
      if (phase === 'reveal' && leader() !== id) {
        maxes.set(id, Math.max(maxes.get(id) ?? 0, nextPrice()));
        raise(id, true);
        bids = bids.map((x) => (x.agentId === id ? { ...x, manual: 'bid', reason: 'You told me to bid.' } : x));
        phaseEndsAt = Date.now() + 5000;
      } else maxes.set(id, 4);
      return { ok: true };
    }
    return { ok: false };
  };

  const next = () => {
    if (phase === 'lobby' || phase === 'sold' || phase === 'unsold') {
      const [name, icon, rarity, teaser] = LOTS[lotIdx % LOTS.length];
      lotIdx++;
      const target = agents[lotIdx % agents.length];
      lot = { id: `lot${lotIdx}`, index: lotIdx, total: LOTS.length, itemId: icon, name, icon, reserve: 0.01, open: 0.01, rarity, teaser, forAgentId: lotIdx % 2 ? target?.id : undefined, seller: wallet() };
      bids = []; ladder = []; going = false; winner = null; maxes = new Map();
      phase = 'intro';
      phaseEndsAt = Date.now() + T.intro;
    } else if (phase === 'intro') {
      phase = 'thinking';
      phaseEndsAt = Date.now() + T.thinking;
    } else if (phase === 'thinking') {
      bids = agents.map((a) => {
        const need = Math.round(Math.random() * 100);
        const max = need < 25 ? 0 : nice(0.1 + (need / 100) * 2.5 * Math.random() + 0.2);
        maxes.set(a.id, max);
        const risk = max > 2 ? 'high' : max > 0.8 ? 'mid' : 'low';
        return { agentId: a.id, amount: null, need, risk, reason: max ? 'This is exactly your thing.' : 'Not what you asked for.', state: max ? 'in' : 'pass' } as Bid;
      });
      phase = 'reveal';
      phaseEndsAt = Date.now() + 8000;
      nextRaiseAt = Date.now() + 500;
    } else if (phase === 'reveal') {
      const top = ladder.at(-1);
      if (!top) {
        phase = 'unsold';
        phaseEndsAt = Date.now() + T.unsold;
        return;
      }
      winner = { agentId: top.agentId, amount: top.amount };
      payments.unshift({ id: `p${Date.now()}`, kind: 'x402', agentId: top.agentId, amount: top.amount, status: 'pending', lotId: lot!.id, at: Date.now() });
      phase = 'paying';
      phaseEndsAt = Date.now() + T.paying;
    } else if (phase === 'paying' && winner) {
      const p = payments.find((x) => x.lotId === lot!.id)!;
      p.status = 'confirmed'; p.sig = sig(); p.explorer = EXPLORER;
      const a = agents.find((x) => x.id === winner!.agentId);
      if (a) {
        a.balance = +(a.balance - winner.amount).toFixed(2); a.spent = +(a.spent + winner.amount).toFixed(2); a.wins++;
        deliveries.unshift({ lotId: lot!.id, agentId: a.id, icon: lot!.icon, name: lot!.name, price: winner.amount, content: { type: 'text', text: 'Why did the validator break up? Too many forks.' }, sig: p.sig, explorer: p.explorer, at: Date.now() });
      }
      lotsSold++;
      phase = 'sold';
      phaseEndsAt = Date.now() + T.sold;
    }
  };

  // One step of the war: the one with the highest limit left keeps raising until nobody can beat it.
  const warTick = () => {
    if (phase !== 'reveal' || Date.now() < nextRaiseAt) return;
    nextRaiseAt = Date.now() + 550 + Math.random() * 250;
    const need = nextPrice();
    bids = bids.map((b) => (b.state === 'in' && b.agentId !== leader() && (maxes.get(b.agentId) ?? 0) < need && b.amount !== null ? { ...b, state: 'out' } : b));
    const rivals = bids.filter((b) => b.state === 'in' && b.agentId !== leader() && (maxes.get(b.agentId) ?? 0) >= need);
    if (!rivals.length) {
      if (!going && ladder.length) {
        going = true;
        phaseEndsAt = Date.now() + T.hold;
      } else if (!ladder.length) phaseEndsAt = Date.now();
      return;
    }
    raise(rivals[Math.floor(Math.random() * rivals.length)].agentId);
    phaseEndsAt = Date.now() + 5000;
  };

  const emit = () => {
    const live = phase === 'reveal' || phase === 'paying' || phase === 'sold';
    setState({
      phase, phaseEndsAt, lot, bids, winner, agents: [...agents], payments: payments.slice(0, 24), network: 'devnet', payMode: 'x402',
      joinUrl: `${location.origin}/play`, enterUrl: 'https://example.trycloudflare.com/enter', lotsSold, minPlayers: 1, paused: false, serverTime: Date.now(),
      ladder: live ? ladder : [], price: live ? price() : 0, next: lot ? nextPrice() : 0, going: phase === 'reveal' && going,
    });
    if (me) setMe({ agent: agents.find((a) => a.id === me) ?? null, deliveries: deliveries.filter((d) => d.agentId === me) });
  };

  emit();
  const tick = setInterval(() => {
    if (agents.length < 12 && Math.random() < 0.02) addAgent();
    warTick();
    if (Date.now() >= phaseEndsAt) next();
    emit();
  }, 100);
  return () => {
    clearInterval(tick);
    handler = null;
  };
}
