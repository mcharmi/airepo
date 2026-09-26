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

export async function verifyRpcChainId({
  environment = "development",
  timeoutMs = Number.parseInt(process.env.EVM_SIMULATION_TIMEOUT_MS || "5000", 10),
  fetchImpl = fetch
} = {}) {
  const expected = environment === "production" ? "0x2105" : "0x14a34";
  const actual = await rpc("eth_chainId", [], { environment, timeoutMs, fetchImpl });
  if (String(actual).toLowerCase() !== expected) {
    throw new Error(`RPC chain mismatch: expected ${expected}, received ${actual}`);
  }
  return {
    chain_id: Number.parseInt(expected.slice(2), 16),
    chain_id_hex: expected,
    network: environment === "production" ? "base" : "base-sepolia"
  };
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

  const [callResult, gasResult] = await Promise.allSettled([
    rpc("eth_call", [call, "latest"], { environment, timeoutMs, fetchImpl }),
    rpc("eth_estimateGas", [call], { environment, timeoutMs, fetchImpl })
  ]);

  const callOk = callResult.status === "fulfilled";
  const gasOk = gasResult.status === "fulfilled";
  const errors = [];
  if (!callOk) errors.push(`eth_call: ${safeMessage(callResult.reason)}`);
  if (!gasOk) errors.push(`eth_estimateGas: ${safeMessage(gasResult.reason)}`);

  return {
    attempted: true,
    success: callOk,
    network: environment === "production" ? "base" : "base-sepolia",
    from_assumed: !tx.from,
    gas_estimate: gasOk ? BigInt(gasResult.value).toString() : null,
    return_data:
      callOk && typeof callResult.value === "string"
        ? callResult.value.slice(0, 514)
        : null,
    error: errors.length ? errors.join(" | ").slice(0, 480) : null
  };
}
