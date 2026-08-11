import { fileURLToPath } from 'node:url';

import releaseEnvironment from '../lib/release-env.js';

const { validateReleaseEnvironment } = releaseEnvironment;

export function parseReleaseEnvironmentArguments(args, environment = process.env) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option === '--if-deploy') {
      if (values.has(option)) throw new Error(`Duplicate release preflight option: ${option}`);
      values.set(option, true);
      continue;
    }
    if (option !== '--target') throw new Error(`Unknown release preflight option: ${option}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error('--target requires a value');
    if (values.has(option)) throw new Error(`Duplicate release preflight option: ${option}`);
    values.set(option, value);
    index += 1;
  }
  const target = String(
    values.get('--target') || environment.VERCEL_ENV || environment.MESTO_RELEASE_TARGET || ''
  ).trim().toLowerCase();
  return { ifDeploy: values.has('--if-deploy'), target };
}

export function runReleaseEnvironmentPreflight(args, environment = process.env) {
  const options = parseReleaseEnvironmentArguments(args, environment);
  if (options.ifDeploy && !['preview', 'production'].includes(options.target)) {
    const vercelBuild = String(environment.VERCEL || '').trim() === '1'
      || Boolean(
        environment.VERCEL_URL
        || environment.VERCEL_PROJECT_ID
        || environment.VERCEL_DEPLOYMENT_ID
        || environment.MESTO_RELEASE_TARGET
      );
    if (vercelBuild) {
      throw new Error('VERCEL_ENV must identify preview or production during a Vercel build');
    }
    return { skipped: true, target: options.target || 'local' };
  }
  const result = validateReleaseEnvironment(environment, { target: options.target });
  return { ...result, skipped: false };
}

function main() {
  const result = runReleaseEnvironmentPreflight(process.argv.slice(2));
  if (result.skipped) {
    console.log('Release environment preflight skipped outside Vercel Preview/Production.');
    return;
  }
  console.log(`Release environment preflight passed for ${result.target}: ${result.checks.length} redacted checks.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    console.error(error?.message || 'Release environment preflight failed.');
    process.exitCode = 1;
  }
}
