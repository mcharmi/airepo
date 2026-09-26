import express from "express";
import { pathToFileURL } from "node:url";
import { analyzeTransaction } from "./risk.js";
import { loadSanctionsSet, refreshOfacSanctions, getSanctionsStatus } from "./sanctions.js";
import { createFixedWindowRateLimiter } from "./rate-limit.js";
import { observeRequest, markRateLimited, getMetricsSnapshot } from "./observability.js";
import { simulateTransaction } from "./simulation.js";

const app = express();
app.set("trust proxy", 1);
const x402Enabled = process.env.X402_ENABLED === "true";
const requestedEnvironment =
  process.env.X402_ENVIRONMENT === "production" ? "production" : "development";
const riskRateLimit = Number.parseInt(process.env.RISK_RATE_LIMIT || "120", 10);
const riskRateWindowMs = Number.parseInt(
  process.env.RISK_RATE_WINDOW_MS || "60000",
  10
);
const riskLimiter = createFixedWindowRateLimiter({
  limit: riskRateLimit,
  windowMs: riskRateWindowMs
});
const simulationEnabled = process.env.EVM_SIMULATION_ENABLED === "true";

app.use((req, res, next) => {
  observeRequest(req, res);
  next();
});

app.use((req, res, next) => {
  if (req.method !== "POST" || req.path !== "/risk-check") {
    return next();
  }

  const result = riskLimiter.check(req.ip || req.socket.remoteAddress || "unknown");
  res.setHeader("X-RateLimit-Limit", String(result.limit));
  res.setHeader("X-RateLimit-Remaining", String(result.remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));

  if (!result.allowed) {
    markRateLimited();
    res.setHeader("Retry-After", String(result.retryAfterSeconds));
    return res.status(429).json({
      error: "RATE_LIMITED",
      message: "Too many requests. Retry after the indicated delay."
    });
  }

  return next();
});

if (x402Enabled) {
  const [{ createX402Server }, { paymentMiddlewareFromHTTPServer }] =
    await Promise.all([
      import("@coinbase/cdp-sdk/x402"),
      import("@x402/express")
    ]);

  if (
    requestedEnvironment === "production" &&
    process.env.ALLOW_MAINNET !== "true"
  ) {
    throw new Error(
      "Refusing to start x402 in production. Set ALLOW_MAINNET=true only after Base Sepolia payment smoke tests pass."
    );
  }

  const payTo = (process.env.PAY_TO || "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(payTo)) {
    throw new Error(
      "PAY_TO must be a valid EVM address when x402 is enabled."
    );
  }

  const environment = requestedEnvironment;
  const network =
    environment === "production" ? "eip155:8453" : "eip155:84532";

  const x402Server = await createX402Server({
    environment,
    payToConfig: {
      type: "address",
      evm: payTo
    },
    routes: {
      "POST /risk-check": {
        accepts: [
          {
            scheme: "exact",
            price: process.env.X402_PRICE || "$0.01",
            network,
            payTo: ""
          }
        ],
        description:
          "Deterministic pre-sign risk screening for unsigned Base EVM transactions. Detects ERC20 transfers, token approvals, unlimited approvals, setApprovalForAll, malformed calldata and OFAC SDN and configured address matches. Returns machine-readable ALLOW, REVIEW or BLOCK."
      }
    }
  });

  app.use(paymentMiddlewareFromHTTPServer(x402Server));

  console.log(
    `x402 enabled (${environment}, ${network}); payments received at ${payTo}`
  );
}

app.use(express.json({ limit: "64kb" }));
app.use((err, _req, res, next) => {
  if (err?.type === "entity.parse.failed" || err?.type === "entity.too.large") {
    return res.status(400).json({
      error: "INVALID_REQUEST",
      message: "Expected valid JSON body with string fields: chain, to, data, value"
    });
  }
  return next(err);
});

function isRiskCheckPayload(body) {
  return (
    !!body &&
    typeof body === "object" &&
    typeof body.chain === "string" &&
    typeof body.to === "string" &&
    typeof body.data === "string" &&
    typeof body.value === "string"
  );
}

function isSemanticallyValidPayload(body) {
  if (body.chain !== "base") return false;
  if (!/^0x[0-9a-fA-F]{40}$/.test(body.to)) return false;
  if (!/^0x([0-9a-fA-F]{2})*$/.test(body.data)) return false;
  if (!/^\d+$/.test(body.value)) return false;
  if (body.from !== undefined && !/^0x[0-9a-fA-F]{40}$/.test(body.from)) return false;
  try {
    BigInt(body.value);
  } catch {
    return false;
  }
  return true;
}

app.get("/metrics", (_req, res) => {
  res.json(
    getMetricsSnapshot({
      limiterEntries: riskLimiter.size()
    })
  );
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "agent-sign-guard",
    version: "0.6.0",
    x402: x402Enabled,
    simulation: simulationEnabled,
    sanctions: getSanctionsStatus()
  });
});

app.post("/risk-check", async (req, res) => {
  if (!isRiskCheckPayload(req.body)) {
    return res.status(400).json({
      error: "INVALID_REQUEST",
      message: "Expected JSON body with string fields: chain, to, data, value"
    });
  }
  if (!isSemanticallyValidPayload(req.body)) {
    return res.status(400).json({
      error: "INVALID_REQUEST",
      message:
        "Invalid transaction fields: chain must be base, to/from must be 20-byte hex addresses, data must be hex calldata, value must be non-negative integer string"
    });
  }

  const sanctions = loadSanctionsSet();
  const result = analyzeTransaction(req.body, sanctions);

  if (simulationEnabled) {
    const simulation = await simulateTransaction(req.body, {
      environment: requestedEnvironment
    });
    result.simulation = simulation;

    if (
      simulation.success === false &&
      simulation.from_assumed === false &&
      result.verdict === "ALLOW"
    ) {
      result.verdict = "REVIEW";
      result.risk_score = Math.max(result.risk_score, 30);
      result.flags.push("SIMULATION_REVERTED");
      result.reasons.push(
        "Current-state EVM simulation reverted for the supplied sender"
      );
    }
  } else {
    result.simulation = {
      attempted: false,
      success: null,
      network: null,
      from_assumed: !req.body.from,
      gas_estimate: null,
      return_data: null,
      error: null
    };
  }

  return res.json(result);
});

export { app };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const requireFreshSanctions =
    process.env.REQUIRE_FRESH_SANCTIONS === "true" ||
    (x402Enabled && requestedEnvironment === "production");
  const refreshEnabled = process.env.OFAC_REFRESH_ENABLED !== "false";

  if (refreshEnabled) {
    try {
      const status = await refreshOfacSanctions();
      console.log(
        `OFAC SDN sanctions loaded: ${status.count} EVM addresses at ${status.refreshed_at}`
      );
    } catch (error) {
      console.error(
        `OFAC SDN refresh failed: ${error instanceof Error ? error.message : String(error)}`
      );
      const fallback = getSanctionsStatus();
      if (fallback.fresh) {
        console.warn(
          `Using fresh bundled OFAC snapshot from ${fallback.refreshed_at} with ${fallback.count} EVM addresses`
        );
      } else if (requireFreshSanctions) {
        throw new Error(
          "Refusing to start because fresh OFAC SDN data is required."
        );
      }
    }
  } else if (requireFreshSanctions) {
    throw new Error(
      "Refusing to start because OFAC refresh is disabled while fresh sanctions data is required."
    );
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`agent-sign-guard listening on :${port}`);
  });
}
