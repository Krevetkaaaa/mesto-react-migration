const crypto = require('node:crypto');
const { text } = require('./http');
const { attemptPostCommit } = require('./merchant-operations');
const { normalizeMembershipRole, permissionsForRole } = require('./merchant-permissions');

class StoreConfigurationError extends Error {
  constructor() {
    super('SUPABASE_NOT_CONFIGURED');
    this.code = 'SUPABASE_NOT_CONFIGURED';
    this.statusCode = 503;
  }
}

function configuration() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { url, key, configured: Boolean(url && key) };
}

function encodeFilters(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  return params.toString();
}

async function request(path, options = {}) {
  const config = configuration();
  if (!config.configured) throw new StoreConfigurationError();
  const query = encodeFilters(options.query);
  const response = await fetch(`${config.url}/rest/v1/${path}${query ? `?${query}` : ''}`, {
    method: options.method || 'GET',
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.prefer ? { Prefer: options.prefer } : {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.message || body?.hint || `Supabase request failed (${response.status})`);
    error.statusCode = response.status;
    error.details = body;
    throw error;
  }
  if (options.withMetadata) {
    const contentRange = response.headers.get('content-range') || '';
    const totalMatch = contentRange.match(/\/(\d+)$/);
    return {
      items: Array.isArray(body) ? body : [],
      total: totalMatch ? Number(totalMatch[1]) : null
    };
  }
  return body;
}

async function authRequest(path, options = {}) {
  const config = configuration();
  if (!config.configured) throw new StoreConfigurationError();
  const response = await fetch(`${config.url}/auth/v1/${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${options.accessToken || config.key}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.msg || body?.message || body?.error_description || `Supabase Auth request failed (${response.status})`);
    error.statusCode = response.status;
    error.code = body?.code || body?.error_code || 'AUTH_ERROR';
    error.details = body;
    throw error;
  }
  return body;
}

function missingExtendedSchema(error) {
  return error?.statusCode === 404 || /schema cache|could not find the table|relation .* does not exist|PGRST205/i.test(`${error?.message || ''} ${error?.details?.code || ''}`);
}

function profileFromAuthUser(user) {
  const metadata = user?.user_metadata || {};
  const app = user?.app_metadata || {};
  return user ? {
    id: user.id,
    username: metadata.username || String(user.email || '').split('@')[0],
    display_name: metadata.display_name || metadata.full_name || metadata.name || String(user.email || '').split('@')[0],
    email: String(user.email || '').toLowerCase(),
    email_is_internal: Boolean(app.mesto_email_is_internal) || /@oauth\.mesto\.invalid$/i.test(String(user.email || '')),
    phone: metadata.phone || user.phone || '',
    role: app.mesto_role || 'customer',
    status: app.mesto_status || 'active',
    must_change_password: Boolean(app.must_change_password),
    session_version: Number.isInteger(Number(app.mesto_session_version)) ? Number(app.mesto_session_version) : 0,
    last_login_at: user.last_sign_in_at || null,
    created_at: user.created_at,
    updated_at: user.updated_at || user.created_at,
    _auth_user: user
  } : null;
}

async function authUserById(id) {
  const result = await authRequest(`admin/users/${id}`);
  return result?.user || result;
}

async function listAuthUsers() {
  const result = await authRequest('admin/users?page=1&per_page=1000');
  return Array.isArray(result) ? result : result?.users || [];
}

async function updateAuthMetadata(id, patch = {}) {
  const user = await authUserById(id);
  const userMetadata = { ...(user.user_metadata || {}), ...(patch.user_metadata || {}) };
  const appMetadata = { ...(user.app_metadata || {}), ...(patch.app_metadata || {}) };
  const result = await authRequest(`admin/users/${id}`, { method: 'PUT', body: { user_metadata: userMetadata, app_metadata: appMetadata } });
  return result?.user || result;
}

async function storageUpload(path, bytes, contentType) {
  const config = configuration();
  if (!config.configured) throw new StoreConfigurationError();
  const response = await fetch(`${config.url}/storage/v1/object/venue-submissions/${path}`, {
    method: 'POST',
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      'Content-Type': contentType,
      'x-upsert': 'false'
    },
    body: bytes
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.message || `Storage upload failed (${response.status})`);
    error.statusCode = response.status;
    throw error;
  }
  return `${config.url}/storage/v1/object/public/venue-submissions/${path}`;
}

function venueFromSubmission(submission) {
  const slugBase = text(submission.title, 120).toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, '-')
    .replace(/^-|-$/g, '') || 'venue';
  return {
    slug: `${slugBase}-${String(submission.id).slice(0, 8)}`,
    title: submission.title,
    city: submission.city,
    category: submission.category,
    cuisine: submission.cuisine || '',
    description: submission.description,
    address: submission.address || '',
    phone: submission.phone || '',
    website: submission.website || '',
    hours: submission.hours || '',
    average_check: submission.average_check || '',
    features: submission.features || [],
    photos: submission.photos || [],
    source: 'community',
    status: 'published',
    created_by: submission.submitted_by || null
  };
}

function createStore() {
  return {
    configured: configuration().configured,
    async listPublished({ city, category, limit = 100 } = {}) {
      const query = { select: '*', status: 'eq.published', order: 'created_at.desc', limit };
      if (city && city !== 'all') query.city = `eq.${city}`;
      if (category && category !== 'all') query.category = `eq.${category}`;
      return request('venues', { query });
    },
    async listPublishedPage({ city, category, search, limit = 50, offset = 0 } = {}) {
      const pageSize = Math.min(Math.max(Number(limit) || 50, 1), 100);
      const pageOffset = Math.max(Number(offset) || 0, 0);
      const query = {
        select: '*',
        status: 'eq.published',
        order: 'created_at.desc',
        limit: pageSize,
        offset: pageOffset
      };
      if (city && city !== 'all') query.city = `eq.${city}`;
      if (category && category !== 'all') query.category = `eq.${category}`;
      const normalizedSearch = text(search, 120).replace(/[^\p{L}\p{N}\s._-]/gu, ' ').replace(/\s+/g, ' ').trim();
      if (normalizedSearch) {
        const pattern = `*${normalizedSearch}*`;
        query.or = `(title.ilike.${pattern},description.ilike.${pattern},address.ilike.${pattern},cuisine.ilike.${pattern},category.ilike.${pattern})`;
      }
      return request('venues', {
        prefer: 'count=exact',
        query,
        withMetadata: true
      });
    },
    async publishedVenueBySlug(slug) {
      const rows = await request('venues', {
        query: {
          select: 'id,slug,title,city,category,cuisine,description,address,phone,website,hours,average_check,features,photos,source,status,created_at,updated_at',
          status: 'eq.published',
          slug: `eq.${slug}`,
          limit: 1
        }
      });
      const venue = rows?.[0];
      return venue?.status === 'published' ? venue : null;
    },
    async createVenueSubmission(payload) {
      const rows = await request('venue_submissions', { method: 'POST', prefer: 'return=representation', body: payload });
      return rows?.[0] || null;
    },
    async createReviewSubmission(payload) {
      const rows = await request('review_submissions', { method: 'POST', prefer: 'return=representation', body: payload });
      return rows?.[0] || null;
    },
    async profileById(id) {
      try {
        const rows = await request('profiles', { query: { select: '*', id: `eq.${id}`, limit: 1 } });
        return rows?.[0] || null;
      } catch (error) {
        if (!missingExtendedSchema(error)) throw error;
        return profileFromAuthUser(await authUserById(id).catch(() => null));
      }
    },
    async profileByLogin(login) {
      const normalized = String(login || '').trim().toLowerCase();
      const filter = normalized.includes('@') ? { email: `eq.${normalized}` } : { username: `eq.${normalized}` };
      try {
        const rows = await request('profiles', { query: { select: '*', ...filter, limit: 1 } });
        return rows?.[0] || null;
      } catch (error) {
        if (!missingExtendedSchema(error)) throw error;
        const users = await listAuthUsers();
        const user = users.find((item) => String(item.email || '').toLowerCase() === normalized || String(item.user_metadata?.username || '').toLowerCase() === normalized);
        return profileFromAuthUser(user);
      }
    },
    async saveProfile(profile) {
      try {
        const rows = await request('profiles', { method: 'POST', prefer: 'resolution=merge-duplicates,return=representation', body: profile });
        return rows?.[0] || null;
      } catch (error) {
        if (!missingExtendedSchema(error)) throw error;
        const user = await updateAuthMetadata(profile.id, {
          user_metadata: { username: profile.username, display_name: profile.display_name, phone: profile.phone || '' },
          app_metadata: { mesto_role: profile.role, mesto_status: profile.status, must_change_password: Boolean(profile.must_change_password), mesto_session_version: Number(profile.session_version || 0), mesto_email_is_internal: Boolean(profile.email_is_internal) }
        });
        return profileFromAuthUser(user);
      }
    },
    async updateProfile(id, patch) {
      try {
        const rows = await request('profiles', { method: 'PATCH', prefer: 'return=representation', query: { id: `eq.${id}` }, body: patch });
        if (rows?.[0]) return rows[0];
      } catch (error) {
        if (!missingExtendedSchema(error)) throw error;
      }
      const user = await updateAuthMetadata(id, {
        user_metadata: { ...(patch.username !== undefined ? { username: patch.username } : {}), ...(patch.display_name !== undefined ? { display_name: patch.display_name } : {}), ...(patch.phone !== undefined ? { phone: patch.phone } : {}) },
        app_metadata: { ...(patch.role !== undefined ? { mesto_role: patch.role } : {}), ...(patch.status !== undefined ? { mesto_status: patch.status } : {}), ...(patch.must_change_password !== undefined ? { must_change_password: Boolean(patch.must_change_password) } : {}), ...(patch.session_version !== undefined ? { mesto_session_version: Number(patch.session_version) } : {}), ...(patch.email_is_internal !== undefined ? { mesto_email_is_internal: Boolean(patch.email_is_internal) } : {}) }
      });
      return profileFromAuthUser(user);
    },
    async listFavorites(userId) {
      let stored = [];
      try {
        stored = await request('favorites', { query: { select: '*', user_id: `eq.${userId}`, order: 'created_at.desc', limit: 500 } });
      } catch (error) {
        if (!missingExtendedSchema(error)) throw error;
      }
      const user = await authUserById(userId);
      const metadata = Array.isArray(user.user_metadata?.mesto_favorites) ? user.user_metadata.mesto_favorites : [];
      return [...new Map([...metadata, ...stored].map((item) => [item.venue_key, item])).values()];
    },
    async saveFavorite(payload) {
      try {
        const rows = await request('favorites', { method: 'POST', prefer: 'resolution=merge-duplicates,return=representation', body: payload });
        const favorite = rows?.[0] || null;
        const user = await authUserById(payload.user_id);
        const current = Array.isArray(user.user_metadata?.mesto_favorites) ? user.user_metadata.mesto_favorites : [];
        if (current.some((item) => item.venue_key === payload.venue_key)) {
          await updateAuthMetadata(payload.user_id, { user_metadata: { mesto_favorites: current.filter((item) => item.venue_key !== payload.venue_key) } });
        }
        return favorite;
      } catch (error) {
        if (!missingExtendedSchema(error)) throw error;
        const user = await authUserById(payload.user_id);
        const current = Array.isArray(user.user_metadata?.mesto_favorites) ? user.user_metadata.mesto_favorites : [];
        const favorite = { ...payload, created_at: new Date().toISOString() };
        const next = [...current.filter((item) => item.venue_key !== payload.venue_key), favorite].slice(-500);
        await updateAuthMetadata(payload.user_id, { user_metadata: { mesto_favorites: next } });
        return favorite;
      }
    },
    async deleteFavorite(userId, venueKey) {
      let removed = [];
      try {
        removed = await request('favorites', { method: 'DELETE', prefer: 'return=representation', query: { user_id: `eq.${userId}`, venue_key: `eq.${venueKey}` } });
      } catch (error) {
        if (!missingExtendedSchema(error)) throw error;
      }
      const user = await authUserById(userId);
      const current = Array.isArray(user.user_metadata?.mesto_favorites) ? user.user_metadata.mesto_favorites : [];
      if (current.some((item) => item.venue_key === venueKey)) {
        await updateAuthMetadata(userId, { user_metadata: { mesto_favorites: current.filter((item) => item.venue_key !== venueKey) } });
      }
      return removed;
    },
    async dashboard() {
      const [venues, submissions, reviews, merchants] = await Promise.all([
        request('venues', { query: { select: '*', order: 'updated_at.desc', limit: 500 } }),
        request('venue_submissions', { query: { select: '*', order: 'created_at.desc', limit: 200 } }),
        request('review_submissions', { query: { select: '*', order: 'created_at.desc', limit: 200 } }),
        request('profiles', { query: { select: 'id', role: 'eq.merchant', limit: 500 } }).catch(async (error) => {
          if (!missingExtendedSchema(error)) throw error;
          return (await listAuthUsers()).filter((user) => profileFromAuthUser(user)?.role === 'merchant');
        })
      ]);
      const published = venues.filter((item) => item.status === 'published');
      return {
        stats: {
          venues: published.length,
          pendingVenues: submissions.filter((item) => item.status === 'pending').length,
          pendingReviews: reviews.filter((item) => item.status === 'pending').length,
          cities: new Set(published.map((item) => item.city).filter(Boolean)).size,
          merchants: merchants.length
        },
        venues,
        submissions,
        reviews
      };
    },
    async saveVenue(payload, id) {
      if (id) {
        const rows = await request('venues', { method: 'PATCH', prefer: 'return=representation', query: { id: `eq.${id}` }, body: payload });
        return rows?.[0] || null;
      }
      const rows = await request('venues', { method: 'POST', prefer: 'return=representation', body: payload });
      return rows?.[0] || null;
    },
    async deleteVenue(id) {
      return request('venues', { method: 'DELETE', prefer: 'return=representation', query: { id: `eq.${id}` } });
    },
    async listMerchants() {
      const venues = await request('venues', { query: { select: 'id,title,city,category,status', order: 'title.asc', limit: 1000 } });
      let profiles = [];
      let memberships = [];
      try {
        [profiles, memberships] = await Promise.all([
          request('profiles', { query: { select: '*', role: 'eq.merchant', order: 'created_at.desc', limit: 500 } }),
          request('venue_memberships', { query: { select: '*', order: 'created_at.desc', limit: 1000 } })
        ]);
      } catch (error) {
        if (!missingExtendedSchema(error)) throw error;
      }
      const users = (await listAuthUsers()).filter((user) => profileFromAuthUser(user)?.role === 'merchant');
      const metadataProfiles = users.map(profileFromAuthUser);
      const metadataMemberships = users.flatMap((user) => (user.app_metadata?.mesto_venue_ids || []).map((venueId) => ({
        id: `${user.id}:${venueId}`,
        user_id: user.id,
        venue_id: venueId,
        membership_role: user.app_metadata?.mesto_membership_role || 'owner',
        created_at: user.created_at
      })));
      profiles = [...new Map([...metadataProfiles, ...profiles].map((profile) => [profile.id, profile])).values()];
      memberships = [...new Map([...metadataMemberships, ...memberships].map((membership) => [`${membership.user_id}:${membership.venue_id}`, membership])).values()];
      const venueMap = new Map(venues.map((venue) => [venue.id, venue]));
      return profiles.map((profile) => ({
        ...profile,
        memberships: memberships.filter((item) => item.user_id === profile.id).map((item) => ({ ...item, venue: venueMap.get(item.venue_id) || null }))
      }));
    },
    async listMemberships(userId) {
      let stored = [];
      try {
        stored = await request('venue_memberships', { query: { select: '*', user_id: `eq.${userId}`, order: 'created_at.asc', limit: 500 } });
      } catch (error) {
        if (!missingExtendedSchema(error)) throw error;
      }
      const user = await authUserById(userId);
      const metadata = (user.app_metadata?.mesto_venue_ids || []).map((venueId) => ({ user_id: userId, venue_id: venueId, membership_role: user.app_metadata?.mesto_membership_role || 'owner' }));
      return [...new Map([...metadata, ...stored].map((item) => [item.venue_id, item])).values()];
    },
    async replaceMemberships(userId, venueIds, membershipRole = 'owner') {
      const role = normalizeMembershipRole(membershipRole);
      if (!role) throw Object.assign(new Error('Некорректная роль ресторатора.'), { statusCode: 400 });
      const normalizedVenueIds = [...new Set(venueIds.map(String))];
      if (normalizedVenueIds.length) {
        const existingVenues = await request('venues', { query: { select: 'id', id: `in.(${normalizedVenueIds.join(',')})`, limit: normalizedVenueIds.length } });
        if (existingVenues.length !== normalizedVenueIds.length) throw Object.assign(new Error('Одно из назначенных заведений не найдено.'), { statusCode: 400 });
      }
      try {
        const current = await request('venue_memberships', { query: { select: '*', user_id: `eq.${userId}`, limit: 500 } });
        let memberships = [];
        if (normalizedVenueIds.length) {
          memberships = await request('venue_memberships', {
            method: 'POST',
            prefer: 'resolution=merge-duplicates,return=representation',
            query: { on_conflict: 'venue_id,user_id' },
            body: normalizedVenueIds.map((venueId) => ({ user_id: userId, venue_id: venueId, membership_role: role, permissions: permissionsForRole(role) }))
          });
        }
        const obsolete = current.filter((item) => !normalizedVenueIds.includes(item.venue_id)).map((item) => item.venue_id);
        if (obsolete.length) await request('venue_memberships', { method: 'DELETE', query: { user_id: `eq.${userId}`, venue_id: `in.(${obsolete.join(',')})` } });
        await updateAuthMetadata(userId, { app_metadata: { mesto_venue_ids: [], mesto_membership_role: role } }).catch(() => null);
        return memberships;
      } catch (error) {
        if (!missingExtendedSchema(error)) throw error;
        await updateAuthMetadata(userId, { app_metadata: { mesto_venue_ids: normalizedVenueIds, mesto_membership_role: role } });
        return normalizedVenueIds.map((venueId) => ({ user_id: userId, venue_id: venueId, membership_role: role, permissions: permissionsForRole(role) }));
      }
    },
    async venuesByIds(ids) {
      if (!ids.length) return [];
      return request('venues', { query: { select: '*', id: `in.(${ids.join(',')})`, order: 'title.asc', limit: 500 } });
    },
    async menuForVenues(ids, userId) {
      if (!ids.length) return [];
      let stored = [];
      try {
        stored = await request('menu_items', { query: { select: '*', venue_id: `in.(${ids.join(',')})`, order: 'section.asc,sort_order.asc', limit: 1000 } });
      } catch (error) {
        if (!missingExtendedSchema(error) || !userId) throw error;
      }
      if (!userId) return stored;
      const user = await authUserById(userId);
      const metadata = (user.app_metadata?.mesto_menu || []).filter((item) => ids.includes(item.venue_id));
      return [...new Map([...metadata, ...stored].map((item) => [item.id, item])).values()];
    },
    async saveMenuItem(payload, id, userId) {
      let item;
      try {
        if (id) {
          const rows = await request('menu_items', { method: 'PATCH', prefer: 'return=representation', query: { id: `eq.${id}` }, body: payload });
          if (rows?.[0]) item = rows[0];
          else {
            const inserted = await request('menu_items', { method: 'POST', prefer: 'return=representation', body: { ...payload, id } });
            item = inserted?.[0] || null;
          }
        } else {
          const rows = await request('menu_items', { method: 'POST', prefer: 'return=representation', body: payload });
          item = rows?.[0] || null;
        }
      } catch (error) {
        if (!missingExtendedSchema(error) || !userId) throw error;
        const user = await authUserById(userId);
        const current = Array.isArray(user.app_metadata?.mesto_menu) ? user.app_metadata.mesto_menu : [];
        const item = { ...payload, id: id || crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        const next = [...current.filter((entry) => entry.id !== item.id), item];
        await updateAuthMetadata(userId, { app_metadata: { mesto_menu: next } });
        return item;
      }
      if (userId && id) {
        await attemptPostCommit(async () => {
          const user = await authUserById(userId);
          const current = Array.isArray(user.app_metadata?.mesto_menu) ? user.app_metadata.mesto_menu : [];
          if (current.some((entry) => entry.id === id)) {
            await updateAuthMetadata(userId, { app_metadata: { mesto_menu: current.filter((entry) => entry.id !== id) } });
          }
        });
      }
      return item;
    },
    async deleteMenuItem(id, userId) {
      let removed = [];
      let databaseCommitted = false;
      try {
        removed = await request('menu_items', { method: 'DELETE', prefer: 'return=representation', query: { id: `eq.${id}` } });
        databaseCommitted = true;
      } catch (error) {
        if (!missingExtendedSchema(error) || !userId) throw error;
      }
      if (userId) {
        const removeLegacyItem = async () => {
          const user = await authUserById(userId);
          const current = Array.isArray(user.app_metadata?.mesto_menu) ? user.app_metadata.mesto_menu : [];
          if (current.some((item) => item.id === id)) {
            await updateAuthMetadata(userId, { app_metadata: { mesto_menu: current.filter((item) => item.id !== id) } });
          }
        };
        if (databaseCommitted) await attemptPostCommit(removeLegacyItem);
        else await removeLegacyItem();
      }
      return removed;
    },
    async promotionsForVenues(ids, userId) {
      if (!ids.length) return [];
      let stored = [];
      try {
        stored = await request('promotions', { query: { select: '*', venue_id: `in.(${ids.join(',')})`, order: 'created_at.desc', limit: 500 } });
      } catch (error) {
        if (!missingExtendedSchema(error) || !userId) throw error;
      }
      if (!userId) return stored;
      const user = await authUserById(userId);
      const metadata = (user.app_metadata?.mesto_promotions || []).filter((item) => ids.includes(item.venue_id));
      return [...new Map([...metadata, ...stored].map((item) => [item.id, item])).values()];
    },
    async publicVenueContent(venueId) {
      let menu = [];
      let promotions = [];
      try {
        [menu, promotions] = await Promise.all([
          request('menu_items', { query: { select: 'id,venue_id,section,title,description,price,photo_url,is_available,sort_order', venue_id: `eq.${venueId}`, is_available: 'eq.true', order: 'section.asc,sort_order.asc', limit: 300 } }),
          request('promotions', { query: { select: 'id,venue_id,title,description,starts_at,ends_at,status', venue_id: `eq.${venueId}`, status: 'eq.active', order: 'created_at.desc', limit: 100 } })
        ]);
      } catch (error) {
        if (!missingExtendedSchema(error)) throw error;
      }
      const users = await listAuthUsers();
      const metadataMenu = users.flatMap((user) => Array.isArray(user.app_metadata?.mesto_menu) ? user.app_metadata.mesto_menu : [])
        .filter((item) => item.venue_id === venueId && item.is_available !== false);
      const metadataPromotions = users.flatMap((user) => Array.isArray(user.app_metadata?.mesto_promotions) ? user.app_metadata.mesto_promotions : [])
        .filter((item) => item.venue_id === venueId && item.status === 'active');
      const unique = (items) => [...new Map(items.map((item) => [item.id, item])).values()];
      return {
        menu: unique([...menu, ...metadataMenu]).sort((a, b) => String(a.section || '').localeCompare(String(b.section || ''), 'ru') || Number(a.sort_order || 0) - Number(b.sort_order || 0)),
        promotions: unique([...promotions, ...metadataPromotions]).filter((item) => (!item.starts_at || new Date(item.starts_at).getTime() <= Date.now()) && (!item.ends_at || new Date(item.ends_at).getTime() >= Date.now()))
      };
    },
    async savePromotion(payload, id, userId) {
      let item;
      try {
        if (id) {
          const rows = await request('promotions', { method: 'PATCH', prefer: 'return=representation', query: { id: `eq.${id}` }, body: payload });
          if (rows?.[0]) item = rows[0];
          else {
            const inserted = await request('promotions', { method: 'POST', prefer: 'return=representation', body: { ...payload, id } });
            item = inserted?.[0] || null;
          }
        } else {
          const rows = await request('promotions', { method: 'POST', prefer: 'return=representation', body: payload });
          item = rows?.[0] || null;
        }
      } catch (error) {
        if (!missingExtendedSchema(error) || !userId) throw error;
        const user = await authUserById(userId);
        const current = Array.isArray(user.app_metadata?.mesto_promotions) ? user.app_metadata.mesto_promotions : [];
        const item = { ...payload, id: id || crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        const next = [...current.filter((entry) => entry.id !== item.id), item];
        await updateAuthMetadata(userId, { app_metadata: { mesto_promotions: next } });
        return item;
      }
      if (userId && id) {
        await attemptPostCommit(async () => {
          const user = await authUserById(userId);
          const current = Array.isArray(user.app_metadata?.mesto_promotions) ? user.app_metadata.mesto_promotions : [];
          if (current.some((entry) => entry.id === id)) {
            await updateAuthMetadata(userId, { app_metadata: { mesto_promotions: current.filter((entry) => entry.id !== id) } });
          }
        });
      }
      return item;
    },
    async deletePromotion(id, userId) {
      let removed = [];
      let databaseCommitted = false;
      try {
        removed = await request('promotions', { method: 'DELETE', prefer: 'return=representation', query: { id: `eq.${id}` } });
        databaseCommitted = true;
      } catch (error) {
        if (!missingExtendedSchema(error) || !userId) throw error;
      }
      if (userId) {
        const removeLegacyItem = async () => {
          const user = await authUserById(userId);
          const current = Array.isArray(user.app_metadata?.mesto_promotions) ? user.app_metadata.mesto_promotions : [];
          if (current.some((item) => item.id === id)) {
            await updateAuthMetadata(userId, { app_metadata: { mesto_promotions: current.filter((item) => item.id !== id) } });
          }
        };
        if (databaseCommitted) await attemptPostCommit(removeLegacyItem);
        else await removeLegacyItem();
      }
      return removed;
    },
    async audit(entry) {
      try { return await request('audit_log', { method: 'POST', body: entry }); }
      catch (error) { if (missingExtendedSchema(error)) return null; throw error; }
    },
    async moderateSubmission({ id, decision, note, moderator }) {
      return request('rpc/moderate_venue_submission', { method: 'POST', body: { p_submission_id: id, p_decision: decision, p_note: note || '', p_moderator: moderator || null } });
    },
    async moderateReview({ id, decision, note, moderator }) {
      return request('rpc/moderate_review_submission', { method: 'POST', body: { p_review_id: id, p_decision: decision, p_note: note || '', p_moderator: moderator || null } });
    },
    async upload(path, bytes, contentType) {
      return storageUpload(path, bytes, contentType);
    },
    venueFromSubmission
  };
}

module.exports = { StoreConfigurationError, authRequest, configuration, createStore, request, venueFromSubmission };
