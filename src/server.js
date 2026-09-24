import express from "express";
import { analyzeTransaction } from "./risk.js";
import { loadSanctionsSet } from "./sanctions.js";

const app = express();
app.use(express.json({ limit: "64kb" }));

const sanctions = await loadSanctionsSet();

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
  const result = analyzeTransaction(req.body, sanctions);
  return res.json(result);
});

export { app };

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`agent-sign-guard listening on :${port}`);
  });
}
