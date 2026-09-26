const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function rpcUrl(environment) {
  if (process.env.BASE_RPC_URL) return process.env.BASE_RPC_URL;
  return environment === "production"
    ? "https://mainnet.base.org"
    : "https://sepolia.base.org";
}

function hexValue(decimal) {
  return `0x${BigInt(decimal).toString(16)}`;
}

async function rpc(method, params, { environment, timeoutMs, fetchImpl }) {
  const response = await fetchImpl(rpcUrl(environment), {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params
    })
  });

  if (!response.ok) {
    throw new Error(`RPC HTTP ${response.status}`);
  }

  const body = await response.json();
  if (body.error) {
    const error = new Error(body.error.message || "RPC error");
    error.rpcCode = body.error.code;
    throw error;
  }
  return body.result;
}

function safeMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, " ").slice(0, 240);
}

export async function simulateTransaction(tx, {
  environment = "development",
  timeoutMs = Number.parseInt(process.env.EVM_SIMULATION_TIMEOUT_MS || "5000", 10),
  fetchImpl = fetch
} = {}) {
  const call = {
    from: tx.from || ZERO_ADDRESS,
    to: tx.to,
    data: tx.data || "0x",
    value: hexValue(tx.value || "0")
  };

  try {
    const [returnData, gasHex] = await Promise.all([
      rpc("eth_call", [call, "latest"], { environment, timeoutMs, fetchImpl }),
      rpc("eth_estimateGas", [call], { environment, timeoutMs, fetchImpl })
    ]);

    return {
      attempted: true,
      success: true,
      network: environment === "production" ? "base" : "base-sepolia",
      from_assumed: !tx.from,
      gas_estimate: BigInt(gasHex).toString(),
      return_data: typeof returnData === "string" ? returnData.slice(0, 514) : null,
      error: null
    };
  } catch (error) {
    return {
      attempted: true,
      success: false,
      network: environment === "production" ? "base" : "base-sepolia",
      from_assumed: !tx.from,
      gas_estimate: null,
      return_data: null,
      error: safeMessage(error)
    };
  }
}
