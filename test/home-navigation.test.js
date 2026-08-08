const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const appSource = readFileSync(resolve(__dirname, '..', 'app.js'), 'utf8');
const phaseConfigs = [5, 6, 7].map((phase) => ({
  phase,
  config: require(resolve(__dirname, '..', 'e2e', `phase${phase}-playwright.config.js`))
}));

function routeHelpers() {
  const start = appSource.indexOf('function catalogHref');
  const end = appSource.indexOf('\nfunction branchWord', start);
  assert.notEqual(start, -1, 'catalog route helpers must exist in app.js');
  assert.notEqual(end, -1, 'catalog route helper block must have a stable end');
  const context = { URLSearchParams, encodeURIComponent };
  vm.runInNewContext(`${appSource.slice(start, end)}\nthis.helpers = { catalogHref, venueHref };`, context);
  return context.helpers;
}

function staticInventory() {
  const start = appSource.indexOf('const venueData =');
  const end = appSource.indexOf('const venueExtras', start);
  assert.notEqual(start, -1, 'venue inventory source must exist in app.js');
  assert.notEqual(end, -1, 'venue inventory source must have a stable end');
  const context = {};
  vm.runInNewContext(`${appSource.slice(start, end)}\nthis.inventory = staticVenueInventory;`, context);
  return JSON.parse(JSON.stringify(context.inventory));
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
  const start = appSource.indexOf("document.querySelectorAll('.quick-filters [data-filter]')");
  const end = appSource.indexOf("document.querySelectorAll('[data-home-link]')", start);
  const listeners = appSource.slice(start, end);

  assert.match(listeners, /navigateToCatalog\(\{ category: filter\.dataset\.filter \}\)/);
  assert.match(listeners, /navigateToCatalog\(\{ category: category\.dataset\.filterCategory \}\)/);
  assert.match(listeners, /navigateToCatalog\(\{ city: 'Ялта', category: 'Рестораны' \}\)/);
  assert.match(listeners, /navigateToCatalog\(\{ pet: true \}\)/);
  assert.match(listeners, /navigateToCatalog\(\{ query, city \}\)/);
  assert.match(listeners, /navigateToCatalog\(\{ city: button\.dataset\.cityFilter \}\)/);
  assert.doesNotMatch(listeners, /openCatalog\(/);
  assert.match(appSource, /function syncCatalogHeading\(\) \{\s*if \(!catalogEyebrow \|\| !catalogTitle \|\| !catalogCopy\) return;/);
});

test('the Phase 5-7 release matrix retains each fixture contract suite', () => {
  for (const { phase, config } of phaseConfigs) {
    assert.equal(config.testMatch.test(`phase${phase}-fixture.spec.js`), true, `Phase ${phase}`);
  }
});

test('retired hidden venue cards remain presentation data and never drive the home summary', () => {
  const inventory = staticInventory();
  const byId = Object.fromEntries(inventory.map((item) => [item.dataset.venue, item.dataset]));
  assert.equal(inventory.length, 31);
  assert.equal(new Set(Object.keys(byId)).size, 31);
  assert.equal(byId.pristan.pet, '1');
  assert.equal(byId['coffee-85'].pet, '0');

  const counts = inventory.reduce((result, item) => {
    result[item.dataset.category] = (result[item.dataset.category] || 0) + 1;
    return result;
  }, {});
  assert.deepEqual(counts, {
    Рестораны: 7,
    Кофейни: 7,
    Бары: 2,
    Кафе: 5,
    'Фаст-кэжуал': 1,
    Кондитерские: 1,
    Пиццерии: 1,
    Гастробары: 1,
    'Караоке-клубы': 2,
    'Банкетные залы': 2,
    'Суши-бары': 1,
    'Кальян-бары': 1
  });

  const cityCounts = inventory.reduce((result, item) => {
    result[item.dataset.city] = (result[item.dataset.city] || 0) + 1;
    return result;
  }, {});
  assert.deepEqual(cityCounts, {
    Севастополь: 8,
    Симферополь: 14,
    Ялта: 7,
    Алушта: 1,
    Евпатория: 1
  });

  assert.match(appSource, /new Set\(staticVenueInventory\.map\(normalizedVenueTitle\)\)/);
  assert.doesNotMatch(appSource, /function inventoryCards|setupVenueCounters|syncCatalogTotals|data-collection-count/);
  assert.match(appSource, /endpoint\.searchParams\.set\('summary', '1'\)/);
  assert.match(appSource, /summary\?\.source !== 'database' \|\| summary\.databaseConfigured !== true/);
  assert.match(appSource, /dataset\.homeCatalogSource !== 'database'/);
});

test('database-backed home cards preserve an API slug and use it before the editorial dialog fallback', () => {
  assert.match(appSource, /slug: item\.slug \|\| ''/);
  assert.match(appSource, /const href = venueHref\(venueData\[card\.dataset\.venue\]\?\.slug\)/);
  assert.match(appSource, /if \(href\) \{[\s\S]*window\.location\.assign\(href\);[\s\S]*return;[\s\S]*\}\s*openVenue\(card\.dataset\.venue\)/);
});
