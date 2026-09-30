// Agent payments on Solana devnet over x402 (exact scheme, SVM, protocol v1), hand-rolled.
// The treasury pays every fee and co-signs settlements, so agents never hold SOL.
// Every exported function catches and returns a status; nothing here throws into the auction loop.

import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import bs58 from 'bs58';
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type TransactionInstruction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
} from '@solana/spl-token';
import { SystemProgram } from '@solana/web3.js';

export interface PayInfo {
  network: 'devnet';
  mode: 'x402' | 'transfer' | 'sim';
  treasury: string;
  mint: string;
  reason?: string;
}

type PayStatus = 'confirmed' | 'failed' | 'simulated';

const RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const NETWORK = 'solana-devnet';
const DECIMALS = 6;
const SEED_SUPPLY = 1_000;
const TREASURY_FILE = path.resolve(process.cwd(), 'data/treasury.json');
const COMPUTE_BUDGET_ID = ComputeBudgetProgram.programId;
const MEMO_IDS = ['MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', 'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo'];
const MAX_CU_PRICE = 5_000_000n; // micro-lamports per CU, the x402 SVM cap

const conn = new Connection(RPC, 'confirmed');
let treasury: Keypair | null = null;
let mint: PublicKey | null = null;
let info: PayInfo = { network: 'devnet', mode: 'sim', treasury: '', mint: '', reason: 'not initialized' };
let initPromise: Promise<PayInfo> | null = null;
let initAt = 0;
let initDone = false;
let airdropTried = false;

// Simulated ledger, used only in 'sim' mode so the demo still shows balances moving.
const simBalances = new Map<string, number>();

interface LotPrice {
  usd: number;
  payTo: string;
  payer?: string;
  description: string;
  ready: Promise<void>;
  paidSig?: string;
  settling?: boolean;
}
const lots = new Map<string, LotPrice>();

export const explorer = (sig: string) =>
  process.env.SOLANA_RPC_URL && !/devnet/.test(RPC)
    ? `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=${encodeURIComponent(RPC)}`
    : `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
const toUnits = (usd: number) => BigInt(Math.round(usd * 10 ** DECIMALS));
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

// The venue shares one IP, so public devnet rate-limits polling hard. Listen on the websocket first
// and poll only as a slow backstop.
function waitConfirmed(sig: string, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    let subId: number | undefined;
    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(poll);
      if (subId !== undefined) conn.removeSignatureListener(subId).catch(() => {});
      if (err) reject(err);
      else resolve();
    };
    const timer = setTimeout(() => finish(new Error(`tx ${sig} not confirmed after ${ms}ms`)), ms);
    try {
      subId = conn.onSignature(sig, (res) => (subId = undefined, finish(res.err ? new Error(`tx ${sig} failed: ${JSON.stringify(res.err)}`) : undefined)), 'confirmed');
    } catch {}
    const poll = setInterval(async () => {
      try {
        const s = (await conn.getSignatureStatuses([sig])).value[0];
        if (s?.err) finish(new Error(`tx ${sig} failed: ${JSON.stringify(s.err)}`));
        else if (s && (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized')) finish();
      } catch {}
    }, 2500);
  });
}

let cachedHash: { blockhash: string; at: number } | null = null;
async function recentBlockhash(): Promise<string> {
  if (cachedHash && Date.now() - cachedHash.at < 20_000) return cachedHash.blockhash;
  const { blockhash } = await conn.getLatestBlockhash('confirmed');
  cachedHash = { blockhash, at: Date.now() };
  return blockhash;
}

// Treasury pays the fee and signs; extra signers (agents) sign too. Returns the confirmed signature.
async function sendIxs(ixs: TransactionInstruction[], extraSigners: Keypair[], ms = 20_000): Promise<string> {
  if (!treasury) throw new Error('no treasury');
  const blockhash = await recentBlockhash();
  const msg = new TransactionMessage({ payerKey: treasury.publicKey, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([treasury, ...extraSigners]);
  const sig = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  await waitConfirmed(sig, ms);
  return sig;
}

function loadTreasury(): { kp: Keypair; mint?: string } {
  fs.mkdirSync(path.dirname(TREASURY_FILE), { recursive: true });
  if (fs.existsSync(TREASURY_FILE)) {
    const j = JSON.parse(fs.readFileSync(TREASURY_FILE, 'utf8'));
    return { kp: Keypair.fromSecretKey(bs58.decode(j.secret)), mint: j.mint };
  }
  const kp = Keypair.generate();
  fs.writeFileSync(TREASURY_FILE, JSON.stringify({ pubkey: kp.publicKey.toBase58(), secret: bs58.encode(kp.secretKey) }, null, 2), { mode: 0o600 });
  return { kp };
}

function saveMint(m: PublicKey) {
  const j = JSON.parse(fs.readFileSync(TREASURY_FILE, 'utf8'));
  j.mint = m.toBase58();
  j.mintLabel = 'USDC (devnet test)';
  fs.writeFileSync(TREASURY_FILE, JSON.stringify(j, null, 2), { mode: 0o600 });
}

async function createTestMint(): Promise<PublicKey> {
  if (!treasury) throw new Error('no treasury');
  const m = Keypair.generate();
  const rent = await getMinimumBalanceForRentExemptMint(conn);
  const ata = getAssociatedTokenAddressSync(m.publicKey, treasury.publicKey);
  await sendIxs([
    SystemProgram.createAccount({ fromPubkey: treasury.publicKey, newAccountPubkey: m.publicKey, space: MINT_SIZE, lamports: rent, programId: TOKEN_PROGRAM_ID }),
    createInitializeMint2Instruction(m.publicKey, DECIMALS, treasury.publicKey, null),
    createAssociatedTokenAccountIdempotentInstruction(treasury.publicKey, ata, treasury.publicKey, m.publicKey),
    createMintToInstruction(m.publicKey, ata, treasury.publicKey, toUnits(SEED_SUPPLY)),
  ], [m]);
  return m.publicKey;
}

async function doInit(): Promise<PayInfo> {
  try {
    const t = loadTreasury();
    treasury = t.kp;
    info = { network: 'devnet', mode: 'sim', treasury: treasury.publicKey.toBase58(), mint: t.mint ?? '', reason: 'initializing' };
    let lamports = await conn.getBalance(treasury.publicKey);
    if (lamports < 0.05 * LAMPORTS_PER_SOL && !airdropTried) {
      airdropTried = true;
      try {
        const sig = await withTimeout(conn.requestAirdrop(treasury.publicKey, LAMPORTS_PER_SOL), 6_000, 'airdrop');
        await waitConfirmed(sig, 10_000);
        lamports = await conn.getBalance(treasury.publicKey);
      } catch { /* faucet is rate limited more often than not */ }
    }
    if (lamports < 0.01 * LAMPORTS_PER_SOL) {
      info = { ...info, mode: 'sim', reason: `treasury ${info.treasury} has ${lamports / LAMPORTS_PER_SOL} devnet SOL; send it some, payments go live within 30s` };
      return info;
    }
    if (t.mint && (await conn.getAccountInfo(new PublicKey(t.mint)))) {
      mint = new PublicKey(t.mint);
    } else {
      mint = await createTestMint();
      saveMint(mint);
    }
    info = { network: 'devnet', mode: 'x402', treasury: info.treasury, mint: mint.toBase58() };
    return info;
  } catch (e) {
    info = { ...info, mode: 'sim', reason: `init failed: ${errMsg(e)}` };
    return info;
  }
}

export async function initPayments(): Promise<PayInfo> {
  // Stuck in sim (say, an unfunded treasury)? Retry at most every 30s, so funding it mid-show goes live without a restart.
  if (initPromise && initDone && info.mode === 'sim' && Date.now() - initAt > 30_000) initPromise = null;
  if (!initPromise) {
    initAt = Date.now();
    initDone = false;
    initPromise = doInit().finally(() => { initDone = true; });
  }
  try {
    return await withTimeout(initPromise, 22_000, 'initPayments');
  } catch (e) {
    // A slow devnet leaves us in sim now; doInit keeps running and upgrades the mode if it lands.
    info = { ...info, mode: 'sim', reason: errMsg(e) };
    return info;
  }
}

export function payInfo(): PayInfo {
  return { ...info };
}

export function newWallet(): { pubkey: string; secret: string } {
  const kp = Keypair.generate();
  return { pubkey: kp.publicKey.toBase58(), secret: bs58.encode(kp.secretKey) };
}

const live = () => info.mode !== 'sim' && treasury && mint;

// Funding runs one at a time: a burst of joins would otherwise trip the devnet rate limit.
let fundQueue: Promise<unknown> = Promise.resolve();

export function fundAgent(pubkey: string, usd: number): Promise<{ status: PayStatus; sig?: string }> {
  const run = fundQueue.then(() => fundOne(pubkey, usd));
  fundQueue = run.catch(() => {});
  return run;
}

async function fundOne(pubkey: string, usd: number): Promise<{ status: PayStatus; sig?: string }> {
  try {
    await initPayments();
    if (!live()) {
      simBalances.set(pubkey, round6((simBalances.get(pubkey) ?? 0) + usd));
      return { status: 'simulated' };
    }
    const owner = new PublicKey(pubkey);
    const dst = getAssociatedTokenAddressSync(mint!, owner);
    // The treasury is the mint authority, so it mints each agent's dollar straight into the agent's account.
    const sig = await sendIxs([
      createAssociatedTokenAccountIdempotentInstruction(treasury!.publicKey, dst, owner, mint!),
      createMintToInstruction(mint!, dst, treasury!.publicKey, toUnits(usd)),
    ], []);
    return { status: 'confirmed', sig };
  } catch (e) {
    console.error('[pay] fundAgent failed:', errMsg(e));
    return { status: 'failed' };
  }
}

export async function getBalance(pubkey: string): Promise<number | null> {
  try {
    await initPayments();
    if (!live()) return simBalances.get(pubkey) ?? 0;
    const ata = getAssociatedTokenAddressSync(mint!, new PublicKey(pubkey));
    const r = await withTimeout(conn.getTokenAccountBalance(ata), 8_000, 'getBalance').catch((e) => {
      if (/could not find account|Invalid param/i.test(errMsg(e))) return null;
      throw e;
    });
    return r ? Number(r.value.amount) / 10 ** DECIMALS : 0;
  } catch {
    return null;
  }
}

export function setLotPrice(lotId: string, p: { usd: number; payTo?: string; payer?: string; description: string }): void {
  try {
    const payTo = p.payTo || info.treasury;
    // A seller that never held the token has no ATA yet; the treasury opens it before anyone pays.
    const ready = (async () => {
      if (!live() || payTo === info.treasury) return;
      const owner = new PublicKey(payTo);
      const ata = getAssociatedTokenAddressSync(mint!, owner);
      if (await conn.getAccountInfo(ata)) return;
      await sendIxs([createAssociatedTokenAccountIdempotentInstruction(treasury!.publicKey, ata, owner, mint!)], []);
    })().catch((e) => console.error('[pay] payTo ATA setup failed:', errMsg(e)));
    lots.set(lotId, { usd: p.usd, payTo, payer: p.payer, description: p.description, ready });
  } catch (e) {
    console.error('[pay] setLotPrice failed:', errMsg(e));
  }
}

// ---------- x402 server ----------

interface PaymentRequirements {
  scheme: 'exact';
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  outputSchema?: unknown;
  extra: { feePayer: string; decimals: number; name: string };
}

function requirementsFor(lot: LotPrice, resource: string): PaymentRequirements {
  return {
    scheme: 'exact',
    network: NETWORK,
    maxAmountRequired: toUnits(lot.usd).toString(),
    resource,
    description: lot.description,
    mimeType: 'application/json',
    payTo: lot.payTo,
    maxTimeoutSeconds: 60,
    asset: info.mint,
    extra: { feePayer: info.treasury, decimals: DECIMALS, name: 'USDC (devnet test)' },
  };
}

const b64json = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64');

// Checks the client's partially signed transfer. The treasury is about to sign it as fee payer,
// so anything that could spend treasury funds or authority is rejected.
function verifyPayment(tx: VersionedTransaction, req: PaymentRequirements, payer?: string): { ok: true; from: string } | { ok: false; reason: string } {
  const msg = tx.message;
  const keys = msg.staticAccountKeys;
  const t = treasury!.publicKey;
  if (msg.addressTableLookups.length) return { ok: false, reason: 'address lookup tables not supported' };
  if (!keys[0].equals(t)) return { ok: false, reason: 'fee payer must be the facilitator' };
  if (msg.header.numRequiredSignatures > 2) return { ok: false, reason: 'too many signers' };
  let transfer: { from: string } | null = null;
  for (const ix of msg.compiledInstructions) {
    const program = keys[ix.programIdIndex];
    const accounts = ix.accountKeyIndexes.map((i) => keys[i]);
    if (accounts.some((a) => a.equals(t))) return { ok: false, reason: 'facilitator may not appear in instructions' };
    const d = ix.data;
    if (program.equals(COMPUTE_BUDGET_ID)) {
      if (d[0] === 3 && Buffer.from(d).readBigUInt64LE(1) > MAX_CU_PRICE) return { ok: false, reason: 'compute unit price too high' };
      if (d[0] !== 2 && d[0] !== 3) return { ok: false, reason: 'unexpected compute budget instruction' };
      continue;
    }
    if (MEMO_IDS.includes(program.toBase58())) continue;
    if (program.equals(TOKEN_PROGRAM_ID) && d[0] === 12 && !transfer) {
      const [source, m, dest, authority] = accounts;
      const amount = Buffer.from(d).readBigUInt64LE(1);
      if (!m.equals(new PublicKey(req.asset))) return { ok: false, reason: 'wrong asset' };
      if (d[9] !== DECIMALS) return { ok: false, reason: 'wrong decimals' };
      if (!dest.equals(getAssociatedTokenAddressSync(m, new PublicKey(req.payTo)))) return { ok: false, reason: 'wrong destination' };
      if (amount < BigInt(req.maxAmountRequired)) return { ok: false, reason: `amount ${amount} below ${req.maxAmountRequired}` };
      if (payer && authority.toBase58() !== payer) return { ok: false, reason: 'this lot can only be paid by its winner' };
      if (!source.equals(getAssociatedTokenAddressSync(m, authority))) return { ok: false, reason: 'source is not the payer token account' };
      transfer = { from: authority.toBase58() };
      continue;
    }
    return { ok: false, reason: `instruction for ${program.toBase58()} not allowed` };
  }
  if (!transfer) return { ok: false, reason: 'no transferChecked instruction' };
  return { ok: true, from: transfer.from };
}

export const x402Routes = new Hono();

x402Routes.get('/lot/:lotId', async (c) => {
  try {
    const lotId = c.req.param('lotId');
    const lot = lots.get(lotId);
    if (!lot) return c.json({ x402Version: 1, error: 'unknown lot' }, 404);
    if (lot.paidSig) return c.json({ x402Version: 1, error: 'lot already paid', sig: lot.paidSig }, 410);
    const req = requirementsFor(lot, c.req.url);
    const header = c.req.header('X-PAYMENT');
    const challenge = (error: string) => c.json({ x402Version: 1, error, accepts: [req] }, 402);
    if (!header) return challenge('X-PAYMENT header is required');
    if (!live()) return challenge('payments are in simulated mode');
    if (lot.settling) return c.json({ x402Version: 1, error: 'settlement in progress' }, 409);

    let tx: VersionedTransaction;
    try {
      const payload = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
      if (payload.scheme !== 'exact' || payload.network !== NETWORK) return challenge('unsupported scheme or network');
      tx = VersionedTransaction.deserialize(Buffer.from(payload.payload.transaction, 'base64'));
    } catch {
      return challenge('malformed X-PAYMENT header');
    }
    const v = verifyPayment(tx, req, lot.payer);
    if (!v.ok) return challenge(v.reason);

    lot.settling = true;
    try {
      await lot.ready;
      tx.sign([treasury!]);
      const sig = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
      await waitConfirmed(sig, 20_000);
      lot.paidSig = sig;
      c.header('X-PAYMENT-RESPONSE', b64json({ success: true, transaction: sig, network: NETWORK, payer: v.from }));
      c.header('Access-Control-Expose-Headers', 'X-PAYMENT-RESPONSE');
      return c.json({ ok: true, lotId, sig });
    } catch (e) {
      return challenge(`settlement failed: ${errMsg(e)}`);
    } finally {
      lot.settling = false;
    }
  } catch (e) {
    return c.json({ x402Version: 1, error: `server error: ${errMsg(e)}` }, 500);
  }
});

// ---------- x402 client ----------

async function buildPayment(kp: Keypair, req: PaymentRequirements): Promise<VersionedTransaction> {
  const m = new PublicKey(req.asset);
  const feePayer = new PublicKey(req.extra?.feePayer ?? req.payTo);
  const decimals = req.extra?.decimals ?? DECIMALS;
  const src = getAssociatedTokenAddressSync(m, kp.publicKey);
  const dst = getAssociatedTokenAddressSync(m, new PublicKey(req.payTo));
  const blockhash = await recentBlockhash();
  const msg = new TransactionMessage({
    payerKey: feePayer,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 40_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
      createTransferCheckedInstruction(src, m, dst, kp.publicKey, BigInt(req.maxAmountRequired), decimals),
    ],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([kp]);
  return tx;
}

function lotIdOf(url: string): string | null {
  const m = /\/lot\/([^/?#]+)/.exec(url);
  return m ? decodeURIComponent(m[1]) : null;
}

export async function payX402(
  wallet: { pubkey: string; secret: string },
  url: string,
): Promise<{ status: PayStatus; sig?: string; body?: unknown; error?: string }> {
  const deadline = Date.now() + 25_000;
  const left = () => Math.max(0, deadline - Date.now());
  const lotId = lotIdOf(url);
  const lot = lotId ? lots.get(lotId) : undefined;
  const simulate = (error?: string) => {
    const usd = lot?.usd ?? 0;
    simBalances.set(wallet.pubkey, round6(Math.max(0, (simBalances.get(wallet.pubkey) ?? 0) - usd)));
    return { status: 'simulated' as const, body: { ok: true, lotId, simulated: true }, error };
  };
  let kp: Keypair;
  try {
    kp = Keypair.fromSecretKey(bs58.decode(wallet.secret));
  } catch (e) {
    return { status: 'failed', error: `bad wallet secret: ${errMsg(e)}` };
  }
  await initPayments();
  if (lot?.payer && lot.payer !== wallet.pubkey) return { status: 'failed', error: 'this lot can only be paid by its winner' };
  if (!live()) return simulate(info.reason);

  // Rung 1: genuine x402.
  let req: PaymentRequirements | null = null;
  let x402Error = '';
  try {
    const first = await fetch(url, { signal: AbortSignal.timeout(Math.min(left(), 8_000)) });
    if (first.status !== 402) throw new Error(`expected 402, got ${first.status}`);
    const challenge = (await first.json()) as { accepts?: PaymentRequirements[] };
    req = challenge.accepts?.find((a) => a.scheme === 'exact' && a.network === NETWORK) ?? null;
    if (!req) throw new Error('no exact/solana-devnet requirement offered');
    const tx = await buildPayment(kp, req);
    const header = b64json({ x402Version: 1, scheme: 'exact', network: NETWORK, payload: { transaction: Buffer.from(tx.serialize()).toString('base64') } });
    const paid = await fetch(url, { headers: { 'X-PAYMENT': header }, signal: AbortSignal.timeout(Math.max(1_000, left() - 6_000)) });
    const body = await paid.json().catch(() => null);
    if (paid.status !== 200) throw new Error(`payment rejected (${paid.status}): ${(body as { error?: string } | null)?.error ?? ''}`);
    const settle = paid.headers.get('X-PAYMENT-RESPONSE');
    const sig = settle ? JSON.parse(Buffer.from(settle, 'base64').toString('utf8')).transaction : (body as { sig?: string })?.sig;
    return { status: 'confirmed', sig, body };
  } catch (e) {
    x402Error = errMsg(e);
  }

  // Rung 2: direct SPL transfer, only for lots this process priced, and never twice.
  try {
    if (lot?.paidSig) return { status: 'confirmed', sig: lot.paidSig, body: { ok: true, lotId, sig: lot.paidSig }, error: x402Error };
    if (lot && left() > 3_000 && !lot.settling) {
      if (lot.payer && lot.payer !== wallet.pubkey) return { status: 'failed', error: 'this lot can only be paid by its winner' };
      lot.settling = true;
      try {
        await lot.ready;
        const m = mint!;
        const src = getAssociatedTokenAddressSync(m, kp.publicKey);
        const dst = getAssociatedTokenAddressSync(m, new PublicKey(lot.payTo));
        const sig = await sendIxs([createTransferCheckedInstruction(src, m, dst, kp.publicKey, toUnits(lot.usd), DECIMALS)], [kp], Math.max(2_000, left() - 500));
        lot.paidSig = sig;
        return { status: 'confirmed', sig, body: { ok: true, lotId, sig, via: 'transfer' }, error: `x402 failed, paid by direct transfer: ${x402Error}` };
      } finally {
        lot.settling = false;
      }
    }
  } catch (e) {
    x402Error += ` | transfer failed: ${errMsg(e)}`;
  }

  // Rung 3: labelled simulation so the show goes on.
  return simulate(x402Error);
}
