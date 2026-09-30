// Paid seats for outside agents. pay.sh's gateway (`pay gate api`) owns the public URL, the 402 and
// the settlement; it forwards only paid requests here, to a localhost route behind a secret path.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Hono } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { join, markSeat, snapshot } from './engine.ts';
import type { GoalId } from '../shared/types.ts';

const GATE_FILE = path.resolve(process.cwd(), 'data/pay-gate.json');

function loadToken(): string {
  try {
    return JSON.parse(fs.readFileSync(GATE_FILE, 'utf8')).token;
  } catch {
    const token = crypto.randomBytes(18).toString('base64url');
    fs.mkdirSync(path.dirname(GATE_FILE), { recursive: true });
    fs.writeFileSync(GATE_FILE, JSON.stringify({ token }, null, 2), { mode: 0o600 });
    return token;
  }
}

export const GATE_TOKEN = loadToken();

// Server-side only until the contract grows a field for it: which agents bought their seat through pay.sh.
const external = new Map<string, { via: 'pay.sh'; at: number }>();
export const viaOf = (agentId: string): 'pay.sh' | undefined => external.get(agentId)?.via;

const LOCAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function goalFrom(raw: string): GoalId {
  if (/laugh|joke|funny/i.test(raw)) return 'laugh';
  if (/art|draw|paint|picture/i.test(raw)) return 'art';
  if (/weather|rain|sun/i.test(raw)) return 'weather';
  if (/alpha|price|market|secret/i.test(raw)) return 'alpha';
  return 'custom';
}

export const enterRoutes = new Hono();

enterRoutes.post('/:token/enter', async (c) => {
  try {
    const remote = getConnInfo(c).remote.address ?? '';
    if (c.req.param('token') !== GATE_TOKEN || !LOCAL.has(remote)) return c.json({ error: 'not found' }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { goal?: unknown; name?: unknown };
    const text = typeof body.goal === 'string' ? body.goal.slice(0, 80) : '';
    const r = join({ goal: goalFrom(text), text, name: typeof body.name === 'string' ? body.name : undefined });
    if ('error' in r) return c.json(r, 409);
    external.set(r.agentId, { via: 'pay.sh', at: Date.now() });
    const h = c.req.header();
    const receipt = h['payment-receipt-url'] ?? h['x-payment-receipt-url'];
    console.log('[seat] paid entry via pay.sh, forwarded headers:', Object.keys(h).join(','));
    markSeat(r.agentId, 0.05, typeof receipt === 'string' && receipt.startsWith('https://') ? receipt : undefined);
    const s = snapshot();
    const name = s.agents.find((a) => a.id === r.agentId)?.name ?? '';
    return c.json({ agentId: r.agentId, name, playUrl: `${s.joinUrl}?agent=${encodeURIComponent(r.agentId)}`, via: 'pay.sh' });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
