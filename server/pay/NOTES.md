# server/pay notes

## Paid seats through pay.sh (round 2)

- `server/enter.ts` serves `POST /paid/<token>/enter`. It accepts only loopback callers holding the token from `data/pay-gate.json`, and returns 404 for everything else. Mount it with `app.route('/paid', enterRoutes)`.
- `server/pay/gate.ts` writes `data/paywall.yml` (routing proxy to that route, `POST enter` at $0.05) and runs pay's gateway: `npx tsx server/pay/gate.ts --sandbox` (hosted sandbox, debugger on the same port) or `npx tsx server/pay/gate.ts` (mainnet USDC to `data/house-mainnet.json`, 4WAFs7ScsnZ7Kf3w4epEoBSCfsdVssYEN4Et6oAAKKxS). Public URL: `http://<host>:1402/enter`.
- The gateway speaks MPP `solana/charge` (WWW-Authenticate: Payment ... intent="charge"), not x402. `pay curl` and `pay claude` handle it.
- Mainnet status: the 402 comes back, then settlement fails with "Attempt to debit an account but found no record of a prior credit". The fee payer has 0 SOL: `karimbaba` 6kQjP6pSmHbyPm4YSrWT4v2m92VKXCGwaMkkyZMcPs7R holds $5 USDC and 0 SOL, and no hosted fee payer steps in for a self-run gateway. Likely fix: about 0.01 SOL on 6kQj (it pays the fee plus the rent for the recipient's USDC account). Not verified. The first mainnet try also died on "Blockhash not found" after a slow client (about 2 min). Nothing was spent.

## State (2026-09-30)

- Code is x402 exact-SVM (protocol v1), hand-rolled on `@solana/web3.js` + `@solana/spl-token`. No new npm deps.
- Devnet treasury `2dfExpNMcViY4fynUDWvfo96xcBgHLpV5X8r59tACEsi` has 0 SOL, so devnet runs in `sim` mode.
- The full x402 flow is proven on Surfpool 1.0.0 (a local devnet fork, same SVM and same code), not on public devnet.

## Going live on devnet

1. Send 1 to 2 devnet SOL to `2dfExpNMcViY4fynUDWvfo96xcBgHLpV5X8r59tACEsi` (faucet.solana.com in a browser, GitHub login lifts the limit).
2. Nothing else. `initPayments()` retries every 30s while in sim, creates the "USDC (devnet test)" mint (6 decimals, treasury is mint authority, 1,000 seeded), saves it to `data/treasury.json`, and flips to `x402`.
3. Proof: `npx tsx server/pay/smoke.ts`.

`data/treasury.json` currently names a mint that exists only on the Surfpool fork. On devnet `getAccountInfo` returns null, so init creates a fresh mint and overwrites it. Expected.

## Why no SOL

- `requestAirdrop` on api.devnet.solana.com and devnet.rpcpool.com: 429, daily limit for this IP. Ankr, Helius, OnFinality, Alchemy demo: need API keys or 429.
- faucet.solana.com: Cloudflare captcha, and its "I am an AI Agent" panel says agents must not use it. Not bypassed.
- devnet-pow (the faucet's suggested route) needs a fee payer that already holds SOL. Dropped.

## Why rung 3

- Rung 1: the `pay` CLI is a proxy/CLI (MPP, hosted sandbox or local Surfpool), not a Node server/client library for a raw Keypair on devnet.
- Rung 2: `@x402/svm` 2.28.0 exists (released 2026-09-29) but is built on `@solana/kit` plus a facilitator split. Wiring it up would cost more time than the hand-roll.
- The hand-roll follows the spec: 402 body `{x402Version:1, error, accepts:[{scheme:'exact', network:'solana-devnet', maxAmountRequired, resource, payTo, asset, extra:{feePayer, decimals}}]}`, base64 `X-PAYMENT` holding `{payload:{transaction}}`, and base64 `X-PAYMENT-RESPONSE` `{success, transaction, network, payer}`.

## Server checks before the treasury co-signs

The fee payer must be the treasury. There are no lookup tables and at most 2 signers. Only ComputeBudget (CU price capped at 5 lamports/CU), Memo and one SPL `transferChecked` are allowed. The treasury may not appear in any instruction. The transfer must use the right mint, 6 decimals and the ATA of `payTo`, the amount must be at least the price, and the source must be the authority's own ATA. When `payer` is set, the authority must equal it. A lot settles once: a second payment gets 410, and a payment during settlement gets 409.

## Known gaps

- x402 v1 headers only. v2 (`PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE`) is not served.
- The runtime ladder follows the brief: x402, then direct transfer, then simulated. An agent without enough funds therefore ends as `simulated` (labelled, with `error`), not `failed`.
- There are no negative tests for a malicious X-PAYMENT (checks were read, not fuzzed).
- The sim ledger lives in memory and resets on restart.
- Circle devnet USDC was skipped because the treasury could not get SOL. Stretch (`buyWithPay`) was not attempted.
- Surfpool was installed through `brew tap txtx/taps`. Remove it with `brew uninstall surfpool && brew untap txtx/taps`.
