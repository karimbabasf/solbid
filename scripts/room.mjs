// One command for the room: build, open two public tunnels, start the server and pay.sh's gateway.
// Usage: node scripts/room.mjs [--mainnet]   (default gateway network is the pay sandbox)
import { spawn, execSync } from 'node:child_process';

const mainnet = process.argv.includes('--mainnet');
const kids = [];
const run = (cmd, args, env = {}, tag = cmd) => {
  const p = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  kids.push(p);
  const out = (d) => process.stdout.write(`[${tag}] ${d}`);
  p.stdout.on('data', out);
  p.stderr.on('data', out);
  return p;
};
// pay's gateway ignores SIGTERM, so whatever is still up a moment later gets SIGKILL.
const stopAll = () => {
  for (const k of kids) k.kill('SIGTERM');
  setTimeout(() => {
    for (const k of kids) if (k.exitCode === null) k.kill('SIGKILL');
    for (const port of [8787, 1402]) {
      try {
        execSync(`lsof -ti tcp:${port} -sTCP:LISTEN | xargs kill -9`, { stdio: 'ignore' });
      } catch {}
    }
    process.exit(0);
  }, 1500);
};
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

function tunnel(port) {
  return new Promise((resolve, reject) => {
    const p = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    kids.push(p);
    const t = setTimeout(() => reject(new Error(`no tunnel for :${port} after 30s`)), 30000);
    const look = (d) => {
      const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) {
        clearTimeout(t);
        resolve(m[0]);
      }
    };
    p.stdout.on('data', look);
    p.stderr.on('data', look);
  });
}

for (const port of [8787, 1402]) {
  try {
    execSync(`lsof -ti tcp:${port} -sTCP:LISTEN | xargs kill -9`, { stdio: 'ignore' }); // listeners only: a bare tcp:port match also kills tunnels and dev proxies connected to it
  } catch {}
}

console.log('building web...');
execSync('npx vite build', { stdio: 'inherit' });

const [site, gate] = await Promise.all([tunnel(8787), tunnel(1402)]);
run('npx', ['tsx', 'server/index.ts'], { NODE_ENV: 'production', PUBLIC_URL: site, ENTER_URL: gate }, 'server');
run('npx', ['tsx', 'server/pay/gate.ts', ...(mainnet ? [] : ['--sandbox'])], {}, 'gate');

setTimeout(() => {
  console.log(`\n  Big screen   ${site}   (or http://localhost:8787)`);
  console.log(`  Phones       ${site}/play`);
  console.log(`  Agents       pay ${mainnet ? '' : '--sandbox '}curl -s -X POST ${gate}/enter -d '{"goal":"make me laugh"}'`);
  console.log(`  Debugger     http://127.0.0.1:1402\n`);
}, 8000);
