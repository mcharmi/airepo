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
