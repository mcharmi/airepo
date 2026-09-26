import test from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData } from "viem";
import { analyzeTransaction } from "../src/risk.js";
import { PERMIT2_ABI, PERMIT2_ADDRESS } from "../src/permit2.js";

const OWNER = "0x1111111111111111111111111111111111111111";
const TOKEN = "0x2222222222222222222222222222222222222222";
const SPENDER = "0x3333333333333333333333333333333333333333";
const RECIPIENT = "0x4444444444444444444444444444444444444444";

test("blocks unlimited Permit2 allowance permit", () => {
  const data = encodeFunctionData({
    abi: PERMIT2_ABI,
    functionName: "permit",
    args: [
      OWNER,
      {
        details: {
          token: TOKEN,
          amount: (1n << 160n) - 1n,
          expiration: 999999n,
          nonce: 0n
        },
        spender: SPENDER,
        sigDeadline: 9999999999n
      },
      "0x1234"
    ]
  });

  const r = analyzeTransaction({
    chain: "base",
    to: PERMIT2_ADDRESS,
    data,
    value: "0"
  });

  assert.equal(r.verdict, "BLOCK");
  assert.equal(r.action, "PERMIT2_ALLOWANCE_PERMIT");
  assert.equal(r.unlimited_approval, true);
  assert.equal(r.flags.includes("UNLIMITED_PERMIT2_APPROVAL"), true);
});

test("reviews Permit2 signature transfer and extracts recipient", () => {
  const data = encodeFunctionData({
    abi: PERMIT2_ABI,
    functionName: "permitTransferFrom",
    args: [
      {
        permitted: { token: TOKEN, amount: 1000n },
        nonce: 1n,
        deadline: 9999999999n
      },
      {
        to: RECIPIENT,
        requestedAmount: 500n
      },
      OWNER,
      "0x1234"
    ]
  });

  const r = analyzeTransaction({
    chain: "base",
    to: PERMIT2_ADDRESS,
    data,
    value: "0"
  });

  assert.equal(r.verdict, "REVIEW");
  assert.equal(r.action, "PERMIT2_SIGNATURE_TRANSFER");
  assert.equal(r.recipient, RECIPIENT);
  assert.equal(r.amount, "500");
  assert.equal(r.flags.includes("PERMIT2_SIGNATURE_TRANSFER"), true);
});

test("blocks sanctioned recipient in Permit2 transfer", () => {
  const data = encodeFunctionData({
    abi: PERMIT2_ABI,
    functionName: "transferFrom",
    args: [OWNER, RECIPIENT, 5n, TOKEN]
  });

  const sanctions = new Set([RECIPIENT]);
  const r = analyzeTransaction({
    chain: "base",
    to: PERMIT2_ADDRESS,
    data,
    value: "0"
  }, sanctions);

  assert.equal(r.verdict, "BLOCK");
  assert.equal(r.sanctioned_match, true);
});
