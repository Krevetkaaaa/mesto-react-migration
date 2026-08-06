import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const port = Number(process.env.PORT || 4173);
const host = '127.0.0.1';

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2'
};

const customer = {
  id: '10000000-0000-4000-8000-000000000001',
  username: 'anna',
  name: 'Анна Петрова',
  email: 'anna@example.test',
  hasEmail: true,
  phone: '',
  role: 'customer',
  status: 'active',
  mustChangePassword: false
};

const merchant = {
  id: '20000000-0000-4000-8000-000000000001',
  username: 'merchant.owner',
  name: 'Мария Волкова',
  email: 'merchant@example.test',
  hasEmail: true,
  phone: '',
  role: 'merchant',
  status: 'active',
  mustChangePassword: false
};

const catalogItems = [
  {
    id: 'mesto-fixture-1',
    databaseId: '30000000-0000-4000-8000-000000000001',
    slug: 'tihiy-sad',
    name: 'Тихий сад',
    city: 'Симферополь',
    address: 'ул. Пушкина, 18',
    description: 'Спокойный ресторан с сезонной кухней и внутренним садом.',
    categories: ['Рестораны', 'Европейская'],
    category: 'Рестораны',
    cuisine: 'Европейская',
    hours: '10:00–23:00',
    averageCheck: '1 400 ₽',
    phones: ['+7 978 000-00-01'],
    website: '',
    features: ['Можно с питомцами', 'Парковка рядом', 'Wi-Fi'],
    coordinates: [],
    photos: ['/assets/real-dining-night.jpg'],
    mapsUrl: '',
    source: 'mesto',
    rating: 4.9,
    reviewCount: 128
  },
  {
    id: 'mesto-fixture-2',
    databaseId: '30000000-0000-4000-8000-000000000002',
    slug: 'morskoy-svet',
    name: 'Морской свет',
    city: 'Ялта',
    address: 'наб. Ленина, 7',
    description: 'Ресторан у воды с открытой террасой и рыбным меню.',
    categories: ['Рестораны', 'Средиземноморская'],
    category: 'Рестораны',
    cuisine: 'Средиземноморская',
    hours: '12:00–00:00',
    averageCheck: '1 900 ₽',
    phones: ['+7 978 000-00-02'],
    website: '',
    features: ['Вид на море', 'Парковка рядом'],
    coordinates: [],
    photos: ['/assets/venue-restaurant-unsplash.jpg'],
    mapsUrl: '',
    source: 'mesto',
    rating: 4.8,
    reviewCount: 94
  },
  {
    id: 'mesto-fixture-3',
    databaseId: '30000000-0000-4000-8000-000000000003',
    slug: 'kofe-vo-dvore',
    name: 'Кофе во дворе',
    city: 'Симферополь',
    address: 'ул. Горького, 11',
    description: 'Кофейня с завтраками, выпечкой и тихим двором.',
    categories: ['Кофейни', 'Кофе и десерты'],
    category: 'Кофейни',
    cuisine: 'Кофе и десерты',
    hours: '08:00–21:00',
    averageCheck: '550 ₽',
    phones: ['+7 978 000-00-03'],
    website: '',
    features: ['Можно с питомцами', 'Wi-Fi'],
    coordinates: [],
    photos: ['/assets/venue-coffee-unsplash.jpg'],
    mapsUrl: '',
    source: 'mesto',
    rating: 4.7,
    reviewCount: 51
  }
];

const publicVenueDetails = catalogItems.map((item) => ({
  id: item.databaseId,
  slug: item.slug,
  title: item.name,
  city: item.city,
  category: item.category,
  cuisine: item.cuisine,
  description: item.description,
  address: item.address,
  phone: item.phones[0] || '',
  website: item.website,
  hours: item.hours,
  average_check: item.averageCheck,
  features: structuredClone(item.features),
  photos: structuredClone(item.photos),
  source: item.source,
  status: 'published',
  created_at: '2026-07-01T10:00:00.000Z',
  updated_at: '2026-07-15T12:00:00.000Z'
}));

const merchantVenue = {
  id: '30000000-0000-4000-8000-000000000001',
  title: 'Тихий сад',
  slug: 'tihiy-sad',
  city: 'Симферополь',
  category: 'Ресторан',
  cuisine: 'Европейская',
  description: 'Спокойный ресторан с сезонной кухней и внутренним садом.',
  address: 'ул. Пушкина, 18',
  phone: '+7 978 000-00-01',
  website: '',
  hours: '10:00–23:00',
  average_check: '1 400 ₽',
  features: ['Можно с питомцами', 'Парковка рядом', 'Wi-Fi'],
  photos: ['/assets/real-dining-night.jpg'],
  source: 'mesto',
  status: 'published',
  created_at: '2026-07-01T10:00:00.000Z',
  updated_at: '2026-07-15T12:00:00.000Z'
};

const merchantDashboard = {
  user: merchant,
  venues: [merchantVenue],
  memberships: [{
    id: '40000000-0000-4000-8000-000000000001',
    user_id: merchant.id,
    venue_id: merchantVenue.id,
    membership_role: 'owner'
  }],
  menu: [{
    id: '50000000-0000-4000-8000-000000000001',
    venue_id: merchantVenue.id,
    title: 'Черноморская рыба',
    description: 'Сезонные овощи и соус из трав',
    section: 'Основное меню',
    price: 1240,
    photo_url: '/assets/card-restaurant.png',
    status: 'active',
    sort_order: 10
  }],
  promotions: [{
    id: '60000000-0000-4000-8000-000000000001',
    venue_id: merchantVenue.id,
    title: 'Сезонное меню',
    description: 'Летние блюда до конца августа.',
    starts_at: '2026-06-01T00:00:00.000Z',
    ends_at: '2027-09-01T00:00:00.000Z',
    status: 'active'
  }],
  reviews: [{
    id: '70000000-0000-4000-8000-000000000001',
    venue_id: merchantVenue.id,
    author_name: 'Ирина',
    rating: 5,
    body: 'Очень спокойное место и внимательный сервис.',
    status: 'approved',
    created_at: '2026-07-14T14:30:00.000Z'
  }],
  stats: { venues: 1, menuItems: 1, activePromotions: 1, reviews: 1 }
};

const adminDashboard = {
  stats: { venues: 1, pendingVenues: 1, pendingReviews: 1, merchants: 1, cities: 1 },
  venues: [merchantVenue],
  submissions: [{
    id: '80000000-0000-4000-8000-000000000001',
    title: 'Новый берег',
    city: 'Ялта',
    category: 'Кафе',
    cuisine: 'Европейская',
    description: 'Небольшое кафе рядом с набережной.',
    address: 'ул. Морская, 2',
    contact_name: 'Алексей',
    contact_email: 'alexey@example.test',
    status: 'pending',
    created_at: '2026-07-16T09:15:00.000Z'
  }],
  reviews: [{
    id: '90000000-0000-4000-8000-000000000001',
    venue_id: merchantVenue.id,
    venue_title: merchantVenue.title,
    author_name: 'Ирина',
    rating: 5,
    body: 'Очень спокойное место и внимательный сервис.',
    status: 'pending',
    created_at: '2026-07-16T10:00:00.000Z'
  }],
  databaseConfigured: true
};

const adminMerchants = [{
  id: merchant.id,
  user_id: merchant.id,
  display_name: merchant.name,
  username: merchant.username,
  email: merchant.email,
  status: 'active',
  created_at: '2026-07-01T08:00:00.000Z',
  last_login_at: '2026-07-16T08:30:00.000Z',
  memberships: [{ venue_id: merchantVenue.id, membership_role: 'owner', venue: merchantVenue }]
}];

function initialFixtureState() {
  return {
    adminDashboard: structuredClone(adminDashboard),
    adminMerchants: structuredClone(adminMerchants),
    favorites: [],
    merchantDashboard: structuredClone(merchantDashboard),
    publicVenueDetails: structuredClone(publicVenueDetails),
    requestCounters: {
      venueDetail: 0,
      venueDetailBySlug: {},
      venueList: 0
    },
    nextAdminMerchant: 2,
    nextAdminVenue: 2,
    nextMenuItem: 2,
    nextPromotion: 2,
    nextPublicReview: 2,
    nextPublicSubmission: 2,
    oauthSessions: 0,
    uploads: [],
    scenario: {
      adminDatabaseConfigured: true,
      adminEmpty: false,
      adminMerchantsDelayMs: 0,
      adminMerchantsError: false,
      catalogDelayMs: 0,
      catalogError: false,
      catalogPageSize: null,
      favoritesFailNext: false,
      merchantDelayMs: 0,
      merchantEmptyWorkspace: false,
      merchantMultiVenue: false,
      merchantMustChangePassword: false,
      merchantRole: 'owner',
      merchantSessionMode: 'active',
      venueDelayMs: 0,
      venueError: false
    }
  };
}

let fixtureState = initialFixtureState();

function resetFixtureState() {
  fixtureState = initialFixtureState();
  return fixtureState;
}

function applyFixturePatch(patch = {}) {
  for (const key of [
    'adminDatabaseConfigured',
    'adminEmpty',
    'adminMerchantsDelayMs',
    'adminMerchantsError',
    'catalogDelayMs',
    'catalogError',
    'catalogPageSize',
    'favoritesFailNext',
    'merchantDelayMs',
    'merchantEmptyWorkspace',
    'merchantMultiVenue',
    'merchantMustChangePassword',
    'merchantRole',
    'merchantSessionMode',
    'venueDelayMs',
    'venueError'
  ]) {
    if (Object.hasOwn(patch, key)) fixtureState.scenario[key] = patch[key];
  }
  if (Array.isArray(patch.favorites)) fixtureState.favorites = structuredClone(patch.favorites);
  if (Array.isArray(patch.publicVenueDetails)) fixtureState.publicVenueDetails = structuredClone(patch.publicVenueDetails);
  fixtureState.merchantDashboard.memberships.forEach((membership) => {
    membership.membership_role = fixtureState.scenario.merchantRole;
  });
  if (fixtureState.scenario.merchantEmptyWorkspace) {
    Object.assign(fixtureState.merchantDashboard, { venues: [], memberships: [], menu: [], promotions: [], reviews: [] });
  } else if (fixtureState.scenario.merchantMultiVenue && fixtureState.merchantDashboard.venues.length === 1) {
    const secondVenue = {
      ...structuredClone(merchantVenue),
      id: '30000000-0000-4000-8000-000000000002',
      title: 'Морской свет',
      slug: 'morskoy-svet',
      city: 'Ялта',
      address: 'наб. Ленина, 7',
      photos: ['/assets/venue-restaurant-unsplash.jpg']
    };
    fixtureState.merchantDashboard.venues.push(secondVenue);
    fixtureState.merchantDashboard.memberships.push({
      id: '40000000-0000-4000-8000-000000000002',
      user_id: merchant.id,
      venue_id: secondVenue.id,
      membership_role: fixtureState.scenario.merchantRole
    });
  }
  if (fixtureState.scenario.adminEmpty) {
    fixtureState.adminDashboard.venues = [];
    fixtureState.adminDashboard.submissions = [];
    fixtureState.adminDashboard.reviews = [];
    fixtureState.adminMerchants = [];
  }
  fixtureState.adminDashboard.databaseConfigured = fixtureState.scenario.adminDatabaseConfigured !== false;
  return fixtureState;
}

function fixtureSummary() {
  return {
    adminMerchants: fixtureState.adminMerchants.length,
    adminVenues: fixtureState.adminDashboard.venues.length,
    favorites: fixtureState.favorites.length,
    menu: fixtureState.merchantDashboard.menu.length,
    oauthSessions: fixtureState.oauthSessions,
    promotions: fixtureState.merchantDashboard.promotions.length,
    publicVenueDetails: structuredClone(fixtureState.publicVenueDetails),
    requestCounters: structuredClone(fixtureState.requestCounters),
    reviews: fixtureState.adminDashboard.reviews.length,
    submissions: fixtureState.adminDashboard.submissions.length,
    uploads: fixtureState.uploads.length,
    scenario: fixtureState.scenario
  };
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(milliseconds) || 0)));
}

function fixtureMerchantUser() {
  return { ...merchant, mustChangePassword: Boolean(fixtureState.scenario.merchantMustChangePassword) };
}

function json(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-E2E-Fixture': 'legacy-safety-net',
    ...headers
  });
  response.end(JSON.stringify(body));
}

function cookies(request) {
  return Object.fromEntries(String(request.headers.cookie || '').split(';').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const separator = entry.indexOf('=');
    return separator === -1 ? [entry, ''] : [entry.slice(0, separator), decodeURIComponent(entry.slice(separator + 1))];
  }));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error('Fixture request is too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function catalogPayload(url) {
  const city = url.searchParams.get('city') || 'all';
  const category = url.searchParams.get('category') || '';
  const query = String(url.searchParams.get('query') || '').trim().toLocaleLowerCase('ru-RU');
  const genericQueries = new Set(['', 'где поесть', 'все места', 'заведения']);
  const filteredItems = catalogItems.filter((item) => {
    const matchesCity = city === 'all' || item.city === city;
    const matchesCategory = !category || category === 'all' || item.category === category || item.categories.includes(category);
    const haystack = `${item.name} ${item.description} ${item.categories.join(' ')} ${item.city}`.toLocaleLowerCase('ru-RU');
    const matchesQuery = genericQueries.has(query) || haystack.includes(query);
    return matchesCity && matchesCategory && matchesQuery;
  });
  const requestedSkip = Math.max(0, Number.parseInt(url.searchParams.get('skip') || '0', 10) || 0);
  const requestedResults = Math.max(1, Number.parseInt(url.searchParams.get('results') || '50', 10) || 50);
  const pageSize = Math.max(1, Number(fixtureState.scenario.catalogPageSize || requestedResults));
  const items = filteredItems.slice(requestedSkip, requestedSkip + pageSize);
  const nextSkip = requestedSkip + items.length < filteredItems.length ? requestedSkip + items.length : null;
  return {
    source: 'Место',
    city,
    query: url.searchParams.get('query') || '',
    count: items.length,
    found: filteredItems.length,
    skip: requestedSkip,
    results: pageSize,
    nextSkip,
    persistentCount: items.length,
    databaseConfigured: true,
    items
  };
}

async function handleApi(request, response, url) {
  const path = url.pathname;
  const requestCookies = cookies(request);

  if (path === '/api/venues' && request.method === 'GET') {
    fixtureState.requestCounters.venueList += 1;
    await wait(fixtureState.scenario.catalogDelayMs);
    if (fixtureState.scenario.catalogError) return json(response, 503, { message: 'Каталог временно недоступен.' });
    return json(response, 200, catalogPayload(url));
  }
  const venueDetailMatch = path.match(/^\/api\/venues\/([^/]+)$/);
  if (venueDetailMatch && request.method === 'GET') {
    const slug = decodeURIComponent(venueDetailMatch[1]);
    fixtureState.requestCounters.venueDetail += 1;
    fixtureState.requestCounters.venueDetailBySlug[slug] = (fixtureState.requestCounters.venueDetailBySlug[slug] || 0) + 1;
    await wait(fixtureState.scenario.venueDelayMs);
    if (fixtureState.scenario.venueError) return json(response, 503, { message: 'Заведение временно недоступно.' });
    const venue = fixtureState.publicVenueDetails.find((item) => item.slug === slug && item.status === 'published');
    return venue
      ? json(response, 200, { venue: structuredClone(venue) })
      : json(response, 404, { code: 'VENUE_NOT_FOUND', message: 'Заведение не найдено.' });
  }
  if (path === '/api/venue-content' && request.method === 'GET') return json(response, 200, { menu: [], promotions: [] });
  if (path === '/api/auth/providers' && request.method === 'GET') return json(response, 200, { google: false, yandex: false, vk: false });
  if (path === '/api/auth/session' && request.method === 'GET') {
    if (requestCookies['e2e-session'] === 'merchant' && fixtureState.scenario.merchantSessionMode === 'expired') return json(response, 401, { authenticated: false });
    const user = requestCookies['e2e-session'] === 'merchant'
      ? fixtureState.scenario.merchantSessionMode === 'wrong-role' ? customer : fixtureMerchantUser()
      : requestCookies['e2e-session'] === 'customer' ? customer : null;
    return user ? json(response, 200, { authenticated: true, user, favorites: structuredClone(fixtureState.favorites) }) : json(response, 401, { authenticated: false });
  }
  if (path === '/api/auth/login' && request.method === 'POST') {
    const body = await readJson(request);
    const isMerchant = String(body.login || '').toLowerCase().includes('merchant');
    const user = isMerchant ? merchant : customer;
    return json(response, 200, { authenticated: true, user }, {
      'Set-Cookie': `e2e-session=${isMerchant ? 'merchant' : 'customer'}; Path=/; HttpOnly; SameSite=Lax`
    });
  }
  if (path === '/api/auth/register' && request.method === 'POST') {
    const body = await readJson(request);
    const user = { ...customer, name: String(body.name || customer.name), username: String(body.username || customer.username), email: String(body.email || customer.email) };
    return json(response, 201, { authenticated: true, user }, {
      'Set-Cookie': 'e2e-session=customer; Path=/; HttpOnly; SameSite=Lax'
    });
  }
  if (path === '/api/auth/oauth-session' && request.method === 'POST') {
    const body = await readJson(request);
    if (body.accessToken !== 'fixture-oauth-token') return json(response, 401, { message: 'OAuth fixture token is invalid.' });
    fixtureState.oauthSessions += 1;
    return json(response, 200, { authenticated: true, user: customer }, {
      'Set-Cookie': 'e2e-session=customer; Path=/; HttpOnly; SameSite=Lax'
    });
  }
  if (path === '/api/auth/logout' && request.method === 'POST') {
    return json(response, 200, { authenticated: false }, { 'Set-Cookie': 'e2e-session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax' });
  }
  if (path === '/api/favorites') {
    if (!requestCookies['e2e-session']) return json(response, 401, { message: 'Войдите или зарегистрируйтесь, чтобы продолжить.' });
    if (request.method === 'GET') return json(response, 200, { favorites: structuredClone(fixtureState.favorites) });
    const body = await readJson(request);
    if (fixtureState.scenario.favoritesFailNext) {
      fixtureState.scenario.favoritesFailNext = false;
      return json(response, 503, { message: 'Избранное временно недоступно.' });
    }
    const existingIndex = fixtureState.favorites.findIndex((favorite) => favorite.venue_key === body.venueKey);
    if (request.method === 'DELETE') {
      if (existingIndex !== -1) fixtureState.favorites.splice(existingIndex, 1);
      return json(response, 200, { ok: true });
    }
    if (request.method === 'POST') {
      const favorite = {
        id: `favorite-${body.venueKey}`,
        venue_key: body.venueKey,
        venue_id: body.venueId || null,
        external_venue_id: body.externalVenueId || null,
        snapshot: body.snapshot || {}
      };
      if (existingIndex === -1) fixtureState.favorites.push(favorite);
      else fixtureState.favorites[existingIndex] = favorite;
      return json(response, 201, { favorite });
    }
  }
  if (path === '/api/uploads' && request.method === 'POST') {
    if (!requestCookies['e2e-session']) return json(response, 401, { message: 'Authentication required.' });
    const body = await readJson(request);
    if (!body.name || !body.type || !String(body.data || '').startsWith('data:')) return json(response, 400, { message: 'Invalid fixture upload.' });
    const upload = {
      name: String(body.name),
      type: String(body.type),
      url: `/uploads/e2e-${fixtureState.uploads.length + 1}.png`
    };
    fixtureState.uploads.push(upload);
    return json(response, 201, { url: upload.url });
  }
  if (path === '/api/reviews' && request.method === 'POST') {
    if (!requestCookies['e2e-session']) return json(response, 401, { message: 'Authentication required.' });
    const body = await readJson(request);
    const review = {
      id: `90000000-0000-4000-8000-${String(fixtureState.nextPublicReview++).padStart(12, '0')}`,
      venue_id: body.venueId || null,
      external_venue_id: body.externalVenueId || null,
      venue_title: body.venueTitle || '',
      author_name: body.authorName || '',
      rating: Number(body.rating || 0),
      body: body.review || '',
      status: 'pending',
      created_at: '2026-08-05T09:00:00.000Z'
    };
    fixtureState.adminDashboard.reviews.push(review);
    return json(response, 201, { review: structuredClone(review) });
  }
  if (path === '/api/submissions' && request.method === 'POST') {
    if (!requestCookies['e2e-session']) return json(response, 401, { message: 'Authentication required.' });
    const body = await readJson(request);
    const submission = {
      id: `80000000-0000-4000-8000-${String(fixtureState.nextPublicSubmission++).padStart(12, '0')}`,
      title: body.title || '',
      city: body.city || '',
      category: body.category || '',
      cuisine: body.cuisine || '',
      description: body.description || '',
      address: body.address || '',
      contact_name: body.contactName || '',
      contact_email: body.contactEmail || '',
      photos: Array.isArray(body.photos) ? body.photos : [],
      status: 'pending',
      created_at: '2026-08-05T09:00:00.000Z'
    };
    fixtureState.adminDashboard.submissions.push(submission);
    return json(response, 201, { submission: structuredClone(submission) });
  }
  if (path === '/api/merchant/dashboard' && request.method === 'GET') {
    await wait(fixtureState.scenario.merchantDelayMs);
    const dashboard = structuredClone(fixtureState.merchantDashboard);
    dashboard.user = fixtureMerchantUser();
    return requestCookies['e2e-session'] === 'merchant'
      ? json(response, 200, dashboard)
      : json(response, 401, { message: 'Войдите в кабинет ресторатора.' });
  }
  if (path === '/api/merchant/venue' && request.method === 'PATCH') {
    const body = await readJson(request);
    const venue = fixtureState.merchantDashboard.venues.find((item) => item.id === body.id);
    if (!venue) return json(response, 404, { message: 'Заведение не найдено.' });
    Object.assign(venue, {
      title: body.title ?? venue.title,
      cuisine: body.cuisine ?? venue.cuisine,
      description: body.description ?? venue.description,
      address: body.address ?? venue.address,
      phone: body.phone ?? venue.phone,
      website: body.website ?? venue.website,
      hours: body.hours ?? venue.hours,
      average_check: body.averageCheck ?? venue.average_check,
      features: Array.isArray(body.features) ? body.features : venue.features,
      updated_at: '2026-08-05T09:00:00.000Z'
    });
    return json(response, 200, { venue: structuredClone(venue) });
  }
  if (path === '/api/merchant/menu' && ['POST', 'PATCH', 'DELETE'].includes(request.method)) {
    const body = await readJson(request);
    const items = fixtureState.merchantDashboard.menu;
    const index = items.findIndex((item) => item.id === body.id);
    if (request.method === 'DELETE') {
      if (index !== -1) items.splice(index, 1);
      return json(response, 200, { ok: true });
    }
    const item = {
      id: body.id || `50000000-0000-4000-8000-${String(fixtureState.nextMenuItem++).padStart(12, '0')}`,
      venue_id: body.venueId || merchantVenue.id,
      section: body.section || 'Основное меню',
      title: body.title || '',
      description: body.description || '',
      price: Number(body.price || 0),
      photo_url: body.photoUrl || '',
      is_available: body.isAvailable !== false,
      sort_order: Number(body.sortOrder || 0),
      status: 'active'
    };
    if (index === -1) items.push(item); else items[index] = { ...items[index], ...item };
    return json(response, request.method === 'POST' ? 201 : 200, { item: structuredClone(item) });
  }
  if (path === '/api/merchant/promotions' && ['POST', 'PATCH', 'DELETE'].includes(request.method)) {
    const body = await readJson(request);
    const items = fixtureState.merchantDashboard.promotions;
    const index = items.findIndex((item) => item.id === body.id);
    if (request.method === 'DELETE') {
      if (index !== -1) items.splice(index, 1);
      return json(response, 200, { ok: true });
    }
    const item = {
      id: body.id || `60000000-0000-4000-8000-${String(fixtureState.nextPromotion++).padStart(12, '0')}`,
      venue_id: body.venueId || merchantVenue.id,
      title: body.title || '',
      description: body.description || '',
      starts_at: body.startsAt || null,
      ends_at: body.endsAt || null,
      status: body.status || 'draft'
    };
    if (index === -1) items.push(item); else items[index] = { ...items[index], ...item };
    return json(response, request.method === 'POST' ? 201 : 200, { item: structuredClone(item) });
  }
  if (path === '/api/auth/password' && request.method === 'POST') return json(response, 200, { ok: true, user: merchant });
  if (path === '/api/admin/session' && request.method === 'GET') {
    return requestCookies['e2e-admin'] === 'active'
      ? json(response, 200, { authenticated: true, user: { login: 'editor', role: 'admin' } })
      : json(response, 401, { authenticated: false });
  }
  if (path === '/api/admin/login' && request.method === 'POST') {
    await readJson(request);
    return json(response, 200, { authenticated: true, user: { login: 'editor', role: 'admin' } }, {
      'Set-Cookie': 'e2e-admin=active; Path=/; HttpOnly; SameSite=Lax'
    });
  }
  if (path === '/api/admin/logout' && request.method === 'POST') {
    return json(response, 200, { authenticated: false }, { 'Set-Cookie': 'e2e-admin=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax' });
  }
  if (path === '/api/admin/dashboard' && request.method === 'GET') {
    if (requestCookies['e2e-admin'] !== 'active') return json(response, 401, { message: 'Требуется вход администратора.' });
    fixtureState.adminDashboard.stats = {
      ...fixtureState.adminDashboard.stats,
      venues: fixtureState.adminDashboard.venues.length,
      pendingVenues: fixtureState.adminDashboard.submissions.filter((item) => item.status === 'pending').length,
      pendingReviews: fixtureState.adminDashboard.reviews.filter((item) => item.status === 'pending').length,
      merchants: fixtureState.adminMerchants.length,
      cities: new Set(fixtureState.adminDashboard.venues.map((venue) => venue.city)).size
    };
    fixtureState.adminDashboard.databaseConfigured = fixtureState.scenario.adminDatabaseConfigured !== false;
    return json(response, 200, structuredClone(fixtureState.adminDashboard));
  }
  if (path === '/api/admin/merchants' && request.method === 'GET') {
    await wait(fixtureState.scenario.adminMerchantsDelayMs);
    if (fixtureState.scenario.adminMerchantsError) return json(response, 503, { message: 'Рестораторы временно недоступны.' });
    return requestCookies['e2e-admin'] === 'active' ? json(response, 200, { merchants: structuredClone(fixtureState.adminMerchants) }) : json(response, 401, { message: 'Требуется вход администратора.' });
  }
  if (path === '/api/admin/submissions' && request.method === 'PATCH') {
    const body = await readJson(request);
    const item = fixtureState.adminDashboard.submissions.find((submission) => submission.id === body.id);
    if (!item) return json(response, 404, { message: 'Заявка не найдена.' });
    item.status = body.decision;
    item.moderation_note = body.note || '';
    return json(response, 200, { item: structuredClone(item) });
  }
  if (path === '/api/admin/reviews' && request.method === 'PATCH') {
    const body = await readJson(request);
    const item = fixtureState.adminDashboard.reviews.find((review) => review.id === body.id);
    if (!item) return json(response, 404, { message: 'Отзыв не найден.' });
    item.status = body.decision;
    item.moderation_note = body.note || '';
    return json(response, 200, { item: structuredClone(item) });
  }
  if (path === '/api/admin/venues' && ['POST', 'PATCH', 'DELETE'].includes(request.method)) {
    const body = await readJson(request);
    const items = fixtureState.adminDashboard.venues;
    const index = items.findIndex((venue) => venue.id === body.id);
    if (request.method === 'DELETE') {
      if (index !== -1) items.splice(index, 1);
      return json(response, 200, { ok: true });
    }
    const venue = {
      ...(index === -1 ? {} : items[index]),
      ...body,
      id: body.id || `30000000-0000-4000-8000-${String(fixtureState.nextAdminVenue++).padStart(12, '0')}`,
      average_check: body.averageCheck || body.average_check || '',
      created_at: index === -1 ? '2026-08-05T09:00:00.000Z' : items[index].created_at,
      updated_at: '2026-08-05T09:00:00.000Z'
    };
    delete venue.averageCheck;
    if (index === -1) items.push(venue); else items[index] = venue;
    return json(response, request.method === 'POST' ? 201 : 200, { venue: structuredClone(venue) });
  }
  if (path === '/api/admin/merchants' && ['POST', 'PATCH'].includes(request.method)) {
    const body = await readJson(request);
    if (request.method === 'POST') {
      const created = {
        id: `20000000-0000-4000-8000-${String(fixtureState.nextAdminMerchant++).padStart(12, '0')}`,
        user_id: `20000000-0000-4000-8000-${String(fixtureState.nextAdminMerchant).padStart(12, '0')}`,
        display_name: body.displayName,
        username: body.username,
        email: body.email || `${body.username}@accounts.mesto.guide`,
        status: 'active',
        created_at: '2026-08-05T09:00:00.000Z',
        last_login_at: null,
        memberships: (body.venueIds || []).map((venueId) => ({
          venue_id: venueId,
          membership_role: body.membershipRole || 'owner',
          venue: fixtureState.adminDashboard.venues.find((venue) => venue.id === venueId)
        })).filter((membership) => membership.venue)
      };
      fixtureState.adminMerchants.push(created);
      return json(response, 201, {
        merchant: structuredClone(created),
        credentials: { login: body.username, password: body.password || 'FixturePass123' },
        message: 'Ресторатор создан.'
      });
    }
    const existing = fixtureState.adminMerchants.find((item) => (item.id || item.user_id) === body.userId);
    if (!existing) return json(response, 404, { message: 'Аккаунт ресторатора не найден.' });
    if (body.action === 'reset-password') return json(response, 200, { credentials: { password: 'ResetPass123' }, message: 'Временный пароль создан.' });
    if (body.status) existing.status = body.status;
    if (body.displayName) existing.display_name = body.displayName;
    if (Array.isArray(body.venueIds)) existing.memberships = body.venueIds.map((venueId) => ({
      venue_id: venueId,
      membership_role: body.membershipRole || 'owner',
      venue: fixtureState.adminDashboard.venues.find((venue) => venue.id === venueId)
    })).filter((membership) => membership.venue);
    return json(response, 200, { ok: true });
  }

  return json(response, 404, { message: `Fixture route not found: ${request.method} ${path}` });
}

function fontPath(pathname) {
  const match = pathname.match(/^\/__e2e-fonts\/(manrope|cormorant-garamond)-(\d+)-normal\.woff2$/);
  if (!match) return null;
  const [, family, weight] = match;
  return resolve(root, 'node_modules', '@fontsource', family, 'files', `${family}-cyrillic-${weight}-normal.woff2`);
}

async function sendFile(response, path, headOnly = false) {
  try {
    const details = await stat(path);
    if (!details.isFile()) throw new Error('Not a file');
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Length': details.size,
      'Content-Type': contentTypes[extname(path).toLowerCase()] || 'application/octet-stream'
    });
    if (headOnly) return response.end();
    createReadStream(path).pipe(response);
  } catch {
    json(response, 404, { message: 'Static fixture file not found.' });
  }
}

const routeFiles = new Map([
  ['/', 'index.html'],
  ['/catalog', 'index.html'],
  ['/help', 'help.html'],
  ['/merchant', 'merchant.html'],
  ['/admin', 'admin.html']
]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${host}:${port}`);
    if (url.pathname === '/__health') return json(response, 200, { ok: true });
    if (url.pathname === '/__e2e/reset' && request.method === 'POST') {
      resetFixtureState();
      return json(response, 200, fixtureSummary());
    }
    if (url.pathname === '/__e2e/state' && request.method === 'POST') {
      applyFixturePatch(await readJson(request));
      return json(response, 200, fixtureSummary());
    }
    if (url.pathname === '/__e2e/state' && request.method === 'GET') return json(response, 200, fixtureSummary());
    if (url.pathname.startsWith('/api/')) return await handleApi(request, response, url);

    const bundledFont = fontPath(url.pathname);
    if (bundledFont) return await sendFile(response, bundledFont, request.method === 'HEAD');

    if (!['GET', 'HEAD'].includes(request.method || '')) return json(response, 405, { message: 'Method not allowed.' });
    const mapped = routeFiles.get(url.pathname);
    const relative = mapped || decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const candidate = resolve(root, relative || 'index.html');
    if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return json(response, 403, { message: 'Static path is outside the fixture root.' });
    return await sendFile(response, candidate, request.method === 'HEAD');
  } catch (error) {
    json(response, 500, { message: error.message || 'Fixture server error.' });
  }
});

server.listen(port, host, () => {
  process.stdout.write(`Legacy fixture server listening at http://${host}:${port}\n`);
});

function close() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', close);
process.on('SIGTERM', close);
