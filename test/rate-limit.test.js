import test from "node:test";
import assert from "node:assert/strict";
import { createFixedWindowRateLimiter } from "../src/rate-limit.js";

test("allows requests up to the configured limit", () => {
  let now = 1000;
  const limiter = createFixedWindowRateLimiter({
    limit: 2,
    windowMs: 1000,
    now: () => now
  });

  assert.equal(limiter.check("ip").allowed, true);
  const second = limiter.check("ip");
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 0);
  assert.equal(limiter.check("ip").allowed, false);

  now = 2000;
  const reset = limiter.check("ip");
  assert.equal(reset.allowed, true);
  assert.equal(reset.remaining, 1);
});

test("tracks keys independently", () => {
  const limiter = createFixedWindowRateLimiter({
    limit: 1,
    windowMs: 1000,
    now: () => 100
  });

  assert.equal(limiter.check("a").allowed, true);
  assert.equal(limiter.check("a").allowed, false);
  assert.equal(limiter.check("b").allowed, true);
});
