const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.(?:ts|tsx)$/.test(entry.name) && !/\.server\.(?:ts|tsx)$/.test(entry.name) ? [absolute] : [];
  });
}

test('client React source does not introduce raw HTML or executable string sinks', () => {
  const findings = [];
  for (const file of sourceFiles(path.join(ROOT, 'app'))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const [name, pattern] of [
      ['dangerouslySetInnerHTML', /\bdangerouslySetInnerHTML\b/],
      ['innerHTML assignment', /\.innerHTML\s*=/],
      ['eval', /\beval\s*\(/],
      ['Function constructor', /\bnew\s+Function\s*\(/]
    ]) {
      if (pattern.test(source)) findings.push(`${path.relative(ROOT, file)}: ${name}`);
    }
  }
  assert.deepEqual(findings, []);
});

test('production client bundle scan rejects server secret markers', async (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mesto-client-scan-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const moduleUrl = pathToFileURL(path.join(ROOT, 'scripts', 'check-client-bundle-secrets.mjs')).href;
  const { scanClientBundle } = await import(moduleUrl);

  fs.writeFileSync(path.join(temporary, 'safe.js'), 'console.log("public client")');
  const environment = { MESTO_ADMIN_SESSION_SECRET: 'admin-secret-value-without-its-name' };
  assert.deepEqual(await scanClientBundle(temporary, environment), { files: 1, findings: [] });

  fs.writeFileSync(path.join(temporary, 'unsafe.js'), 'const leaked = "admin-secret-value-without-its-name";');
  const result = await scanClientBundle(temporary, environment);
  assert.deepEqual(result.findings.map(({ marker }) => marker), ['MESTO_ADMIN_SESSION_SECRET value']);
});
