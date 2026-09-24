import test from "node:test";
import assert from "node:assert/strict";
import { analyzeTransaction } from "../src/risk.js";

const TO = "0x1111111111111111111111111111111111111111";
const SPENDER = "2222222222222222222222222222222222222222";
const RECIPIENT = "3333333333333333333333333333333333333333";

function padAddress(addr) {
  return addr.padStart(64, "0");
}
function padUint(n) {
  return BigInt(n).toString(16).padStart(64, "0");
}

test("allows plain native transfer", () => {
  const r = analyzeTransaction({ chain: "base", to: TO, data: "0x", value: "1" });
  assert.equal(r.verdict, "ALLOW");
  assert.equal(r.action, "NATIVE_TRANSFER");
});

test("reviews empty calldata with zero value", () => {
  const r = analyzeTransaction({ chain: "base", to: TO, data: "0x", value: "0" });
  assert.equal(r.verdict, "REVIEW");
  assert.equal(r.action, "EMPTY_CALLDATA");
});

test("blocks unlimited ERC20 approval", () => {
  const data = "0x095ea7b3" + padAddress(SPENDER) + "f".repeat(64);
  const r = analyzeTransaction({ chain: "base", to: TO, data, value: "0" });
  assert.equal(r.action, "ERC20_APPROVE");
  assert.equal(r.unlimited_approval, true);
  assert.equal(r.verdict, "BLOCK");
});

test("reviews finite ERC20 approval", () => {
  const data = "0x095ea7b3" + padAddress(SPENDER) + padUint(1000);
  const r = analyzeTransaction({ chain: "base", to: TO, data, value: "0" });
  assert.equal(r.verdict, "REVIEW");
});

test("decodes ERC20 transfer", () => {
  const data = "0xa9059cbb" + padAddress(RECIPIENT) + padUint(123);
  const r = analyzeTransaction({ chain: "base", to: TO, data, value: "0" });
  assert.equal(r.verdict, "ALLOW");
  assert.equal(r.recipient, "0x" + RECIPIENT);
  assert.equal(r.amount, "123");
});

test("blocks sanctioned ERC20 transfer recipient", () => {
  const sanctions = new Set(["0x" + RECIPIENT]);
  const data = "0xa9059cbb" + padAddress(RECIPIENT) + padUint(123);
  const r = analyzeTransaction({ chain: "base", to: TO, data, value: "0" }, sanctions);
  assert.equal(r.verdict, "BLOCK");
  assert.equal(r.sanctioned_match, true);
});

test("blocks sanctioned destination contract", () => {
  const sanctions = new Set([TO]);
  const r = analyzeTransaction({ chain: "base", to: TO, data: "0x12345678", value: "0" }, sanctions);
  assert.equal(r.verdict, "BLOCK");
  assert.equal(r.sanctioned_match, true);
});

test("blocks setApprovalForAll true", () => {
  const data = "0xa22cb465" + padAddress(SPENDER) + padUint(1);
  const r = analyzeTransaction({ chain: "base", to: TO, data, value: "0" });
  assert.equal(r.verdict, "BLOCK");
  assert.equal(r.action, "SET_APPROVAL_FOR_ALL");
});

test("blocks malformed setApprovalForAll bool value", () => {
  const data = "0xa22cb465" + padAddress(SPENDER) + padUint(2);
  const r = analyzeTransaction({ chain: "base", to: TO, data, value: "0" });
  assert.equal(r.verdict, "BLOCK");
  assert.equal(r.action, "SET_APPROVAL_FOR_ALL");
  assert.equal(r.flags.includes("MALFORMED_CALLDATA"), true);
});

test("blocks configured sanctioned spender", () => {
  const sanctions = new Set(["0x" + SPENDER]);
  const data = "0x095ea7b3" + padAddress(SPENDER) + padUint(5);
  const r = analyzeTransaction({ chain: "base", to: TO, data, value: "0" }, sanctions);
  assert.equal(r.verdict, "BLOCK");
  assert.equal(r.sanctioned_match, true);
});

test("blocks sanctioned spender on finite approval", () => {
  const sanctions = new Set(["0x" + SPENDER]);
  const data = "0x095ea7b3" + padAddress(SPENDER) + padUint(1);
  const r = analyzeTransaction({ chain: "base", to: TO, data, value: "0" }, sanctions);
  assert.equal(r.verdict, "BLOCK");
  assert.equal(r.sanctioned_match, true);
});

test("blocks sanctioned spender on setApprovalForAll revoke", () => {
  const sanctions = new Set(["0x" + SPENDER]);
  const data = "0xa22cb465" + padAddress(SPENDER) + padUint(0);
  const r = analyzeTransaction({ chain: "base", to: TO, data, value: "0" }, sanctions);
  assert.equal(r.verdict, "BLOCK");
  assert.equal(r.sanctioned_match, true);
});

test("reviews unknown selector", () => {
  const r = analyzeTransaction({ chain: "base", to: TO, data: "0x12345678", value: "0" });
  assert.equal(r.verdict, "REVIEW");
});

test("blocks malformed selector-plus-trailing-bytes calldata", () => {
  const r = analyzeTransaction({ chain: "base", to: TO, data: "0x1234567890", value: "0" });
  assert.equal(r.verdict, "BLOCK");
  assert.equal(r.flags.includes("MALFORMED_CALLDATA"), true);
});

test("blocks malformed calldata", () => {
  const r = analyzeTransaction({ chain: "base", to: TO, data: "0x095ea7b3ff", value: "0" });
  assert.equal(r.verdict, "BLOCK");
});

test("blocks negative native value", () => {
  const r = analyzeTransaction({ chain: "base", to: TO, data: "0x", value: "-1" });
  assert.equal(r.verdict, "BLOCK");
  assert.equal(r.flags.includes("INVALID_VALUE"), true);
});
