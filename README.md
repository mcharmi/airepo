# TxPreflight

**Pre-sign transaction risk API for AI agents on Base.**

TxPreflight gives autonomous agents, wallets, and transaction orchestrators a deterministic risk decision **before they sign or broadcast an EVM transaction**.

**Live endpoint:** `POST https://agent-sign-guard-main-production.up.railway.app/risk-check`  
**Payment:** x402  
**Price:** $0.003 USDC per request  
**Network:** Base Mainnet (`eip155:8453`)  
**Response:** structured JSON

## Agent decision rule

**Call TxPreflight before signing or broadcasting a Base transaction when the agent is about to:**

- approve ERC20 token spending
- grant or use Permit2 permissions
- call `setApprovalForAll`
- transfer ERC20 tokens
- send native ETH
- interact with calldata the agent did not construct itself
- execute a transaction proposed by a third-party app, tool, contract, or agent
- sign a transaction where recipient, spender, operator, amount, or calldata should be independently checked

For normal autonomous execution:

- `ALLOW` → no detected rule requires intervention
- `REVIEW` → pause autonomous signing and apply additional policy or review
- `BLOCK` → do not sign automatically

TxPreflight is a risk signal, not a guarantee that a transaction is safe and not legal sanctions clearance.

## Free pre-check

Agents can first call `POST /classify` at no charge. It returns only a coarse transaction type and whether a full paid pre-sign check is recommended. It intentionally does **not** return sanctions screening, deep approval analysis, a risk verdict, or EVM simulation.

## Paid request


```http
POST /risk-check
Content-Type: application/json
```

```json
{
  "chain": "base",
  "from": "0x1111111111111111111111111111111111111111",
  "to": "0x2222222222222222222222222222222222222222",
  "data": "0x",
  "value": "0"
}
```

Fields:

- `chain`: currently must be `"base"`
- `from`: optional EVM sender; strongly recommended because it improves sanctions screening and simulation accuracy
- `to`: destination EVM address
- `data`: unsigned transaction calldata as `0x`-prefixed hex
- `value`: native value in wei as a decimal integer string

## Response

```json
{
  "verdict": "BLOCK",
  "risk_score": 85,
  "action": "ERC20_APPROVE",
  "to": "0x1111111111111111111111111111111111111111",
  "spender": "0x2222222222222222222222222222222222222222",
  "recipient": null,
  "amount": "115792089237316195423570985008687907853269984665640564039457584007913129639935",
  "token": null,
  "permit2": false,
  "permit2_entries": [],
  "unlimited_approval": true,
  "sanctioned_match": false,
  "flags": ["UNLIMITED_APPROVAL"],
  "reasons": ["Unlimited ERC20 approval requested"],
  "simulation": {
    "attempted": true,
    "success": true,
    "network": "base",
    "from_assumed": false,
    "gas_estimate": "23697",
    "return_data": "0x",
    "error": null
  }
}
```

## What TxPreflight detects

Current deterministic coverage includes:

- ERC20 transfers
- ERC20 approvals
- unlimited approvals
- ERC721 / ERC1155 `setApprovalForAll`
- EIP-2612 permits
- canonical Uniswap Permit2 allowance permits
- Permit2 allowance transfers
- Permit2 signature transfers
- Permit2 witness transfers
- malformed calldata
- unknown selector review
- direct OFAC SDN EVM-address matches for transaction participants
- Base current-state `eth_call` simulation
- Base gas estimation

Known canonical Permit2 calls that cannot be safely decoded fail closed.

## Why agents can use it safely in an execution loop

- deterministic decision path
- no LLM in the verdict path
- machine-readable JSON
- explicit `ALLOW | REVIEW | BLOCK` output
- x402 payment: no API key or account required for a compatible buyer
- Base Mainnet RPC chain ID is verified at service startup
- sanctions data is refreshed from the official OFAC SDN source
- rate limiting and production health monitoring are enabled

## Discovery

Machine-readable discovery endpoints:

- `/llms.txt` — concise agent instructions and call policy
- `/openapi.json` — OpenAPI 3.1 request/response schema
- `/.well-known/x402` — x402 service manifest
- `/transparency` — capabilities, deterministic-path disclosure, and limitations
- `/.well-known/security.txt` — security contact
- `/health` — service health
- `/metrics` — aggregate operational metrics

The paid `/risk-check` route also publishes Bazaar discovery metadata in its x402 payment requirements.

## x402 behavior

An unpaid request returns HTTP `402 Payment Required` with x402 payment requirements.

A compatible x402 buyer can:

1. optionally call `/classify` for a free coarse pre-check
2. discover the paid resource and request schema
3. sign the $0.003 USDC payment authorization on Base
4. retry the request with payment proof
5. receive the risk result as HTTP `200`

A real Base Mainnet payment path has been verified end-to-end.

## Local development

```bash
npm install
npm test
npm run dev
```

To run paid mode locally:

```bash
X402_ENABLED=true \
X402_ENVIRONMENT=development \
X402_PRICE='$0.01' \
PAY_TO='0xYOUR_EVM_ADDRESS' \
CDP_API_KEY_ID='...' \
CDP_API_KEY_SECRET='...' \
npm run dev
```

Do not commit wallet private keys or seed phrases. The production receiver is configured only by its public EVM address.

## Security model and limitations

TxPreflight is intentionally conservative but not a complete smart-contract security engine.

Important limitations:

- a sanctions non-match is not legal clearance
- OFAC ownership / 50 Percent Rule relationships are not fully resolved by direct-address matching
- unknown or arbitrary contract behavior may require deeper tracing or review
- simulation reflects current chain state and sender context
- `ALLOW` means no configured rule triggered REVIEW or BLOCK; it does not mean “guaranteed safe”
- `BLOCK` is a deterministic policy result, not an allegation that an address or contract is a scam

## Repository

Source: https://github.com/mcharmi/airepo
