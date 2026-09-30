// The one contract between server, stage and phone. Change it only in the lead thread.

export type Phase = 'lobby' | 'intro' | 'thinking' | 'reveal' | 'paying' | 'sold' | 'unsold';

export type GoalId = 'laugh' | 'art' | 'alpha' | 'weather' | 'custom';

export type ItemIcon = 'joke' | 'art' | 'weather' | 'secret' | 'price' | 'fortune' | 'haiku' | 'coffee';

export type Risk = 'low' | 'mid' | 'high';

export interface AgentPublic {
  id: string;
  name: string; // short, uppercase, e.g. "PIP"
  color: number; // 0..7, index into the kit palette
  sprite: number; // 0..3, body variant
  goal: GoalId;
  goalText: string; // what the guest asked for, <= 40 chars
  wallet: string; // base58 pubkey
  balance: number; // USDC
  funded: boolean;
  house: boolean; // house bot, not a guest
  wins: number;
  spent: number;
  joinedAt: number;
}

export interface Lot {
  id: string;
  index: number; // 1-based
  total: number;
  itemId: string;
  name: string; // 1-2 words
  icon: ItemIcon;
  reserve: number; // USDC floor
  seller: string; // pubkey that gets paid
}

export interface Bid {
  agentId: string;
  amount: number | null; // null = pass
  need: number; // 0..100, how much the guest needs this
  risk: Risk; // how much of the remaining budget this bid puts at stake
  reason: string; // <= 60 chars
}

export type PaymentStatus = 'pending' | 'confirmed' | 'failed' | 'simulated';

export interface Payment {
  id: string;
  kind: 'fund' | 'x402';
  agentId: string;
  amount: number;
  status: PaymentStatus;
  sig?: string;
  explorer?: string; // full Solana Explorer URL
  lotId?: string;
  at: number;
}

export type DeliveryContent =
  | { type: 'text'; text: string }
  | { type: 'svg'; svg: string; caption?: string };

export interface Delivery {
  lotId: string;
  agentId: string;
  icon: ItemIcon;
  name: string;
  price: number;
  content: DeliveryContent;
  sig?: string;
  explorer?: string;
  at: number;
}

export interface AuctionState {
  phase: Phase;
  phaseEndsAt: number; // epoch ms, 0 when open-ended
  lot: Lot | null;
  bids: Bid[]; // filled during 'thinking' (hidden) and shown from 'reveal'
  winner: { agentId: string; amount: number } | null;
  agents: AgentPublic[];
  payments: Payment[]; // newest first, max 24
  network: 'devnet' | 'mainnet';
  payMode: 'x402' | 'transfer' | 'sim';
  joinUrl: string;
  lotsSold: number;
  paused: boolean;
  serverTime: number;
}

// SSE on GET /api/stream[?agent=<id>]
//   event: state  -> AuctionState (full snapshot on every change)
//   event: me     -> MeState (only when ?agent= is set)
export interface MeState {
  agent: AgentPublic | null;
  deliveries: Delivery[]; // newest first
}

// POST /api/join  body JoinRequest -> { agentId: string }
export interface JoinRequest {
  goal: GoalId;
  text?: string; // custom goal line
  color?: number;
  sprite?: number;
  name?: string;
}

// POST /api/host/:action  action = start | pause | next | reset | bots
