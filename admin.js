const adminState = { dashboard: { stats: {}, venues: [], submissions: [], reviews: [] }, merchants: [], merchantsLoaded: false, activeView: 'overview' };

const loginView = document.querySelector('#admin-login');
const shell = document.querySelector('#admin-shell');
const editor = document.querySelector('#venue-editor');
const editorForm = document.querySelector('#venue-editor-form');
const merchantEditor = document.querySelector('#merchant-editor');
const merchantForm = document.querySelector('#merchant-editor-form');
const credentialsDialog = document.querySelector('#merchant-credentials');
const passwordPolicyPromise = import('/password-policy.mjs');
let visibleCredentials = null;
let toastTimer;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function toast(message) {
  const element = document.querySelector('#admin-toast');
  element.textContent = message;
  element.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('is-visible'), 3600);
}

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.message || 'Ошибка запроса'), { status: response.status, body });
  return body;
}

function setAuthenticated(value) {
  loginView.hidden = value;
  shell.hidden = !value;
}

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function merchantVenues(merchant) {
  if (Array.isArray(merchant.venues)) return merchant.venues;
  if (Array.isArray(merchant.memberships)) return merchant.memberships.map((membership) => membership.venue || adminState.dashboard.venues.find((venue) => venue.id === membership.venue_id)).filter(Boolean);
  if (Array.isArray(merchant.venue_ids)) return merchant.venue_ids.map((id) => adminState.dashboard.venues.find((venue) => venue.id === id)).filter(Boolean);
  return [];
}

function merchantVenueIds(merchant) {
  if (Array.isArray(merchant.memberships)) return merchant.memberships.map((membership) => membership.venue_id || membership.venue?.id).filter(Boolean);
  if (Array.isArray(merchant.venue_ids)) return merchant.venue_ids;
  return merchantVenues(merchant).map((venue) => venue.id).filter(Boolean);
}

function merchantLabel(merchant) {
  return merchant.display_name || merchant.displayName || merchant.name || merchant.username || merchant.email || 'Ресторатор';
}

function merchantId(merchant) {
  return merchant.id || merchant.user_id || merchant.userId;
}

function publicMerchantEmail(value) {
  const address = String(value || '');
  return /@accounts\.mesto\.guide$/i.test(address) ? '' : address;
}

function merchantStatusLabel(status) {
  return ({ active: 'Активен', suspended: 'Приостановлен', invited: 'Приглашён' })[status] || status || 'Активен';
}

function membershipRoleLabel(role) {
  return ({ owner: 'Владелец', manager: 'Управляющий', content_editor: 'Редактор контента', analyst: 'Аналитик' })[role] || 'Владелец';
}

function compactRow(item, type) {
  const title = type === 'venue' ? item.title : item.title || item.venue_title;
  const detail = type === 'venue' ? `${item.city} · ${item.category}` : `${item.city || item.venue_title} · ${item.status || 'pending'}`;
  return `<div class="compact-row"><i>${escapeHtml(title?.slice(0, 1) || 'М')}</i><span><b>${escapeHtml(title)}</b><small>${escapeHtml(detail)}</small></span><time>${formatDate(item.created_at || item.updated_at)}</time></div>`;
}

function renderOverview() {
  const { stats, venues, submissions } = adminState.dashboard;
  document.querySelector('#stat-venues').textContent = stats.venues || 0;
  document.querySelector('#stat-submissions').textContent = stats.pendingVenues || 0;
  document.querySelector('#stat-reviews').textContent = stats.pendingReviews || 0;
  document.querySelector('#stat-merchants').textContent = stats.merchants ?? adminState.merchants.length;
  document.querySelector('#stat-cities').textContent = stats.cities || 0;
  document.querySelector('#pending-badge').textContent = (stats.pendingVenues || 0) + (stats.pendingReviews || 0);
  const pending = submissions.filter((item) => item.status === 'pending').slice(0, 5);
  document.querySelector('#overview-submissions').innerHTML = pending.length ? pending.map((item) => compactRow(item, 'submission')).join('') : '<div class="empty-state">Новых заявок нет</div>';
  document.querySelector('#overview-venues').innerHTML = venues.length ? venues.slice(0, 5).map((item) => compactRow(item, 'venue')).join('') : '<div class="empty-state">Постоянный каталог пока пуст</div>';
}

function renderModeration() {
  const items = adminState.dashboard.submissions.filter((item) => item.status === 'pending');
  document.querySelector('#moderation-list').innerHTML = items.length ? items.map((item) => `<article class="moderation-card" data-submission-id="${escapeHtml(item.id)}"><div><p class="admin-eyebrow">${escapeHtml(item.city)} · ${escapeHtml(item.category)}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p><div class="data-chips"><span>${escapeHtml(item.contact_name)}</span><span>${escapeHtml(item.contact_email)}</span>${item.cuisine ? `<span>${escapeHtml(item.cuisine)}</span>` : ''}${item.address ? `<span>${escapeHtml(item.address)}</span>` : ''}<span>${formatDate(item.created_at)}</span></div></div><div class="moderation-actions"><button class="approve" type="button" data-moderate="approved">Одобрить</button><button class="reject" type="button" data-moderate="rejected">Отклонить</button></div></article>`).join('') : '<div class="empty-state">Все заявки обработаны</div>';
}

function renderVenues() {
  document.querySelector('#venues-table').innerHTML = adminState.dashboard.venues.length ? adminState.dashboard.venues.map((item) => `<tr data-venue-id="${escapeHtml(item.id)}"><td><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.address || item.description)}</small></td><td>${escapeHtml(item.city)}</td><td>${escapeHtml(item.category)}</td><td><span class="status-pill ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></td><td><div class="table-actions"><button type="button" data-edit-venue>Изменить</button><button class="danger" type="button" data-delete-venue>Удалить</button></div></td></tr>`).join('') : '<tr><td colspan="5"><div class="empty-state">Постоянных карточек пока нет</div></td></tr>';
}

function renderMerchants() {
  const table = document.querySelector('#merchants-table');
  const summary = document.querySelector('#merchant-summary');
  const active = adminState.merchants.filter((merchant) => merchant.status !== 'suspended').length;
  const assigned = new Set(adminState.merchants.flatMap((merchant) => merchantVenueIds(merchant))).size;
  summary.innerHTML = `<span><b>${adminState.merchants.length}</b> аккаунтов</span><span><b>${active}</b> с активным доступом</span><span><b>${assigned}</b> заведений назначено</span>`;
  table.innerHTML = adminState.merchants.length ? adminState.merchants.map((merchant) => {
    const id = merchantId(merchant);
    const status = merchant.status || 'active';
    const venues = merchantVenues(merchant);
    const login = merchant.username || merchant.login || '—';
    const email = publicMerchantEmail(merchant.email) || 'Внутренний аккаунт';
    const membershipRole = merchant.memberships?.[0]?.membership_role || 'owner';
    const venueMarkup = venues.length
      ? `<div class="merchant-venue-list">${venues.map((venue) => `<span title="${escapeHtml(venue.city || '')}">${escapeHtml(venue.title || venue.name || 'Заведение')}</span>`).join('')}</div>`
      : '<span class="merchant-no-venues">Не назначены</span>';
    const nextStatus = status === 'suspended' ? 'active' : 'suspended';
    const statusAction = status === 'suspended' ? 'Активировать' : 'Приостановить';
    return `<tr data-merchant-id="${escapeHtml(id)}"><td><div class="merchant-person"><i>${escapeHtml(merchantLabel(merchant).slice(0, 1).toUpperCase())}</i><span><strong>${escapeHtml(merchantLabel(merchant))}</strong><small>Создан ${formatDate(merchant.created_at)}</small></span></div></td><td><strong class="merchant-login">@${escapeHtml(login)}</strong><small>${escapeHtml(email)}</small><small class="merchant-role">${escapeHtml(membershipRoleLabel(membershipRole))}</small></td><td>${venueMarkup}</td><td><span class="status-pill merchant-status ${escapeHtml(status)}">${escapeHtml(merchantStatusLabel(status))}</span></td><td>${formatDate(merchant.last_login_at || merchant.last_sign_in_at)}</td><td><div class="table-actions merchant-actions"><button type="button" data-merchant-edit>Назначения</button><button type="button" data-merchant-status="${nextStatus}">${statusAction}</button><button type="button" data-merchant-reset>Новый пароль</button></div></td></tr>`;
  }).join('') : '<tr><td colspan="6"><div class="empty-state"><b>Рестораторов пока нет</b><span>Создайте первый аккаунт и назначьте ему заведение.</span></div></td></tr>';
  document.querySelector('#stat-merchants').textContent = adminState.dashboard.stats.merchants ?? adminState.merchants.length;
}

function renderReviews() {
  const items = adminState.dashboard.reviews.filter((item) => item.status === 'pending');
  document.querySelector('#reviews-list').innerHTML = items.length ? items.map((item) => `<article class="review-admin-card" data-review-id="${escapeHtml(item.id)}"><div><p class="admin-eyebrow">${escapeHtml(item.venue_title)}</p><h3>${escapeHtml(item.author_name)}</h3><div class="review-stars">${'★'.repeat(item.rating)}${'☆'.repeat(5 - item.rating)}</div><p>${escapeHtml(item.body)}</p></div><div class="review-actions"><button class="approve" type="button" data-review-decision="approved">Опубликовать</button><button class="reject" type="button" data-review-decision="rejected">Отклонить</button></div></article>`).join('') : '<div class="empty-state">Новых отзывов нет</div>';
}

function renderDashboard() {
  renderOverview(); renderModeration(); renderVenues(); renderReviews();
  if (adminState.merchantsLoaded) renderMerchants();
}

async function loadMerchants({ silent = false } = {}) {
  try {
    const data = await api('/api/admin/merchants');
    adminState.merchants = Array.isArray(data.merchants) ? data.merchants : Array.isArray(data.items) ? data.items : [];
    adminState.dashboard.stats.merchants = adminState.merchants.length;
    adminState.merchantsLoaded = true;
    renderMerchants();
  } catch (error) {
    if (error.status === 401) return setAuthenticated(false);
    adminState.merchantsLoaded = false;
    document.querySelector('#merchants-table').innerHTML = `<tr><td colspan="6"><div class="empty-state"><b>Не удалось загрузить рестораторов</b><span>${escapeHtml(error.message)}</span></div></td></tr>`;
    if (!silent) toast(error.message);
  }
}

async function loadDashboard() {
  try {
    const data = await api('/api/admin/dashboard');
    adminState.dashboard = data;
    document.querySelector('#setup-alert').hidden = data.databaseConfigured !== false;
    renderDashboard();
    await loadMerchants({ silent: true });
  } catch (error) {
    if (error.status === 401) return setAuthenticated(false);
    document.querySelector('#setup-alert').hidden = false;
    toast(error.message);
  }
}

const viewTitles = { overview: 'Добрый день', moderation: 'Модерация', venues: 'Каталог заведений', merchants: 'Рестораторы', reviews: 'Отзывы' };
function showView(view) {
  adminState.activeView = view;
  document.querySelectorAll('[data-admin-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.adminView === view));
  document.querySelectorAll('[data-view-panel]').forEach((panel) => { panel.hidden = panel.dataset.viewPanel !== view; panel.classList.toggle('is-active', panel.dataset.viewPanel === view); });
  document.querySelector('#admin-view-title').textContent = viewTitles[view] || 'Админ-панель';
  if (view === 'merchants' && !adminState.merchantsLoaded) loadMerchants();
}

function openVenueEditor(venue) {
  editorForm.reset();
  editorForm.elements.id.value = venue?.id || '';
  ['title', 'slug', 'city', 'category', 'cuisine', 'address', 'phone', 'website', 'hours', 'source', 'status', 'description'].forEach((name) => { if (venue?.[name] != null) editorForm.elements[name].value = venue[name]; });
  editorForm.elements.averageCheck.value = venue?.average_check || '';
  const features = Array.isArray(venue?.features) ? venue.features : [];
  editorForm.elements.editorChoice.value = features.some((item) => /выбор места/i.test(item)) ? '1' : '';
  editorForm.elements.features.value = features.filter((item) => !/выбор места/i.test(item)).join(', ');
  editorForm.elements.photos.value = Array.isArray(venue?.photos) ? venue.photos.join('\n') : '';
  document.querySelector('#venue-editor-title').textContent = venue ? 'Редактировать заведение' : 'Новое заведение';
  editor.showModal();
}

function renderMerchantVenueOptions(selectedIds = []) {
  const selected = new Set(selectedIds);
  const venues = [...adminState.dashboard.venues].sort((left, right) => `${left.city} ${left.title}`.localeCompare(`${right.city} ${right.title}`, 'ru'));
  document.querySelector('#merchant-venue-options').innerHTML = venues.length ? venues.map((venue) => `<label class="venue-option"><input type="checkbox" name="venueIds" value="${escapeHtml(venue.id)}" ${selected.has(venue.id) ? 'checked' : ''} /><span><b>${escapeHtml(venue.title)}</b><small>${escapeHtml(venue.city)} · ${escapeHtml(venue.category)}${venue.status !== 'published' ? ` · ${escapeHtml(venue.status)}` : ''}</small></span></label>`).join('') : '<div class="empty-state">Сначала добавьте хотя бы одно заведение в постоянный каталог.</div>';
}

function openMerchantEditor(merchant = null) {
  merchantForm.reset();
  const editing = Boolean(merchant);
  const id = editing ? merchantId(merchant) : '';
  merchantForm.elements.id.value = id;
  merchantForm.elements.name.value = editing ? merchantLabel(merchant) : '';
  merchantForm.elements.login.value = editing ? merchant.username || merchant.login || '' : '';
  merchantForm.elements.email.value = editing ? publicMerchantEmail(merchant.email) : '';
  merchantForm.elements.membershipRole.value = editing ? (merchant.memberships?.[0]?.membership_role || 'owner') : 'owner';
  merchantForm.elements.login.readOnly = editing;
  merchantForm.elements.email.readOnly = editing;
  document.querySelector('[data-password-field]').hidden = editing;
  document.querySelector('#merchant-editor-title').textContent = editing ? `Доступ: ${merchantLabel(merchant)}` : 'Новый ресторатор';
  document.querySelector('#merchant-editor-note').textContent = editing ? 'Измените имя владельца и список заведений, доступных в кабинете ресторатора.' : 'Укажите данные для входа и выберите заведения, доступные владельцу.';
  document.querySelector('#merchant-submit').textContent = editing ? 'Сохранить доступ' : 'Создать аккаунт';
  renderMerchantVenueOptions(editing ? merchantVenueIds(merchant) : []);
  merchantEditor.showModal();
}

function showCredentials(result, fallback = {}) {
  const merchant = result.merchant || fallback.merchant || {};
  const credentials = result.credentials || {};
  visibleCredentials = {
    name: merchantLabel({ ...fallback, ...merchant }),
    login: credentials.login || merchant.username || fallback.login || fallback.username || '—',
    email: publicMerchantEmail(credentials.email || merchant.email || fallback.email) || 'Не указан',
    password: credentials.password || credentials.temporaryPassword || result.password || '—'
  };
  document.querySelector('#credential-name').textContent = visibleCredentials.name;
  document.querySelector('#credential-login').textContent = visibleCredentials.login;
  document.querySelector('#credential-email').textContent = visibleCredentials.email;
  document.querySelector('#credential-password').textContent = visibleCredentials.password;
  if (credentialsDialog.open) credentialsDialog.close();
  credentialsDialog.showModal();
}

function closeCredentials() {
  if (credentialsDialog.open) credentialsDialog.close();
  visibleCredentials = null;
  document.querySelector('#credential-password').textContent = '—';
}

async function copyCredentials() {
  if (!visibleCredentials) return;
  const message = [`Кабинет ресторатора «Место»`, `Имя: ${visibleCredentials.name}`, `Логин: ${visibleCredentials.login}`, `E-mail: ${visibleCredentials.email}`, `Временный пароль: ${visibleCredentials.password}`, `Войти: ${window.location.origin}/merchant`].join('\n');
  try {
    await navigator.clipboard.writeText(message);
  } catch {
    const input = document.createElement('textarea');
    input.value = message;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.append(input);
    input.select();
    document.execCommand('copy');
    input.remove();
  }
  toast('Данные для входа скопированы');
}

async function moderateSubmission(id, decision) {
  const note = decision === 'rejected' ? window.prompt('Причина отказа:', '') : '';
  if (decision === 'rejected' && note === null) return;
  await api('/api/admin/submissions', { method: 'PATCH', body: JSON.stringify({ id, decision, note }) });
  toast(decision === 'approved' ? 'Заявка одобрена и опубликована' : 'Заявка отклонена');
  await loadDashboard();
}

async function moderateReview(id, decision) {
  const note = decision === 'rejected' ? window.prompt('Причина отказа:', '') : '';
  if (decision === 'rejected' && note === null) return;
  await api('/api/admin/reviews', { method: 'PATCH', body: JSON.stringify({ id, decision, note }) });
  toast(decision === 'approved' ? 'Отзыв опубликован' : 'Отзыв отклонён');
  await loadDashboard();
}

const adminLoginForm = document.querySelector('#admin-login-form');

adminLoginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const errorBox = document.querySelector('#login-error');
  errorBox.textContent = '';
  try {
    await api('/api/admin/login', { method: 'POST', body: JSON.stringify(data) });
    adminLoginForm.reset();
    setAuthenticated(true);
    await loadDashboard();
  }
  catch (error) { errorBox.textContent = error.message; }
});
document.querySelectorAll('[data-admin-logout]').forEach((button) => button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    await api('/api/admin/logout', { method: 'POST', body: '{}' });
    adminLoginForm.reset();
    document.querySelector('#login-error').textContent = '';
    setAuthenticated(false);
  } catch (error) {
    toast(error.message || 'Не удалось выйти. Попробуйте ещё раз.');
  } finally {
    button.disabled = false;
  }
}));
document.querySelector('#refresh-dashboard').addEventListener('click', loadDashboard);
document.querySelectorAll('[data-admin-view]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.adminView)));
document.querySelectorAll('[data-new-venue]').forEach((button) => button.addEventListener('click', () => openVenueEditor()));
document.querySelectorAll('[data-new-merchant]').forEach((button) => button.addEventListener('click', () => openMerchantEditor()));
editor.querySelector('.dialog-close').addEventListener('click', () => editor.close());
document.querySelector('[data-editor-cancel]').addEventListener('click', () => editor.close());
merchantEditor.querySelector('.dialog-close').addEventListener('click', () => merchantEditor.close());
document.querySelector('[data-merchant-cancel]').addEventListener('click', () => merchantEditor.close());
credentialsDialog.querySelector('.dialog-close').addEventListener('click', closeCredentials);
document.querySelector('[data-credentials-close]').addEventListener('click', closeCredentials);
document.querySelector('[data-copy-credentials]').addEventListener('click', () => copyCredentials().catch(() => toast('Не удалось скопировать данные')));
credentialsDialog.addEventListener('close', () => { visibleCredentials = null; document.querySelector('#credential-password').textContent = '—'; });

document.querySelector('#moderation-list').addEventListener('click', (event) => { const button = event.target.closest('[data-moderate]'); const card = button?.closest('[data-submission-id]'); if (button && card) moderateSubmission(card.dataset.submissionId, button.dataset.moderate).catch((error) => toast(error.message)); });
document.querySelector('#reviews-list').addEventListener('click', (event) => { const button = event.target.closest('[data-review-decision]'); const card = button?.closest('[data-review-id]'); if (button && card) moderateReview(card.dataset.reviewId, button.dataset.reviewDecision).catch((error) => toast(error.message)); });
document.querySelector('#venues-table').addEventListener('click', async (event) => {
  const row = event.target.closest('[data-venue-id]'); if (!row) return;
  const venue = adminState.dashboard.venues.find((item) => item.id === row.dataset.venueId); if (!venue) return;
  if (event.target.closest('[data-edit-venue]')) openVenueEditor(venue);
  if (event.target.closest('[data-delete-venue]') && window.confirm(`Удалить «${venue.title}»?`)) { try { await api('/api/admin/venues', { method: 'DELETE', body: JSON.stringify({ id: venue.id }) }); toast('Карточка удалена'); await loadDashboard(); } catch (error) { toast(error.message); } }
});
document.querySelector('#merchants-table').addEventListener('click', async (event) => {
  const row = event.target.closest('[data-merchant-id]');
  const button = event.target.closest('button');
  if (!row || !button) return;
  const merchant = adminState.merchants.find((item) => merchantId(item) === row.dataset.merchantId);
  if (!merchant) return;
  if (button.matches('[data-merchant-edit]')) return openMerchantEditor(merchant);
  button.disabled = true;
  try {
    if (button.matches('[data-merchant-status]')) {
      const status = button.dataset.merchantStatus;
      const action = status === 'suspended' ? 'приостановить' : 'активировать';
      if (!window.confirm(`Вы уверены, что хотите ${action} доступ для «${merchantLabel(merchant)}»?`)) return;
      await api('/api/admin/merchants', { method: 'PATCH', body: JSON.stringify({ userId: merchantId(merchant), status }) });
      toast(status === 'suspended' ? 'Доступ ресторатора приостановлен' : 'Доступ ресторатора активирован');
      await loadMerchants();
    }
    if (button.matches('[data-merchant-reset]')) {
      if (!window.confirm(`Создать новый временный пароль для «${merchantLabel(merchant)}»? Старый пароль перестанет работать.`)) return;
      const result = await api('/api/admin/merchants', { method: 'PATCH', body: JSON.stringify({ userId: merchantId(merchant), action: 'reset-password' }) });
      showCredentials(result, { merchant, name: merchantLabel(merchant), login: merchant.username, email: merchant.email });
      toast('Новый временный пароль создан');
    }
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
});
editorForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  data.features = String(data.features || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (data.editorChoice === '1') data.features.unshift('Выбор Места');
  delete data.editorChoice;
  data.photos = String(data.photos || '').split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
  try { await api('/api/admin/venues', { method: data.id ? 'PATCH' : 'POST', body: JSON.stringify(data) }); editor.close(); toast('Карточка сохранена'); await loadDashboard(); } catch (error) { toast(error.message); }
});
merchantForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const passwordPolicy = await passwordPolicyPromise;
  const formData = new FormData(event.currentTarget);
  const id = String(formData.get('id') || '');
  const displayName = String(formData.get('name') || '').trim();
  const venueIds = formData.getAll('venueIds').map(String);
  const membershipRole = String(formData.get('membershipRole') || 'owner');
  const submit = document.querySelector('#merchant-submit');
  submit.disabled = true;
  try {
    if (id) {
      await api('/api/admin/merchants', { method: 'PATCH', body: JSON.stringify({ userId: id, displayName, venueIds, membershipRole }) });
      merchantEditor.close();
      toast('Доступ ресторатора обновлён');
    } else {
      const username = String(formData.get('login') || '').trim().toLowerCase();
      const email = String(formData.get('email') || '').trim().toLowerCase();
      const password = String(formData.get('password') || '');
      if (password && !passwordPolicy.isStrongPassword(password)) {
        toast(passwordPolicy.TEMPORARY_PASSWORD_ERROR_MESSAGE);
        return;
      }
      const payload = { displayName, username, venueIds, membershipRole };
      if (email) payload.email = email;
      if (password) payload.password = password;
      const result = await api('/api/admin/merchants', { method: 'POST', body: JSON.stringify(payload) });
      merchantEditor.close();
      showCredentials(result, { name: displayName, login: username, email });
      toast('Аккаунт ресторатора создан');
    }
    await loadMerchants();
  } catch (error) {
    toast(error.message);
  } finally {
    submit.disabled = false;
  }
});
(async function boot() {
  try {
    const passwordPolicy = await passwordPolicyPromise;
    const passwordInput = merchantForm.elements.password;
    passwordInput.minLength = passwordPolicy.PASSWORD_MIN_LENGTH;
    passwordInput.pattern = passwordPolicy.PASSWORD_PATTERN;
    passwordInput.title = passwordPolicy.TEMPORARY_PASSWORD_ERROR_MESSAGE;
    document.querySelector('[data-password-hint]').textContent = passwordPolicy.TEMPORARY_PASSWORD_HINT;
    await api('/api/admin/session'); setAuthenticated(true); await loadDashboard();
  }
  catch { setAuthenticated(false); }
})();
