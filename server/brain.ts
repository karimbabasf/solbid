import type { Risk } from '../shared/types.ts';
import { ITEMS, VALUE, type Item } from './items.ts';
import { llm, parseJson } from './llm.ts';

export interface Mind {
  id: string;
  goal: string; // guest's goal in words
  goalId: string;
  balance: number;
  boldness: number; // 0.6 cautious .. 1.5 degen
  ready: boolean; // funded
  fits: string[]; // item ids a model matched to a custom goal at join
  want?: boolean; // the human pressed WANT IT before the war
}

// One agent's private plan for a lot. `max` never leaves the server: the war reveals it one raise at a time.
export interface Plan {
  agentId: string;
  need: number;
  reason: string;
  risk: Risk;
  max: number; // 0 = pass
}

// Step 1, judgment: how much does this human need this item? LLM for everyone in one call, keyword match as the fallback.
// Step 2, risk: turn need + budget into a spending limit with plain arithmetic, so every number on screen is explainable.

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
  const direct = (item.tags.includes(m.goalId as never) && m.goalId !== 'custom') || m.fits.includes(item.id);
  const word = item.words.some((w) => text.includes(w));
  const jitter = Math.round(Math.random() * 14);
  if (item.id === 'wish') return { need: 80 + jitter, reason: 'Made for exactly what you asked.' };
  if (direct || word) return { need: 72 + jitter, reason: `You said "${m.goal}". This fits.` };
  if (item.rarity !== 'common') return { need: 30 + jitter, reason: 'Rare, but not really your thing.' };
  return { need: 12 + jitter, reason: 'Not what you asked for.' };
}

// Groups of four in parallel: one call for twelve agents often runs past the timeout.
async function judge(item: Item, minds: Mind[]): Promise<{ map: Map<string, { need: number; reason: string }>; llm: boolean }> {
  const groups: Mind[][] = [];
  for (let i = 0; i < minds.length; i += 4) groups.push(minds.slice(i, i + 4));
  const parts = await Promise.all(groups.map((g) => judgeGroup(item, g)));
  const map = new Map<string, { need: number; reason: string }>();
  for (const part of parts) for (const [k, v] of part) map.set(k, v);
  const usedLlm = map.size > 0;
  for (const m of minds) if (!map.has(m.id)) map.set(m.id, heuristicNeed(item, m));
  return { map, llm: usedLlm };
}

async function judgeGroup(item: Item, minds: Mind[]): Promise<Map<string, { need: number; reason: string }>> {
  const map = new Map<string, { need: number; reason: string }>();
  const text = await llm(
    [
      {
        role: 'system',
        content:
          'You are the judgment of several shopping agents at a live auction. Each agent serves one human who stated a goal. ' +
          'For the item on sale, decide for every agent how much its human needs it (need 0-100) and give a reason the agent says to its human: ' +
          'first person, max 48 characters, concrete, playful, mention their goal when it fits, no emoji, no dashes. ' +
          'Scale: 80-100 serves the goal directly, 45-75 is a real stretch that could still delight them, 20-40 nice to have, under 20 useless to them.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          item: { name: item.name, gets: item.id === 'wish' ? 'custom made for the winner: it delivers exactly their own human_goal, so it serves every goal directly' : item.teaser, rarity: item.rarity },
          agents: minds.map((m) => ({ id: m.id, human_goal: m.goal })),
          reply_as: '{"agents":[{"id":"...","need":0,"reason":"..."}]}',
        }),
      },
    ],
    5200,
    true,
  );
  const parsed = parseJson<{ agents?: { id: string; need: number; reason: string }[] }>(text);
  const ids = new Set(minds.map((m) => m.id));
  for (const a of parsed?.agents ?? []) {
    if (!a || typeof a.id !== 'string' || !ids.has(a.id)) continue;
    const need = Math.max(0, Math.min(100, Math.round(Number(a.need))));
    if (!Number.isFinite(need)) continue;
    map.set(a.id, { need, reason: String(a.reason ?? '').replace(LONG_DASH, ',').slice(0, 60) });
  }
  return map;
}

const cents = (n: number) => Math.floor(n * 100) / 100;

// The spending limit: what the item is worth to this human, capped at a share of the wallet that grows with need.
export function limitFor(item: Item, need: number, balance: number, boldness: number, open: number) {
  const worth = VALUE[item.rarity] * (0.3 + (need / 100) * 1.7) * boldness * (0.85 + Math.random() * 0.3);
  const share = need >= 85 ? 0.38 : need >= 65 ? 0.24 : need >= 40 ? 0.12 : 0.05;
  const max = cents(Math.min(worth, balance * share * boldness, balance));
  return max >= open ? max : 0;
}

export function riskOf(max: number, balance: number): Risk {
  const stake = max / Math.max(balance, 0.01);
  return stake > 0.22 ? 'high' : stake > 0.08 ? 'mid' : 'low';
}

export async function decide(item: Item, minds: Mind[], open: number): Promise<{ plans: Plan[]; source: 'llm' | 'rules' }> {
  const ready = minds.filter((m) => m.ready);
  const judged = ready.length ? await judge(item, ready) : { map: new Map<string, { need: number; reason: string }>(), llm: false };
  const plans: Plan[] = minds.map((m) => {
    if (!m.ready) return { agentId: m.id, need: 0, reason: 'Still getting funded.', risk: 'low', max: 0 };
    const j = judged.map.get(m.id) ?? heuristicNeed(item, m);
    const need = m.want ? Math.max(95, j.need) : j.need;
    const reason = m.want ? 'You said you want it.' : j.reason || 'Worth a look.';
    if (m.balance < open) return { agentId: m.id, need, reason: 'Wallet is empty.', risk: 'low', max: 0 };
    if (need < 20) return { agentId: m.id, need, reason: j.reason || 'Not what you asked for.', risk: 'low', max: 0 };
    const max = limitFor(item, need, m.balance, m.boldness, open);
    if (!max) return { agentId: m.id, need, reason: 'Not worth the risk.', risk: 'low', max: 0 };
    return { agentId: m.id, need, reason, risk: riskOf(max, m.balance), max };
  });
  return { plans, source: judged.llm ? 'llm' : 'rules' };
}

// Custom goals ("plan my date night") get matched to catalog items once, at join, so lots can be picked for them.
export async function matchGoal(goal: string): Promise<string[]> {
  const text = await llm(
    [
      { role: 'system', content: 'Pick the items from the catalog that best serve the human goal. Reply as JSON {"ids":["..."]}, 1 to 4 ids, best first.' },
      { role: 'user', content: JSON.stringify({ goal, catalog: ITEMS.filter((i) => i.id !== 'wish').map((i) => ({ id: i.id, name: i.name, gets: i.teaser })) }) },
    ],
    4000,
    true,
  );
  const ids = parseJson<{ ids?: unknown[] }>(text)?.ids ?? [];
  return ids.filter((x): x is string => typeof x === 'string' && ITEMS.some((i) => i.id === x)).slice(0, 4);
}
