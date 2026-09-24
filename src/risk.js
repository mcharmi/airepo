const SELECTORS = {
  ERC20_TRANSFER: "a9059cbb",
  ERC20_APPROVE: "095ea7b3",
  SET_APPROVAL_FOR_ALL: "a22cb465"
};

const MAX_UINT256 = (1n << 256n) - 1n;

function strip0x(v = "") {
  return v.startsWith("0x") ? v.slice(2) : v;
}

function word(data, index) {
  const start = 8 + index * 64;
  const out = data.slice(start, start + 64);
  if (out.length !== 64) throw new Error("malformed calldata");
  return out;
}

function asAddress(w) {
  return "0x" + w.slice(24).toLowerCase();
}

function asUint(w) {
  return BigInt("0x" + w);
}

function asBoolStrict(w) {
  const v = asUint(w);
  if (v !== 0n && v !== 1n) throw new Error("malformed bool");
  return v === 1n;
}

function parseValue(value) {
  if (typeof value !== "string") throw new Error("invalid value");
  return BigInt(value);
}

function baseResult() {
  return {
    verdict: "ALLOW",
    risk_score: 0,
    action: "UNKNOWN",
    to: null,
    spender: null,
    recipient: null,
    amount: null,
    unlimited_approval: false,
    sanctioned_match: false,
    flags: [],
    reasons: []
  };
}

const VERDICT_SEVERITY = {
  ALLOW: 0,
  REVIEW: 1,
  BLOCK: 2
};

function raise(result, score, verdict, flag, reason) {
  result.risk_score = Math.max(result.risk_score, score);
  if (VERDICT_SEVERITY[verdict] > VERDICT_SEVERITY[result.verdict]) {
    result.verdict = verdict;
  }
  result.flags.push(flag);
  result.reasons.push(reason);
}

export function analyzeTransaction(tx, sanctions = new Set()) {
  const result = baseResult();

  if (!tx || tx.chain !== "base") {
    raise(result, 80, "BLOCK", "UNSUPPORTED_CHAIN", "Only Base is supported in MVP");
    return result;
  }

  if (typeof tx.to !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(tx.to)) {
    raise(result, 90, "BLOCK", "INVALID_TO", "Destination address is invalid");
    return result;
  }

  result.to = tx.to.toLowerCase();

  if (sanctions.has(result.to)) {
    result.sanctioned_match = true;
    raise(result, 100, "BLOCK", "SANCTIONS_MATCH", "Destination matches configured sanctions data");
  }

  const data = strip0x(tx.data || "").toLowerCase();
  if (data.length === 0) {
    let nativeValue;
    try {
      nativeValue = parseValue(tx.value);
    } catch {
      raise(result, 90, "BLOCK", "INVALID_VALUE", "Transaction value is not a valid integer string");
      return result;
    }
    if (nativeValue > 0n) {
      result.action = "NATIVE_TRANSFER";
      return result;
    }
    result.action = "EMPTY_CALLDATA";
    raise(result, 20, "REVIEW", "EMPTY_CALLDATA_NO_VALUE", "Empty calldata with zero native value is not a native transfer");
    return result;
  }

  if (
    data.length < 8 ||
    data.length % 2 !== 0 ||
    !/^[0-9a-f]+$/.test(data) ||
    (data.length - 8) % 64 !== 0
  ) {
    raise(result, 90, "BLOCK", "MALFORMED_CALLDATA", "Calldata is malformed");
    return result;
  }

  const selector = data.slice(0, 8);

  try {
    if (selector === SELECTORS.ERC20_TRANSFER) {
      result.action = "ERC20_TRANSFER";
      result.recipient = asAddress(word(data, 0));
      result.amount = asUint(word(data, 1)).toString();
      if (sanctions.has(result.recipient)) {
        result.sanctioned_match = true;
        raise(result, 100, "BLOCK", "SANCTIONS_MATCH", "Token recipient matches configured sanctions data");
      }
      return result;
    }

    if (selector === SELECTORS.ERC20_APPROVE) {
      result.action = "ERC20_APPROVE";
      result.spender = asAddress(word(data, 0));
      const amount = asUint(word(data, 1));
      result.amount = amount.toString();

      if (sanctions.has(result.spender)) {
        result.sanctioned_match = true;
        raise(result, 100, "BLOCK", "SANCTIONS_MATCH", "Approval spender matches configured sanctions data");
      }

      if (amount === MAX_UINT256) {
        result.unlimited_approval = true;
        raise(result, 85, "BLOCK", "UNLIMITED_APPROVAL", "Unlimited ERC20 approval requested");
      } else if (amount > 0n) {
        raise(result, 35, "REVIEW", "TOKEN_APPROVAL", "ERC20 token approval grants spending authority");
      }
      return result;
    }

    if (selector === SELECTORS.SET_APPROVAL_FOR_ALL) {
      result.action = "SET_APPROVAL_FOR_ALL";
      result.spender = asAddress(word(data, 0));
      const approved = asBoolStrict(word(data, 1));

      if (sanctions.has(result.spender)) {
        result.sanctioned_match = true;
        raise(result, 100, "BLOCK", "SANCTIONS_MATCH", "Operator matches configured sanctions data");
      }

      if (approved) {
        raise(result, 90, "BLOCK", "APPROVAL_FOR_ALL", "setApprovalForAll grants control over all tokens in the collection");
      }
      return result;
    }

    raise(result, 25, "REVIEW", "UNKNOWN_SELECTOR", "Function selector is not covered by the MVP decoder");
    return result;
  } catch {
    raise(result, 90, "BLOCK", "MALFORMED_CALLDATA", "Calldata does not match the expected ABI shape");
    return result;
  }
}
