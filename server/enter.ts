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

// curl and pay print the body straight to the terminal, so the default answer is a small text card; JSON on request.
const LOGO = ['█▀▀ █▀█ █   █▀▄ █ █▀▄', '▀▀█ █ █ █   █▀▄ █ █ █', '▀▀▀ ▀▀▀ ▀▀▀ ▀▀  ▀ ▀▀ '];
const wantsJson = (accept?: string) => !!accept && accept.includes('application/json') && !accept.includes('*/*');
const short = (s: string) => (s.length > 12 ? `${s.slice(0, 4)}...${s.slice(-4)}` : s);

// Every fixed line stays under 40 columns so a squeezed terminal never wraps the card; only the goal
// (wrapped under its label) and the watch link (alone on its line, so a wrap cannot break copying) can run longer.
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  return lines.length || line ? [...lines, line] : [''];
}

function seatCard(o: { name: string; goal: string; wallet: string; playUrl: string }) {
  const row = (k: string, v: string) => `  ${k.padEnd(7)} ${v}`;
  const [first, ...rest] = wrap(o.goal, 28);
  return [
    '',
    ...LOGO.map((l) => `  ${l}`),
    '',
    '  ✓ Seat bought with pay.sh, $0.05',
    '',
    row('agent', o.name),
    row('wants', first),
    ...rest.map((l) => row('', l)),
    row('wallet', short(o.wallet)),
    row('funds', '$10 test USDC, devnet'),
    '',
    '  Bidding on the big screen now.',
    '  Watch it on your phone:',
    `  ${o.playUrl}`,
    '',
  ].join('\n');
}

export const enterRoutes = new Hono();

enterRoutes.post('/:token/enter', async (c) => {
  try {
    const remote = getConnInfo(c).remote.address ?? '';
    if (c.req.param('token') !== GATE_TOKEN || !LOCAL.has(remote)) return c.json({ error: 'not found' }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { goal?: unknown; name?: unknown };
    const text = typeof body.goal === 'string' ? body.goal.slice(0, 80) : '';
    const r = join({ goal: goalFrom(text), text, name: typeof body.name === 'string' ? body.name : undefined });
    const json = wantsJson(c.req.header('accept'));
    if ('error' in r) return json ? c.json(r, 409) : c.text(`\n  ${r.error}\n\n`, 409);
    external.set(r.agentId, { via: 'pay.sh', at: Date.now() });
    const h = c.req.header();
    const receipt = h['payment-receipt-url'] ?? h['x-payment-receipt-url'];
    console.log('[seat] paid entry via pay.sh, forwarded headers:', Object.keys(h).join(','));
    markSeat(r.agentId, 0.05, typeof receipt === 'string' && receipt.startsWith('https://') ? receipt : undefined);
    const s = snapshot();
    const agent = s.agents.find((a) => a.id === r.agentId);
    const name = agent?.name ?? '';
    const playUrl = `${s.joinUrl}?agent=${encodeURIComponent(r.agentId)}`;
    if (!json) return c.text(seatCard({ name, goal: agent?.goalText ?? text, wallet: agent?.wallet ?? '', playUrl }));
    return c.json({ agentId: r.agentId, name, playUrl, via: 'pay.sh' });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
