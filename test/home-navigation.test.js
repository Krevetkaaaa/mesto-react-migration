const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const appSource = readFileSync(resolve(__dirname, '..', 'app.js'), 'utf8');

function routeHelpers() {
  const start = appSource.indexOf('function catalogHref');
  const end = appSource.indexOf('\nfunction branchWord', start);
  assert.notEqual(start, -1, 'catalog route helpers must exist in app.js');
  assert.notEqual(end, -1, 'catalog route helper block must have a stable end');
  const context = { URLSearchParams, encodeURIComponent };
  vm.runInNewContext(`${appSource.slice(start, end)}\nthis.helpers = { catalogHref, venueHref };`, context);
  return context.helpers;
}

test('legacy home builds canonical catalog URLs without default parameters', () => {
  const { catalogHref } = routeHelpers();
  assert.equal(catalogHref(), '/catalog');
  assert.equal(catalogHref({ city: 'all', category: 'all', cuisine: 'all', sort: 'popular' }), '/catalog');

  const href = catalogHref({
    query: '  кофе у моря  ',
    city: 'Ялта',
    category: 'Кофейни',
    cuisine: 'Кофе и десерты',
    sort: 'new',
    pet: true,
    parking: true
  });
  const url = new URL(href, 'https://mesto.example');
  assert.equal(url.pathname, '/catalog');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    q: 'кофе у моря',
    city: 'Ялта',
    category: 'Кофейни',
    cuisine: 'Кофе и десерты',
    sort: 'new',
    pet: '1',
    parking: '1'
  });
});

test('legacy home only creates venue routes from explicit safe slugs', () => {
  const { venueHref } = routeHelpers();
  assert.equal(venueHref('  Тихий-Сад  '), '/venue/%D1%82%D0%B8%D1%85%D0%B8%D0%B9-%D1%81%D0%B0%D0%B4');
  assert.equal(venueHref('tihiy-sad'), '/venue/tihiy-sad');
  for (const value of ['', 'bad/slug', 'bad--slug', 'bad_slug', '<script>', 'δοκιμή']) {
    assert.equal(venueHref(value), '', value);
  }
});

test('catalog entry listeners navigate instead of taking legacy catalog DOM ownership', () => {
  const start = appSource.indexOf("document.querySelectorAll('.quick-filters button')");
  const end = appSource.indexOf("document.querySelectorAll('[data-home-link]')", start);
  const listeners = appSource.slice(start, end);

  assert.match(listeners, /navigateToCatalog\(\{ category: filter\.dataset\.filter \}\)/);
  assert.match(listeners, /navigateToCatalog\(\{ category: category\.dataset\.filterCategory \}\)/);
  assert.match(listeners, /navigateToCatalog\(\{ city: 'Ялта', category: 'Рестораны' \}\)/);
  assert.match(listeners, /navigateToCatalog\(\{ pet: true \}\)/);
  assert.match(listeners, /navigateToCatalog\(\{ query, city \}\)/);
  assert.match(listeners, /navigateToCatalog\(\{ city: button\.dataset\.cityFilter \}\)/);
  assert.doesNotMatch(listeners, /openCatalog\(/);
});

test('database-backed home cards preserve an API slug and use it before the editorial dialog fallback', () => {
  assert.match(appSource, /slug: item\.slug \|\| ''/);
  assert.match(appSource, /const href = venueHref\(venueData\[card\.dataset\.venue\]\?\.slug\)/);
  assert.match(appSource, /if \(href\) \{[\s\S]*window\.location\.assign\(href\);[\s\S]*return;[\s\S]*\}\s*openVenue\(card\.dataset\.venue\)/);
});
