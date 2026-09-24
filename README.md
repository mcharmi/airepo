# Agent Sign Guard

Deterministic pre-sign transaction risk screening for autonomous agents on Base.

## Goal

Given an unsigned EVM transaction, return a machine-readable risk decision before an agent signs it.

Input:
- chain
- to
- data
- value

Output:
- verdict: ALLOW | REVIEW | BLOCK
- risk_score: 0-100
- action
- extracted actors / amounts
- risk flags
- reasons

## MVP scope

Supported chain: Base.

Supported detections:
- ERC20 transfer
- ERC20 approve
- ERC721 / ERC1155 setApprovalForAll
- malformed calldata
- configurable sanctions-list match for destination and spender

## Design principles

- No LLM in the decision path
- Deterministic and reproducible
- No absolute claims that an address is safe or a scam
- Structured JSON only for the paid endpoint

## Planned x402 pricing

Target launch price: 0.01 USDC per request on Base.

The x402 payment wrapper and Bazaar publication are intentionally kept as a separate deployment step so the screening engine can be tested independently first.

## Local development

```bash
npm install
npm test
npm run dev
```

POST `/risk-check`

Request requirements:
- `chain`: string (MVP supports `"base"` only)
- `to`: hex address string (`0x` + 40 hex chars)
- `data`: hex calldata string with `0x` prefix (empty `0x` allowed)
- `value`: non-negative integer string using digits only (for example `"0"` or `"1000000000000000"`)

Example request:
```json
{
  "chain": "base",
  "to": "0x1111111111111111111111111111111111111111",
  "data": "0x095ea7b30000000000000000000000002222222222222222222222222222222222222222ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  "value": "0"
}
```

Example response:
```json
{
  "verdict": "BLOCK",
  "risk_score": 85,
  "action": "ERC20_APPROVE",
  "to": "0x1111111111111111111111111111111111111111",
  "spender": "0x2222222222222222222222222222222222222222",
  "recipient": null,
  "amount": "115792089237316195423570985008687907853269984665640564039457584007913129639935",
  "unlimited_approval": true,
  "sanctioned_match": false,
  "flags": ["UNLIMITED_APPROVAL"],
  "reasons": ["Unlimited ERC20 approval requested"]
}
```
