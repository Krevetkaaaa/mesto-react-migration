import { spawn } from "node:child_process";
import { createServer, request as requestHttp } from "node:http";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

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
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function proxy(request, response, targetPort) {
  const upstream = requestHttp({
    host,
    port: targetPort,
    method: request.method,
    path: request.url,
    headers: { ...request.headers, host: request.headers.host || `${host}:${targetPort}` },
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  upstream.on("error", (error) => {
    if (!response.headersSent) {
      response.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
    }
    response.end(JSON.stringify({ message: `Phase 4 upstream is unavailable: ${error.message}` }));
  });
  request.pipe(upstream);
}

const entry = await reactServerEntry();
const react = start(process.execPath, [resolve(projectRoot, "node_modules/@react-router/serve/bin.js"), entry], reactPort);
const legacy = start(process.execPath, ["e2e/support/legacy-server.mjs"], legacyPort);
const children = [react, legacy];

for (const child of children) {
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  child.on("error", (error) => process.stderr.write(`Phase 4 child failed: ${error.message}\n`));
}

async function upstreamReady(targetPort, pathname) {
  try {
    const response = await fetch(`http://${host}:${targetPort}${pathname}`);
    return response.ok;
  } catch {
    return false;
  }
}

const gateway = createServer(async (request, response) => {
  const pathname = new URL(request.url || "/", `http://${host}:${port}`).pathname;
  if (pathname === "/__phase4/health") {
    const [reactReady, legacyReady] = await Promise.all([
      upstreamReady(reactPort, "/__react/health"),
      upstreamReady(legacyPort, "/__health"),
    ]);
    if (!reactReady || !legacyReady) {
      response.writeHead(503, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ legacyReady, ok: false, reactReady }));
      return;
    }
    response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ legacyPid: legacy.pid, ok: true, reactPid: react.pid }));
    return;
  }

  const useLegacy = pathname === "/admin"
    || pathname.startsWith("/api/")
    || pathname.startsWith("/__e2e/")
    || pathname.startsWith("/__e2e-fonts/");
  proxy(request, response, useLegacy ? legacyPort : reactPort);
});

gateway.listen(port, host, () => {
  process.stdout.write(`Phase 4 production gateway listening at http://${host}:${port}\n`);
});

function shutdown() {
  gateway.close();
  for (const child of children) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
