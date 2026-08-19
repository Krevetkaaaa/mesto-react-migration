import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isStrongPassword,
  NEW_PASSWORD_ERROR_MESSAGE,
  PASSWORD_ERROR_MESSAGE,
  TEMPORARY_PASSWORD_ERROR_MESSAGE
} from '../../password-policy.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const port = Number(process.env.PORT || 4173);
const host = '127.0.0.1';

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
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

const fixtureAccounts = [
  {
    aliases: [customer.email, customer.username],
    password: 'fixture-password',
    session: 'customer',
    user: customer
  },
  {
    aliases: [merchant.email, merchant.username],
    password: 'fixture-password',
    session: 'merchant',
    user: merchant
  }
];

const catalogItems = [
  {
    id: 'mesto-30000000-0000-4000-8000-000000000001',
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
    id: 'mesto-30000000-0000-4000-8000-000000000002',
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
    id: 'mesto-30000000-0000-4000-8000-000000000003',
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
    adminRequestCounters: {
      dashboard: 0,
      login: 0,
      logout: 0,
      merchantCreate: 0,
      merchantList: 0,
      merchantPasswordReset: 0,
      merchantStatus: 0,
      merchantUpdate: 0,
      reviewModeration: 0,
      session: 0,
      submissionModeration: 0,
      venueCreate: 0,
      venueDelete: 0,
      venueUpdate: 0
    },
    customerUser: structuredClone(customer),
    favorites: [],
    authRequestCounters: {
      login: 0,
      logout: 0,
      oauthSession: 0,
      password: 0,
      providers: 0,
      register: 0,
      session: 0
    },
    favoritesRequestCounters: {
      list: 0,
      remove: 0,
      save: 0
    },
    merchantRequestCounters: {
      dashboard: 0,
      menuCreate: 0,
      menuDelete: 0,
      menuUpdate: 0,
      promotionCreate: 0,
      promotionDelete: 0,
      promotionUpdate: 0,
      venueUpdate: 0
    },
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
      adminDashboardDelayMs: 0,
      adminDashboardError: false,
      adminDashboardFailNext: false,
      adminEmpty: false,
      adminMerchantsDelayMs: 0,
      adminMerchantsError: false,
      adminMerchantsFailNext: false,
      adminMutationDelayMs: 0,
      adminMutationError: false,
      adminMutationFailNext: false,
      adminSessionMode: 'active',
      authDelayMs: 0,
      authError: false,
      catalogDelayMs: 0,
      catalogError: false,
      catalogPageSize: null,
      customerSessionMode: 'active',
      favoritesDelayMs: 0,
      favoritesError: false,
      favoritesFailNext: false,
      merchantDelayMs: 0,
      merchantDashboardError: false,
      merchantDashboardFailNext: false,
      merchantEmptyWorkspace: false,
      merchantMultiVenue: false,
      merchantMustChangePassword: false,
      merchantMutationDelayMs: 0,
      merchantMutationError: false,
      merchantMutationFailNext: false,
      merchantRole: 'owner',
      merchantSessionMode: 'active',
      oauthMode: 'success',
      oauthProviders: {
        google: false,
        yandex: false,
        vk: false
      },
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
    'adminDashboardDelayMs',
    'adminDashboardError',
    'adminDashboardFailNext',
    'adminEmpty',
    'adminMerchantsDelayMs',
    'adminMerchantsError',
    'adminMerchantsFailNext',
    'adminMutationDelayMs',
    'adminMutationError',
    'adminMutationFailNext',
    'adminSessionMode',
    'authDelayMs',
    'authError',
    'catalogDelayMs',
    'catalogError',
    'catalogPageSize',
    'customerSessionMode',
    'favoritesDelayMs',
    'favoritesError',
    'favoritesFailNext',
    'merchantDelayMs',
    'merchantDashboardError',
    'merchantDashboardFailNext',
    'merchantEmptyWorkspace',
    'merchantMultiVenue',
    'merchantMustChangePassword',
    'merchantMutationDelayMs',
    'merchantMutationError',
    'merchantMutationFailNext',
    'merchantRole',
    'merchantSessionMode',
    'oauthMode',
    'venueDelayMs',
    'venueError'
  ]) {
    if (Object.hasOwn(patch, key)) fixtureState.scenario[key] = patch[key];
  }
  if (patch.oauthProviders && typeof patch.oauthProviders === 'object') {
    for (const provider of ['google', 'yandex', 'vk']) {
      if (Object.hasOwn(patch.oauthProviders, provider)) {
        fixtureState.scenario.oauthProviders[provider] = Boolean(patch.oauthProviders[provider]);
      }
    }
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
    adminDashboard: structuredClone(fixtureState.adminDashboard),
    adminMerchantItems: structuredClone(fixtureState.adminMerchants),
    adminMerchants: fixtureState.adminMerchants.length,
    adminRequestCounters: structuredClone(fixtureState.adminRequestCounters),
    adminVenues: fixtureState.adminDashboard.venues.length,
    authRequestCounters: structuredClone(fixtureState.authRequestCounters),
    favorites: fixtureState.favorites.length,
    favoritesRequestCounters: structuredClone(fixtureState.favoritesRequestCounters),
    menu: fixtureState.merchantDashboard.menu.length,
    merchantPromotions: structuredClone(fixtureState.merchantDashboard.promotions),
    merchantRequestCounters: structuredClone(fixtureState.merchantRequestCounters),
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

function fixtureAccount(login, password) {
  const normalizedLogin = String(login || '').trim().toLowerCase();
  return fixtureAccounts.find((account) => (
    account.password === String(password || '')
    && account.aliases.some((alias) => alias.toLowerCase() === normalizedLogin)
  ));
}

function fixtureUserSession(requestCookies) {
  const session = requestCookies['e2e-session'];
  if (session === 'customer') {
    const mode = fixtureState.scenario.customerSessionMode;
    if (mode === 'active') return { user: fixtureState.customerUser };
    if (mode === 'expired') return { code: 'SESSION_EXPIRED' };
    if (mode === 'revoked') return { code: 'SESSION_REVOKED' };
    return {};
  }
  if (session === 'merchant') {
    if (fixtureState.scenario.merchantSessionMode === 'expired') return { code: 'SESSION_EXPIRED' };
    return {
      user: fixtureState.scenario.merchantSessionMode === 'wrong-role'
        ? customer
        : fixtureMerchantUser()
    };
  }
  return {};
}

const fixtureMerchantPermissions = Object.freeze({
  owner: Object.freeze(['venue', 'menu', 'promotions', 'reviews', 'analytics']),
  manager: Object.freeze(['venue', 'menu', 'promotions', 'reviews', 'analytics']),
  content_editor: Object.freeze(['venue', 'menu', 'promotions']),
  analyst: Object.freeze(['reviews', 'analytics'])
});

function authorizeFixtureMerchant(response, requestCookies) {
  const session = fixtureUserSession(requestCookies);
  if (!session.user) {
    json(response, 401, {
      message: 'Войдите в кабинет ресторатора.',
      ...(session.code ? { code: session.code } : {})
    });
    return null;
  }
  if (session.user.role !== 'merchant' || session.user.status !== 'active') {
    json(response, 403, { message: 'Этот аккаунт не имеет доступа к кабинету ресторатора.' });
    return null;
  }
  return session.user;
}

function fixtureMembershipAllows(venueId, permission) {
  const membership = fixtureState.merchantDashboard.memberships.find((item) => item.venue_id === venueId);
  return Boolean(membership && fixtureMerchantPermissions[membership.membership_role]?.includes(permission));
}

function authorizeFixtureMerchantVenue(response, venueId, permission) {
  if (fixtureMembershipAllows(venueId, permission)) return true;
  json(response, 403, { message: 'Недостаточно прав для этого действия.' });
  return false;
}

function fixtureMerchantDashboardPayload() {
  const dashboard = structuredClone(fixtureState.merchantDashboard);
  dashboard.user = fixtureMerchantUser();
  dashboard.menu = dashboard.menu.filter((item) => fixtureMembershipAllows(item.venue_id, 'menu'));
  dashboard.promotions = dashboard.promotions.filter((item) => fixtureMembershipAllows(item.venue_id, 'promotions'));
  dashboard.reviews = dashboard.reviews.filter((item) => fixtureMembershipAllows(item.venue_id, 'reviews'));
  dashboard.stats = {
    venues: dashboard.venues.length,
    menuItems: dashboard.menu.length,
    activePromotions: dashboard.promotions.filter((item) => item.status === 'active').length,
    reviews: dashboard.reviews.length
  };
  return dashboard;
}

async function fixtureMerchantMutationFailure(response) {
  await wait(fixtureState.scenario.merchantMutationDelayMs);
  const fail = fixtureState.scenario.merchantMutationError || fixtureState.scenario.merchantMutationFailNext;
  fixtureState.scenario.merchantMutationFailNext = false;
  if (!fail) return false;
  json(response, 503, { message: 'Изменения кабинета временно недоступны.' });
  return true;
}

const authCounterByPath = new Map([
  ['/api/auth/login', 'login'],
  ['/api/auth/logout', 'logout'],
  ['/api/auth/oauth-session', 'oauthSession'],
  ['/api/auth/password', 'password'],
  ['/api/auth/providers', 'providers'],
  ['/api/auth/register', 'register'],
  ['/api/auth/session', 'session']
]);

function json(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-E2E-Fixture': 'legacy-safety-net',
    ...headers
  });
  response.end(JSON.stringify(body));
}

function redirect(response, location, headers = {}) {
  response.writeHead(302, {
    'Cache-Control': 'no-store',
    Location: location,
    'X-E2E-Fixture': 'legacy-safety-net',
    ...headers
  });
  response.end();
}

function safeOAuthReturnTo(value, origin, fallback = '/profile') {
  const candidate = String(value || '').trim() || fallback;
  const unsafe = (text) => text.startsWith('//')
    || text.includes('\\')
    || [...text].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    });
  if (!candidate.startsWith('/') || unsafe(candidate)) return fallback;
  try {
    const decoded = decodeURIComponent(candidate);
    if (!decoded.startsWith('/') || unsafe(decoded)) return fallback;
    const parsed = new URL(candidate, origin);
    if (parsed.origin !== origin) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || fallback;
  } catch {
    return fallback;
  }
}

function cookies(request) {
  return Object.fromEntries(String(request.headers.cookie || '').split(';').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const separator = entry.indexOf('=');
    return separator === -1 ? [entry, ''] : [entry.slice(0, separator), decodeURIComponent(entry.slice(separator + 1))];
  }));
}

function adminResponse(response, statusCode, body, headers = {}) {
  return json(response, statusCode, body, {
    'Cache-Control': 'private, no-store, max-age=0',
    Vary: 'Cookie',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex',
    ...headers
  });
}

function hasAdminSession(requestCookies) {
  return requestCookies['e2e-admin'] === 'active'
    && fixtureState.scenario.adminSessionMode === 'active';
}

function requireAdminFixture(response, requestCookies) {
  if (hasAdminSession(requestCookies)) return true;
  const expired = requestCookies['e2e-admin'] === 'active'
    && fixtureState.scenario.adminSessionMode === 'expired';
  adminResponse(response, 401, {
    message: 'Требуется вход администратора.',
    ...(expired ? { code: 'SESSION_EXPIRED' } : {})
  });
  return false;
}

function hasSameOrigin(request) {
  const expectedOrigin = `http://${request.headers.host}`;
  const origin = String(request.headers.origin || '');
  const fetchSite = String(request.headers['sec-fetch-site'] || '').toLowerCase();
  return origin === expectedOrigin || (!origin && fetchSite === 'same-origin');
}

function requireAdminMutation(response, request, requestCookies) {
  if (!requireAdminFixture(response, requestCookies)) return false;
  if (hasSameOrigin(request)) return true;
  adminResponse(response, 403, { message: 'Запрос отклонён проверкой источника.' });
  return false;
}

async function shouldFailAdminMutation() {
  await wait(fixtureState.scenario.adminMutationDelayMs);
  const fail = fixtureState.scenario.adminMutationError
    || fixtureState.scenario.adminMutationFailNext;
  fixtureState.scenario.adminMutationFailNext = false;
  return fail;
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

function publishedCatalogItems() {
  const publishedSlugs = new Set(
    fixtureState.publicVenueDetails
      .filter((venue) => venue.status === 'published')
      .map((venue) => venue.slug)
  );
  return catalogItems.filter((item) => publishedSlugs.has(item.slug));
}

function catalogSummaryPayload() {
  const items = publishedCatalogItems();
  const byCategory = {};
  const byCity = {};
  items.forEach((item) => {
    byCategory[item.category] = (byCategory[item.category] || 0) + 1;
    byCity[item.city] = (byCity[item.city] || 0) + 1;
  });
  return {
    total: items.length,
    byCategory,
    byCity,
    source: 'database',
    databaseConfigured: true
  };
}

function catalogPayload(url) {
  const city = url.searchParams.get('city') || 'all';
  const category = url.searchParams.get('category') || '';
  const query = String(url.searchParams.get('query') || '').trim().toLocaleLowerCase('ru-RU');
  const genericQueries = new Set(['', 'где поесть', 'все места', 'заведения']);
  const filteredItems = publishedCatalogItems().filter((item) => {
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
  const authCounter = authCounterByPath.get(path);

  if (authCounter) {
    fixtureState.authRequestCounters[authCounter] += 1;
    await wait(fixtureState.scenario.authDelayMs);
    if (fixtureState.scenario.authError) {
      return json(response, 503, { message: 'Авторизация временно недоступна.' });
    }
  }

  if (path === '/api/venue-sitemap' && request.method === 'GET') {
    await wait(fixtureState.scenario.catalogDelayMs);
    if (fixtureState.scenario.catalogError) return json(response, 503, { message: 'Sitemap fixture is temporarily unavailable.' });
    const slugs = fixtureState.publicVenueDetails
      .filter((venue) => venue.status === 'published')
      .map((venue) => venue.slug)
      .sort((left, right) => left.localeCompare(right, 'ru'));
    return json(response, 200, {
      databaseConfigured: true,
      complete: true,
      slugs
    });
  }
  if (path === '/api/venues' && request.method === 'GET') {
    fixtureState.requestCounters.venueList += 1;
    await wait(fixtureState.scenario.catalogDelayMs);
    if (fixtureState.scenario.catalogError) return json(response, 503, { message: 'Каталог временно недоступен.' });
    return json(response, 200, url.searchParams.get('summary') === '1'
      ? catalogSummaryPayload()
      : catalogPayload(url));
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
  if (path === '/api/auth/oauth' && request.method === 'GET') {
    const provider = String(url.searchParams.get('provider') || '').trim().toLowerCase();
    if (!['google', 'yandex', 'vk'].includes(provider) || !fixtureState.scenario.oauthProviders[provider]) {
      return json(response, 503, {
        code: 'OAUTH_PROVIDER_NOT_CONFIGURED',
        message: 'This OAuth fixture provider is not enabled.'
      });
    }
    const returnTo = safeOAuthReturnTo(url.searchParams.get('returnTo'), url.origin);
    const mode = fixtureState.scenario.oauthMode;
    if (mode !== 'success') {
      const oauthError = mode === 'expired' ? 'OAUTH_EXPIRED' : 'OAUTH_DENIED';
      const target = new URL('/login', url.origin);
      target.searchParams.set('oauthError', oauthError);
      target.searchParams.set('provider', provider);
      return redirect(response, `${target.pathname}${target.search}`);
    }
    if (provider === 'google') {
      const target = new URL('/login', url.origin);
      target.searchParams.set('returnTo', returnTo);
      target.hash = 'access_token=fixture-oauth-token';
      return redirect(response, `${target.pathname}${target.search}${target.hash}`);
    }
    fixtureState.customerUser = structuredClone(customer);
    fixtureState.scenario.customerSessionMode = 'active';
    return redirect(response, returnTo, {
      'Set-Cookie': 'e2e-session=customer; Path=/; HttpOnly; SameSite=Lax'
    });
  }
  if (path === '/api/auth/providers' && request.method === 'GET') return json(response, 200, {
    email: true,
    ...structuredClone(fixtureState.scenario.oauthProviders)
  });
  if (path === '/api/auth/session' && request.method === 'GET') {
    const session = fixtureUserSession(requestCookies);
    return session.user
      ? json(response, 200, { authenticated: true, user: session.user, favorites: structuredClone(fixtureState.favorites) })
      : json(response, 200, { authenticated: false, ...(session.code ? { code: session.code } : {}) });
  }
  if (path === '/api/auth/login' && request.method === 'POST') {
    const body = await readJson(request);
    const account = fixtureAccount(body.login, body.password);
    if (!account) return json(response, 401, { code: 'INVALID_CREDENTIALS', message: 'Неверный логин или пароль.' });
    if (account.session === 'customer') {
      fixtureState.customerUser = structuredClone(account.user);
      fixtureState.scenario.customerSessionMode = 'active';
    }
    const user = account.session === 'customer' ? fixtureState.customerUser : account.user;
    return json(response, 200, { authenticated: true, user }, {
      'Set-Cookie': `e2e-session=${account.session}; Path=/; HttpOnly; SameSite=Lax`
    });
  }
  if (path === '/api/auth/register' && request.method === 'POST') {
    const body = await readJson(request);
    if (!isStrongPassword(body.password)) return json(response, 400, { message: PASSWORD_ERROR_MESSAGE });
    const user = { ...customer, name: String(body.name || customer.name), username: String(body.username || customer.username), email: String(body.email || customer.email) };
    fixtureState.customerUser = structuredClone(user);
    fixtureState.scenario.customerSessionMode = 'active';
    return json(response, 201, { authenticated: true, user: fixtureState.customerUser }, {
      'Set-Cookie': 'e2e-session=customer; Path=/; HttpOnly; SameSite=Lax'
    });
  }
  if (path === '/api/auth/oauth-session' && request.method === 'POST') {
    const body = await readJson(request);
    if (body.accessToken !== 'fixture-oauth-token') return json(response, 401, { message: 'OAuth fixture token is invalid.' });
    fixtureState.oauthSessions += 1;
    fixtureState.customerUser = structuredClone(customer);
    fixtureState.scenario.customerSessionMode = 'active';
    return json(response, 200, { authenticated: true, user: fixtureState.customerUser }, {
      'Set-Cookie': 'e2e-session=customer; Path=/; HttpOnly; SameSite=Lax'
    });
  }
  if (path === '/api/auth/logout' && request.method === 'POST') {
    return json(response, 200, { ok: true }, { 'Set-Cookie': 'e2e-session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax' });
  }
  if (path === '/api/favorites') {
    const counter = request.method === 'GET' ? 'list' : request.method === 'POST' ? 'save' : request.method === 'DELETE' ? 'remove' : null;
    if (counter) fixtureState.favoritesRequestCounters[counter] += 1;
    const session = fixtureUserSession(requestCookies);
    if (!session.user) return json(response, 401, {
      message: 'Войдите или зарегистрируйтесь, чтобы продолжить.',
      ...(session.code ? { code: session.code } : {})
    });
    await wait(fixtureState.scenario.favoritesDelayMs);
    if (fixtureState.scenario.favoritesError) return json(response, 503, { message: 'Избранное временно недоступно.' });
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
    fixtureState.merchantRequestCounters.dashboard += 1;
    if (!authorizeFixtureMerchant(response, requestCookies)) return;
    await wait(fixtureState.scenario.merchantDelayMs);
    const fail = fixtureState.scenario.merchantDashboardError || fixtureState.scenario.merchantDashboardFailNext;
    fixtureState.scenario.merchantDashboardFailNext = false;
    if (fail) return json(response, 503, { message: 'Кабинет ресторатора временно недоступен.' });
    return json(response, 200, fixtureMerchantDashboardPayload());
  }
  if (path === '/api/merchant/venue' && request.method === 'PATCH') {
    fixtureState.merchantRequestCounters.venueUpdate += 1;
    if (!authorizeFixtureMerchant(response, requestCookies)) return;
    const body = await readJson(request);
    const venue = fixtureState.merchantDashboard.venues.find((item) => item.id === body.id);
    if (!venue) return json(response, 404, { message: 'Заведение не найдено.' });
    if (!authorizeFixtureMerchantVenue(response, venue.id, 'venue')) return;
    if (await fixtureMerchantMutationFailure(response)) return;
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
    const counter = request.method === 'POST' ? 'menuCreate' : request.method === 'PATCH' ? 'menuUpdate' : 'menuDelete';
    fixtureState.merchantRequestCounters[counter] += 1;
    if (!authorizeFixtureMerchant(response, requestCookies)) return;
    const body = await readJson(request);
    const items = fixtureState.merchantDashboard.menu;
    const index = items.findIndex((item) => item.id === body.id);
    if (request.method !== 'POST' && index === -1) return json(response, 404, { message: 'Позиция меню не найдена.' });
    const venueId = request.method === 'POST' ? body.venueId : items[index]?.venue_id;
    if (!authorizeFixtureMerchantVenue(response, venueId, 'menu')) return;
    if (await fixtureMerchantMutationFailure(response)) return;
    if (request.method === 'DELETE') {
      items.splice(index, 1);
      return json(response, 200, { ok: true });
    }
    const item = {
      id: body.id || `50000000-0000-4000-8000-${String(fixtureState.nextMenuItem++).padStart(12, '0')}`,
      venue_id: venueId,
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
    const counter = request.method === 'POST' ? 'promotionCreate' : request.method === 'PATCH' ? 'promotionUpdate' : 'promotionDelete';
    fixtureState.merchantRequestCounters[counter] += 1;
    if (!authorizeFixtureMerchant(response, requestCookies)) return;
    const body = await readJson(request);
    const items = fixtureState.merchantDashboard.promotions;
    const index = items.findIndex((item) => item.id === body.id);
    if (request.method !== 'POST' && index === -1) return json(response, 404, { message: 'Акция не найдена.' });
    const venueId = request.method === 'POST' ? body.venueId : items[index]?.venue_id;
    if (!authorizeFixtureMerchantVenue(response, venueId, 'promotions')) return;
    if (await fixtureMerchantMutationFailure(response)) return;
    if (request.method === 'DELETE') {
      items.splice(index, 1);
      return json(response, 200, { ok: true });
    }
    const promotion = {
      id: body.id || `60000000-0000-4000-8000-${String(fixtureState.nextPromotion++).padStart(12, '0')}`,
      venue_id: venueId,
      title: body.title || '',
      description: body.description || '',
      starts_at: body.startsAt || null,
      ends_at: body.endsAt || null,
      status: body.status || 'draft'
    };
    if (index === -1) items.push(promotion); else items[index] = { ...items[index], ...promotion };
    return json(response, request.method === 'POST' ? 201 : 200, { promotion: structuredClone(promotion) });
  }
  if (path === '/api/auth/password' && request.method === 'POST') {
    const session = fixtureUserSession(requestCookies);
    if (!session.user) {
      return json(response, 401, { message: 'Войдите или зарегистрируйтесь, чтобы продолжить.', ...(session.code ? { code: session.code } : {}) });
    }
    const body = await readJson(request);
    if (!isStrongPassword(body.password)) {
      return json(response, 400, { message: NEW_PASSWORD_ERROR_MESSAGE });
    }
    if (session.user.role === 'merchant') fixtureState.scenario.merchantMustChangePassword = false;
    const user = session.user.role === 'merchant' ? fixtureMerchantUser() : session.user;
    return json(response, 200, { user });
  }
  if (path === '/api/admin/session' && request.method === 'GET') {
    fixtureState.adminRequestCounters.session += 1;
    return hasAdminSession(requestCookies)
      ? adminResponse(response, 200, { authenticated: true, user: { login: 'editor', role: 'admin' } })
      : adminResponse(response, 401, {
          authenticated: false,
          ...(fixtureState.scenario.adminSessionMode === 'expired' ? { code: 'SESSION_EXPIRED' } : {})
        });
  }
  if (path === '/api/admin/login' && request.method === 'POST') {
    fixtureState.adminRequestCounters.login += 1;
    if (!hasSameOrigin(request)) {
      return adminResponse(response, 403, { message: 'Запрос отклонён проверкой источника.' });
    }
    const body = await readJson(request);
    if (String(body.login || '').trim() !== 'editor' || body.password !== 'fixture-password') {
      return adminResponse(response, 401, { message: 'Неверный логин или пароль.' });
    }
    fixtureState.scenario.adminSessionMode = 'active';
    return adminResponse(response, 200, { authenticated: true, user: { login: 'editor', role: 'admin' } }, {
      'Set-Cookie': 'e2e-admin=active; Path=/; HttpOnly; SameSite=Lax'
    });
  }
  if (path === '/api/admin/logout' && request.method === 'POST') {
    fixtureState.adminRequestCounters.logout += 1;
    if (!requireAdminMutation(response, request, requestCookies)) return;
    return adminResponse(response, 200, { ok: true }, {
      'Set-Cookie': 'e2e-admin=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'
    });
  }
  if (path === '/api/admin/dashboard' && request.method === 'GET') {
    fixtureState.adminRequestCounters.dashboard += 1;
    if (!requireAdminFixture(response, requestCookies)) return;
    await wait(fixtureState.scenario.adminDashboardDelayMs);
    const fail = fixtureState.scenario.adminDashboardError
      || fixtureState.scenario.adminDashboardFailNext;
    fixtureState.scenario.adminDashboardFailNext = false;
    if (fail) return adminResponse(response, 503, { message: 'Панель временно недоступна.' });
    fixtureState.adminDashboard.stats = {
      ...fixtureState.adminDashboard.stats,
      venues: fixtureState.adminDashboard.venues.length,
      pendingVenues: fixtureState.adminDashboard.submissions.filter((item) => item.status === 'pending').length,
      pendingReviews: fixtureState.adminDashboard.reviews.filter((item) => item.status === 'pending').length,
      merchants: fixtureState.adminMerchants.length,
      cities: new Set(fixtureState.adminDashboard.venues.map((venue) => venue.city)).size
    };
    fixtureState.adminDashboard.databaseConfigured = fixtureState.scenario.adminDatabaseConfigured !== false;
    return adminResponse(response, 200, structuredClone(fixtureState.adminDashboard));
  }
  if (path === '/api/admin/merchants' && request.method === 'GET') {
    fixtureState.adminRequestCounters.merchantList += 1;
    if (!requireAdminFixture(response, requestCookies)) return;
    await wait(fixtureState.scenario.adminMerchantsDelayMs);
    const fail = fixtureState.scenario.adminMerchantsError
      || fixtureState.scenario.adminMerchantsFailNext;
    fixtureState.scenario.adminMerchantsFailNext = false;
    if (fail) return adminResponse(response, 503, { message: 'Рестораторы временно недоступны.' });
    return adminResponse(response, 200, { merchants: structuredClone(fixtureState.adminMerchants) });
  }
  if (path === '/api/admin/submissions' && request.method === 'PATCH') {
    fixtureState.adminRequestCounters.submissionModeration += 1;
    if (!requireAdminMutation(response, request, requestCookies)) return;
    if (await shouldFailAdminMutation()) return adminResponse(response, 503, { message: 'Изменение временно недоступно.' });
    const body = await readJson(request);
    const item = fixtureState.adminDashboard.submissions.find((submission) => submission.id === body.id);
    if (!item) return adminResponse(response, 404, { message: 'Заявка не найдена.' });
    item.status = body.decision;
    item.moderation_note = body.note || '';
    return adminResponse(response, 200, { result: structuredClone(item) });
  }
  if (path === '/api/admin/reviews' && request.method === 'PATCH') {
    fixtureState.adminRequestCounters.reviewModeration += 1;
    if (!requireAdminMutation(response, request, requestCookies)) return;
    if (await shouldFailAdminMutation()) return adminResponse(response, 503, { message: 'Изменение временно недоступно.' });
    const body = await readJson(request);
    const item = fixtureState.adminDashboard.reviews.find((review) => review.id === body.id);
    if (!item) return adminResponse(response, 404, { message: 'Отзыв не найден.' });
    item.status = body.decision;
    item.moderation_note = body.note || '';
    return adminResponse(response, 200, { result: structuredClone(item) });
  }
  if (path === '/api/admin/venues' && ['POST', 'PATCH', 'DELETE'].includes(request.method)) {
    const counter = request.method === 'POST'
      ? 'venueCreate'
      : request.method === 'PATCH' ? 'venueUpdate' : 'venueDelete';
    fixtureState.adminRequestCounters[counter] += 1;
    if (!requireAdminMutation(response, request, requestCookies)) return;
    if (await shouldFailAdminMutation()) return adminResponse(response, 503, { message: 'Изменение временно недоступно.' });
    const body = await readJson(request);
    const items = fixtureState.adminDashboard.venues;
    const index = items.findIndex((venue) => venue.id === body.id);
    if (request.method === 'DELETE') {
      if (index !== -1) items.splice(index, 1);
      return adminResponse(response, 200, { ok: true });
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
    return adminResponse(response, request.method === 'POST' ? 201 : 200, { venue: structuredClone(venue) });
  }
  if (path === '/api/admin/merchants' && ['POST', 'PATCH'].includes(request.method)) {
    if (!requireAdminMutation(response, request, requestCookies)) return;
    if (await shouldFailAdminMutation()) return adminResponse(response, 503, { message: 'Изменение временно недоступно.' });
    const body = await readJson(request);
    if (request.method === 'POST') {
      if (Object.prototype.hasOwnProperty.call(body, 'password') && !isStrongPassword(body.password)) {
        return adminResponse(response, 400, { message: TEMPORARY_PASSWORD_ERROR_MESSAGE });
      }
      fixtureState.adminRequestCounters.merchantCreate += 1;
      const id = `20000000-0000-4000-8000-${String(fixtureState.nextAdminMerchant++).padStart(12, '0')}`;
      const created = {
        id,
        user_id: id,
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
      return adminResponse(response, 201, {
        merchant: structuredClone(created),
        credentials: { login: body.username, password: body.password || 'FixturePass123' },
        message: 'Ресторатор создан.'
      });
    }
    const existing = fixtureState.adminMerchants.find((item) => (item.id || item.user_id) === body.userId);
    if (!existing) return adminResponse(response, 404, { message: 'Аккаунт ресторатора не найден.' });
    if (body.action === 'reset-password') {
      if (Object.prototype.hasOwnProperty.call(body, 'password') && !isStrongPassword(body.password)) {
        return adminResponse(response, 400, { message: TEMPORARY_PASSWORD_ERROR_MESSAGE });
      }
      fixtureState.adminRequestCounters.merchantPasswordReset += 1;
      return adminResponse(response, 200, {
        credentials: { password: body.password || 'ResetPass123' },
        message: 'Временный пароль создан.'
      });
    }
    if (body.status) {
      fixtureState.adminRequestCounters.merchantStatus += 1;
      existing.status = body.status;
    } else {
      fixtureState.adminRequestCounters.merchantUpdate += 1;
    }
    if (body.displayName) existing.display_name = body.displayName;
    if (Array.isArray(body.venueIds)) existing.memberships = body.venueIds.map((venueId) => ({
      venue_id: venueId,
      membership_role: body.membershipRole || 'owner',
      venue: fixtureState.adminDashboard.venues.find((venue) => venue.id === venueId)
    })).filter((membership) => membership.venue);
    return adminResponse(response, 200, { ok: true });
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
