import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { childProcessHasExited, PHASE4_CHILD_STDIO } from "./phase4-process-contract.mjs";
import { proxyHttpRequest } from "./phase4-proxy.mjs";

const projectRoot = resolve(import.meta.dirname, "../..");
const host = "127.0.0.1";
const port = Number(process.env.PORT || 4174);
const reactPort = Number(process.env.PHASE4_REACT_PORT || 4184);
const legacyPort = Number(process.env.PHASE4_LEGACY_PORT || 4185);

async function findServerEntry(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const matches = [];

  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) matches.push(...await findServerEntry(path));
    else if (entry.isFile() && entry.name === "index.js") matches.push(path);
  }

  return matches;
}

async function reactServerEntry() {
  const matches = await findServerEntry(resolve(projectRoot, "build/server"));
  if (matches.length !== 1) throw new Error(`Expected exactly one React server entry, found ${matches.length}.`);
  return matches[0];
}

function start(command, args, childPort) {
  return spawn(command, args, {
    cwd: projectRoot,
    env: { ...process.env, HOST: host, PORT: String(childPort) },
    // @react-router/serve writes one access-log line per request. Keeping an
    // unread stdout pipe eventually blocks the child once the OS buffer fills,
    // which looks like SSR saturation under sustained local load.
    stdio: PHASE4_CHILD_STDIO,
    windowsHide: true,
  });
}

const entry = await reactServerEntry();
const react = start(process.execPath, [resolve(projectRoot, "node_modules/@react-router/serve/bin.js"), entry], reactPort);
const legacy = start(process.execPath, ["e2e/support/legacy-server.mjs"], legacyPort);
const children = [react, legacy];
let shuttingDown = false;
let shutdownPromise = null;

for (const child of children) {
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  child.on("error", (error) => process.stderr.write(`Phase 4 child failed: ${error.message}\n`));
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    process.stderr.write(`Phase 4 child exited early: code=${code} signal=${signal}\n`);
    process.exitCode = 1;
    void shutdown();
  });
}

async function upstreamReady(targetPort, pathname) {
  try {
    const response = await fetch(`http://${host}:${targetPort}${pathname}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(2_000),
    });
    const ready = response.ok;
    await response.arrayBuffer();
    return ready;
  } catch {
    return false;
  }
}

const gateway = createServer(async (request, response) => {
  const pathname = new URL(request.url || "/", `http://${host}:${port}`).pathname;
  if (pathname === "/__phase4/health") {
    const reactAlive = !childProcessHasExited(react);
    const legacyAlive = !childProcessHasExited(legacy);
    const [reactReady, legacyReady] = await Promise.all([
      upstreamReady(reactPort, "/__react/health"),
      upstreamReady(legacyPort, "/__health"),
    ]);
    if (!reactAlive || !legacyAlive || !reactReady || !legacyReady) {
      response.writeHead(503, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ legacyAlive, legacyReady, ok: false, reactAlive, reactReady }));
      return;
    }
    response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ legacyPid: legacy.pid, ok: true, reactPid: react.pid }));
    return;
  }

  const useLegacy = pathname.startsWith("/api/")
    || pathname.startsWith("/__e2e/")
    || pathname.startsWith("/__e2e-fonts/");
  proxyHttpRequest(request, response, { host, targetPort: useLegacy ? legacyPort : reactPort });
});

if (typeof process.send === "function") {
  try {
    process.send(
      { legacyPid: legacy.pid, reactPid: react.pid, type: "phase4-owned-children" },
      (error) => {
        if (error) shutdown();
      },
    );
  } catch {
    void shutdown();
  }
}

gateway.on("error", (error) => {
  process.stderr.write(`Phase 4 gateway failed: ${error.message}\n`);
  process.exitCode = 1;
  void shutdown();
});

gateway.listen(port, host, () => {
  process.stdout.write(`Phase 4 production gateway listening at http://${host}:${port}\n`);
});

function settleWithin(promise, timeoutMs) {
  return new Promise((resolveResult) => {
    const timer = setTimeout(() => resolveResult(false), timeoutMs);
    promise.then(
      () => {
        clearTimeout(timer);
        resolveResult(true);
      },
      () => {
        clearTimeout(timer);
        resolveResult(false);
      },
    );
  });
}

function waitForChildClose(child, timeoutMs) {
  if (childProcessHasExited(child)) return Promise.resolve(true);
  return settleWithin(once(child, "close"), timeoutMs);
}

function signalChild(child, signal) {
  if (childProcessHasExited(child)) return;
  try {
    child.kill(signal);
  } catch {
    // The directly owned child exited between the state check and signal.
  }
}

async function stopChild(child) {
  if (childProcessHasExited(child)) return;
  signalChild(child, "SIGTERM");
  if (await waitForChildClose(child, 2_000)) return;
  signalChild(child, "SIGKILL");
  await waitForChildClose(child, 1_000);
}

async function closeGateway() {
  if (!gateway.listening) return;
  const closed = new Promise((resolveClose) => gateway.close(() => resolveClose(true)));
  const graceful = await settleWithin(closed, 2_000);
  if (graceful) return;
  gateway.closeAllConnections?.();
  await settleWithin(closed, 1_000);
}

function sendProcessMessage(message) {
  if (!process.connected || typeof process.send !== "function") return Promise.resolve(false);
  return new Promise((resolveSend) => {
    try {
      process.send(message, (error) => resolveSend(!error));
    } catch {
      resolveSend(false);
    }
  });
}

function shutdown() {
  if (shutdownPromise) return shutdownPromise;
  shuttingDown = true;
  shutdownPromise = (async () => {
    const gatewayClose = closeGateway();
    await Promise.all(children.map((child) => stopChild(child)));
    await gatewayClose;
    await sendProcessMessage({ type: "phase4-stopped" });
    if (process.connected) process.disconnect();
  })().catch((error) => {
    process.exitCode = 1;
    process.stderr.write(`Phase 4 shutdown failed: ${error.message}\n`);
    if (process.connected) process.disconnect();
  });
  return shutdownPromise;
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
process.once("disconnect", () => void shutdown());
process.on("message", (message) => {
  if (message?.type === "phase4-shutdown") void shutdown();
});
process.once("exit", () => {
  for (const child of children) signalChild(child, "SIGTERM");
});
