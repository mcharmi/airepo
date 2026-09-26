import express from "express";
import { pathToFileURL } from "node:url";
import { analyzeTransaction } from "./risk.js";
import { loadSanctionsSet, refreshOfacSanctions, getSanctionsStatus } from "./sanctions.js";
import { createFixedWindowRateLimiter } from "./rate-limit.js";
import { observeRequest, markRateLimited, getMetricsSnapshot } from "./observability.js";
import { simulateTransaction } from "./simulation.js";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";

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
const publicBaseUrl =
  process.env.PUBLIC_BASE_URL ||
  "https://agent-sign-guard-main-production.up.railway.app";
const serviceDescription =
  "Pre-sign EVM transaction risk API for AI agents on Base. Detects ERC20 approvals, unlimited approvals, Permit2 permissions and transfers, OFAC SDN EVM address matches, malformed calldata, and adds current-state EVM simulation before signing.";

const bazaarDiscovery = declareDiscoveryExtension({
  bodyType: "json",
  input: {
    chain: "base",
    from: "0x1111111111111111111111111111111111111111",
    to: "0x2222222222222222222222222222222222222222",
    data: "0x",
    value: "0"
  },
  inputSchema: {
    properties: {
      chain: {
        type: "string",
        const: "base",
        description: "Blockchain. Agent Sign Guard currently supports Base."
      },
      from: {
        type: "string",
        description:
          "Optional EVM sender address. Supplying it improves current-state simulation accuracy."
      },
      to: {
        type: "string",
        description: "20-byte destination contract or recipient EVM address."
      },
      data: {
        type: "string",
        description:
          "Unsigned transaction calldata as 0x-prefixed hex. Use 0x for a native transfer."
      },
      value: {
        type: "string",
        description:
          "Unsigned native token value in wei as a non-negative decimal integer string."
      }
    },
    required: ["chain", "to", "data", "value"]
  },
  output: {
    example: {
      verdict: "REVIEW",
      risk_score: 45,
      action: "PERMIT2_SIGNATURE_TRANSFER",
      sanctioned_match: false,
      unlimited_approval: false,
      flags: ["PERMIT2_SIGNATURE_TRANSFER"],
      reasons: [
        "Permit2 authorizes token movement using a signed one-time permission"
      ],
      simulation: {
        attempted: true,
        success: true,
        network: "base-sepolia",
        from_assumed: false,
        gas_estimate: "23697"
      }
    },
    schema: {
      type: "object",
      properties: {
        verdict: { type: "string", enum: ["ALLOW", "REVIEW", "BLOCK"] },
        risk_score: { type: "integer", minimum: 0, maximum: 100 },
        action: { type: "string" },
        sanctioned_match: { type: "boolean" },
        unlimited_approval: { type: "boolean" },
        flags: { type: "array", items: { type: "string" } },
        reasons: { type: "array", items: { type: "string" } },
        simulation: { type: "object" }
      },
      required: [
        "verdict",
        "risk_score",
        "action",
        "sanctioned_match",
        "flags",
        "reasons"
      ]
    }
  }
});

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
        resource: `${publicBaseUrl}/risk-check`,
        description: serviceDescription,
        mimeType: "application/json",
        serviceName: "Agent Sign Guard",
        tags: [
          "evm-security",
          "transaction-risk",
          "base",
          "permit2",
          "x402"
        ],
        extensions: bazaarDiscovery
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


const publicExample = {
  chain: "base",
  from: "0x1111111111111111111111111111111111111111",
  to: "0x2222222222222222222222222222222222222222",
  data: "0x",
  value: "0"
};

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Agent Sign Guard - EVM Transaction Risk API for AI Agents</title>
  <meta name="description" content="Pre-sign EVM transaction risk screening for AI agents on Base. Detect unlimited approvals, Permit2 permissions, OFAC SDN EVM matches, malformed calldata and simulate transactions before signing.">
  <meta name="keywords" content="EVM transaction risk API, AI agent wallet security, pre-sign transaction screening, Base transaction simulation, Permit2 risk, ERC20 approval risk, unlimited approval detection, OFAC wallet screening, x402 API">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${publicBaseUrl}/">
  <meta property="og:title" content="Agent Sign Guard - EVM Transaction Risk API">
  <meta property="og:description" content="Pre-sign EVM risk screening for AI agents: Permit2, ERC20 approvals, OFAC SDN matching and Base simulation via x402.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${publicBaseUrl}/">
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Agent Sign Guard",
    applicationCategory: "SecurityApplication",
    operatingSystem: "Web API",
    description:
      "Pre-sign EVM transaction risk API for AI agents on Base with Permit2 analysis, approval risk detection, OFAC SDN screening and EVM simulation.",
    url: publicBaseUrl
  })}</script>
</head>
<body>
  <main>
    <h1>Agent Sign Guard</h1>
    <p>Deterministic pre-sign transaction risk screening for autonomous agents and wallets on Base.</p>
    <h2>What it detects</h2>
    <ul>
      <li>ERC20 transfers and token approvals</li>
      <li>Unlimited approvals and setApprovalForAll</li>
      <li>Uniswap Permit2 permissions and transfers</li>
      <li>OFAC SDN EVM address matches</li>
      <li>Malformed or unknown calldata</li>
      <li>Current-state EVM simulation before signing</li>
    </ul>
    <h2>Paid API</h2>
    <p><code>POST /risk-check</code> is protected by x402 and returns ALLOW, REVIEW or BLOCK with structured reasons.</p>
    <p>Machine-readable discovery: <a href="/llms.txt">llms.txt</a>, <a href="/.well-known/x402">x402 manifest</a>, <a href="/transparency">transparency</a>, <a href="/.well-known/security.txt">security.txt</a>.</p>
  </main>
</body>
</html>`);
});

app.get("/openapi.json", (_req, res) => {
  res.json({
    openapi: "3.1.0",
    info: {
      title: "Agent Sign Guard API",
      version: "0.6.0",
      description: serviceDescription
    },
    servers: [{ url: publicBaseUrl }],
    paths: {
      "/risk-check": {
        post: {
          operationId: "screenEvmTransactionBeforeSigning",
          summary: "Screen an unsigned Base EVM transaction before signing",
          description:
            "Returns a deterministic ALLOW, REVIEW or BLOCK decision with decoded approval/Permit2 risk, OFAC SDN direct-address screening, and optional current-state EVM simulation. Access is paid via x402.",
          tags: ["EVM Security", "Transaction Risk", "AI Agents", "Base", "x402"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    chain: { type: "string", const: "base" },
                    from: {
                      type: "string",
                      pattern: "^0x[0-9a-fA-F]{40}$",
                      description:
                        "Optional sender address; improves simulation accuracy."
                    },
                    to: {
                      type: "string",
                      pattern: "^0x[0-9a-fA-F]{40}$"
                    },
                    data: {
                      type: "string",
                      pattern: "^0x([0-9a-fA-F]{2})*$"
                    },
                    value: {
                      type: "string",
                      pattern: "^[0-9]+$",
                      description: "Native value in wei as a decimal integer string."
                    }
                  },
                  required: ["chain", "to", "data", "value"]
                },
                example: publicExample
              }
            }
          },
          responses: {
            "200": {
              description: "Risk decision after successful x402 payment.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      verdict: {
                        type: "string",
                        enum: ["ALLOW", "REVIEW", "BLOCK"]
                      },
                      risk_score: {
                        type: "integer",
                        minimum: 0,
                        maximum: 100
                      },
                      action: { type: "string" },
                      sanctioned_match: { type: "boolean" },
                      unlimited_approval: { type: "boolean" },
                      flags: {
                        type: "array",
                        items: { type: "string" }
                      },
                      reasons: {
                        type: "array",
                        items: { type: "string" }
                      },
                      simulation: { type: ["object", "null"] }
                    },
                    required: [
                      "verdict",
                      "risk_score",
                      "action",
                      "sanctioned_match",
                      "flags",
                      "reasons"
                    ]
                  }
                }
              }
            },
            "402": {
              description: "x402 payment required."
            },
            "429": {
              description: "Rate limit exceeded."
            }
          }
        }
      }
    }
  });
});

app.get("/llms.txt", (_req, res) => {
  res.type("text/plain").send(`# Agent Sign Guard

> Pre-sign EVM transaction risk API for AI agents, autonomous wallets, and agentic payment systems on Base.

Agent Sign Guard helps an AI agent decide whether an unsigned EVM transaction should be ALLOWed, REVIEWed, or BLOCKed before signing.

## Primary endpoint
- POST ${publicBaseUrl}/risk-check
- Payment: x402
- Price: ${process.env.X402_PRICE || "$0.01"}
- Network: Base Sepolia during testing; Base mainnet only when explicitly enabled.
- Content-Type: application/json

## Inputs
Required: chain, to, data, value.
Optional: from. Supplying from improves EVM simulation accuracy.

Example:
${JSON.stringify(publicExample, null, 2)}

## Capabilities
- EVM transaction risk API
- pre-sign transaction security screening
- Base transaction risk analysis
- ERC20 transfer decoding
- ERC20 approval risk detection
- unlimited token approval detection
- setApprovalForAll detection
- Uniswap Permit2 approval and transfer analysis
- Permit2 signature transfer analysis
- OFAC SDN EVM address screening
- malformed calldata detection
- unknown function selector review
- Base EVM eth_call simulation
- Base gas estimation
- x402 paid API for autonomous agents

## Output
Structured JSON with verdict (ALLOW, REVIEW, BLOCK), risk_score, action, decoded actors/amounts, flags, reasons, sanctions signal, and optional simulation result.

## Important limitations
A non-match is not a legal sanctions clearance. Unknown or unsupported contract behavior may require additional review. The service never claims that an address is absolutely safe or a scam.

## Discovery
- OpenAPI: ${publicBaseUrl}/openapi.json\n- x402 manifest: ${publicBaseUrl}/.well-known/x402
- Transparency: ${publicBaseUrl}/transparency
- Health: ${publicBaseUrl}/health
- Metrics: ${publicBaseUrl}/metrics
`);
});

app.get("/robots.txt", (_req, res) => {
  res.type("text/plain").send(`User-agent: *
Allow: /
Sitemap: ${publicBaseUrl}/sitemap.xml
`);
});

app.get("/sitemap.xml", (_req, res) => {
  const urls = [
    "/",
    "/llms.txt",
    "/openapi.json",
    "/.well-known/x402",
    "/transparency",
    "/.well-known/security.txt"
  ];
  res.type("application/xml").send(
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      urls.map(path => `<url><loc>${publicBaseUrl}${path}</loc></url>`).join("") +
      "</urlset>"
  );
});

app.get("/.well-known/security.txt", (_req, res) => {
  res.type("text/plain").send(`Canonical: ${publicBaseUrl}/.well-known/security.txt
Policy: ${publicBaseUrl}/transparency
Expires: 2027-09-26T00:00:00Z
Preferred-Languages: en, de
`);
});

app.get("/security.txt", (_req, res) => {
  res.redirect(301, "/.well-known/security.txt");
});

app.get("/.well-known/x402", (_req, res) => {
  res.json({
    name: "Agent Sign Guard",
    version: "0.6.0",
    protocol: "x402",
    resource: `${publicBaseUrl}/risk-check`,
    method: "POST",
    description: serviceDescription,
    price: process.env.X402_PRICE || "$0.01",
    payment_network:
      requestedEnvironment === "production" ? "eip155:8453" : "eip155:84532",
    content_type: "application/json",
    tags: [
      "evm-security",
      "transaction-risk",
      "base",
      "permit2",
      "x402"
    ],
    capabilities: [
      "pre-sign transaction screening",
      "ERC20 approval risk",
      "unlimited approval detection",
      "Permit2 risk detection",
      "OFAC SDN EVM screening",
      "Base EVM transaction simulation"
    ],
    openapi: `${publicBaseUrl}/openapi.json`,
    llms: `${publicBaseUrl}/llms.txt`,
    transparency: `${publicBaseUrl}/transparency`
  });
});

app.get("/transparency", (_req, res) => {
  res.json({
    service: "Agent Sign Guard",
    version: "0.6.0",
    decision_path: "deterministic",
    llm_in_decision_path: false,
    supported_chain: "base",
    payment_protocol: "x402",
    supported_risk_checks: [
      "ERC20 transfer",
      "ERC20 approve",
      "setApprovalForAll",
      "EIP-2612 permit",
      "Uniswap Permit2",
      "OFAC SDN direct EVM address match",
      "malformed calldata",
      "unknown selector review",
      "EVM eth_call and gas-estimate simulation"
    ],
    limitations: [
      "A sanctions non-match is not legal clearance.",
      "OFAC 50 Percent Rule and ownership relationships are not fully resolved by direct address matching.",
      "Unknown or arbitrary contract behavior can require additional analysis.",
      "Simulation results depend on current chain state and supplied sender context."
    ],
    source_repository: "https://github.com/mcharmi/airepo"
  });
});

app.get("/.well-known/agent-card.json", (_req, res) => {
  res.status(404).json({
    error: "NOT_A2A_SERVER",
    message:
      "Agent Sign Guard is an x402 HTTP API, not an A2A JSON-RPC server. Use /llms.txt and /.well-known/x402 for machine-readable discovery."
  });
});

app.get("/.well-known/agent.json", (_req, res) => {
  res.status(404).json({
    error: "NOT_A2A_SERVER",
    message:
      "Agent Sign Guard does not claim A2A protocol compatibility. Use /llms.txt and /.well-known/x402."
  });
});

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
