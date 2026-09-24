import { CdpClient } from "@coinbase/cdp-sdk";
import { CdpX402Client } from "@coinbase/cdp-sdk/x402";
import { wrapFetchWithPayment } from "@x402/fetch";

const target = process.env.X402_SMOKE_URL || "http://127.0.0.1:3000/risk-check";

const client = new CdpX402Client({ environment: "development" });
const { evmAddress } = await client.getAddresses();

console.log(`Buyer wallet: ${evmAddress}`);

if (process.env.X402_FAUCET !== "false") {
  const cdp = new CdpClient();
  try {
    const faucet = await cdp.evm.requestFaucet({
      address: evmAddress,
      network: "base-sepolia",
      token: "usdc"
    });
    console.log("Requested Base Sepolia USDC faucet funding", faucet?.transactionHash || "");
  } catch (error) {
    console.log("Faucet request did not complete; continuing in case wallet is already funded.");
    console.log(error?.message || String(error));
  }
}

const fetchWithPayment = wrapFetchWithPayment(globalThis.fetch, client);

const payload = {
  chain: "base",
  to: "0x1111111111111111111111111111111111111111",
  data: "0x095ea7b30000000000000000000000002222222222222222222222222222222222222222ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  value: "0"
};

let response;
for (let attempt = 1; attempt <= 8; attempt += 1) {
  response = await fetchWithPayment(target, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (response.status === 200) break;

  console.log(`Attempt ${attempt}: HTTP ${response.status}; retrying after faucet confirmation window`);
  await new Promise(resolve => setTimeout(resolve, 15000));
}

const body = await response.text();
console.log(`Final HTTP ${response.status}`);
console.log(body);

if (response.status !== 200) {
  process.exitCode = 1;
} else {
  const parsed = JSON.parse(body);
  if (parsed.verdict !== "BLOCK" || parsed.action !== "ERC20_APPROVE") {
    console.error("Unexpected risk decision from paid endpoint");
    process.exitCode = 1;
  } else {
    console.log("x402 paid smoke test passed");
  }
}
