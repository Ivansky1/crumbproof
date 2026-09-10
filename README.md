# CrumbProof

Proof, baked on-chain. CrumbProof creates and verifies tamper-evident file and text receipts on [Cookie Chain](https://docs.cookiechain.wtf), without uploading the original content.

Built for the [Create an App on Cookie Chain bounty](https://superteam.fun/earn/listing/create-an-app-on-cookie-chain-app).

## What it does

1. Hashes a local file or text with SHA-256 in the browser.
2. Encodes the fingerprint and small public metadata in a versioned Memo instruction.
3. Uses a Nightly Wallet to sign and send the transaction to Cookie Chain.
4. Waits for confirmed finality and returns a CookieScan receipt.
5. Verifies any CrumbProof receipt by transaction signature and optionally compares the original file.

The file or text never leaves the browser. Only its fingerprint, label, kind, byte size, MIME type, and client creation time are written to the public chain.

## Bounty requirements covered

- Nightly Wallet detection and connection via Wallet Standard
- Cookie Chain custom-network request with an explicit genesis-hash guard
- Connected wallet address display
- Real Memo program transaction signed by the connected wallet
- Preflight, confirmation, rejection, RPC, and wrong-chain error handling
- Live chain slot and transaction-count feedback
- App-specific wallet receipt history
- Public receipt verification with optional file-integrity comparison
- Responsive public web application and open-source code

## Stack

- React 19, TypeScript, and Vite
- `@solana/web3.js` against the Cookie Chain RPC
- Wallet Standard wrapped with the Solana standard wallet adapter
- Browser Web Crypto for SHA-256
- Vitest for the proof protocol

## Run locally

Requirements: Node.js 20+ and a Nightly browser extension configured for Cookie Chain.

```bash
npm install
npm run dev
```

The default application URL is `http://localhost:5173`.

Optional RPC override:

```bash
VITE_COOKIE_RPC=https://rpc.cookiescan.io npm run dev
```

The app refuses to sign if the configured RPC does not report Cookie Chain's expected genesis hash.

## Validate

```bash
npm test
npm run lint
npm run build
```

## Receipt protocol

CrumbProof uses Cookie Chain's genesis-embedded Memo program:

```text
MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr
```

The UTF-8 memo starts with `crumbproof:v1:` followed by compact JSON:

```json
{
  "h": "lowercase SHA-256 hex",
  "l": "public label",
  "k": "file or text",
  "s": 1234,
  "m": "MIME type",
  "t": "ISO-8601 client timestamp"
}
```

Verification treats the transaction's confirmed block time as the authoritative chain timestamp. The memo timestamp is retained as creation metadata and a fallback for RPC responses without block time.

## Network

- RPC: `https://rpc.cookiescan.io`
- WebSocket: `wss://wss.cookiescan.io`
- Genesis hash: `9wDaBRDgArEUpvhHxGguNkwozsZh4UpGZB9o2EoEcBB2`
- Explorer: [cookiescan.io](https://cookiescan.io)
- Bridge: [hyperlane.cookiescan.io](https://hyperlane.cookiescan.io)

## Security notes

- CrumbProof never asks for or handles a seed phrase or private key.
- Every write requires explicit approval in Nightly.
- Metadata is public and should not contain secrets or personal data.
- A proof demonstrates that the signer committed to a fingerprint by the transaction time. It does not prove authorship, legality, or the truth of the underlying content.

## License

MIT

