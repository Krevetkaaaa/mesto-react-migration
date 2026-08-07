import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { resolve } from "node:path";

import { runLoadTest } from "./phase11-load.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const host = "127.0.0.1";
async function reservePort() {
  const reservation = createServer();
  await new Promise((resolveListen, rejectListen) => {
    reservation.once("error", rejectListen);
    reservation.listen(0, host, resolveListen);
  });
  const address = reservation.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise((resolveClose) => reservation.close(resolveClose));
  if (!port) throw new Error("Unable to reserve a local Phase 11 port");
  return port;
}

const [port, reactPort, legacyPort] = await Promise.all([reservePort(), reservePort(), reservePort()]);
const baseUrl = `http://${host}:${port}`;
const outputTail = [];
let spawnError = null;
let childPids = [];
let stopPromise = null;

const server = spawn(process.execPath, [resolve(projectRoot, "e2e/support/phase4-production-server.mjs")], {
  cwd: projectRoot,
  env: {
    ...process.env,
    HOST: host,
    PORT: String(port),
    PHASE4_REACT_PORT: String(reactPort),
    PHASE4_LEGACY_PORT: String(legacyPort),
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

for (const stream of [server.stdout, server.stderr]) {
  stream.on("data", (chunk) => {
    outputTail.push(String(chunk));
    if (outputTail.length > 40) outputTail.shift();
  });
}
server.on("error", (error) => {
  spawnError = error;
});

async function waitUntilReady() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (server.exitCode !== null) throw new Error(`Phase 11 local server exited early:\n${outputTail.join("")}`);
    try {
      const response = await fetch(`${baseUrl}/__phase4/health`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) {
        const payload = await response.json();
        if (payload?.ok && Number.isSafeInteger(payload.reactPid) && Number.isSafeInteger(payload.legacyPid)) {
          childPids = [payload.reactPid, payload.legacyPid];
          return;
        }
      }
    } catch {
      // Startup polling is expected to fail until both child servers listen.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Phase 11 local server did not become ready:\n${outputTail.join("")}`);
}

function stopPid(pid, signal) {
  try {
    process.kill(pid, signal);
  } catch {
    // The verified child already exited.
  }
}

async function stopServer() {
  if (stopPromise) return stopPromise;
  stopPromise = (async () => {
    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await Promise.race([
        once(server, "close"),
        new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000)),
      ]);
    }
    for (const pid of childPids) stopPid(pid, "SIGTERM");
    if (server.exitCode === null) server.kill("SIGKILL");
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    for (const pid of childPids) stopPid(pid, "SIGKILL");
  })();
  return stopPromise;
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    stopServer().finally(() => {
      process.exitCode = 130;
    });
  });
}

try {
  await waitUntilReady();
  const matrix = [
    ["smoke", "public-read"],
    ["smoke", "popular-venue"],
    ["smoke", "auth-safe"],
    ["smoke", "merchant-admin"],
    ["baseline", "mixed"],
  ];
  const results = [];
  for (const [stageName, scenario] of matrix) {
    const result = await runLoadTest({ baseUrl, stageName, scenario });
    results.push(result);
    console.log(JSON.stringify({
      stage: stageName,
      scenario,
      passed: result.slo.passed,
      requests: result.summary.requests,
      attemptedThroughputRps: result.summary.attemptedThroughputRps,
      successfulThroughputRps: result.summary.successfulThroughputRps,
      latencyMs: result.summary.latencyMs,
      statuses: result.summary.statuses,
      failures: result.slo.failures,
    }));
  }
  const failed = results.filter((result) => !result.slo.passed);
  if (failed.length) throw new Error(`${failed.length} local load scenarios failed their predeclared SLO`);
  console.log("Phase 11 local smoke/baseline matrix passed. This is fixture evidence, not production capacity evidence.");
} finally {
  await stopServer();
}
