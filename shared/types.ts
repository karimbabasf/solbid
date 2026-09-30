// The one contract between server, stage and phone. Change it only in the lead thread.

// reveal = the live bidding war: every lot opens at one cent and agents raise against each other until one is left.
export type Phase = 'lobby' | 'intro' | 'thinking' | 'reveal' | 'paying' | 'sold' | 'unsold';

export type GoalId = 'laugh' | 'art' | 'alpha' | 'weather' | 'custom';

export type ItemIcon =
  | 'joke' | 'art' | 'weather' | 'secret' | 'price' | 'fortune' | 'haiku' | 'coffee'
  | 'roast' | 'meme' | 'sunset' | 'crystal' | 'rocket' | 'heart' | 'wish';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

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
  via?: 'pay.sh'; // bought its seat from outside through pay.sh
}

export interface Lot {
  id: string;
  index: number; // 1-based
  total: number;
  itemId: string;
  name: string; // 1-2 words
  icon: ItemIcon;
  reserve: number; // opening price in USDC, same as open
  open: number; // every lot opens here (0.01)
  rarity: Rarity;
  teaser: string; // what the winner gets, <= 60 chars, e.g. "A roast written live about you"
  forAgentId?: string; // the guest this lot was picked for (their goal fits it)
  seller: string; // pubkey that gets paid
}

// One raise in the bidding war, oldest first.
export interface Raise {
  agentId: string;
  amount: number;
  at: number; // epoch ms
  manual?: boolean; // the human pressed BID on their phone
}

export interface Bid {
  agentId: string;
  amount: number | null; // this agent's latest raise so far, null = has not raised
  need: number; // 0..100, how much the guest needs this
  risk: Risk; // how much of the wallet this agent is willing to stake on the lot
  reason: string; // <= 60 chars
  state: 'pass' | 'in' | 'out'; // pass = never bidding on this lot, in = still in the war, out = dropped when the price passed its limit
  manual?: 'bid' | 'pass'; // the human overrode the agent from their phone
}

export type PaymentStatus = 'pending' | 'confirmed' | 'failed' | 'simulated';

export interface Payment {
  id: string;
  kind: 'fund' | 'x402' | 'seat'; // seat = an outside agent paid to enter through pay.sh
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
  ladder: Raise[]; // the bidding war so far, oldest first; empty outside reveal/paying/sold
  price: number; // current high bid, 0 before the first raise
  next: number; // the amount the next raise must reach
  going: boolean; // nobody else will raise: going once, going twice, then the hammer at phaseEndsAt
  agents: AgentPublic[];
  payments: Payment[]; // newest first, max 24
  network: 'devnet' | 'mainnet';
  payMode: 'x402' | 'transfer' | 'sim';
  joinUrl: string;
  enterUrl?: string; // where outside agents buy a seat with pay.sh (POST, $0.05)
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

// POST /api/join  body JoinRequest -> JoinResponse
// POST /api/agent/:id/act    body { key, action: 'bid' | 'pass' } -> { ok: boolean; error?: string }
//   bid: raise now to state.next (or, before the war, tell the agent you want this lot). pass: skip or drop out of this lot.
// POST /api/agent/:id/leave  body { key } -> { ok: boolean }   removes the agent from the room
export interface JoinResponse {
  agentId: string;
  key: string; // keep it on the phone: it signs act and leave
}

export interface JoinRequest {
  goal: GoalId;
  text?: string; // custom goal line
  color?: number;
  sprite?: number;
  name?: string; // up to 7 letters or digits, uppercased; a free name is picked when taken or empty
}

// POST /api/host/:action  action = start | pause | next | reset | bots
