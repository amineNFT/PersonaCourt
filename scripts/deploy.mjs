#!/usr/bin/env node
// Deploy the Persona Court Intelligent Contract to a GenLayer network.
//
// Usage:
//   node --env-file=.env.local scripts/deploy.mjs                    # → testnetBradbury
//   node --env-file=.env.local scripts/deploy.mjs testnetBradbury
//
// Via npm:
//   npm run deploy

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, createAccount, chains } from "genlayer-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const NETWORK = (process.argv[2] ?? process.env.GENLAYER_NETWORK ?? "testnetBradbury").trim();
if (!chains[NETWORK]) {
  console.error(
    `Unknown network "${NETWORK}". Available: ${Object.keys(chains).join(", ")}`,
  );
  process.exit(1);
}

const PK =
  process.env.PRIVATE_KEY ||
  process.env.GENLAYER_PRIVATE_KEY ||
  process.env.NEXT_PUBLIC_PRIVATE_KEY;
if (!PK) {
  console.error(
    "No private key found. Set PRIVATE_KEY in .env.local (then run with `node --env-file=.env.local ...`).",
  );
  process.exit(1);
}

const account = createAccount(PK);
const client = createClient({ chain: chains[NETWORK], account });

const TARGET = {
  game: "persona_court",
  file: "persona_court.py",
  envKey: "NEXT_PUBLIC_BRADBURY_PERSONA_COURT",
};

console.log(
  `[deploy] network=${NETWORK} deployer=${account.address}\n`,
);

const codePath = path.join(ROOT, "contracts", TARGET.file);
const code = await readFile(codePath);
const sizeKB = (code.length / 1024).toFixed(1);
console.log(`[deploy] ${TARGET.game.padEnd(16)} (${sizeKB} KB)`);

const txHash = await client.deployContract({ code, args: [], leaderOnly: false });
console.log(`           tx: ${txHash}`);

const receipt = await client.waitForTransactionReceipt({
  hash: txHash,
  status: "ACCEPTED",
  retries: 200,
  interval: 3000,
});

const leaderReceipt = receipt?.consensus_data?.leader_receipt?.[0];
const gvmResult = leaderReceipt?.result;
if (gvmResult && gvmResult.status && gvmResult.status !== "return") {
  const payload = gvmResult.payload ?? "(no payload)";
  const stderr = leaderReceipt?.genvm_result?.stderr ?? "";
  console.error(
    `           ERROR: ${TARGET.game} constructor rejected → ${gvmResult.status}: ${payload}`,
  );
  if (stderr) console.error(`           stderr:\n${stderr}`);
  process.exit(1);
}

const addr =
  receipt?.data?.contract_address ||
  receipt?.to_address ||
  receipt?.recipient;

if (!addr) {
  console.error(`           ERROR: no contract address in receipt.`);
  console.error("           receipt keys:", Object.keys(receipt ?? {}).join(","));
  process.exit(1);
}

console.log(`           addr: ${addr}\n`);

console.log("─".repeat(60));
console.log(`Done. Add this to .env.local:`);
console.log("─".repeat(60));
console.log(`${TARGET.envKey}=${addr}`);
console.log("─".repeat(60));
console.log("Then restart `npm run dev`.");
