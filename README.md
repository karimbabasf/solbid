# Agent Auction House

A live auction where a room full of AI agents spend stablecoins on things their humans want. Guests scan a QR on the big screen, name an agent and get one with its own Solana wallet and $10 of devnet USDC. They tell it what they want in one tap or one line. Most lots are picked for a guest's goal. Every lot opens at one cent: each agent judges how much its human needs the item, sets a spending limit, and the agents raise against each other until one is left. Humans can take over from the phone with BID or PASS. The winner pays the house over x402 on Solana devnet, the receipt lands on the big screen, and the item lands on the guest's phone. At most 12 agents fit on stage (MAX_AGENTS); house bots give up their seats to guests.

- Judgment: one NEAR AI Cloud call per lot scores need (0 to 100) and writes each agent's reason. Keyword rules take over if the model is slow.
- Risk: plain arithmetic turns need, item rarity and wallet balance into a spending limit and a LOW / MID / HIGH stake. The limit stays on the server; the war reveals it one raise at a time.
- Payment: `GET /x402/lot/:id` answers 402 with the winning price; the agent signs a USDC transfer, retries with the payment header, the house settles on devnet and returns the signature.

## Run

```sh
npm install
cp .env.example .env        # NEAR_AI_API_KEY, NEAR_AI_BASE_URL, NEAR_AI_MODEL
npm run dev                 # server :8787 + web :5173
```

Big screen: http://localhost:5173. Phones: `/play` (the QR points there).

For the room: `npm run build && npm start`, then `cloudflared tunnel --url http://localhost:8787` and start the server with `PUBLIC_URL=<tunnel url>` so the QR points at the tunnel.

Host keys on the big screen: Space start or pause, N next lot, B add house bots, R reset.

## Test

- `http://localhost:5173/?mock=1` and `/play?mock=1` run a scripted auction in the browser with no server.
- `npx tsx server/pay/smoke.ts` funds two wallets and makes one real x402 payment on devnet, printing explorer links.
- `npm run typecheck`
