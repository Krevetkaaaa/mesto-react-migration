const { email, json, methodNotAllowed, readJson, text, uuid } = require('../../lib/http');
const { handleApiError, requireAdmin } = require('../../lib/admin');
const { createManagedUser, isStrongPassword, resetManagedPassword, temporaryPassword } = require('../../lib/identity');
const { normalizeMembershipRole } = require('../../lib/merchant-permissions');
const { authRequest, createStore } = require('../../lib/supabase');

function venueIds(value) {
  return Array.isArray(value) ? [...new Set(value.map(uuid).filter(Boolean))].slice(0, 100) : [];
}

module.exports = async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) return methodNotAllowed(res, ['GET', 'POST', 'PATCH']);
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const store = createStore();
  try {
    if (req.method === 'GET') return json(res, 200, { merchants: await store.listMerchants() });
    const body = await readJson(req, 250_000);
    if (req.method === 'POST') {
      const displayName = text(body.displayName, 120);
      const username = text(body.username, 48).toLowerCase();
      const address = email(body.email) || (username ? `${username}@accounts.mesto.guide` : '');
      const assignments = venueIds(body.venueIds);
      const membershipRole = normalizeMembershipRole(body.membershipRole);
      if (!displayName || !/^[a-z0-9._-]{3,48}$/.test(username) || !address) return json(res, 400, { message: 'Укажите имя и логин из 3–48 латинских букв или цифр.' });
      if (!membershipRole) return json(res, 400, { message: 'Выберите корректную роль ресторатора.' });
      const password = String(body.password || temporaryPassword());
      if (!isStrongPassword(password)) return json(res, 400, { message: 'Временный пароль должен содержать минимум 10 символов, букву и цифру.' });
      const profile = await createManagedUser({ email: address, password, displayName, username, role: 'merchant', mustChangePassword: true });
      try {
        await store.replaceMemberships(profile.id, assignments, membershipRole);
        await store.audit({ actor_label: admin.sub, actor_role: 'admin', action: 'merchant.created', entity_type: 'profile', entity_id: profile.id, details: { venue_ids: assignments } });
      } catch (error) {
        await authRequest(`admin/users/${profile.id}`, { method: 'DELETE' }).catch(() => null);
        throw error;
      }
      return json(res, 201, { merchant: profile, credentials: { login: username, password }, message: 'Ресторатор создан. Сохраните временный пароль — повторно он не показывается.' });
    }
    const userId = uuid(body.userId);
    if (!userId) return json(res, 400, { message: 'Некорректный аккаунт ресторатора.' });
    const target = await store.profileById(userId);
    if (!target || target.role !== 'merchant') return json(res, 404, { message: 'Аккаунт ресторатора не найден.' });
    if (body.action === 'reset-password') {
      const password = String(body.password || temporaryPassword());
      if (!isStrongPassword(password)) return json(res, 400, { message: 'Временный пароль должен содержать минимум 10 символов, букву и цифру.' });
      await resetManagedPassword(userId, password);
      await store.audit({ actor_label: admin.sub, actor_role: 'admin', action: 'merchant.password_reset', entity_type: 'profile', entity_id: userId });
      return json(res, 200, { credentials: { password }, message: 'Временный пароль создан.' });
    }
    const patch = {};
    if (['active', 'suspended'].includes(body.status) && body.status !== target.status) {
      patch.status = body.status;
      patch.session_version = Number(target.session_version || 0) + 1;
    }
    if (body.displayName !== undefined) patch.display_name = text(body.displayName, 120);
    if (Object.keys(patch).length) await store.updateProfile(userId, patch);
    if (Array.isArray(body.venueIds)) {
      const membershipRole = normalizeMembershipRole(body.membershipRole);
      if (!membershipRole) return json(res, 400, { message: 'Выберите корректную роль ресторатора.' });
      await store.replaceMemberships(userId, venueIds(body.venueIds), membershipRole);
    }
    await store.audit({ actor_label: admin.sub, actor_role: 'admin', action: 'merchant.updated', entity_type: 'profile', entity_id: userId, details: { status: patch.status, venue_ids: body.venueIds } });
    return json(res, 200, { ok: true });
  } catch (error) {
    return handleApiError(res, error);
  }
};
