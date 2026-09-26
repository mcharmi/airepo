import { CdpX402Client } from "@coinbase/cdp-sdk/x402";

const client = new CdpX402Client({
  environment: "production",
  walletConfig: {
    type: "eoa",
    accountName: "txpreflight-mainnet-smoke-buyer"
  }
});

const { evmAddress } = await client.getAddresses();

if (!/^0x[0-9a-fA-F]{40}$/.test(evmAddress)) {
  throw new Error("CDP did not return a valid EVM address");
}

console.log("MAINNET_BUYER_ADDRESS=" + evmAddress);
console.log("Fund this address with a small amount of USDC on Base mainnet only.");
