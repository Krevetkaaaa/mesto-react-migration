const { email, json, methodNotAllowed, text, uuid } = require('../../lib/http');
const {
  attemptPostCommit,
  handleApiError,
  readAdminBody,
  requireAdmin,
  setAdminResponseHeaders
} = require('../../lib/admin');
const { createManagedUser, isStrongPassword, resetManagedPassword, temporaryPassword } = require('../../lib/identity');
const { normalizeMembershipRole } = require('../../lib/merchant-permissions');
const { enforceRateLimit } = require('../../lib/rate-limit');
const { authRequest, createStore } = require('../../lib/supabase');

function has(body, key) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function normalizedVenueIds(value) {
  if (!Array.isArray(value) || value.length > 100) return null;
  const ids = value.map((item) => typeof item === 'string' ? uuid(item) : '');
  if (ids.some((id) => !id)) return null;
  return [...new Set(ids)];
}

function validPassword(body) {
  if (!has(body, 'password')) return temporaryPassword();
  return typeof body.password === 'string' && isStrongPassword(body.password) ? body.password : '';
}

async function audit(store, entry) {
  return attemptPostCommit(() => store.audit(entry));
}

module.exports = async function handler(req, res) {
  setAdminResponseHeaders(res);
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
    return methodNotAllowed(res, ['GET', 'POST', 'PATCH']);
  }
  const admin = requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== 'GET' && !await enforceRateLimit(req, res, {
    policy: 'mutation', scope: 'admin-merchants', identifier: admin.sub
  })) return;
  const store = createStore();

  try {
    if (req.method === 'GET') return json(res, 200, { merchants: await store.listMerchants() });

    const body = await readAdminBody(req, 250_000);
    if (req.method === 'POST') {
      const displayName = typeof body.displayName === 'string' ? text(body.displayName, 120) : '';
      const username = typeof body.username === 'string' ? text(body.username, 48).toLowerCase() : '';
      const suppliedEmail = has(body, 'email') ? email(body.email) : '';
      const address = suppliedEmail || (!has(body, 'email') && username ? `${username}@accounts.mesto.guide` : '');
      const assignments = normalizedVenueIds(body.venueIds);
      const membershipRole = normalizeMembershipRole(body.membershipRole);
      const password = validPassword(body);

      if (!displayName || !/^[a-z0-9._-]{3,48}$/.test(username) || !address) {
        return json(res, 400, { message: 'Укажите имя, корректный логин и email ресторатора.' });
      }
      if (!assignments) return json(res, 400, { message: 'Назначения должны содержать не более 100 корректных заведений.' });
      if (!membershipRole) return json(res, 400, { message: 'Выберите корректную роль ресторатора.' });
      if (!password) return json(res, 400, { message: 'Временный пароль должен содержать минимум 10 символов, букву и цифру.' });

      const profile = await createManagedUser({
        email: address,
        password,
        displayName,
        username,
        role: 'merchant',
        mustChangePassword: true
      });
      try {
        await store.replaceMemberships(profile.id, assignments, membershipRole);
      } catch (error) {
        await authRequest(`admin/users/${profile.id}`, { method: 'DELETE' }).catch(() => null);
        throw error;
      }
      await audit(store, {
        actor_label: admin.sub,
        actor_role: 'admin',
        action: 'merchant.created',
        entity_type: 'profile',
        entity_id: profile.id,
        details: { venue_ids: assignments }
      });
      return json(res, 201, {
        merchant: profile,
        credentials: { login: username, password },
        message: 'Ресторатор создан. Сохраните временный пароль — повторно он не показывается.'
      });
    }

    const userId = uuid(body.userId);
    if (!userId) return json(res, 400, { message: 'Некорректный аккаунт ресторатора.' });
    const target = await store.profileById(userId);
    if (!target || target.role !== 'merchant') return json(res, 404, { message: 'Аккаунт ресторатора не найден.' });

    if (body.action === 'reset-password') {
      const allowedKeys = new Set(['userId', 'action', 'password']);
      if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
        return json(res, 400, { message: 'Запрос сброса пароля содержит лишние поля.' });
      }
      const password = validPassword(body);
      if (!password) return json(res, 400, { message: 'Временный пароль должен содержать минимум 10 символов, букву и цифру.' });
      const reset = await resetManagedPassword(userId, password);
      await audit(store, {
        actor_label: admin.sub,
        actor_role: 'admin',
        action: 'merchant.password_reset',
        entity_type: 'profile',
        entity_id: userId,
        details: { security_metadata_updated: reset.securityMetadataUpdated }
      });
      return json(res, 200, {
        credentials: { password },
        message: reset.securityMetadataUpdated
          ? 'Временный пароль создан.'
          : 'Пароль изменён, но отзыв прежних сессий не подтверждён. Проверьте состояние аккаунта.',
        ...(reset.securityMetadataUpdated ? {} : { warning: 'PASSWORD_RESET_METADATA_PENDING' })
      });
    }
    if (has(body, 'action')) return json(res, 400, { message: 'Неизвестное действие с аккаунтом.' });

    const patch = {};
    if (has(body, 'status')) {
      if (!['active', 'suspended'].includes(body.status)) return json(res, 400, { message: 'Некорректный статус аккаунта.' });
      if (body.status !== target.status) {
        patch.status = body.status;
        patch.session_version = Number(target.session_version || 0) + 1;
      }
    }
    if (has(body, 'displayName')) {
      if (typeof body.displayName !== 'string' || !text(body.displayName, 120)) {
        return json(res, 400, { message: 'Укажите имя ресторатора.' });
      }
      patch.display_name = text(body.displayName, 120);
    }

    let assignments = null;
    let membershipRole = '';
    if (has(body, 'venueIds')) {
      assignments = normalizedVenueIds(body.venueIds);
      membershipRole = normalizeMembershipRole(body.membershipRole);
      if (!assignments) return json(res, 400, { message: 'Назначения должны содержать не более 100 корректных заведений.' });
      if (!membershipRole) return json(res, 400, { message: 'Выберите корректную роль ресторатора.' });
    } else if (has(body, 'membershipRole')) {
      return json(res, 400, { message: 'Роль нельзя изменить без списка назначений.' });
    }
    if (!Object.keys(patch).length && assignments === null) {
      return json(res, 400, { message: 'Не указаны изменения аккаунта.' });
    }

    if (Object.keys(patch).length) await store.updateProfile(userId, patch);
    if (assignments !== null) await store.replaceMemberships(userId, assignments, membershipRole);
    await audit(store, {
      actor_label: admin.sub,
      actor_role: 'admin',
      action: 'merchant.updated',
      entity_type: 'profile',
      entity_id: userId,
      details: {
        ...(patch.status ? { status: patch.status } : {}),
        ...(assignments === null ? {} : { venue_ids: assignments })
      }
    });
    return json(res, 200, { ok: true });
  } catch (error) {
    return handleApiError(res, error);
  }
};
