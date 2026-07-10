#!/usr/bin/env node
/**
 * Opinionated local quick start.
 *
 * Wraps the upstream commands rather than editing them, so this file is the only
 * thing this fork has to maintain:
 *
 *   1. start the Mongo container (no-op if it is already up)
 *   2. bootstrap billing so runs are not blocked by credits
 *   3. hand off to `yarn local:start` (build + redis + server + workers)
 *
 * Usage: node localMode/bin/quickstart.js
 *
 * See README.LOCAL.md for the one-time Mongo container setup.
 */
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const TSX = path.join(REPO_ROOT, "node_modules", ".bin", "tsx");
const MONGO_CONTAINER = "sandpiper-mongo";

function mongoIsReachable() {
  const ping = spawnSync(
    "docker",
    [
      "exec",
      MONGO_CONTAINER,
      "mongosh",
      "--quiet",
      "--eval",
      "db.adminCommand('ping')",
    ],
    { stdio: "ignore" },
  );
  return ping.status === 0;
}

async function waitForMongo({ attempts = 15, delayMs = 1000 } = {}) {
  for (let i = 0; i < attempts; i++) {
    if (mongoIsReachable()) return true;
    await sleep(delayMs);
  }
  return false;
}

console.log("🍃 Starting MongoDB…");
spawnSync("docker", ["start", MONGO_CONTAINER], { stdio: "ignore" });

if (!(await waitForMongo())) {
  console.error(
    `\n✗ Could not reach the "${MONGO_CONTAINER}" container.\n` +
      `  Create it once by following the Mongo section of README.LOCAL.md.`,
  );
  process.exit(1);
}

console.log("💳 Bootstrapping local billing…");
const seed = spawnSync(
  TSX,
  ["-r", "dotenv/config", "localMode/seedBilling.ts"],
  { cwd: REPO_ROOT, stdio: "inherit" },
);
if (seed.status !== 0) process.exit(seed.status ?? 1);

console.log("\n🚀 Starting Sandpiper…");
const app = spawn("yarn", ["local:start"], {
  cwd: REPO_ROOT,
  stdio: "inherit",
});
app.on("exit", (code) => process.exit(code ?? 0));
