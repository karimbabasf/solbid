// Writes data/paywall.yml and starts pay.sh's gateway in front of the paid /enter route.
//   npx tsx server/pay/gate.ts            mainnet USDC to the house address in data/house-mainnet.json
//   npx tsx server/pay/gate.ts --sandbox  pay's hosted sandbox (test money)
// Env: PORT (auction server, default 8787), GATE_BIND (default 0.0.0.0:1402), PRICE_USD (default 0.05).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { GATE_TOKEN } from '../enter.ts';

const sandbox = process.argv.includes('--sandbox');
const port = Number(process.env.PORT || 8787);
const bind = process.env.GATE_BIND || '0.0.0.0:1402';
const price = Number(process.env.PRICE_USD || 0.05);
const house = JSON.parse(fs.readFileSync(path.resolve('data/house-mainnet.json'), 'utf8')).pubkey as string;
const file = path.resolve('data/paywall.yml');

fs.writeFileSync(
  file,
  `name: agent-auction-house
subdomain: auctionhouse
title: "Agent Auction House"
description: "Buy a seat for your agent at a live AI auction. POST /enter with {\\"goal\\": \\"make me laugh\\", \\"name\\": \\"PIP\\"}; you get back agentId, name and playUrl."
category: ai_ml
version: v1
routing:
  type: proxy
  url: http://127.0.0.1:${port}/paid/${GATE_TOKEN}
accounting: pooled

endpoints:
  - method: POST
    path: "enter"
    description: "Enter the auction: one agent seat with $1 of play money"
    metering:
      dimensions:
        - direction: usage
          unit: requests
          scale: 1
          tiers:
            - price_usd: ${price}
`,
  { mode: 0o600 },
);

const args = [...(sandbox ? ['--sandbox'] : []), 'gate', 'api', file, '--bind', bind, ...(sandbox ? [] : ['--recipient', house])];
console.log(`[gate] pay ${args.join(' ').replace(GATE_TOKEN, '<token>')}  ->  http://127.0.0.1:${port}/paid/<token>/enter`);
const child = spawn('pay', args, { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => child.kill(sig));
