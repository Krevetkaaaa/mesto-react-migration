import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import process from "node:process";

const projectRoot = resolve(import.meta.dirname, "..");
const clientRoot = resolve(projectRoot, "build/client");
const serverRoot = resolve(projectRoot, "build/server");
const stagedManifestPath = resolve(projectRoot, ".legacy-public/legacy-static-manifest.json");
const vercelConfigPath = resolve(projectRoot, "vercel.json");

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function assertFile(path) {
  const metadata = await stat(path);
  invariant(metadata.isFile(), `Expected file: ${path}`);
}

async function assertMissingFile(path) {
  try {
    await stat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Migrated legacy document must not shadow React SSR: ${path}`);
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

async function findNamedFiles(directory, filename) {
  const matches = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) matches.push(...(await findNamedFiles(path, filename)));
    else if (entry.isFile() && entry.name === filename) matches.push(path);
  }

  return matches;
}

async function findServerEntry() {
  const entries = await findNamedFiles(serverRoot, "index.js");
  invariant(entries.length === 1, `Expected one server build entry, found ${entries.length}`);
  return entries[0];
}

async function availablePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      invariant(address && typeof address === "object", "Could not reserve a smoke-test port");
      const port = address.port;
      probe.close((error) => (error ? reject(error) : resolvePort(port)));
    });
  });
}

async function waitForServer(origin, processOutput) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/__react/health`);
      if (response.status === 200) return response;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Production server did not start in time.\n${processOutput()}`);
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    new Promise((resolveWait) => setTimeout(resolveWait, 3_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

const serverEntry = await findServerEntry();

if (process.argv.includes("--serve")) {
  const serveBin = resolve(projectRoot, "node_modules/@react-router/serve/bin.js");
  const server = spawn(process.execPath, [serveBin, serverEntry], {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => server.kill(signal));
  }

  const exitCode = await new Promise((resolveExit, reject) => {
    server.once("error", reject);
    server.once("exit", (code) => resolveExit(code ?? 1));
  });
  process.exitCode = exitCode;
} else {
  await runSmoke();
}

async function runSmoke() {
  const manifest = JSON.parse(await readFile(stagedManifestPath, "utf8"));
  invariant(manifest.algorithm === "sha256", "Legacy manifest must use SHA-256");
  invariant(manifest.files.length === 45, "The legacy staging set must remain at 45 files");
  const passwordPolicyCoreEntry = manifest.files.find(({ path }) => path === "password-policy-core.js");
  const passwordPolicyEntry = manifest.files.find(({ path }) => path === "password-policy.mjs");
  invariant(
    passwordPolicyCoreEntry?.bytes > 0 && /^[a-f0-9]{64}$/.test(passwordPolicyCoreEntry.sha256),
    "Legacy staging must contain a hashed password-policy-core.js",
  );
  invariant(
    passwordPolicyEntry?.bytes > 0 && /^[a-f0-9]{64}$/.test(passwordPolicyEntry.sha256),
    "Legacy staging must contain a hashed password-policy.mjs",
  );

  const vercelConfig = JSON.parse(await readFile(vercelConfigPath, "utf8"));
  invariant(
    JSON.stringify(vercelConfig.builds) ===
      JSON.stringify([
        {
          src: "package.json",
          use: "@vercel/remix-builder@5.9.2",
          config: { framework: "react-router", zeroConfig: true },
        },
        {
          src: "api/router.js",
          use: "@vercel/node@5.9.5",
          config: { zeroConfig: true },
        },
      ]),
    "Vercel must build both React Router SSR and the legacy CommonJS API",
  );

  const publicLegacyDestinations = vercelConfig.routes.filter(
    (route) => route.dest === "/index.html" || route.dest === "/help.html",
  );
  const indexAliasIndex = vercelConfig.routes.findIndex(
    (route) => route.src === "^/index\\.html/?$" && route.status === 308,
  );
  const legacyHtmlAliasIndex = vercelConfig.routes.findIndex(
    (route) => route.src === "^/(help|merchant|admin)\\.html/?$" && route.status === 308,
  );
  const trailingSlashAliasIndex = vercelConfig.routes.findIndex(
    (route) => route.src === "^/(help|merchant|admin)/$" && route.status === 308,
  );
  const diagramsIndex = vercelConfig.routes.findIndex(
    (route) => route.src === "^/diagrams/(.*)$" && route.continue === true,
  );
  const apiRouteIndex = vercelConfig.routes.findIndex(
    (route) => route.src === "^/api(?:/(.*))?/?$" && route.dest === "/api/router?route=$1",
  );
  const adminIndexRouteIndex = vercelConfig.routes.findIndex(
    (route) => route.src === "^/admin$"
      && route.status === 302
      && route.headers?.Location === "/admin/overview"
      && route.headers?.["Cache-Control"] === "private, no-store, max-age=0"
      && route.headers?.Vary === "Cookie"
      && route.headers?.["X-Content-Type-Options"] === "nosniff"
      && route.headers?.["X-Robots-Tag"] === "noindex",
  );
  const merchantIndexRouteIndex = vercelConfig.routes.findIndex(
    (route) => route.src === "^/merchant$"
      && route.status === 302
      && route.headers?.Location === "/merchant/overview"
      && route.headers?.["Cache-Control"] === "private, no-store, max-age=0"
      && route.headers?.Vary === "Cookie"
      && route.headers?.["X-Content-Type-Options"] === "nosniff"
      && route.headers?.["X-Robots-Tag"] === "noindex",
  );
  const filesystemIndex = vercelConfig.routes.findIndex(
    (route) => route.handle === "filesystem",
  );
  const dynamicReactRoutes = [
    ["^/city(?:/([^/#?]+?))\\.data[/#?]?$", "city/:citySlug.data"],
    ["^/city(?:/([^/#?]+?))[/#?]?$", "city/:citySlug"],
    ["^/venue(?:/([^/#?]+?))\\.data[/#?]?$", "venue/:venueSlug.data"],
    ["^/venue(?:/([^/#?]+?))[/#?]?$", "venue/:venueSlug"],
    ["^/merchant(?:/([^/#?]+?))\\.data[/#?]?$", "merchant/:view.data"],
    ["^/merchant(?:/([^/#?]+?))[/#?]?$", "merchant/:view"],
    ["^/admin(?:/([^/#?]+?))\\.data[/#?]?$", "admin/:view.data"],
    ["^/admin(?:/([^/#?]+?))[/#?]?$", "admin/:view"],
  ].map(([src, dest]) => vercelConfig.routes.findIndex(
    (route) => route.src === src && route.dest === dest,
  ));
  const terminal404Index = vercelConfig.routes.findIndex(
    (route) => route.src === ".*" && route.status === 404,
  );
  invariant(
    publicLegacyDestinations.length === 0,
    "Vercel must leave / and /help to the React Router SSR function",
  );
  invariant(indexAliasIndex >= 0, "Vercel /index.html canonical redirect is missing");
  invariant(legacyHtmlAliasIndex >= 0, "Vercel legacy .html canonical redirects are missing");
  invariant(trailingSlashAliasIndex >= 0, "Vercel trailing-slash canonical redirects are missing");
  invariant(diagramsIndex >= 0, "Vercel diagrams headers route is missing");
  invariant(apiRouteIndex >= 0, "Vercel API rewrite is missing");
  invariant(adminIndexRouteIndex >= 0, "Vercel exact /admin private redirect is missing");
  invariant(merchantIndexRouteIndex >= 0, "Vercel exact /merchant private redirect is missing");
  invariant(filesystemIndex > apiRouteIndex, "Vercel filesystem must not intercept /api/*");
  invariant(
    filesystemIndex > adminIndexRouteIndex,
    "Vercel exact /admin route must precede filesystem to avoid admin.html shadowing",
  );
  invariant(
    filesystemIndex > merchantIndexRouteIndex,
    "Vercel exact /merchant route must precede filesystem to avoid merchant.html shadowing",
  );
  invariant(filesystemIndex > diagramsIndex, "Vercel diagrams headers must run before filesystem handling");
  invariant(
    dynamicReactRoutes.every((routeIndex) => routeIndex > filesystemIndex),
    "Vercel dynamic React document/data routes must follow filesystem handling",
  );
  invariant(
    dynamicReactRoutes.every((routeIndex) => routeIndex < terminal404Index),
    "Vercel dynamic React document/data routes must precede the terminal 404",
  );
  invariant(terminal404Index > filesystemIndex, "Vercel unknown routes must terminate with 404");

  for (const legacyPath of [
    "merchant.html",
    "admin.html",
    "app.js",
    "password-policy-core.js",
    "password-policy.mjs",
    "assets/mesto-hero.png",
    "legacy-static-manifest.json",
  ]) {
    await assertFile(resolve(clientRoot, legacyPath));
  }
  invariant(
    sha256(await readFile(resolve(clientRoot, "password-policy-core.js"))) === passwordPolicyCoreEntry.sha256,
    "Built password-policy-core.js must match the staged SHA-256 manifest",
  );
  invariant(
    sha256(await readFile(resolve(clientRoot, "password-policy.mjs"))) === passwordPolicyEntry.sha256,
    "Built password-policy.mjs must match the staged SHA-256 manifest",
  );
  await assertMissingFile(resolve(clientRoot, "index.html"));
  await assertMissingFile(resolve(clientRoot, "help.html"));

  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  let output = "";
  const child = spawn(process.execPath, [import.meta.filename, "--serve"], {
    cwd: projectRoot,
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  try {
    const healthResponse = await waitForServer(origin, () => output);
    const healthHtml = await healthResponse.text();
    invariant(healthResponse.status === 200, "Health route must return exactly 200");
    invariant(
      healthResponse.headers.get("content-type")?.startsWith("text/html"),
      "Health route must return HTML",
    );
    invariant(healthResponse.headers.get("cache-control")?.includes("no-store"), "Health route must be no-store");
    invariant(healthResponse.headers.get("x-robots-tag")?.includes("noindex"), "Health route must send X-Robots-Tag");
    invariant(healthHtml.includes('data-react-health="ok"'), "Health response is missing its React marker");
    invariant(healthHtml.includes('name="robots" content="noindex,nofollow"'), "Health HTML is missing robots noindex");

    for (const [path, routeMarker, contentMarker, expectsLegacyApp, expectsHydration] of [
      ["/", 'data-react-route="home"', "Лучшие места", false, true],
      ["/help", 'data-react-route="help"', "Всё важное", false, false],
    ]) {
      const response = await fetch(`${origin}${path}`);
      const body = await response.text();
      invariant(response.status === 200, `React ${path} returned ${response.status}`);
      invariant(
        response.headers.get("content-type")?.startsWith("text/html"),
        `React ${path} must return HTML`,
      );
      invariant(body.includes(routeMarker), `React ${path} is missing its SSR route marker`);
      invariant(body.includes(contentMarker), `React ${path} is missing its main content`);
      invariant(body.includes('src="/theme.js?v=theme-1"'), `React ${path} is missing the synchronous theme bootstrap`);
      invariant(
        body.includes('src="app.js?v=ui-motion-3"') === expectsLegacyApp,
        `React ${path} has the wrong legacy app.js ownership`,
      );
      invariant(
        body.includes('type="module"') === expectsHydration,
        `React ${path} has the wrong hydration ownership`,
      );
    }

    for (const [path, marker] of [
      ["/merchant.html", "merchant.css"],
      ["/admin.html", "admin.css"],
    ]) {
      const response = await fetch(`${origin}${path}`);
      const body = await response.text();
      invariant(response.status === 200, `Legacy ${path} returned ${response.status}`);
      invariant(
        response.headers.get("content-type")?.startsWith("text/html"),
        `Legacy ${path} must return HTML`,
      );
      invariant(body.toLocaleLowerCase("en-US").includes(marker), `Legacy ${path} lost its expected marker`);
      invariant(!body.includes('data-react-health="ok"'), `React route intercepted legacy ${path}`);
    }

    const merchantRedirect = await fetch(`${origin}/merchant`, { redirect: "manual" });
    invariant(merchantRedirect.status === 302, `/merchant must redirect, got ${merchantRedirect.status}`);
    invariant(
      merchantRedirect.headers.get("location") === "/merchant/overview",
      "/merchant must redirect to /merchant/overview",
    );
    invariant(
      merchantRedirect.headers.get("cache-control") === "private, no-store, max-age=0",
      "Merchant redirect must remain private and no-store",
    );

    const adminRedirect = await fetch(`${origin}/admin`, { redirect: "manual" });
    invariant(adminRedirect.status === 302, `/admin must redirect, got ${adminRedirect.status}`);
    invariant(
      adminRedirect.headers.get("location") === "/admin/overview",
      "/admin must redirect to /admin/overview",
    );
    invariant(
      adminRedirect.headers.get("cache-control") === "private, no-store, max-age=0",
      "Admin redirect must remain private and no-store",
    );

    const adminDocument = await fetch(`${origin}/admin/overview`);
    const adminHtml = await adminDocument.text();
    // This isolated SSR smoke intentionally starts no legacy API process. The
    // admin route therefore returns its controlled 503 shell here; Phase 8
    // Playwright covers the authenticated 200 path through the fixture gateway.
    invariant(
      adminDocument.status === 200 || adminDocument.status === 503,
      `/admin/overview returned ${adminDocument.status}`,
    );
    invariant(
      adminDocument.headers.get("content-type")?.startsWith("text/html"),
      "React /admin/overview must return HTML",
    );
    invariant(
      adminDocument.headers.get("cache-control") === "private, no-store, max-age=0",
      "React admin document must remain private and no-store",
    );
    invariant(adminHtml.includes('data-react-route="admin"'), "React admin document is missing its SSR marker");
    invariant(!adminHtml.includes('src="admin.js'), "React admin runtime must not load legacy admin.js");

    for (const path of ["/__react/not-found", "/api/phase2-unknown", "/api/auth/yandex/callback"]) {
      const response = await fetch(`${origin}${path}`, { redirect: "manual" });
      const body = await response.text();
      invariant(response.status === 404, `${path} must remain outside the React route table`);
      invariant(
        response.headers.get("content-type")?.startsWith("text/html"),
        `${path} must return an HTML 404 document`,
      );
      invariant(!body.includes('data-react-health="ok"'), `React health route intercepted ${path}`);
      if (path === "/__react/not-found") {
        invariant(body.includes('data-react-error="404"'), "Unknown React URL is missing its 404 marker");
        invariant(
          body.includes('name="robots" content="noindex,nofollow"'),
          "Unknown React URL is missing robots noindex",
        );
      }
    }
  } finally {
    await stop(child);
  }

  process.stdout.write(
    `Phase 8 smoke passed: ${manifest.files.length} staged legacy files unchanged, React SSR owns public/catalog/account/merchant/admin routes, and unknown routes return 404.\n`,
  );
}
