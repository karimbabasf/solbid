import type { AgentPublic, AuctionState, Bid, Delivery, GoalId, ItemIcon, Lot, MeState, Payment, Phase } from '@shared/types';

// Scripted auction for UI work with no server. Loops forever.
const NAMES = ['PIP', 'ZED', 'MOXY', 'BOLT', 'KIKI', 'RUNE', 'NOVA', 'TAKO', 'FIZZ', 'OKRA', 'JUNO', 'BEEP'];
const GOALS: [GoalId, string][] = [['laugh', 'make me laugh'], ['art', 'make me art'], ['alpha', 'give me alpha'], ['weather', 'plan my day'], ['custom', 'find me coffee']];
const LOTS: [string, ItemIcon, number][] = [['Bad Joke', 'joke', 0.05], ['Pixel Art', 'art', 0.1], ['SF Weather', 'weather', 0.03], ['A Secret', 'secret', 0.15], ['SOL Price', 'price', 0.04], ['Fortune', 'fortune', 0.05], ['Haiku', 'haiku', 0.06], ['Coffee', 'coffee', 0.2]];
const TIMES: Record<Phase, number> = { lobby: 3000, intro: 2500, thinking: 3500, reveal: 3500, paying: 2500, sold: 3000, unsold: 2000 };
const sig = () => Array.from({ length: 88 }, () => '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[Math.floor(Math.random() * 58)]).join('');
const wallet = () => sig().slice(0, 44);

export function startMock(setState: (s: AuctionState) => void, setMe: (m: MeState) => void, meId?: string) {
  let t0 = Date.now();
  const agents: AgentPublic[] = [];
  const payments: Payment[] = [];
  const deliveries: Delivery[] = [];
  let phase: Phase = 'lobby';
  let lotIdx = 0;
  let lot: Lot | null = null;
  let bids: Bid[] = [];
  let winner: AuctionState['winner'] = null;
  let lotsSold = 0;
  let phaseEndsAt = t0 + TIMES.lobby;

  const addAgent = (id?: string) => {
    const i = agents.length;
    const [goal, goalText] = GOALS[i % GOALS.length];
    const a: AgentPublic = { id: id ?? `a${i}`, name: NAMES[i % NAMES.length], color: i % 8, sprite: i % 4, goal, goalText, wallet: wallet(), balance: 1, funded: true, house: i < 3 && !id, wins: 0, spent: 0, joinedAt: Date.now() };
    agents.push(a);
    payments.unshift({ id: `p${Date.now()}${i}`, kind: 'fund', agentId: a.id, amount: 1, status: 'confirmed', sig: sig(), explorer: 'https://explorer.solana.com/?cluster=devnet', at: Date.now() });
  };
  if (meId) addAgent(meId);
  addAgent(); addAgent(); addAgent();

  const next = () => {
    const order: Phase[] = ['intro', 'thinking', 'reveal', 'paying', 'sold'];
    if (phase === 'lobby' || phase === 'sold' || phase === 'unsold') {
      const [name, icon, reserve] = LOTS[lotIdx % LOTS.length];
      lotIdx++;
      lot = { id: `lot${lotIdx}`, index: ((lotIdx - 1) % LOTS.length) + 1, total: LOTS.length, itemId: icon, name, icon, reserve, seller: wallet() };
      bids = []; winner = null; phase = 'intro';
    } else {
      phase = order[order.indexOf(phase) + 1];
      if (phase === 'thinking') {
        bids = agents.map((a) => {
          const need = Math.round(Math.random() * 100);
          const pass = need < 35 || a.balance < lot!.reserve;
          const amount = pass ? null : Math.min(a.balance, +(lot!.reserve * (1 + need / 60) + Math.random() * 0.05).toFixed(2));
          return { agentId: a.id, amount, need, risk: need > 75 ? 'high' : need > 50 ? 'mid' : 'low', reason: pass ? 'not what they asked for' : 'they want this, worth it' };
        });
      }
      if (phase === 'paying') {
        const top = bids.filter((b) => b.amount !== null).sort((x, y) => y.amount! - x.amount!)[0];
        if (!top) { phase = 'unsold'; } else {
          winner = { agentId: top.agentId, amount: top.amount! };
          payments.unshift({ id: `p${Date.now()}`, kind: 'x402', agentId: top.agentId, amount: top.amount!, status: 'pending', lotId: lot!.id, at: Date.now() });
        }
      }
      if (phase === 'sold' && winner) {
        const p = payments.find((x) => x.lotId === lot!.id)!;
        p.status = 'confirmed'; p.sig = sig(); p.explorer = 'https://explorer.solana.com/?cluster=devnet';
        const a = agents.find((x) => x.id === winner!.agentId)!;
        a.balance = +(a.balance - winner.amount).toFixed(2); a.spent += winner.amount; a.wins++;
        lotsSold++;
        deliveries.unshift({ lotId: lot!.id, agentId: a.id, icon: lot!.icon, name: lot!.name, price: winner.amount, content: { type: 'text', text: 'Why did the validator break up? Too many forks.' }, sig: p.sig, explorer: p.explorer, at: Date.now() });
      }
    }
    phaseEndsAt = Date.now() + TIMES[phase];
  };

  const emit = () => {
    setState({ phase, phaseEndsAt, lot, bids, winner, agents: [...agents], payments: payments.slice(0, 24), network: 'devnet', payMode: 'x402', joinUrl: `${location.origin}/play`, lotsSold, paused: false, serverTime: Date.now() });
    if (meId) setMe({ agent: agents.find((a) => a.id === meId) ?? null, deliveries: deliveries.filter((d) => d.agentId === meId) });
  };

  emit();
  const tick = setInterval(() => {
    if (agents.length < 12 && Math.random() < 0.12) addAgent();
    if (Date.now() >= phaseEndsAt) next();
    emit();
  }, 400);
  return () => clearInterval(tick);
}
