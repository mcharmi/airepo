import test from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/server.js";

const VALID_BODY = {
  chain: "base",
  to: "0x1111111111111111111111111111111111111111",
  data: "0x",
  value: "0"
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
