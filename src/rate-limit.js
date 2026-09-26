function positiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function createFixedWindowRateLimiter({
  limit = 120,
  windowMs = 60_000,
  now = () => Date.now()
} = {}) {
  const max = positiveInt(limit, 120);
  const window = positiveInt(windowMs, 60_000);
  const buckets = new Map();

  function cleanup(current) {
    if (buckets.size < 1000) return;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= current) buckets.delete(key);
    }
  }

  function check(key) {
    const current = now();
    cleanup(current);

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= current) {
      bucket = { count: 0, resetAt: current + window };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(0, max - bucket.count);

    return {
      allowed: bucket.count <= max,
      limit: max,
      remaining,
      resetAt: bucket.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - current) / 1000))
    };
  }

  return {
    check,
    size: () => buckets.size
  };
}
