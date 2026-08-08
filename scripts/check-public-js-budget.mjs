import { gzipSync } from "node:zlib";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Evidence: the 2026-08-07 production build peaked on routes/public-venue at
// 551,499 raw bytes and 152,798 gzip bytes. The React-owned home now follows
// the same release budget; legacy app.js is deliberately not a runtime asset.
export const PUBLIC_JS_BUDGET = Object.freeze({
  rawBytes: 580 * 1024,
  gzipBytes: 160 * 1024,
});

export const PUBLIC_JS_BUDGET_OVERRIDES = Object.freeze({});

const PUBLIC_ROUTE_PATTERN = /^routes\/public-/;
const PUBLIC_STATIC_JAVASCRIPT = Object.freeze({
  all: ["/theme.js"],
});

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function runtimeManifest(clientRoot) {
  const assetsRoot = resolve(clientRoot, "assets");
  const candidates = (await readdir(assetsRoot))
    .filter((name) => /^manifest-[A-Za-z0-9_-]+\.js$/.test(name));
  invariant(candidates.length === 1, `Expected one React Router runtime manifest, found ${candidates.length}`);
  const source = (await readFile(resolve(assetsRoot, candidates[0]), "utf8")).trim();
  const prefix = "window.__reactRouterManifest=";
  invariant(source.startsWith(prefix) && source.endsWith(";"), "React Router runtime manifest has an unexpected format");
  try {
    return JSON.parse(source.slice(prefix.length, -1));
  } catch (error) {
    throw new Error("React Router runtime manifest is not valid JSON", { cause: error });
  }
}

function javascriptAssets(manifest, routeId, route) {
  const root = manifest.routes?.root;
  invariant(root, "React Router runtime manifest is missing the root route");
  return new Set([
    manifest.entry?.module,
    ...(manifest.entry?.imports ?? []),
    root.module,
    ...(root.imports ?? []),
    route.module,
    ...(route.imports ?? []),
    ...PUBLIC_STATIC_JAVASCRIPT.all,
    ...(PUBLIC_STATIC_JAVASCRIPT[routeId] ?? []),
  ].filter(Boolean));
}

function localAssetPath(clientRoot, assetUrl) {
  invariant(typeof assetUrl === "string" && assetUrl.startsWith("/"), `Invalid client asset URL: ${assetUrl}`);
  const parsed = new URL(assetUrl, "https://mesto.invalid");
  invariant(parsed.origin === "https://mesto.invalid", `External client asset is outside the budget: ${assetUrl}`);
  const relativeAsset = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
  invariant(/\.m?js$/.test(relativeAsset), `Non-JavaScript asset entered the JavaScript budget: ${assetUrl}`);
  const target = resolve(clientRoot, relativeAsset);
  const boundary = relative(resolve(clientRoot), target);
  invariant(boundary && !boundary.startsWith("..") && !isAbsolute(boundary), `Client asset escapes build root: ${assetUrl}`);
  return target;
}

export async function measurePublicJavaScript(clientRoot = resolve(projectRoot, "build/client")) {
  const manifest = await runtimeManifest(clientRoot);
  const routes = Object.entries(manifest.routes ?? {})
    .filter(([routeId]) => PUBLIC_ROUTE_PATTERN.test(routeId))
    .sort(([left], [right]) => left.localeCompare(right));
  invariant(routes.length > 0, "React Router runtime manifest contains no public routes");

  const measurements = [];
  for (const [routeId, route] of routes) {
    const assets = javascriptAssets(manifest, routeId, route);
    let rawBytes = 0;
    let gzipBytes = 0;
    for (const asset of assets) {
      const path = localAssetPath(clientRoot, asset);
      invariant((await stat(path)).isFile(), `Expected client JavaScript asset: ${path}`);
      const bytes = await readFile(path);
      rawBytes += bytes.byteLength;
      gzipBytes += gzipSync(bytes, { level: 9 }).byteLength;
    }
    measurements.push({
      routeId,
      assets: [...assets].sort(),
      rawBytes,
      gzipBytes,
    });
  }
  return measurements;
}

export function assertPublicJavaScriptBudget(measurements, budget) {
  const failures = measurements.flatMap((measurement) => {
    const routeBudget = budget ?? PUBLIC_JS_BUDGET_OVERRIDES[measurement.routeId] ?? PUBLIC_JS_BUDGET;
    const reasons = [];
    if (measurement.rawBytes > routeBudget.rawBytes) {
      reasons.push(`raw ${measurement.rawBytes} > ${routeBudget.rawBytes}`);
    }
    if (measurement.gzipBytes > routeBudget.gzipBytes) {
      reasons.push(`gzip ${measurement.gzipBytes} > ${routeBudget.gzipBytes}`);
    }
    return reasons.length ? [`${measurement.routeId}: ${reasons.join(", ")}`] : [];
  });
  invariant(failures.length === 0, `Public JavaScript budget exceeded:\n${failures.join("\n")}`);
}

function kibibytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

async function main() {
  const rootFlag = process.argv.indexOf("--client-root");
  const clientRoot = rootFlag === -1
    ? resolve(projectRoot, "build/client")
    : resolve(process.argv[rootFlag + 1] || "");
  const measurements = await measurePublicJavaScript(clientRoot);
  for (const measurement of measurements) {
    console.log([
      measurement.routeId,
      `${measurement.assets.length} unique files`,
      `${kibibytes(measurement.rawBytes)} raw`,
      `${kibibytes(measurement.gzipBytes)} gzip`,
    ].join(" | "));
  }
  console.log(`Budget | ${kibibytes(PUBLIC_JS_BUDGET.rawBytes)} raw | ${kibibytes(PUBLIC_JS_BUDGET.gzipBytes)} gzip`);
  for (const [routeId, budget] of Object.entries(PUBLIC_JS_BUDGET_OVERRIDES)) {
    console.log(`Budget override ${routeId} | ${kibibytes(budget.rawBytes)} raw | ${kibibytes(budget.gzipBytes)} gzip`);
  }
  assertPublicJavaScriptBudget(measurements);
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
