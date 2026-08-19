import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FORBIDDEN_CLIENT_MARKERS = Object.freeze([
  "SUPABASE_SERVICE_ROLE_KEY",
  "MESTO_ADMIN_PASSWORD_HASH",
  "MESTO_ADMIN_SESSION_SECRET",
  "MESTO_USER_SESSION_SECRET",
  "MESTO_RATE_LIMIT_REDIS_TOKEN",
  "VK_ID_SERVICE_TOKEN",
  "YANDEX_OAUTH_CLIENT_SECRET",
  "-----BEGIN PRIVATE KEY-----",
]);

const MINIMUM_SECRET_VALUE_LENGTH = 16;

const HIGH_SIGNAL_SECRET_PATTERNS = Object.freeze([
  { label: "OpenAI-style API key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { label: "GitHub personal access token", pattern: /\bghp_[A-Za-z0-9]{20,}\b/ },
]);

async function filesBelow(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(root, entry.name);
    return entry.isDirectory() ? filesBelow(absolute) : [absolute];
  }));
  return nested.flat();
}

export async function scanClientBundle(root, environment = process.env) {
  const rootStats = await stat(root).catch(() => null);
  if (!rootStats?.isDirectory()) {
    throw new Error(`Client bundle directory does not exist: ${root}`);
  }
  const files = (await filesBelow(root)).filter((file) => /\.(?:html|js|json|map|css)$/i.test(file));
  if (!files.length) throw new Error(`Client bundle contains no scannable assets: ${root}`);

  const findings = [];
  const configuredSecretValues = FORBIDDEN_CLIENT_MARKERS.flatMap((name) => {
    const value = environment[name];
    return typeof value === "string" && value.length >= MINIMUM_SECRET_VALUE_LENGTH
      ? [{ name, value }]
      : [];
  });
  for (const file of files) {
    const content = await readFile(file, "utf8");
    for (const marker of FORBIDDEN_CLIENT_MARKERS) {
      if (content.includes(marker)) findings.push({ file, marker });
    }
    for (const { label, pattern } of HIGH_SIGNAL_SECRET_PATTERNS) {
      const match = content.match(pattern);
      if (match) findings.push({ file, marker: label });
    }
    for (const { name, value } of configuredSecretValues) {
      if (content.includes(value)) findings.push({ file, marker: `${name} value` });
    }
  }
  return { files: files.length, findings };
}

async function main() {
  const root = path.resolve(process.argv[2] || "build/client");
  const result = await scanClientBundle(root);
  if (result.findings.length) {
    for (const finding of result.findings) {
      console.error(`${path.relative(process.cwd(), finding.file)}: forbidden client marker ${finding.marker}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`Client bundle secret scan passed: ${result.files} assets checked.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
