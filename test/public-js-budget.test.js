const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, mkdir, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

async function budgetModule() {
  return import('../scripts/check-public-js-budget.mjs');
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'mesto-public-js-budget-'));
  const assets = join(root, 'assets');
  await mkdir(assets);
  const files = {
    'entry.js': 'export const entry = true;',
    'shared.js': 'export const shared = true;',
    'root.js': 'export const root = true;',
    'public.js': 'export const route = true;',
    'help.js': 'export const help = true;',
    'private.js': 'export const privateRoute = true;',
  };
  await Promise.all(Object.entries(files).map(([name, source]) => writeFile(join(assets, name), source)));
  await writeFile(join(root, 'theme.js'), 'window.mestoTheme = true;');
  await writeFile(join(root, 'app.js'), 'window.mestoLegacyHome = true;');
  await writeFile(join(root, 'password-policy.mjs'), 'export const passwordPolicy = true;');
  const manifest = {
    entry: { module: '/assets/entry.js', imports: ['/assets/shared.js'] },
    routes: {
      root: { module: '/assets/root.js', imports: ['/assets/shared.js'] },
      'routes/public-home': { module: '/assets/public.js', imports: ['/assets/shared.js'] },
      'routes/public-help': { module: '/assets/help.js', imports: ['/assets/shared.js'] },
      'routes/admin-layout': { module: '/assets/private.js', imports: ['/assets/shared.js'] },
    },
  };
  await writeFile(join(assets, 'manifest-fixture.js'), `window.__reactRouterManifest=${JSON.stringify(manifest)};`);
  return root;
}

test('measures unique initial JavaScript for public routes only', async (context) => {
  const root = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  const { measurePublicJavaScript } = await budgetModule();

  const measurements = await measurePublicJavaScript(root);

  assert.equal(measurements.length, 2);
  const home = measurements.find(({ routeId }) => routeId === 'routes/public-home');
  const help = measurements.find(({ routeId }) => routeId === 'routes/public-help');
  assert.deepEqual(home.assets, [
    '/app.js',
    '/assets/entry.js',
    '/assets/public.js',
    '/assets/root.js',
    '/assets/shared.js',
    '/password-policy.mjs',
    '/theme.js',
  ]);
  assert.equal(home.rawBytes, Object.values({
    entry: 'export const entry = true;',
    shared: 'export const shared = true;',
    root: 'export const root = true;',
    route: 'export const route = true;',
    app: 'window.mestoLegacyHome = true;',
    passwordPolicy: 'export const passwordPolicy = true;',
    theme: 'window.mestoTheme = true;',
  }).reduce((total, source) => total + Buffer.byteLength(source), 0));
  assert.ok(home.gzipBytes > 0);
  assert.ok(!help.assets.includes('/app.js'));
});

test('fails closed when a measured route exceeds either explicit budget', async () => {
  const { assertPublicJavaScriptBudget } = await budgetModule();
  const measurements = [{ routeId: 'routes/public-home', assets: ['/asset.js'], rawBytes: 101, gzipBytes: 51 }];

  assert.throws(
    () => assertPublicJavaScriptBudget(measurements, { rawBytes: 100, gzipBytes: 100 }),
    /raw 101 > 100/,
  );
  assert.throws(
    () => assertPublicJavaScriptBudget(measurements, { rawBytes: 200, gzipBytes: 50 }),
    /gzip 51 > 50/,
  );
});
