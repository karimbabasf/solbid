// End-to-end check: npx tsx server/pay/smoke.ts
// Two agents get $1 each, agent A buys lot test1 for $0.07 over x402, balances are printed.
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { explorer, fundAgent, getBalance, initPayments, newWallet, payX402, setLotPrice, x402Routes } from './index.ts';

const PORT = 8799;
const t0 = Date.now();
const info = await initPayments();
console.log(`init ${Date.now() - t0}ms  mode=${info.mode} treasury=${info.treasury} mint=${info.mint}${info.reason ? ` reason=${info.reason}` : ''}`);

const a = newWallet();
const b = newWallet();
console.log(`wallet A ${a.pubkey}\nwallet B ${b.pubkey}`);

for (const [name, w] of [['A', a], ['B', b]] as const) {
  const t = Date.now();
  const r = await fundAgent(w.pubkey, 1);
  console.log(`fund ${name} $1 -> ${r.status} ${Date.now() - t}ms${r.sig ? `\n  sig ${r.sig}\n  ${explorer(r.sig)}` : ''}`);
}

const app = new Hono();
app.route('/x402', x402Routes);
const server = serve({ fetch: app.fetch, port: PORT });

setLotPrice('test1', { usd: 0.07, payer: a.pubkey, description: 'Lot test1: one smoke-test joke' });
const url = `http://localhost:${PORT}/x402/lot/test1`;

const challenge = await fetch(url);
console.log(`GET without payment -> ${challenge.status} ${JSON.stringify(await challenge.json()).slice(0, 220)}...`);

const stranger = await payX402(b, url);
console.log(`wallet B tries A's lot -> ${stranger.status}${stranger.error ? ` (${stranger.error.slice(0, 120)})` : ''}`);

const t = Date.now();
const paid = await payX402(a, url);
console.log(`payX402 A -> ${paid.status} in ${Date.now() - t}ms body=${JSON.stringify(paid.body)}${paid.error ? ` error=${paid.error}` : ''}`);
if (paid.sig) console.log(`  sig ${paid.sig}\n  ${explorer(paid.sig)}`);

console.log(`balance A ${await getBalance(a.pubkey)}  balance B ${await getBalance(b.pubkey)}  treasury ${await getBalance(info.treasury)}`);
server.close();
process.exit(0);
