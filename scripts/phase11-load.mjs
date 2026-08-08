import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import path from "node:path";

const MAX_LATENCY_SAMPLES = 200_000;
const MAX_LABEL_LATENCY_SAMPLES = 20_000;
const INITIAL_SAMPLE_SEED = 0x6d657374;

export const LOAD_STAGES = Object.freeze({
  smoke: Object.freeze({ virtualUsers: 5, durationMs: 3_000, minimumThroughputRps: 5 }),
  baseline: Object.freeze({ virtualUsers: 25, durationMs: 10_000, minimumThroughputRps: 20 }),
  expected: Object.freeze({ virtualUsers: 100, durationMs: 20_000, minimumThroughputRps: 40 }),
  burst: Object.freeze({ virtualUsers: 300, durationMs: 5_000, minimumThroughputRps: 40 }),
  soak: Object.freeze({ virtualUsers: 100, durationMs: 120_000, minimumThroughputRps: 40 }),
});

export const LOAD_SCENARIOS = Object.freeze([
  "public-read",
  "popular-venue",
  "auth-safe",
  "mixed",
  "merchant-admin",
]);

const DEFAULT_LOAD_ARGUMENTS = Object.freeze({
  baseUrl: "http://127.0.0.1:4174",
  scenario: "public-read",
  stageName: "smoke",
});

const PUBLIC_REQUESTS = Object.freeze([
  Object.freeze({ label: "home-document", pathname: "/" }),
  Object.freeze({ label: "catalog-document", pathname: "/catalog" }),
  Object.freeze({ label: "filtered-catalog", pathname: "/catalog?city=Симферополь&category=Рестораны" }),
  Object.freeze({ label: "venue-document", pathname: "/venue/tihiy-sad" }),
  Object.freeze({ label: "catalog-api", pathname: "/api/venues?results=20&skip=0" }),
  Object.freeze({ label: "venue-api", pathname: "/api/venues/tihiy-sad" }),
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function isPositivePid(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export function fetchWithoutRedirect(input, init = {}) {
  return fetch(input, { ...init, redirect: "manual" });
}

export function addReservoirSample(reservoir, value, observedCount, capacity) {
  invariant(Number.isSafeInteger(observedCount) && observedCount > 0, "Reservoir observed count must be positive");
  invariant(Number.isSafeInteger(capacity) && capacity > 0, "Reservoir capacity must be positive");
  if (reservoir.latencies.length < capacity) {
    reservoir.latencies.push(value);
    return;
  }
  reservoir.sampleSeed = (Math.imul(reservoir.sampleSeed, 1_664_525) + 1_013_904_223) >>> 0;
  const replacement = reservoir.sampleSeed % observedCount;
  if (replacement < capacity) reservoir.latencies[replacement] = value;
}

export function validateLoadTarget(value) {
  const target = new URL(String(value || "http://127.0.0.1:4174"));
  invariant(["http:", "https:"].includes(target.protocol), "Load target must use HTTP or HTTPS");
  invariant(!target.username && !target.password, "Load target must not contain credentials");
  invariant(target.pathname === "/" && !target.search && !target.hash, "Load target must be an origin without path, query, or hash");
  const loopback = ["127.0.0.1", "[::1]"].includes(target.hostname);
  invariant(loopback, "Phase 11 fixture load target must use a loopback IP literal; remote load is intentionally unsupported");
  return target.origin;
}

export function parseLoadArguments(args) {
  if (args.length === 0) return { ...DEFAULT_LOAD_ARGUMENTS };
  invariant(args.length % 2 === 0, "Phase 11 load options require a value");
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    invariant(["--base-url", "--stage", "--scenario"].includes(option), `Unknown Phase 11 load option: ${option}`);
    invariant(value && !value.startsWith("--"), `${option} requires a value`);
    invariant(!values.has(option), `Duplicate Phase 11 load option: ${option}`);
    values.set(option, value);
  }
  invariant(
    values.has("--stage") === values.has("--scenario"),
    "--stage and --scenario must be supplied together",
  );
  const stageName = values.get("--stage") ?? DEFAULT_LOAD_ARGUMENTS.stageName;
  const scenario = values.get("--scenario") ?? DEFAULT_LOAD_ARGUMENTS.scenario;
  invariant(Object.hasOwn(LOAD_STAGES, stageName), `Unknown load stage: ${stageName}`);
  invariant(LOAD_SCENARIOS.includes(scenario), `Unknown load scenario: ${scenario}`);
  return {
    baseUrl: values.get("--base-url") ?? DEFAULT_LOAD_ARGUMENTS.baseUrl,
    scenario,
    stageName,
  };
}

async function resetVerifiedFixture(baseUrl) {
  const gateway = await fetchWithoutRedirect(new URL("/__phase4/health", baseUrl), { signal: AbortSignal.timeout(2_000) });
  const gatewayPayload = await gateway.json().catch(() => null);
  invariant(
    gateway.ok
      && gatewayPayload?.ok === true
      && isPositivePid(gatewayPayload.reactPid)
      && isPositivePid(gatewayPayload.legacyPid),
    "Load target is not the production SSR plus fixture gateway",
  );
  const probe = await fetchWithoutRedirect(new URL("/__e2e/state", baseUrl), { signal: AbortSignal.timeout(2_000) });
  await probe.arrayBuffer();
  invariant(
    probe.ok && probe.headers.get("x-e2e-fixture") === "legacy-safety-net",
    "Load target is not the verified Mesto safety-net fixture",
  );
  const reset = await fetchWithoutRedirect(new URL("/__e2e/reset", baseUrl), {
    method: "POST",
    signal: AbortSignal.timeout(2_000),
  });
  await reset.arrayBuffer();
  invariant(
    reset.ok && reset.headers.get("x-e2e-fixture") === "legacy-safety-net",
    `Fixture reset failed: HTTP ${reset.status}`,
  );
}

function cookieFrom(response) {
  return String(response.headers.get("set-cookie") || "").split(";", 1)[0];
}

async function fixtureLogin(baseUrl, pathname, body) {
  const response = await fetchWithoutRedirect(new URL(pathname, baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(2_000),
  });
  await response.arrayBuffer();
  invariant(response.headers.get("x-e2e-fixture") === "legacy-safety-net", `Fixture sentinel missing for ${pathname}`);
  invariant(response.status === 200, `Fixture session setup failed for ${pathname}: HTTP ${response.status}`);
  const cookie = cookieFrom(response);
  invariant(cookie, `Fixture session setup returned no cookie for ${pathname}`);
  return cookie;
}

async function prepareFixtureSessions(baseUrl, scenario) {
  if (!new Set(["auth-safe", "mixed", "merchant-admin"]).has(scenario)) return {};
  const [customer, merchant, admin] = await Promise.all([
    fixtureLogin(baseUrl, "/api/auth/login", { login: "anna", password: "fixture-password" }),
    fixtureLogin(baseUrl, "/api/auth/login", { login: "merchant.owner", password: "fixture-password" }),
    fixtureLogin(baseUrl, "/api/admin/login", { login: "editor", password: "fixture-password" }),
  ]);
  return { customer, merchant, admin };
}

function publicRequest(index) {
  return PUBLIC_REQUESTS[index % PUBLIC_REQUESTS.length];
}

function requestFor(scenario, index, sessions, baseUrl) {
  if (scenario === "public-read") return publicRequest(index);
  if (scenario === "popular-venue") return { label: "popular-venue-document", pathname: "/venue/tihiy-sad" };
  if (scenario === "auth-safe") {
    return index % 10 === 0
      ? {
          label: "known-fixture-login",
          pathname: "/api/auth/login",
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: baseUrl },
          body: JSON.stringify({ login: "anna", password: "fixture-password" }),
        }
      : { label: "customer-session", pathname: "/api/auth/session", headers: { Cookie: sessions.customer } };
  }
  if (scenario === "merchant-admin") {
    return index % 10 < 7
      ? { label: "merchant-dashboard", pathname: "/api/merchant/dashboard", headers: { Cookie: sessions.merchant } }
      : { label: "admin-dashboard", pathname: "/api/admin/dashboard", headers: { Cookie: sessions.admin } };
  }
  const bucket = index % 100;
  if (bucket < 90) return publicRequest(index);
  if (bucket < 96) return { label: "customer-favorites", pathname: "/api/favorites", headers: { Cookie: sessions.customer } };
  if (bucket < 99) return { label: "merchant-dashboard", pathname: "/api/merchant/dashboard", headers: { Cookie: sessions.merchant } };
  return { label: "admin-dashboard", pathname: "/api/admin/dashboard", headers: { Cookie: sessions.admin } };
}

function percentile(sorted, ratio) {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
  return Number(sorted[index].toFixed(2));
}

export function summarizeLoadMetrics(metrics, elapsedMs) {
  const latencies = [...metrics.latencies].sort((left, right) => left - right);
  const total = metrics.requests;
  const status4xx = Object.entries(metrics.statuses)
    .filter(([status]) => Number(status) >= 400 && Number(status) < 500)
    .reduce((sum, [, count]) => sum + count, 0);
  const status5xx = Object.entries(metrics.statuses)
    .filter(([status]) => Number(status) >= 500)
    .reduce((sum, [, count]) => sum + count, 0);
  return {
    requests: total,
    sampledLatencies: latencies.length,
    elapsedMs: Number(elapsedMs.toFixed(2)),
    attemptedThroughputRps: Number((total / (elapsedMs / 1000)).toFixed(2)),
    successfulThroughputRps: Number(((metrics.statuses[200] || 0) / (elapsedMs / 1000)).toFixed(2)),
    latencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
    },
    responseBytes: metrics.responseBytes,
    statuses: metrics.statuses,
    status4xx,
    status429: metrics.statuses[429] || 0,
    status5xx,
    transportErrors: metrics.transportErrors,
    unexpectedStatuses: metrics.unexpectedStatuses,
    abortedReason: metrics.abortedReason || null,
    cache: metrics.cache,
    byLabel: Object.fromEntries(Object.entries(metrics.byLabel).map(([label, value]) => {
      const sortedLabelLatencies = [...value.latencies].sort((left, right) => left - right);
      return [label, {
        requests: value.requests,
        successes: value.successes,
        transportErrors: value.transportErrors,
        statuses: value.statuses,
        latencyMs: {
          p50: percentile(sortedLabelLatencies, 0.5),
          p95: percentile(sortedLabelLatencies, 0.95),
          p99: percentile(sortedLabelLatencies, 0.99),
        },
      }];
    })),
  };
}

export function evaluateLocalSlo(summary, stage, scenario) {
  const latencyLimit = scenario === "merchant-admin" ? { p95: 1_500, p99: 3_000 } : { p95: 1_000, p99: 2_500 };
  const failures = [];
  if (summary.latencyMs.p95 === null || summary.latencyMs.p95 > latencyLimit.p95) {
    failures.push(`p95 ${summary.latencyMs.p95}ms > ${latencyLimit.p95}ms`);
  }
  if (summary.latencyMs.p99 === null || summary.latencyMs.p99 > latencyLimit.p99) {
    failures.push(`p99 ${summary.latencyMs.p99}ms > ${latencyLimit.p99}ms`);
  }
  if (summary.successfulThroughputRps < stage.minimumThroughputRps) {
    failures.push(`successful throughput ${summary.successfulThroughputRps}rps < ${stage.minimumThroughputRps}rps`);
  }
  if (summary.status5xx) failures.push(`${summary.status5xx} HTTP 5xx responses`);
  if (summary.transportErrors) failures.push(`${summary.transportErrors} transport errors`);
  if (summary.unexpectedStatuses) failures.push(`${summary.unexpectedStatuses} unexpected statuses`);
  if (summary.abortedReason) failures.push(`aborted: ${summary.abortedReason}`);
  return { passed: failures.length === 0, failures, limits: { ...latencyLimit, minimumThroughputRps: stage.minimumThroughputRps } };
}

export async function runLoadTest({ baseUrl, stageName = "smoke", scenario = "public-read" }) {
  const origin = validateLoadTarget(baseUrl);
  const stage = LOAD_STAGES[stageName];
  invariant(stage, `Unknown load stage: ${stageName}`);
  invariant(LOAD_SCENARIOS.includes(scenario), `Unknown load scenario: ${scenario}`);
  await resetVerifiedFixture(origin);
  const sessions = await prepareFixtureSessions(origin, scenario);
  const metrics = {
    requests: 0,
    latencies: [],
    responseBytes: 0,
    statuses: {},
    transportErrors: 0,
    unexpectedStatuses: 0,
    abortedReason: null,
    consecutiveTransportErrors: 0,
    lastSuccessAt: performance.now(),
    sampleSeed: INITIAL_SAMPLE_SEED,
    cache: { hit: 0, miss: 0, unreported: 0 },
    byLabel: {},
  };
  const startedAt = performance.now();
  const deadline = startedAt + stage.durationMs;
  let sequence = 0;

  async function worker(workerIndex) {
    while (performance.now() < deadline && !metrics.abortedReason) {
      const index = sequence++;
      const definition = requestFor(scenario, index, sessions, origin);
      const requestStarted = performance.now();
      let status = 0;
      try {
        const response = await fetchWithoutRedirect(new URL(definition.pathname, origin), {
          method: definition.method || "GET",
          headers: definition.headers,
          body: definition.body,
          signal: AbortSignal.timeout(5_000),
        });
        const body = await response.arrayBuffer();
        status = response.status;
        if (definition.pathname.startsWith("/api/") && response.headers.get("x-e2e-fixture") !== "legacy-safety-net") {
          metrics.abortedReason = `fixture sentinel missing for ${definition.label}`;
        }
        metrics.responseBytes += body.byteLength;
        metrics.statuses[status] = (metrics.statuses[status] || 0) + 1;
        if (status !== 200) metrics.unexpectedStatuses += 1;
        if (status === 200) {
          metrics.consecutiveTransportErrors = 0;
          metrics.lastSuccessAt = performance.now();
        }
        const cacheState = String(response.headers.get("x-vercel-cache") || "").toUpperCase();
        const age = Number(response.headers.get("age") || 0);
        if (cacheState === "HIT" || age > 0) metrics.cache.hit += 1;
        else if (cacheState) metrics.cache.miss += 1;
        else metrics.cache.unreported += 1;
      } catch {
        metrics.transportErrors += 1;
        metrics.consecutiveTransportErrors += 1;
      }
      const latency = performance.now() - requestStarted;
      metrics.requests += 1;
      addReservoirSample(metrics, latency, metrics.requests, MAX_LATENCY_SAMPLES);
      const label = metrics.byLabel[definition.label] ?? {
        requests: 0,
        successes: 0,
        transportErrors: 0,
        statuses: {},
        latencies: [],
        sampleSeed: INITIAL_SAMPLE_SEED,
      };
      label.requests += 1;
      if (status === 200) label.successes += 1;
      if (status === 0) label.transportErrors += 1;
      else label.statuses[status] = (label.statuses[status] || 0) + 1;
      addReservoirSample(label, latency, label.requests, MAX_LABEL_LATENCY_SAMPLES);
      metrics.byLabel[definition.label] = label;
      const serverErrors = Object.entries(metrics.statuses)
        .filter(([code]) => Number(code) >= 500)
        .reduce((sum, [, count]) => sum + count, 0);
      if (metrics.consecutiveTransportErrors >= 5) {
        metrics.abortedReason = "five consecutive transport errors";
      } else if (metrics.requests >= 100 && serverErrors / metrics.requests > 0.05) {
        metrics.abortedReason = "HTTP 5xx rate exceeded 5% after 100 requests";
      } else if (performance.now() - metrics.lastSuccessAt > 10_000) {
        metrics.abortedReason = "no successful response for 10 seconds";
      }
    }
  }

  await Promise.all(Array.from({ length: stage.virtualUsers }, (_, index) => worker(index)));
  const summary = summarizeLoadMetrics(metrics, performance.now() - startedAt);
  const slo = evaluateLocalSlo(summary, stage, scenario);
  return { target: origin, stage: stageName, scenario, configuration: stage, summary, slo };
}

async function main() {
  const result = await runLoadTest(parseLoadArguments(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
  if (!result.slo.passed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
