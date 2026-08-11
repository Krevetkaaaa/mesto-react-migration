import { fileURLToPath } from 'node:url';

import {
  linkedVercelProject,
  previewProviderExpectation,
  resolveExpectedPreviewCommitSha,
  runPreviewLoad,
  validatePreviewLoadTarget
} from './preview-load.mjs';

const DEPLOYMENT_ID_PATTERN = /^dpl_[A-Za-z0-9]{16,}$/;

export const PREVIEW_LOAD_GATE_SEQUENCE = Object.freeze(['expected', 'burst', 'soak']);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function parsePreviewLoadGateArguments(args, environment = process.env) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option === '--acknowledge-preview-load') {
      invariant(!values.has(option), `Duplicate Preview load gate option: ${option}`);
      values.set(option, true);
      continue;
    }
    invariant(
      ['--base-url', '--deployment-id', '--expected-commit-sha'].includes(option),
      `Unknown Preview load gate option: ${option}`
    );
    const value = args[index + 1];
    invariant(value && !value.startsWith('--'), `${option} requires a value`);
    invariant(!values.has(option), `Duplicate Preview load gate option: ${option}`);
    values.set(option, value);
    index += 1;
  }
  invariant(values.has('--acknowledge-preview-load'), '--acknowledge-preview-load is required');
  const deploymentId = String(values.get('--deployment-id') || '');
  invariant(DEPLOYMENT_ID_PATTERN.test(deploymentId), '--deployment-id must be an exact Vercel deployment ID');
  return {
    baseUrl: validatePreviewLoadTarget(values.get('--base-url'), environment.MESTO_LOAD_ALLOWED_PREVIEW_ORIGIN),
    deploymentId,
    expectedCommitSha: resolveExpectedPreviewCommitSha(values.get('--expected-commit-sha'), environment)
  };
}

function immutableEvidence(manifest) {
  return JSON.stringify([
    manifest?.deploymentId,
    manifest?.projectId,
    manifest?.commitSha,
    manifest?.expectedCommitSha,
    manifest?.actualCommitSha,
    manifest?.providerIdentity?.fingerprint
  ]);
}

export async function runPreviewLoadGate(options, { runStage = runPreviewLoad, now = () => new Date() } = {}) {
  const target = validatePreviewLoadTarget(options.baseUrl, options.allowedOrigin);
  const expectedCommitSha = resolveExpectedPreviewCommitSha(options.expectedCommitSha, {});
  const startedAt = now().toISOString();
  const stages = [];
  let firstEvidence = null;

  for (const stageName of PREVIEW_LOAD_GATE_SEQUENCE) {
    const result = await runStage({ ...options, baseUrl: target, expectedCommitSha, stageName });
    invariant(result?.stage === stageName, `Preview load gate received evidence for the wrong stage: ${stageName}`);
    invariant(result?.evidenceManifest, `Preview load gate stage ${stageName} has no evidence manifest`);
    invariant(
      result.evidenceManifest.expectedCommitSha === expectedCommitSha,
      `Preview load gate expected commit evidence does not match during ${stageName}`
    );
    invariant(
      result.evidenceManifest.actualCommitSha === expectedCommitSha
        && result.evidenceManifest.commitSha === expectedCommitSha,
      `Preview load gate actual commit evidence does not match during ${stageName}`
    );
    if (!firstEvidence) firstEvidence = result.evidenceManifest;
    invariant(
      immutableEvidence(result.evidenceManifest) === immutableEvidence(firstEvidence),
      `Preview load gate evidence changed during ${stageName}`
    );
    stages.push(result);
    if (!result.slo?.passed) break;
  }

  const passed = stages.length === PREVIEW_LOAD_GATE_SEQUENCE.length
    && stages.every((stage) => stage.slo.passed);
  const completedNames = new Set(stages.map((stage) => stage.stage));
  return {
    schemaVersion: 1,
    kind: 'mesto.preview.edge-document-load-gate',
    passed,
    evidenceManifest: firstEvidence ? {
      deploymentId: firstEvidence.deploymentId,
      projectId: firstEvidence.projectId,
      commitSha: firstEvidence.commitSha,
      expectedCommitSha: firstEvidence.expectedCommitSha,
      actualCommitSha: firstEvidence.actualCommitSha,
      target,
      startedAt,
      completedAt: now().toISOString(),
      providerIdentity: firstEvidence.providerIdentity
    } : null,
    sequence: [...PREVIEW_LOAD_GATE_SEQUENCE],
    stages,
    notRun: PREVIEW_LOAD_GATE_SEQUENCE.filter((stageName) => !completedNames.has(stageName))
  };
}

async function main() {
  const options = parsePreviewLoadGateArguments(process.argv.slice(2));
  const linked = linkedVercelProject();
  const expectation = previewProviderExpectation(process.env);
  const configuredTeamId = String(process.env.MESTO_LOAD_VERCEL_TEAM_ID || '').trim();
  const result = await runPreviewLoadGate({
    ...options,
    allowedOrigin: process.env.MESTO_LOAD_ALLOWED_PREVIEW_ORIGIN,
    bypassSecret: process.env.MESTO_PREVIEW_BYPASS_SECRET || '',
    projectId: linked.projectId,
    teamId: configuredTeamId || linked.teamId,
    vercelToken: process.env.VERCEL_TOKEN,
    expectedSupabaseProjectRef: expectation.supabaseProjectRef,
    forbiddenProductionSupabaseProjectRef: expectation.forbiddenProductionSupabaseProjectRef,
    expectedRedisNamespace: expectation.redisNamespace,
    expectedRedisProvidersFingerprint: expectation.redisProvidersFingerprint,
    forbiddenProductionRedisProvidersFingerprint: expectation.forbiddenProductionRedisProvidersFingerprint
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error?.message || 'Preview load gate failed');
    process.exitCode = 1;
  });
}
