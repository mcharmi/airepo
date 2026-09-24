import { CdpClient } from "@coinbase/cdp-sdk";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const target = process.env.X402_SMOKE_URL || "http://127.0.0.1:3000/risk-check";

const privateKey = process.env.EVM_PRIVATE_KEY || generatePrivateKey();
const signer = privateKeyToAccount(privateKey);

console.log(`Buyer wallet: ${signer.address}`);

if (process.env.X402_FAUCET !== "false") {
  const cdp = new CdpClient();
  try {
    const faucet = await cdp.evm.requestFaucet({
      address: signer.address,
      network: "base-sepolia",
      token: "usdc"
    });
    console.log(
      "Requested Base Sepolia USDC faucet funding",
      faucet?.transactionHash || ""
    );
  } catch (error) {
    console.log(
      "Faucet request did not complete; continuing in case the wallet is already funded."
    );
    console.log(error?.message || String(error));
  }
}

const client = new x402Client();
client.register("eip155:*", new ExactEvmScheme(signer));
const fetchWithPayment = wrapFetchWithPayment(globalThis.fetch, client);

const payload = {
  chain: "base",
  to: "0x1111111111111111111111111111111111111111",
  data: "0x095ea7b30000000000000000000000002222222222222222222222222222222222222222ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  value: "0"
};

let response;
for (let attempt = 1; attempt <= 8; attempt += 1) {
  try {
    response = await fetchWithPayment(target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.log(
      `Attempt ${attempt}: payment request failed; retrying after faucet confirmation window`
    );
    console.log(error?.message || String(error));
    await new Promise(resolve => setTimeout(resolve, 15000));
    continue;
  }

  if (response.status === 200) break;

  console.log(
    `Attempt ${attempt}: HTTP ${response.status}; retrying after faucet confirmation window`
  );
  await new Promise(resolve => setTimeout(resolve, 15000));
}

if (!response) {
  throw new Error("No response received from paid endpoint");
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
