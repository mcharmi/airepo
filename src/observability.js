const startedAt = Date.now();

const counters = {
  requests_total: 0,
  risk_check_requests_total: 0,
  rate_limited_total: 0,
  status: Object.create(null)
};

export function observeRequest(req, res) {
  const started = process.hrtime.bigint();
  counters.requests_total += 1;
  if (req.path === "/risk-check") counters.risk_check_requests_total += 1;

  res.on("finish", () => {
    const key = String(res.statusCode);
    counters.status[key] = (counters.status[key] || 0) + 1;

    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    if (elapsedMs >= 5000) {
      console.warn(
        JSON.stringify({
          event: "slow_request",
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration_ms: Math.round(elapsedMs)
        })
      );
    }
  });
}

export function markRateLimited() {
  counters.rate_limited_total += 1;
}

export function getMetricsSnapshot({ limiterEntries = 0 } = {}) {
  return {
    service: "txpreflight",
    version: "0.6.0",
    uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
    requests_total: counters.requests_total,
    risk_check_requests_total: counters.risk_check_requests_total,
    rate_limited_total: counters.rate_limited_total,
    responses_by_status: { ...counters.status },
    limiter_entries: limiterEntries
  };
}
