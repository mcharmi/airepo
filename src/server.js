import express from "express";
import { pathToFileURL } from "node:url";
import { analyzeTransaction } from "./risk.js";
import { loadSanctionsSet } from "./sanctions.js";

const app = express();
app.use(express.json({ limit: "64kb" }));
app.use((err, _req, res, next) => {
  if (err?.type === "entity.parse.failed") {
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
  try {
    BigInt(body.value);
  } catch {
    return false;
  }
  return true;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "agent-sign-guard", version: "0.1.0" });
});

app.post("/risk-check", (req, res) => {
  if (!isRiskCheckPayload(req.body)) {
    return res.status(400).json({
      error: "INVALID_REQUEST",
      message: "Expected JSON body with string fields: chain, to, data, value"
    });
  }
  if (!isSemanticallyValidPayload(req.body)) {
    return res.status(400).json({
      error: "INVALID_REQUEST",
      message: "Invalid transaction fields: chain must be base, to must be 20-byte hex address, data must be hex calldata, value must be integer string"
    });
  }
  const sanctions = loadSanctionsSet();
  const result = analyzeTransaction(req.body, sanctions);
  return res.json(result);
});

export { app };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`agent-sign-guard listening on :${port}`);
  });
}
