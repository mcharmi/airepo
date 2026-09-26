import { decodeFunctionData } from "viem";

export const PERMIT2_ADDRESS =
  "0x000000000022d473030f116ddee9f6b43ac78ba3";

const MAX_UINT160 = (1n << 160n) - 1n;

const permitDetails = [
  { name: "token", type: "address" },
  { name: "amount", type: "uint160" },
  { name: "expiration", type: "uint48" },
  { name: "nonce", type: "uint48" }
];

const tokenPermissions = [
  { name: "token", type: "address" },
  { name: "amount", type: "uint256" }
];

const transferDetails = [
  { name: "to", type: "address" },
  { name: "requestedAmount", type: "uint256" }
];

export const PERMIT2_ABI = [
  {
    type: "function",
    name: "permit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "owner", type: "address" },
      {
        name: "permitSingle",
        type: "tuple",
        components: [
          { name: "details", type: "tuple", components: permitDetails },
          { name: "spender", type: "address" },
          { name: "sigDeadline", type: "uint256" }
        ]
      },
      { name: "signature", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "permit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "owner", type: "address" },
      {
        name: "permitBatch",
        type: "tuple",
        components: [
          { name: "details", type: "tuple[]", components: permitDetails },
          { name: "spender", type: "address" },
          { name: "sigDeadline", type: "uint256" }
        ]
      },
      { name: "signature", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "transferFrom",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "token", type: "address" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "transferFrom",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "transferDetails",
        type: "tuple[]",
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "amount", type: "uint160" },
          { name: "token", type: "address" }
        ]
      }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "permitTransferFrom",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "permit",
        type: "tuple",
        components: [
          { name: "permitted", type: "tuple", components: tokenPermissions },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      },
      { name: "transferDetails", type: "tuple", components: transferDetails },
      { name: "owner", type: "address" },
      { name: "signature", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "permitTransferFrom",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "permit",
        type: "tuple",
        components: [
          { name: "permitted", type: "tuple[]", components: tokenPermissions },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      },
      { name: "transferDetails", type: "tuple[]", components: transferDetails },
      { name: "owner", type: "address" },
      { name: "signature", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "permitWitnessTransferFrom",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "permit",
        type: "tuple",
        components: [
          { name: "permitted", type: "tuple", components: tokenPermissions },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      },
      { name: "transferDetails", type: "tuple", components: transferDetails },
      { name: "owner", type: "address" },
      { name: "witness", type: "bytes32" },
      { name: "witnessTypeString", type: "string" },
      { name: "signature", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "permitWitnessTransferFrom",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "permit",
        type: "tuple",
        components: [
          { name: "permitted", type: "tuple[]", components: tokenPermissions },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      },
      { name: "transferDetails", type: "tuple[]", components: transferDetails },
      { name: "owner", type: "address" },
      { name: "witness", type: "bytes32" },
      { name: "witnessTypeString", type: "string" },
      { name: "signature", type: "bytes" }
    ],
    outputs: []
  }
];

function lower(v) {
  return typeof v === "string" ? v.toLowerCase() : v;
}

function permitDetailsArray(value) {
  return Array.isArray(value) ? value : [value];
}

export function decodePermit2(data) {
  try {
    const decoded = decodeFunctionData({
      abi: PERMIT2_ABI,
      data: data.startsWith("0x") ? data : `0x${data}`
    });

    const args = decoded.args || [];

    if (decoded.functionName === "permit") {
      const owner = lower(args[0]);
      const permit = args[1];
      const details = permitDetailsArray(permit.details);
      return {
        recognized: true,
        action: Array.isArray(permit.details)
          ? "PERMIT2_ALLOWANCE_PERMIT_BATCH"
          : "PERMIT2_ALLOWANCE_PERMIT",
        owner,
        spender: lower(permit.spender),
        token: details.length === 1 ? lower(details[0].token) : null,
        amount: details.length === 1 ? details[0].amount.toString() : null,
        unlimited: details.some(d => d.amount === MAX_UINT160),
        entries: details.map(d => ({
          token: lower(d.token),
          amount: d.amount.toString()
        }))
      };
    }

    if (decoded.functionName === "transferFrom") {
      if (Array.isArray(args[0])) {
        const entries = args[0].map(d => ({
          from: lower(d.from),
          recipient: lower(d.to),
          amount: d.amount.toString(),
          token: lower(d.token)
        }));
        return {
          recognized: true,
          action: "PERMIT2_TRANSFER_BATCH",
          owner: null,
          spender: null,
          recipient: null,
          token: null,
          amount: null,
          unlimited: false,
          entries
        };
      }

      return {
        recognized: true,
        action: "PERMIT2_TRANSFER",
        owner: lower(args[0]),
        recipient: lower(args[1]),
        amount: args[2].toString(),
        token: lower(args[3]),
        spender: null,
        unlimited: false,
        entries: []
      };
    }

    if (
      decoded.functionName === "permitTransferFrom" ||
      decoded.functionName === "permitWitnessTransferFrom"
    ) {
      const permit = args[0];
      const requested = args[1];
      const owner = lower(args[2]);
      const permits = permitDetailsArray(permit.permitted);
      const requests = permitDetailsArray(requested);
      const entries = permits.map((p, index) => ({
        token: lower(p.token),
        permitted_amount: p.amount.toString(),
        recipient: lower(requests[index]?.to),
        requested_amount: requests[index]?.requestedAmount?.toString() ?? null
      }));

      return {
        recognized: true,
        action: Array.isArray(permit.permitted)
          ? decoded.functionName === "permitWitnessTransferFrom"
            ? "PERMIT2_WITNESS_TRANSFER_BATCH"
            : "PERMIT2_SIGNATURE_TRANSFER_BATCH"
          : decoded.functionName === "permitWitnessTransferFrom"
            ? "PERMIT2_WITNESS_TRANSFER"
            : "PERMIT2_SIGNATURE_TRANSFER",
        owner,
        spender: null,
        recipient: entries.length === 1 ? entries[0].recipient : null,
        token: entries.length === 1 ? entries[0].token : null,
        amount: entries.length === 1 ? entries[0].requested_amount : null,
        unlimited: false,
        entries
      };
    }

    return { recognized: false };
  } catch {
    return { recognized: false };
  }
}
