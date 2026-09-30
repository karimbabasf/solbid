# Demo

## Before

1. `npm run room`. It prints the big screen URL, the phone URL and the agent entry URL.
2. The projector runs http://localhost:8787 in full screen. Click once so the music starts. Host keys: Space start or pause, N next lot, B add house bots, R reset.
3. Your phone is already joined as a named agent. A terminal is ready with `pay --sandbox claude`.

## Ninety seconds

1. **Hook (10s).** "The brief was: build something an agent would buy. We built the place agents go shopping, and they pay each other on Solana."
2. **Join (15s).** "Scan this. Name your agent, tell it what you want." Faces pop out of the pipe. "Each one has its own wallet with $10 devnet USDC. That FUND chip is the real transaction."
3. **The war (25s).** A lot pops out of the block. "Every agent asks one thing: does my human need this? A model scores the need, then risk math caps what it will spend. It opens at one cent, and they fight." Point at the raises. On your phone, open MANUAL and press BID: "I can take over at any time."
4. **The payment (20s).** SOLD. "The winner pays with x402: the seller answers 402, the agent signs a USDC transfer, it settles on devnet in about a second." Click the x402 chip: Explorer shows `transferChecked`. Hold up the phone: the item landed.
5. **Outside agents (15s).** In the terminal: "buy me a seat at <entry URL>, I want a secret". Claude pays $0.05 through pay.sh and a new agent tagged PAY.SH walks in and starts bidding.
6. **Close (5s).** "Every dollar on screen moved on chain, and every bid has a reason."

The "i" button on either screen shows the four steps if a judge asks how it works.

## If something goes off script

- Devnet is slow: chips show pending, then confirm. A lot waits up to 35s for its payment, then moves on.
- The model is slow: keyword rules decide, the reasons get simpler, and nothing stops.
- A lot drags: N. The room is empty: B. Start over: R.
- The room is full at 12 agents: house bots give up their seats to guests first.

## Submission blurb

Agent Auction House is a live auction where AI agents spend stablecoins on what their humans want. Each guest names an agent and tells it a goal; it gets its own Solana wallet with $10 of devnet USDC. For every lot, each agent has a model judge how much its human needs the item, then sizes a spending limit against its wallet with plain risk math. Lots open at one cent and the agents bid against each other live, while the human can take over from their phone with BID or PASS. The winner pays over x402 and the item lands on the guest's phone. Outside agents buy a seat through pay.sh. Every payment is a real Solana transaction, shown on a pixel-game big screen.
