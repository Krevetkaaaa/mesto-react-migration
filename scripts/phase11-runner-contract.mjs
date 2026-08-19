import { once } from "node:events";

import { childProcessHasExited } from "../e2e/support/phase4-process-contract.mjs";
import { LOAD_SCENARIOS, LOAD_STAGES } from "./phase11-load.mjs";

const DEFAULT_MATRIX = Object.freeze([
  Object.freeze(["smoke", "public-read"]),
  Object.freeze(["smoke", "popular-venue"]),
  Object.freeze(["smoke", "auth-safe"]),
  Object.freeze(["smoke", "merchant-admin"]),
  Object.freeze(["baseline", "mixed"]),
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function parseRunMatrix(args) {
  if (args.length === 0) return DEFAULT_MATRIX.map((entry) => [...entry]);
  invariant(args.length % 2 === 0, "Phase 11 runner options require a value");
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    invariant(["--stage", "--scenario"].includes(option), `Unknown Phase 11 runner option: ${option}`);
    invariant(value && !value.startsWith("--"), `${option} requires a value`);
    invariant(!values.has(option), `Duplicate Phase 11 runner option: ${option}`);
    values.set(option, value);
  }
  invariant(values.has("--stage") && values.has("--scenario"), "--stage and --scenario must be supplied together");
  const stage = values.get("--stage");
  const scenario = values.get("--scenario");
  invariant(Object.hasOwn(LOAD_STAGES, stage), `Unknown load stage: ${stage}`);
  invariant(LOAD_SCENARIOS.includes(scenario), `Unknown load scenario: ${scenario}`);
  return [[stage, scenario]];
}

function isPositivePid(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export function ownedChildPidsFromMessage(message) {
  if (message?.type !== "phase4-owned-children") return null;
  invariant(isPositivePid(message.reactPid), "Phase 4 IPC reported an invalid React child PID");
  invariant(isPositivePid(message.legacyPid), "Phase 4 IPC reported an invalid legacy child PID");
  invariant(message.reactPid !== message.legacyPid, "Phase 4 IPC child PIDs must be distinct");
  return Object.freeze([message.reactPid, message.legacyPid]);
}

export function healthMatchesOwnedChildPids(payload, ownedPids) {
  return payload?.ok === true
    && Array.isArray(ownedPids)
    && ownedPids.length === 2
    && payload.reactPid === ownedPids[0]
    && payload.legacyPid === ownedPids[1];
}

export async function responseMatchesOwnedChildPids(response, ownedPids) {
  const payload = await response.json().catch(() => null);
  return response.ok && healthMatchesOwnedChildPids(payload, ownedPids);
}

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

function waitForGatewayClose(gateway, timeoutMs) {
  if (childProcessHasExited(gateway)) return Promise.resolve(true);
  return settleWithin(once(gateway, "close"), timeoutMs);
}

function sendGatewayMessage(gateway, message) {
  if (!gateway.connected || typeof gateway.send !== "function") return Promise.resolve(false);
  return new Promise((resolveSend) => {
    try {
      gateway.send(message, (error) => resolveSend(!error));
    } catch {
      resolveSend(false);
    }
  });
}

export async function stopOwnedGateway(gateway, { gracefulTimeoutMs = 5_000, signalTimeoutMs = 1_000 } = {}) {
  const wasRunning = !childProcessHasExited(gateway);
  if (!wasRunning) return { acknowledged: false, forced: false, wasRunning };

  let acknowledged = false;
  const onMessage = (message) => {
    if (message?.type === "phase4-stopped") acknowledged = true;
  };
  gateway.on("message", onMessage);

  try {
    const requested = await sendGatewayMessage(gateway, { type: "phase4-shutdown" });
    if (!requested && !childProcessHasExited(gateway)) gateway.kill("SIGTERM");
    if (await waitForGatewayClose(gateway, gracefulTimeoutMs)) {
      return { acknowledged, forced: false, wasRunning };
    }

    if (!childProcessHasExited(gateway)) gateway.kill("SIGTERM");
    if (await waitForGatewayClose(gateway, signalTimeoutMs)) {
      return { acknowledged, forced: false, wasRunning };
    }

    if (!childProcessHasExited(gateway)) gateway.kill("SIGKILL");
    await waitForGatewayClose(gateway, signalTimeoutMs);
    return { acknowledged, forced: true, wasRunning };
  } finally {
    gateway.off("message", onMessage);
  }
}
