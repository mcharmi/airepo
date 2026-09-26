import test from "node:test";
import assert from "node:assert/strict";
import { simulateTransaction, verifyRpcChainId } from "../src/simulation.js";

const TX = {
  chain: "base",
  from: "0x1111111111111111111111111111111111111111",
  to: "0x2222222222222222222222222222222222222222",
  data: "0x",
  value: "0"
};

test("returns successful eth_call and gas estimate", async () => {
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    const result = body.method === "eth_call" ? "0x" : "0x5208";
    return {
      ok: true,
      json: async () => ({ jsonrpc: "2.0", id: 1, result })
    };
  };

  const r = await simulateTransaction(TX, { fetchImpl, timeoutMs: 1000 });
  assert.equal(r.success, true);
  assert.equal(r.gas_estimate, "21000");
  assert.equal(r.from_assumed, false);
});

test("returns structured failure when RPC reverts", async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      jsonrpc: "2.0",
      id: 1,
      error: { code: 3, message: "execution reverted" }
    })
  });

  const r = await simulateTransaction(TX, { fetchImpl, timeoutMs: 1000 });
  assert.equal(r.success, false);
  assert.match(r.error, /execution reverted/);
});


test("preserves eth_call success when gas estimation fails", async () => {
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "eth_call") {
      return {
        ok: true,
        json: async () => ({ jsonrpc: "2.0", id: 1, result: "0x" })
      };
    }
    return {
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32000, message: "gas estimate unavailable" }
      })
    };
  };

  const r = await simulateTransaction(TX, { fetchImpl, timeoutMs: 1000 });
  assert.equal(r.success, true);
  assert.equal(r.return_data, "0x");
  assert.equal(r.gas_estimate, null);
  assert.match(r.error, /gas estimate unavailable/);
});

test("verifies expected Base mainnet chain id", async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ jsonrpc: "2.0", id: 1, result: "0x2105" })
  });

  const r = await verifyRpcChainId({
    environment: "production",
    fetchImpl,
    timeoutMs: 1000
  });
  assert.equal(r.chain_id, 8453);
  assert.equal(r.network, "base");
});

test("rejects RPC chain mismatch", async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ jsonrpc: "2.0", id: 1, result: "0x1" })
  });

  await assert.rejects(
    verifyRpcChainId({
      environment: "production",
      fetchImpl,
      timeoutMs: 1000
    }),
    /RPC chain mismatch/
  );
});
