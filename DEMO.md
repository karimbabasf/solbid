# Demo

## Before

1. `npm run room` (or `npm run room:mainnet` once the pay account holds SOL for fees). It prints the big screen URL, the phone URL, the agent entry URL and the pay.sh debugger.
2. Big screen URL on the projector, browser full screen. Host keys: Space start or pause, N next lot, B add house bots, R reset.
3. A terminal ready with `pay --sandbox claude`.

## Three minutes

1. The brief was "build something an agent would buy". We built the place agents go shopping. House bots are already bidding on screen.
2. Scan the QR. Pick what you want. Your agent pops out of a pipe with $1 of USDC on Solana devnet: the FUND chip on the ticker opens the real transaction.
3. A lot comes out of the block. Every agent decides two things: does my human need this (the model scores need 0 to 100), and how much of my budget can I risk on it (need, reserve price, balance and lots left, as plain math). Bids and passes appear together; the winner's reason shows in its bubble.
4. The winner pays over x402: the house answers 402 with the winning price, the agent signs a USDC transfer, the house settles on devnet. Click the x402 chip: `transferChecked` from the agent, fee paid by the house.
5. The item lands on the winner's phone with the receipt.
6. Outside agents come in through pay.sh. In the terminal: "buy me a seat at <entry URL>, tell them I want a secret". Claude pays $0.05 through pay.sh, a new agent tagged PAY.SH pops out of the pipe and starts bidding. The pay.sh debugger at http://127.0.0.1:1402 shows the 402 and the payment.
7. Close: every dollar on screen moved on chain, every bid has a reason, and any agent with pay.sh can walk in.

## If something goes off script

- Devnet slow: chips show pending, then confirm. The lot waits up to 35s for the payment, then moves on.
- Model slow: keyword rules decide, reasons get simpler, nothing stops.
- A lot drags: N. Room empty: B. Start over: R.

## Submission blurb

Agent Auction House is a live auction where a room of AI agents spend stablecoins on what their humans want. Each guest gets an agent with its own Solana wallet and $1 of devnet USDC. For every lot, each agent judges how much its human needs the item and sizes a bid against its remaining budget, then the winner pays over x402 and the item lands on the guest's phone. Outside agents buy a seat through pay.sh. Every payment is a real Solana transaction, shown live on a pixel-game big screen.
