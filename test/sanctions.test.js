import test from "node:test";
import assert from "node:assert/strict";
import {
  extractEvmAddressesFromOfacCsv,
  refreshOfacSanctions,
  loadSanctionsSet,
  getSanctionsStatus
} from "../src/sanctions.js";

const A = "0x0931cA4D13BB4ba75D9B7132AB690265D749a5E7";
const B = "0xd882cfc20f52f2599d84b8e8d58c7fb62cfe344b";

test("extracts and normalizes EVM digital currency addresses from OFAC CSV fields", () => {
  const csv = [
    '1,"CRYPTEX",entity,"CYBER2",-0-,-0-,-0-,-0-,-0-,-0-,-0-,"Website x; Digital Currency Address - ETH ' + A + '; Digital Currency Address - XBT 1abc;"',
    '2,"OTHER",individual,"CYBER2",-0-,-0-,-0-,-0-,-0-,-0-,-0-,"Digital Currency Address - ETC ' + B + ';"'
  ].join("\n");

  const result = extractEvmAddressesFromOfacCsv(csv);
  assert.deepEqual(
    [...result].sort(),
    [A.toLowerCase(), B.toLowerCase()].sort()
  );
});

test("ignores non-EVM digital currency addresses", () => {
  const csv =
    '1,"BTC ONLY",entity,"CYBER2",-0-,-0-,-0-,-0-,-0-,-0-,-0-,"Digital Currency Address - XBT 1MTndG4K51RRMvkzyvguaHnQpiMLnxFGzM;"';
  const result = extractEvmAddressesFromOfacCsv(csv);
  assert.equal(result.size, 0);
});

test("refreshes in-memory sanctions set from OFAC data", async () => {
  const csv =
    '1,"TEST",entity,"CYBER2",-0-,-0-,-0-,-0-,-0-,-0-,-0-,"Digital Currency Address - ETH ' + A + ';"';

  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    text: async () => csv
  });

  const status = await refreshOfacSanctions({ fetchImpl, timeoutMs: 1000 });
  assert.equal(status.fresh, true);
  assert.equal(loadSanctionsSet().has(A.toLowerCase()), true);
  assert.equal(getSanctionsStatus().source, "ofac-sdn+configured");
});

test("rejects suspicious OFAC response with zero EVM addresses", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    text: async () => '1,"NO CRYPTO",entity,"TEST"'
  });

  await assert.rejects(
    () => refreshOfacSanctions({ fetchImpl, timeoutMs: 1000 }),
    /no EVM addresses/
  );
});
