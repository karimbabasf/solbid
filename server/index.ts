import { existsSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { act, addClient, host, join, leave, meState, setJoinUrl, snapshot, start, touchViewer, type PayRail } from './engine.ts';
import { simRail, simRoutes } from './simrail.ts';
import { enterRoutes } from './enter.ts';
import { llmLabel } from './llm.ts';

try {
  process.loadEnvFile('.env');
} catch {}

const PORT = Number(process.env.PORT || 8787);
const PROD = process.env.NODE_ENV === 'production';
const BOTS = Number(process.env.BOTS ?? 3);

function lanIp() {
  for (const list of Object.values(networkInterfaces())) {
    for (const n of list ?? []) if (n.family === 'IPv4' && !n.internal) return n.address;
  }
  return 'localhost';
}

const publicBase = () => process.env.PUBLIC_URL?.replace(/\/$/, '') || `http://${lanIp()}:${PROD ? PORT : 5173}`;

// Load the real payment rail; if anything about it breaks, run simulated and say so.
let rail: PayRail;
let routes: Hono = simRoutes;
try {
  const pay: any = await import('./pay/index.ts');
  rail = {
    initPayments: pay.initPayments,
    payInfo: pay.payInfo,
    newWallet: pay.newWallet,
    fundAgent: pay.fundAgent,
    getBalance: pay.getBalance,
    setLotPrice: pay.setLotPrice,
    payX402: pay.payX402,
    explorer: pay.explorer,
  };
  routes = pay.x402Routes;
  const info = await Promise.race([rail.initPayments(), new Promise<null>((r) => setTimeout(() => r(null), 30000))]);
  if (!info) throw new Error('initPayments timed out');
  console.log(`[pay] mode=${info.mode} treasury=${info.treasury} mint=${info.mint}${info.reason ? ` (${info.reason})` : ''}`);
} catch (e) {
  console.warn('[pay] real rail unavailable, running simulated:', (e as Error).message);
  rail = simRail((e as Error).message);
  routes = simRoutes;
}

const app = new Hono();

app.route('/x402', routes);
app.route('/paid', enterRoutes); // pay.sh gateway (server/pay/gate.ts) forwards paid seats here

app.get('/api/health', (c) => c.json({ ok: true, pay: rail.payInfo(), agents: snapshot().agents.length, phase: snapshot().phase, joinUrl: snapshot().joinUrl }));

// Plain JSON snapshot: the client falls back to polling this when a proxy buffers the stream.
app.get('/api/state', (c) => {
  touchViewer();
  const agentId = c.req.query('agent');
  return c.json({ state: snapshot(), me: agentId ? meState(agentId) : null });
});

app.get('/api/stream', (c) => {
  const res = streamSSE(c, async (stream) => {
    const agentId = c.req.query('agent') || undefined;
    let open = true;
    await stream.write(`:${' '.repeat(2048)}\n\n`); // push past proxy buffers
    const remove = addClient({
      agentId,
      send: (event, data) => {
        if (open) stream.writeSSE({ event, data }).catch(() => (open = false));
      },
    });
    stream.onAbort(() => {
      open = false;
    });
    while (open) {
      await stream.sleep(15000);
      if (open) await stream.writeSSE({ event: 'ping', data: '' }).catch(() => (open = false));
    }
    remove();
  });
  // no-transform stops Cloudflare from compressing (and so buffering) the stream.
  res.headers.set('Cache-Control', 'no-cache, no-transform');
  res.headers.set('X-Accel-Buffering', 'no');
  return res;
});

app.post('/api/join', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const r = join(body ?? {});
  return 'error' in r ? c.json(r, 429) : c.json(r);
});

app.get('/api/agent/:id', (c) => c.json(meState(c.req.param('id'))));

app.post('/api/agent/:id/act', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { key?: unknown; action?: unknown };
  return c.json(act(c.req.param('id'), body.key, body.action));
});

app.post('/api/agent/:id/leave', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { key?: unknown };
  return c.json(leave(c.req.param('id'), body.key));
});

// Host controls only answer the machine running the room. Tunnels also connect from loopback, so their forwarding headers count as outside.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
app.use('/api/host/*', async (c, next) => {
  const forwarded = c.req.header('cf-connecting-ip') || c.req.header('cf-ray') || c.req.header('x-forwarded-for');
  if (forwarded || !LOOPBACK.has(getConnInfo(c).remote.address ?? '')) return c.json({ ok: false, error: 'host controls are local only' }, 403);
  await next();
});

app.post('/api/host/url', async (c) => {
  const { url } = await c.req.json().catch(() => ({ url: '' }));
  if (typeof url === 'string' && /^https?:\/\//.test(url)) setJoinUrl(`${url.replace(/\/$/, '')}/play`);
  return c.json({ ok: true });
});

// After /api/host/url: a :action route registered first would swallow it.
app.post('/api/host/:action', (c) => (host(c.req.param('action')) ? c.json({ ok: true }) : c.json({ ok: false }, 400)));

if (PROD && existsSync('dist/index.html')) {
  app.use('/assets/*', serveStatic({ root: './dist' }));
  app.use('/*', serveStatic({ root: './dist' }));
  app.get('*', (c) => c.html(readFileSync('dist/index.html', 'utf8'))); // read per request so a rebuild needs no restart
}

app.onError((err, c) => {
  console.error('[http]', err);
  return c.json({ ok: false }, 500);
});

start({ rail, port: PORT, joinUrl: `${publicBase()}/play`, bots: BOTS });

serve({ fetch: app.fetch, port: PORT }, () => console.log(`[server] http://localhost:${PORT}  join: ${publicBase()}/play  llm: ${llmLabel()}`));

process.on('unhandledRejection', (e) => console.error('[unhandled]', e));
process.on('uncaughtException', (e) => console.error('[uncaught]', e));
