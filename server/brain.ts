import type { Bid, Risk } from '../shared/types.ts';
import type { Item } from './items.ts';
import { llm, parseJson } from './llm.ts';

export interface Mind {
  id: string;
  goal: string; // guest's goal in words
  goalId: string;
  balance: number;
  boldness: number; // 0.6 cautious .. 1.6 degen
  ready: boolean; // funded
}

// Step 1, judgment: how much does this human need this item? LLM for everyone in one call, keyword match as the fallback.
// Step 2, risk: turn need + budget into a bid with plain arithmetic, so every number on screen is explainable.

const GOAL_WORDS: Record<string, string> = {
  laugh: 'make me laugh',
  art: 'make me art',
  alpha: 'give me alpha',
  weather: 'plan my day',
};

const LONG_DASH = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`, 'g');

export const goalWords = (goalId: string, text?: string) => (text?.trim() ? text.trim().slice(0, 40) : GOAL_WORDS[goalId] ?? 'surprise me');

function heuristicNeed(item: Item, m: Mind): { need: number; reason: string } {
  const text = m.goal.toLowerCase();
  const direct = item.tags.includes(m.goalId as never);
  const word = item.words.some((w) => text.includes(w));
  const jitter = Math.round(Math.random() * 12);
  if (direct || word) return { need: 78 + jitter, reason: `You said "${m.goal}". This fits.` };
  if (item.tags.length === 0 || item.icon === 'fortune') return { need: 38 + jitter, reason: 'Nice to have, not what you asked for.' };
  return { need: 10 + jitter, reason: 'Not what you asked for.' };
}

async function judge(item: Item, minds: Mind[]): Promise<{ map: Map<string, { need: number; reason: string }>; llm: boolean }> {
  const map = new Map<string, { need: number; reason: string }>();
  const text = await llm(
    [
      {
        role: 'system',
        content:
          'You are the judgment of several shopping agents at a live auction. Each agent serves one human who stated a goal. ' +
          'For the item on sale, decide for every agent how much its human needs it (need 0-100) and give a reason the agent says to its human: ' +
          'first person, max 48 characters, concrete, a little playful, no emoji, no dashes. Be strict: items that do not serve the goal score under 35. ' +
          'Reply as JSON: {"agents":[{"id":"...","need":0,"reason":"..."}]}',
      },
      {
        role: 'user',
        content: JSON.stringify({
          item: { name: item.name, what: item.words.slice(0, 4).join(', ') },
          agents: minds.map((m) => ({ id: m.id, human_goal: m.goal })),
        }),
      },
    ],
    4500,
    true,
  );
  const parsed = parseJson<{ agents?: { id: string; need: number; reason: string }[] }>(text);
  for (const a of parsed?.agents ?? []) {
    if (!a || typeof a.id !== 'string') continue;
    const need = Math.max(0, Math.min(100, Math.round(Number(a.need))));
    if (!Number.isFinite(need)) continue;
    map.set(a.id, { need, reason: String(a.reason ?? '').replace(LONG_DASH, ',').slice(0, 60) });
  }
  const usedLlm = map.size > 0;
  for (const m of minds) if (!map.has(m.id)) map.set(m.id, heuristicNeed(item, m));
  return { map, llm: usedLlm };
}

const cents = (n: number) => Math.floor(n * 100) / 100;

export async function decide(item: Item, minds: Mind[], lotsLeft: number): Promise<{ bids: Bid[]; source: 'llm' | 'rules' }> {
  const ready = minds.filter((m) => m.ready);
  const judged = ready.length ? await judge(item, ready) : { map: new Map<string, { need: number; reason: string }>(), llm: false };
  const bids: Bid[] = minds.map((m) => {
    if (!m.ready) return { agentId: m.id, amount: null, need: 0, risk: 'low', reason: 'Still getting funded.' };
    const j = judged.map.get(m.id) ?? heuristicNeed(item, m);
    const need = j.need;
    // What the item is worth to this human: reserve scaled by need.
    const worth = item.reserve * (1 + (need / 100) * 3) * m.boldness;
    // How much of the wallet this one lot may risk: more when need is high, less when many lots remain.
    const share = (need >= 85 ? 0.45 : need >= 65 ? 0.28 : 0.14) * m.boldness * (lotsLeft > 4 ? 0.8 : 1.1);
    const cap = m.balance * Math.min(0.9, share);
    const amount = cents(Math.min(worth * (0.92 + Math.random() * 0.16), cap, m.balance));
    if (need < 40) return { agentId: m.id, amount: null, need, risk: 'low', reason: j.reason || 'Not what you asked for.' };
    if (amount < item.reserve || m.balance < item.reserve) return { agentId: m.id, amount: null, need, risk: 'high', reason: 'Wanted it, but it would drain your budget.' };
    const stake = amount / Math.max(m.balance, 0.01);
    const risk: Risk = stake > 0.3 ? 'high' : stake > 0.12 ? 'mid' : 'low';
    return { agentId: m.id, amount, need, risk, reason: j.reason || 'Worth it for you.' };
  });
  return { bids, source: judged.llm ? 'llm' : 'rules' };
}
