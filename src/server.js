import express from "express";
import { analyzeTransaction } from "./risk.js";
import { loadSanctionsSet } from "./sanctions.js";

const app = express();
app.use(express.json({ limit: "64kb" }));

const sanctions = await loadSanctionsSet();

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "agent-sign-guard", version: "0.1.0" });
});

app.post("/risk-check", (req, res) => {
  const result = analyzeTransaction(req.body, sanctions);
  res.json(result);
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`agent-sign-guard listening on :${port}`);
});
