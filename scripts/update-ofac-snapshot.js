import { mkdir, writeFile } from "node:fs/promises";
import {
  OFAC_SDN_CSV_URL,
  refreshOfacSanctions,
  loadSanctionsSet,
  getSanctionsStatus
} from "../src/sanctions.js";

await refreshOfacSanctions();

const status = getSanctionsStatus();
const addresses = [...loadSanctionsSet()]
  .filter(v => /^0x[0-9a-f]{40}$/.test(v))
  .sort();

if (addresses.length === 0) {
  throw new Error("Refusing to write empty OFAC snapshot");
}

await mkdir(new URL("../data/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../data/ofac-sdn-evm.json", import.meta.url),
  JSON.stringify(
    {
      source: OFAC_SDN_CSV_URL,
      generated_at: status.refreshed_at,
      count: addresses.length,
      addresses
    },
    null,
    2
  ) + "\n",
  "utf8"
);

console.log(`Wrote ${addresses.length} OFAC SDN EVM addresses`);
