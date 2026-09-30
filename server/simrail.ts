import { Hono } from 'hono';
import type { PayRail } from './engine.ts';

// Stand-in rail used only when server/pay fails to load. Everything it returns is labelled simulated.
const fakeKey = () => Array.from({ length: 44 }, () => '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[Math.floor(Math.random() * 58)]).join('');

export const simRoutes = new Hono().get('/lot/:lotId', (c) => c.json({ ok: true, lotId: c.req.param('lotId'), simulated: true }));

export const simRail = (reason: string): PayRail => {
  const info = { network: 'devnet' as const, mode: 'sim' as const, treasury: fakeKey(), mint: 'simulated', reason };
  return {
    initPayments: async () => info,
    payInfo: () => info,
    newWallet: () => ({ pubkey: fakeKey(), secret: '' }),
    fundAgent: async () => ({ status: 'simulated' }),
    getBalance: async () => null,
    setLotPrice: () => {},
    payX402: async () => ({ status: 'simulated' }),
    explorer: (sig) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
  };
};
