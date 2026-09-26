import test from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/server.js";

const VALID_BODY = {
  chain: "base",
  to: "0x1111111111111111111111111111111111111111",
  data: "0x",
  value: "1"
};

function withServer(run) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      try {
        const address = server.address();
        const baseUrl = `http://127.0.0.1:${address.port}`;
        await run(baseUrl);
        server.close(err => (err ? reject(err) : resolve()));
      } catch (error) {
        server.close(() => reject(error));
      }
    });
  });
}

test("returns 400 for invalid risk-check payload", async () => {
  await withServer(async baseUrl => {
    const res = await fetch(`${baseUrl}/risk-check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chain: "base" })
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error, "INVALID_REQUEST");
    assert.equal(body.message, "Expected JSON body with string fields: chain, to, data, value");
  });
});

test("returns 400 JSON for malformed JSON body", async () => {
  await withServer(async baseUrl => {
    const res = await fetch(`${baseUrl}/risk-check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{bad-json"
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error, "INVALID_REQUEST");
    assert.equal(body.message, "Expected valid JSON body with string fields: chain, to, data, value");
  });
});

test("returns 400 for semantically invalid transaction payload", async () => {
  await withServer(async baseUrl => {
    const res = await fetch(`${baseUrl}/risk-check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...VALID_BODY, chain: "ethereum" })
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error, "INVALID_REQUEST");
    assert.equal(
      body.message,
      "Invalid transaction fields: chain must be base, to/from must be 20-byte hex addresses, data must be hex calldata, value must be non-negative integer string"
    );
  });
});

test("returns 400 for negative transaction value", async () => {
  await withServer(async baseUrl => {
    const res = await fetch(`${baseUrl}/risk-check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...VALID_BODY, value: "-1" })
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error, "INVALID_REQUEST");
  });
});

test("returns 400 for signed value format", async () => {
  await withServer(async baseUrl => {
    const res = await fetch(`${baseUrl}/risk-check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...VALID_BODY, value: "+1" })
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error, "INVALID_REQUEST");
  });
});

test("returns 400 JSON for request body over size limit", async () => {
  await withServer(async baseUrl => {
    const hugeData = "0x" + "aa".repeat(70000);
    const res = await fetch(`${baseUrl}/risk-check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...VALID_BODY, data: hugeData })
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error, "INVALID_REQUEST");
    assert.equal(body.message, "Expected valid JSON body with string fields: chain, to, data, value");
  });
});

test("returns 200 for valid risk-check payload", async () => {
  await withServer(async baseUrl => {
    const res = await fetch(`${baseUrl}/risk-check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(VALID_BODY)
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.verdict, "ALLOW");
    assert.equal(body.action, "NATIVE_TRANSFER");
  });
});

test("returns review verdict for unknown selector payload", async () => {
  await withServer(async baseUrl => {
    const res = await fetch(`${baseUrl}/risk-check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...VALID_BODY, data: "0x12345678", value: "0" })
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.verdict, "REVIEW");
    assert.equal(body.flags.includes("UNKNOWN_SELECTOR"), true);
  });
});

test("returns block verdict for unlimited approval payload", async () => {
  await withServer(async baseUrl => {
    const data =
      "0x095ea7b3" +
      "2222222222222222222222222222222222222222".padStart(64, "0") +
      "f".repeat(64);
    const res = await fetch(`${baseUrl}/risk-check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...VALID_BODY, data, value: "0" })
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.verdict, "BLOCK");
    assert.equal(body.action, "ERC20_APPROVE");
  });
});


test("exposes aggregate metrics without request identities", async () => {
  await withServer(async baseUrl => {
    const res = await fetch(`${baseUrl}/metrics`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.service, "agent-sign-guard");
    assert.equal(body.version, "0.6.0");
    assert.equal(typeof body.requests_total, "number");
    assert.equal(typeof body.risk_check_requests_total, "number");
    assert.equal(typeof body.rate_limited_total, "number");
    assert.equal(typeof body.responses_by_status, "object");
    assert.equal("ip" in body, false);
    assert.equal("wallet" in body, false);
  });
});
