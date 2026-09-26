const OFAC_SDN_CSV_URL =
  process.env.OFAC_SDN_CSV_URL ||
  "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV";

let cachedSanctions = new Set();
let sanctionsStatus = {
  source: "configured-only",
  refreshed_at: null,
  count: 0,
  fresh: false,
  error: null
};

function configuredAddresses() {
  return (process.env.SANCTIONED_ADDRESSES || "")
    .split(",")
    .map(v => v.trim().toLowerCase())
    .filter(v => /^0x[0-9a-f]{40}$/.test(v));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows;
}

export function extractEvmAddressesFromOfacCsv(csvText) {
  const out = new Set();
  const rows = parseCsv(csvText);
  const pattern =
    /Digital Currency Address\s*-\s*[A-Za-z0-9]+\s+(0x[0-9a-fA-F]{40})/g;

  for (const row of rows) {
    for (const field of row) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(field)) !== null) {
        out.add(match[1].toLowerCase());
      }
    }
  }

  return out;
}

export async function refreshOfacSanctions({
  fetchImpl = fetch,
  timeoutMs = 20000
} = {}) {
  try {
    const response = await fetchImpl(OFAC_SDN_CSV_URL, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "user-agent": "agent-sign-guard/0.4 (OFAC SDN EVM screening)",
        accept: "text/csv,text/plain;q=0.9,*/*;q=0.1"
      }
    });

    if (!response.ok) {
      throw new Error(`OFAC HTTP ${response.status}`);
    }

    const csv = await response.text();
    const ofac = extractEvmAddressesFromOfacCsv(csv);
    if (ofac.size === 0) {
      throw new Error("OFAC feed contained no EVM addresses");
    }

    cachedSanctions = new Set([...configuredAddresses(), ...ofac]);
    sanctionsStatus = {
      source: "ofac-sdn+configured",
      refreshed_at: new Date().toISOString(),
      count: cachedSanctions.size,
      fresh: true,
      error: null
    };
    return { ...sanctionsStatus };
  } catch (error) {
    cachedSanctions = new Set([
      ...cachedSanctions,
      ...configuredAddresses()
    ]);
    sanctionsStatus = {
      ...sanctionsStatus,
      count: cachedSanctions.size,
      fresh: false,
      error: error instanceof Error ? error.message : String(error)
    };
    throw error;
  }
}

export function loadSanctionsSet() {
  return new Set([...cachedSanctions, ...configuredAddresses()]);
}

export function getSanctionsStatus() {
  return { ...sanctionsStatus, count: loadSanctionsSet().size };
}

cachedSanctions = new Set(configuredAddresses());
sanctionsStatus.count = cachedSanctions.size;
