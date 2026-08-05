(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const viewMeta = {
    overview: ['Рабочее пространство', 'Добрый день'],
    venue: ['Публичная карточка', 'О заведении'],
    menu: ['Кухня заведения', 'Меню'],
    promotions: ['Предложения для гостей', 'Акции'],
    reviews: ['Мнение гостей', 'Отзывы']
  };

  const statusLabels = {
    published: 'Опубликовано',
    draft: 'Черновик',
    archived: 'В архиве'
  };

  const promotionLabels = {
    draft: 'Черновик',
    active: 'Активна',
    archived: 'Архив'
  };

  const permissionLabels = {
    venue: 'Редактирование карточки',
    menu: 'Управление меню',
    promotions: 'Управление акциями',
    reviews: 'Просмотр отзывов',
    analytics: 'Просмотр статистики'
  };

  const state = {
    user: null,
    workspace: null,
    activeVenueId: '',
    activeView: 'overview',
    confirmResolve: null,
    toastTimer: null
  };

  const loginView = $('#merchant-login');
  const appView = $('#merchant-app');
  const loginForm = $('#merchant-login-form');
  const loginMessage = $('#login-message');
  const loadingScreen = $('#loading-screen');
  const toastElement = $('#merchant-toast');
  const menuDialog = $('#menu-dialog');
  const promotionDialog = $('#promotion-dialog');
  const passwordDialog = $('#password-dialog');
  const confirmDialog = $('#confirm-dialog');
  let sidebarReturnFocus = null;

  function readableMessage(message, fallback) {
    const value = String(message || '').trim();
    if (!value || /(?:Р.|С.){4}/.test(value)) return fallback;
    return value;
  }

  async function api(url, options = {}) {
    const requestOptions = {
      credentials: 'same-origin',
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    };
    const response = await fetch(url, requestOptions);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || `Ошибка ${response.status}`);
      error.status = response.status;
      error.code = data.code || '';
      error.payload = data;
      if (response.status === 401 && !appView.hidden) showLogin('Сессия завершена. Войдите снова.');
      throw error;
    }
    return data;
  }

  function jsonBody(value) {
    return JSON.stringify(value);
  }

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch { /* Private browsing can disable storage. */ }
  }

  function storageRemove(key) {
    try { localStorage.removeItem(key); } catch { /* The session remains valid without persistence. */ }
  }

  function setButtonBusy(button, busy, busyText = 'Сохраняем…') {
    if (!button) return;
    if (busy) {
      button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.textContent = busyText;
    } else {
      button.disabled = false;
      if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
  }

  function setLoading(visible) {
    loadingScreen.hidden = !visible;
  }

  function toast(message, type = 'success') {
    clearTimeout(state.toastTimer);
    toastElement.textContent = message;
    toastElement.classList.toggle('is-error', type === 'error');
    toastElement.classList.add('is-visible');
    state.toastTimer = window.setTimeout(() => toastElement.classList.remove('is-visible'), 3300);
  }

  function initials(value) {
    const parts = String(value || 'М').trim().split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'М';
  }

  function safeImage(value) {
    if (!value) return '';
    try {
      const url = new URL(String(value), window.location.origin);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

  function setCover(element, image) {
    const url = safeImage(image);
    element.style.backgroundImage = url
      ? `linear-gradient(135deg, rgba(11,29,44,.14), rgba(11,29,44,.34)), url("${url.replace(/["\\\n\r]/g, '')}")`
      : '';
  }

  function formatMoney(value) {
    if (value === '' || value == null || Number.isNaN(Number(value))) return 'Цена не указана';
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(value))} ₽`;
  }

  function formatDate(value, options = {}) {
    if (!value) return 'Не указано';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Не указано';
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', ...options }).format(date);
  }

  function promotionIsLive(item) {
    const now = Date.now();
    const starts = item.starts_at ? new Date(item.starts_at).getTime() : null;
    const ends = item.ends_at ? new Date(item.ends_at).getTime() : null;
    return item.status === 'active' && (!starts || starts <= now) && (!ends || ends >= now);
  }

  function toLocalInput(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  }

  function plural(number, forms) {
    const value = Math.abs(Number(number)) % 100;
    const last = value % 10;
    if (value > 10 && value < 20) return `${number} ${forms[2]}`;
    if (last > 1 && last < 5) return `${number} ${forms[1]}`;
    if (last === 1) return `${number} ${forms[0]}`;
    return `${number} ${forms[2]}`;
  }

  function stars(rating) {
    const rounded = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    return `${'★'.repeat(rounded)}${'☆'.repeat(5 - rounded)}`;
  }

  function emptyState(icon, title, copy, action = '') {
    const wrapper = document.createElement('div');
    wrapper.className = 'empty-list';
    const iconWrap = document.createElement('span');
    iconWrap.innerHTML = `<svg aria-hidden="true"><use href="#icon-${icon}"></use></svg>`;
    const heading = document.createElement('h3');
    heading.textContent = title;
    const paragraph = document.createElement('p');
    paragraph.textContent = copy;
    wrapper.append(iconWrap, heading, paragraph);
    if (action) {
      const button = document.createElement('button');
      button.className = 'button button--primary';
      button.type = 'button';
      button.textContent = action;
      if (icon === 'menu') button.dataset.newMenu = '';
      if (icon === 'tag') button.dataset.newPromotion = '';
      wrapper.append(button);
    }
    return wrapper;
  }

  function activeVenue() {
    return state.workspace?.venues?.find((venue) => venue.id === state.activeVenueId) || null;
  }

  function activeItems(key) {
    return (state.workspace?.[key] || []).filter((item) => item.venue_id === state.activeVenueId);
  }

  function activePermissions() {
    const membership = state.workspace?.memberships?.find((item) => item.venue_id === state.activeVenueId);
    if (membership?.membership_role === 'analyst') return ['reviews', 'analytics'];
    if (membership?.membership_role === 'content_editor') return ['venue', 'menu', 'promotions'];
    if (!membership?.membership_role || ['owner', 'manager'].includes(membership.membership_role)) return ['venue', 'menu', 'promotions', 'reviews', 'analytics'];
    return [];
  }

  function applyPermissionState() {
    const permissions = new Set(activePermissions());
    const viewPermission = { venue: 'venue', menu: 'menu', promotions: 'promotions', reviews: 'reviews' };
    Object.entries(viewPermission).forEach(([view, permission]) => {
      $$(`[data-merchant-view="${view}"]`).forEach((button) => { button.hidden = !permissions.has(permission); });
    });
    $$('[data-new-menu]').forEach((button) => { button.hidden = !permissions.has('menu'); });
    $$('[data-new-promotion]').forEach((button) => { button.hidden = !permissions.has('promotions'); });
    if (viewPermission[state.activeView] && !permissions.has(viewPermission[state.activeView])) state.activeView = 'overview';
  }

  function showLogin(message = '') {
    state.user = null;
    state.workspace = null;
    state.activeVenueId = '';
    appView.hidden = true;
    loginView.hidden = false;
    loginMessage.textContent = message;
    document.title = 'Место — кабинет ресторатора';
    window.setTimeout(() => loginForm.elements.login?.focus(), 80);
  }

  function showApp(user) {
    state.user = user;
    loginView.hidden = true;
    appView.hidden = false;
    $('#sidebar-user-name').textContent = user.name || user.username || 'Ресторатор';
    $('#sidebar-user-email').textContent = user.email || '';
    $('#sidebar-avatar').textContent = initials(user.name || user.username || user.email);
    $('#password-alert').hidden = !user.mustChangePassword;
    document.title = 'Место — кабинет ресторатора';
  }

  async function initialize() {
    bindEvents();
    setLoading(true);
    try {
      const session = await api('/api/auth/session');
      if (!session.authenticated || session.user?.role !== 'merchant') {
        showLogin(session.authenticated ? 'Этот аккаунт не имеет доступа к кабинету ресторатора.' : '');
        return;
      }
      showApp(session.user);
      await loadWorkspace({ quiet: true });
      if (session.user.mustChangePassword) openPasswordDialog(true);
    } catch (error) {
      if (error.status === 403) {
        showLogin('Этот аккаунт не имеет доступа к кабинету ресторатора.');
      } else if (error.status && error.status !== 401) {
        showLogin('Сервис временно недоступен. Попробуйте обновить страницу.');
      } else {
        showLogin();
      }
    } finally {
      setLoading(false);
    }
  }

  async function login(event) {
    event.preventDefault();
    loginMessage.textContent = '';
    const submit = loginForm.querySelector('[type="submit"]');
    const loginValue = loginForm.elements.login.value.trim();
    const password = loginForm.elements.password.value;
    if (!loginValue || !password) {
      loginMessage.textContent = 'Введите логин и пароль.';
      return;
    }
    setButtonBusy(submit, true, 'Проверяем доступ…');
    try {
      const result = await api('/api/auth/login', {
        method: 'POST',
        body: jsonBody({ login: loginValue, password })
      });
      if (result.user?.role !== 'merchant') {
        await api('/api/auth/logout', { method: 'POST' }).catch(() => null);
        throw Object.assign(new Error('Кабинет доступен только назначенным рестораторам.'), { status: 403 });
      }
      loginForm.reset();
      showApp(result.user);
      setLoading(true);
      await loadWorkspace({ quiet: true });
      if (result.user.mustChangePassword) openPasswordDialog(true);
      toast('Вы вошли в кабинет ресторатора.');
    } catch (error) {
      loginMessage.textContent = error.status === 401
        ? 'Неверный логин или пароль.'
        : readableMessage(error.message, 'Не удалось выполнить вход. Попробуйте ещё раз.');
    } finally {
      setLoading(false);
      setButtonBusy(submit, false);
    }
  }

  async function logout() {
    const button = $('#merchant-logout');
    button.disabled = true;
    try {
      await api('/api/auth/logout', { method: 'POST' });
      storageRemove('mesto-merchant-venue');
      closeSidebar();
      showLogin();
      toast('Вы вышли из кабинета.');
    } catch (error) {
      toast(readableMessage(error.message, 'Не удалось завершить сеанс. Проверьте соединение и повторите выход.'), 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function loadWorkspace({ quiet = false } = {}) {
    if (!quiet) setLoading(true);
    try {
      const data = await api('/api/merchant/dashboard');
      state.workspace = {
        ...data,
        venues: Array.isArray(data.venues) ? data.venues : [],
        memberships: Array.isArray(data.memberships) ? data.memberships : [],
        menu: Array.isArray(data.menu) ? data.menu : [],
        promotions: Array.isArray(data.promotions) ? data.promotions : [],
        reviews: Array.isArray(data.reviews) ? data.reviews : []
      };
      if (data.user) {
        state.user = data.user;
        showApp(data.user);
      }
      const remembered = storageGet('mesto-merchant-venue');
      const hasRemembered = state.workspace.venues.some((venue) => venue.id === remembered);
      state.activeVenueId = hasRemembered ? remembered : (state.workspace.venues[0]?.id || '');
      renderWorkspace();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        showLogin(error.status === 403 ? 'Этот аккаунт не имеет доступа к кабинету ресторатора.' : 'Сессия завершена. Войдите снова.');
        throw error;
      }
      toast(readableMessage(error.message, 'Не удалось загрузить кабинет.'), 'error');
      throw error;
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  function renderWorkspace() {
    const venues = state.workspace.venues;
    const hasVenues = venues.length > 0;
    $('#workspace-empty').hidden = hasVenues;
    $('#view-stack').hidden = !hasVenues;
    $('#venue-switcher-wrap').hidden = !hasVenues;
    const switcher = $('#venue-switcher');
    switcher.replaceChildren(...venues.map((venue) => {
      const option = document.createElement('option');
      option.value = venue.id;
      option.textContent = venue.title;
      option.selected = venue.id === state.activeVenueId;
      return option;
    }));
    if (!hasVenues) return;

    applyPermissionState();
    renderOverview();
    renderVenueEditor();
    renderMenu();
    renderPromotions();
    renderReviews();
    setView(state.activeView, false);
  }

  function renderOverview() {
    const venue = activeVenue();
    const menu = activeItems('menu');
    const promotions = activeItems('promotions');
    const reviews = activeItems('reviews');
    $('#stat-venues').textContent = String(state.workspace.venues.length);
    $('#stat-menu').textContent = String(menu.length);
    $('#stat-promotions').textContent = String(promotions.filter(promotionIsLive).length);
    $('#stat-reviews').textContent = String(reviews.length);
    $('#menu-nav-count').textContent = String(menu.length);
    $('#promotions-nav-count').textContent = String(promotions.filter(promotionIsLive).length);
    $('#reviews-nav-count').textContent = String(reviews.length);

    const spotlightImage = $('#venue-spotlight-image');
    setCover(spotlightImage, venue.photos?.[0]);
    const status = $('#venue-status');
    status.textContent = statusLabels[venue.status] || venue.status || 'Карточка';
    status.className = `status-badge ${venue.status === 'draft' ? 'is-draft' : venue.status === 'archived' ? 'is-archived' : ''}`.trim();
    $('#venue-spotlight-title').textContent = venue.title;
    $('#venue-spotlight-meta').textContent = [venue.category, venue.cuisine, venue.city].filter(Boolean).join(' · ');
    $('#venue-spotlight-description').textContent = venue.description || 'Добавьте короткое описание, чтобы гости лучше почувствовали характер заведения.';
    const features = $('#venue-spotlight-features');
    const values = Array.isArray(venue.features) ? venue.features.slice(0, 5) : [];
    features.replaceChildren(...values.map((feature) => {
      const chip = document.createElement('span');
      chip.textContent = feature;
      return chip;
    }));

    const overviewReviews = $('#overview-reviews');
    if (!reviews.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state-inline';
      empty.textContent = 'Опубликованных отзывов пока нет.';
      overviewReviews.replaceChildren(empty);
      return;
    }
    overviewReviews.replaceChildren(...reviews.slice(0, 3).map((review) => {
      const row = document.createElement('article');
      row.className = 'recent-review';
      const avatar = document.createElement('span');
      avatar.className = 'review-avatar';
      avatar.textContent = initials(review.author_name);
      const copy = document.createElement('p');
      const name = document.createElement('b');
      name.textContent = review.author_name || 'Гость';
      const body = document.createElement('span');
      body.textContent = review.body || '';
      copy.append(name, body);
      const rating = document.createElement('span');
      rating.className = 'stars';
      rating.textContent = stars(review.rating);
      row.append(avatar, copy, rating);
      return row;
    }));
  }

  function renderVenueEditor() {
    const venue = activeVenue();
    const form = $('#venue-form');
    form.elements.id.value = venue.id;
    form.elements.title.value = venue.title || '';
    form.elements.category.value = venue.category || '';
    form.elements.cuisine.value = venue.cuisine || '';
    form.elements.description.value = venue.description || '';
    form.elements.address.value = venue.address || '';
    form.elements.phone.value = venue.phone || '';
    form.elements.website.value = venue.website || '';
    form.elements.hours.value = venue.hours || '';
    form.elements.averageCheck.value = venue.average_check || '';
    form.elements.features.value = Array.isArray(venue.features) ? venue.features.join(', ') : '';
    $('#venue-editor-name').textContent = venue.title;
    $('#venue-editor-category').textContent = [venue.category, venue.city].filter(Boolean).join(' · ');
    $('#venue-editor-monogram').textContent = initials(venue.title);
    setCover($('#venue-editor-cover'), venue.photos?.[0]);
    updateCharacterCount(form.elements.description);

    const permissions = activePermissions();
    $('#venue-permissions').replaceChildren(...permissions.map((permission) => {
      const item = document.createElement('span');
      item.textContent = permissionLabels[permission] || permission;
      return item;
    }));
  }

  async function saveVenue(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    const message = $('#venue-form-message');
    message.textContent = '';
    if (!form.reportValidity()) return;
    const features = form.elements.features.value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 20);
    const payload = {
      id: form.elements.id.value,
      title: form.elements.title.value.trim(),
      cuisine: form.elements.cuisine.value.trim(),
      description: form.elements.description.value.trim(),
      address: form.elements.address.value.trim(),
      phone: form.elements.phone.value.trim(),
      website: form.elements.website.value.trim(),
      hours: form.elements.hours.value.trim(),
      averageCheck: form.elements.averageCheck.value.trim(),
      features
    };
    setButtonBusy(submit, true);
    try {
      await api('/api/merchant/venue', { method: 'PATCH', body: jsonBody(payload) });
      $('#venue-save-state').classList.add('is-saved');
      $('#venue-save-state').innerHTML = '<i></i> Изменения сохранены';
      await loadWorkspace({ quiet: true });
      toast('Карточка заведения обновлена.');
    } catch (error) {
      message.textContent = readableMessage(error.message, 'Не удалось сохранить карточку. Проверьте заполнение полей.');
    } finally {
      setButtonBusy(submit, false);
    }
  }

  function updateCharacterCount(input) {
    const counter = document.querySelector(`[data-count-for="${input.name}"]`);
    if (counter) counter.textContent = String(input.value.length);
  }

  function renderMenu() {
    const allItems = activeItems('menu');
    const search = $('#menu-search').value.trim().toLowerCase();
    const chosenSection = $('#menu-section-filter').value;
    const sections = [...new Set(allItems.map((item) => item.section).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
    const sectionSelect = $('#menu-section-filter');
    const previousSection = sections.includes(chosenSection) ? chosenSection : '';
    sectionSelect.replaceChildren(new Option('Все разделы', ''), ...sections.map((section) => new Option(section, section)));
    sectionSelect.value = previousSection;
    const items = allItems.filter((item) => {
      const matchesSection = !previousSection || item.section === previousSection;
      const haystack = `${item.title || ''} ${item.description || ''} ${item.section || ''}`.toLowerCase();
      return matchesSection && (!search || haystack.includes(search));
    });
    $('#menu-summary').textContent = plural(items.length, ['позиция', 'позиции', 'позиций']);
    const list = $('#menu-list');
    if (!items.length) {
      list.replaceChildren(emptyState('menu', search || previousSection ? 'Ничего не найдено' : 'Меню пока пусто', search || previousSection ? 'Измените фильтр или поисковый запрос.' : 'Добавьте первую позицию — например, фирменное блюдо или напиток.', search || previousSection ? '' : 'Добавить позицию'));
      return;
    }
    list.replaceChildren(...items.map(menuItemNode));
  }

  function menuItemNode(item) {
    const card = document.createElement('article');
    card.className = 'menu-item';
    const image = document.createElement('div');
    image.className = 'menu-item__image';
    const imageUrl = safeImage(item.photo_url);
    if (imageUrl) {
      const picture = document.createElement('img');
      picture.src = imageUrl;
      picture.alt = '';
      picture.loading = 'lazy';
      picture.addEventListener('error', () => { picture.remove(); image.textContent = initials(item.title); }, { once: true });
      image.append(picture);
    } else {
      image.textContent = initials(item.title);
    }
    const copy = document.createElement('div');
    copy.className = 'menu-item__copy';
    const section = document.createElement('p');
    section.textContent = item.section || 'Основное меню';
    const title = document.createElement('h3');
    title.textContent = item.title;
    const description = document.createElement('span');
    description.textContent = item.description || 'Описание не добавлено';
    copy.append(section, title, description);
    const price = document.createElement('b');
    price.className = 'menu-item__price';
    price.textContent = formatMoney(item.price);
    const available = document.createElement('span');
    available.className = `availability ${item.is_available ? '' : 'is-hidden'}`.trim();
    available.textContent = item.is_available ? 'Доступно' : 'Скрыто';
    const actions = rowActions('menu', item.id, item.title);
    card.append(image, copy, price, available, actions);
    return card;
  }

  function rowActions(type, id, title) {
    const actions = document.createElement('div');
    actions.className = 'row-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.dataset.edit = type;
    edit.dataset.id = id;
    edit.title = `Редактировать «${title}»`;
    edit.setAttribute('aria-label', edit.title);
    edit.innerHTML = '<svg aria-hidden="true"><use href="#icon-edit"></use></svg>';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.dataset.delete = type;
    remove.dataset.id = id;
    remove.title = `Удалить «${title}»`;
    remove.setAttribute('aria-label', remove.title);
    remove.innerHTML = '<svg aria-hidden="true"><use href="#icon-trash"></use></svg>';
    actions.append(edit, remove);
    return actions;
  }

  function openMenuDialog(item = null) {
    if (!activeVenue()) return toast('Сначала выберите заведение.', 'error');
    const form = $('#menu-form');
    form.reset();
    form.elements.id.value = item?.id || '';
    form.elements.section.value = item?.section || 'Основное меню';
    form.elements.title.value = item?.title || '';
    form.elements.description.value = item?.description || '';
    form.elements.price.value = item?.price ?? '';
    form.elements.sortOrder.value = item?.sort_order ?? 0;
    form.elements.photoUrl.value = item?.photo_url || '';
    form.elements.isAvailable.checked = item ? Boolean(item.is_available) : true;
    $('#menu-dialog-title').textContent = item ? 'Редактировать позицию' : 'Новая позиция';
    $('#menu-form-message').textContent = '';
    openDialog(menuDialog);
    window.setTimeout(() => form.elements.title.focus(), 60);
  }

  async function saveMenuItem(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const submit = form.querySelector('[type="submit"]');
    const id = form.elements.id.value;
    const payload = {
      id: id || undefined,
      venueId: state.activeVenueId,
      section: form.elements.section.value.trim(),
      title: form.elements.title.value.trim(),
      description: form.elements.description.value.trim(),
      price: form.elements.price.value,
      photoUrl: form.elements.photoUrl.value.trim(),
      isAvailable: form.elements.isAvailable.checked,
      sortOrder: Number(form.elements.sortOrder.value || 0)
    };
    setButtonBusy(submit, true);
    try {
      await api('/api/merchant/menu', { method: id ? 'PATCH' : 'POST', body: jsonBody(payload) });
      closeDialog(menuDialog);
      await loadWorkspace({ quiet: true });
      toast(id ? 'Позиция меню обновлена.' : 'Позиция добавлена в меню.');
    } catch (error) {
      $('#menu-form-message').textContent = readableMessage(error.message, 'Не удалось сохранить позицию. Проверьте данные.');
    } finally {
      setButtonBusy(submit, false);
    }
  }

  function renderPromotions() {
    const promotions = activeItems('promotions');
    const list = $('#promotion-list');
    if (!promotions.length) {
      list.replaceChildren(emptyState('tag', 'Акций пока нет', 'Создайте предложение, укажите срок и опубликуйте его для гостей.', 'Создать акцию'));
      return;
    }
    list.replaceChildren(...promotions.map((item) => {
      const card = document.createElement('article');
      card.className = 'promotion-card';
      const top = document.createElement('div');
      top.className = 'promotion-card__top';
      const status = document.createElement('span');
      status.className = `promotion-status ${item.status || 'draft'}`;
      status.textContent = promotionLabels[item.status] || 'Черновик';
      top.append(status, rowActions('promotion', item.id, item.title));
      const title = document.createElement('h3');
      title.textContent = item.title;
      const description = document.createElement('p');
      description.textContent = item.description || 'Описание акции не добавлено.';
      const dates = document.createElement('div');
      dates.className = 'promotion-dates';
      const start = document.createElement('span');
      start.innerHTML = '<svg aria-hidden="true"><use href="#icon-clock"></use></svg>';
      start.append(document.createTextNode(`с ${formatDate(item.starts_at)}`));
      const end = document.createElement('span');
      end.innerHTML = '<svg aria-hidden="true"><use href="#icon-clock"></use></svg>';
      end.append(document.createTextNode(`до ${formatDate(item.ends_at)}`));
      dates.append(start, end);
      card.append(top, title, description, dates);
      return card;
    }));
  }

  function openPromotionDialog(item = null) {
    if (!activeVenue()) return toast('Сначала выберите заведение.', 'error');
    const form = $('#promotion-form');
    form.reset();
    form.elements.id.value = item?.id || '';
    form.elements.title.value = item?.title || '';
    form.elements.description.value = item?.description || '';
    form.elements.startsAt.value = toLocalInput(item?.starts_at);
    form.elements.endsAt.value = toLocalInput(item?.ends_at);
    form.elements.status.value = item?.status || 'draft';
    $('#promotion-dialog-title').textContent = item ? 'Редактировать акцию' : 'Новая акция';
    $('#promotion-form-message').textContent = '';
    openDialog(promotionDialog);
    window.setTimeout(() => form.elements.title.focus(), 60);
  }

  async function savePromotion(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const startValue = form.elements.startsAt.value;
    const endValue = form.elements.endsAt.value;
    if (startValue && endValue && new Date(endValue) < new Date(startValue)) {
      $('#promotion-form-message').textContent = 'Дата завершения не может быть раньше даты начала.';
      return;
    }
    const submit = form.querySelector('[type="submit"]');
    const id = form.elements.id.value;
    const payload = {
      id: id || undefined,
      venueId: state.activeVenueId,
      title: form.elements.title.value.trim(),
      description: form.elements.description.value.trim(),
      startsAt: startValue ? new Date(startValue).toISOString() : null,
      endsAt: endValue ? new Date(endValue).toISOString() : null,
      status: form.elements.status.value
    };
    setButtonBusy(submit, true);
    try {
      await api('/api/merchant/promotions', { method: id ? 'PATCH' : 'POST', body: jsonBody(payload) });
      closeDialog(promotionDialog);
      await loadWorkspace({ quiet: true });
      toast(id ? 'Акция обновлена.' : 'Акция создана.');
    } catch (error) {
      $('#promotion-form-message').textContent = readableMessage(error.message, 'Не удалось сохранить акцию. Проверьте данные.');
    } finally {
      setButtonBusy(submit, false);
    }
  }

  function renderReviews() {
    const reviews = activeItems('reviews');
    const summary = $('#reviews-summary');
    const list = $('#reviews-list');
    if (!reviews.length) {
      summary.hidden = true;
      list.replaceChildren(emptyState('star', 'Отзывов пока нет', 'Здесь появятся опубликованные редакцией отзывы гостей.'));
      return;
    }
    summary.hidden = false;
    const average = reviews.reduce((total, item) => total + Number(item.rating || 0), 0) / reviews.length;
    const ratingTotal = document.createElement('div');
    ratingTotal.className = 'rating-total';
    const averageNode = document.createElement('b');
    averageNode.textContent = average.toFixed(1);
    const totalCopy = document.createElement('p');
    const starNode = document.createElement('span');
    starNode.className = 'stars';
    starNode.textContent = stars(average);
    const total = document.createElement('small');
    total.textContent = plural(reviews.length, ['отзыв', 'отзыва', 'отзывов']);
    totalCopy.append(starNode, total);
    ratingTotal.append(averageNode, totalCopy);
    const bars = document.createElement('div');
    bars.className = 'rating-bars';
    for (let rating = 5; rating >= 1; rating -= 1) {
      const count = reviews.filter((item) => Math.round(Number(item.rating)) === rating).length;
      const row = document.createElement('div');
      row.className = 'rating-bar';
      const label = document.createElement('span');
      label.textContent = `${rating} ★`;
      const bar = document.createElement('i');
      bar.style.setProperty('--rating-width', `${(count / reviews.length) * 100}%`);
      const value = document.createElement('span');
      value.textContent = String(count);
      row.append(label, bar, value);
      bars.append(row);
    }
    summary.replaceChildren(ratingTotal, bars);
    list.replaceChildren(...reviews.map((review) => {
      const card = document.createElement('article');
      card.className = 'review-card';
      const avatar = document.createElement('span');
      avatar.className = 'review-avatar';
      avatar.textContent = initials(review.author_name);
      const copy = document.createElement('div');
      copy.className = 'review-card__copy';
      const name = document.createElement('h3');
      name.textContent = review.author_name || 'Гость';
      const date = document.createElement('time');
      date.dateTime = review.created_at || '';
      date.textContent = formatDate(review.created_at);
      const body = document.createElement('p');
      body.textContent = review.body;
      copy.append(name, date, body);
      const rating = document.createElement('span');
      rating.className = 'stars';
      rating.textContent = stars(review.rating);
      card.append(avatar, copy, rating);
      return card;
    }));
  }

  async function removeItem(type, id) {
    const source = type === 'menu' ? state.workspace.menu : state.workspace.promotions;
    const item = source.find((entry) => entry.id === id);
    if (!item) return;
    const confirmed = await askConfirm(
      type === 'menu' ? 'Удалить позицию?' : 'Удалить акцию?',
      `«${item.title}» будет удалено без возможности восстановления.`
    );
    if (!confirmed) return;
    const url = type === 'menu' ? '/api/merchant/menu' : '/api/merchant/promotions';
    setLoading(true);
    try {
      await api(url, { method: 'DELETE', body: jsonBody({ id }) });
      await loadWorkspace({ quiet: true });
      toast(type === 'menu' ? 'Позиция удалена.' : 'Акция удалена.');
    } catch (error) {
      toast(readableMessage(error.message, 'Не удалось удалить запись.'), 'error');
    } finally {
      setLoading(false);
    }
  }

  function setView(view, scroll = true) {
    if (!viewMeta[view]) return;
    state.activeView = view;
    $$('[data-view-panel]').forEach((panel) => {
      const active = panel.dataset.viewPanel === view;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
    $$('.sidebar-nav [data-merchant-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.merchantView === view));
    $('#view-eyebrow').textContent = viewMeta[view][0];
    $('#view-title').textContent = viewMeta[view][1];
    closeSidebar();
    if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openDialog(dialog) {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    document.body.classList.add('has-dialog');
  }

  function closeDialog(dialog) {
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    if (!$$('dialog[open]').length) document.body.classList.remove('has-dialog');
  }

  function openPasswordDialog(forced = false) {
    const form = $('#password-form');
    form.reset();
    const currentPasswordField = $('#current-password-field');
    const currentPasswordInput = form.elements.currentPassword;
    currentPasswordField.hidden = forced;
    currentPasswordInput.disabled = forced;
    currentPasswordInput.required = !forced;
    $('#password-form-message').textContent = '';
    passwordDialog.dataset.forced = String(forced);
    openDialog(passwordDialog);
    window.setTimeout(() => form.elements.password.focus(), 60);
  }

  async function savePassword(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const password = form.elements.password.value;
    const confirmation = form.elements.confirmPassword.value;
    const message = $('#password-form-message');
    message.textContent = '';
    if (password.length < 10 || !/[A-Za-zА-Яа-яЁё]/.test(password) || !/\d/.test(password)) {
      message.textContent = 'Пароль должен содержать минимум 10 символов, букву и цифру.';
      return;
    }
    if (password !== confirmation) {
      message.textContent = 'Пароли не совпадают.';
      return;
    }
    const submit = form.querySelector('[type="submit"]');
    setButtonBusy(submit, true);
    try {
      const result = await api('/api/auth/password', { method: 'POST', body: jsonBody({ password, currentPassword: form.elements.currentPassword.disabled ? '' : form.elements.currentPassword.value }) });
      state.user = result.user;
      $('#password-alert').hidden = true;
      passwordDialog.dataset.forced = 'false';
      closeDialog(passwordDialog);
      toast('Новый пароль сохранён.');
    } catch (error) {
      message.textContent = readableMessage(error.message, 'Не удалось изменить пароль. Попробуйте ещё раз.');
    } finally {
      setButtonBusy(submit, false);
    }
  }

  function askConfirm(title, copy) {
    $('#confirm-title').textContent = title;
    $('#confirm-copy').textContent = copy;
    openDialog(confirmDialog);
    return new Promise((resolve) => { state.confirmResolve = resolve; });
  }

  function resolveConfirm(value) {
    closeDialog(confirmDialog);
    state.confirmResolve?.(value);
    state.confirmResolve = null;
  }

  function openSidebar() {
    sidebarReturnFocus = document.activeElement;
    $('#merchant-sidebar').classList.add('is-open');
    $('#sidebar-scrim').hidden = false;
    $('#mobile-menu').setAttribute('aria-expanded', 'true');
    document.body.classList.add('has-sidebar');
    window.setTimeout(() => $('#sidebar-close').focus(), 0);
  }

  function closeSidebar() {
    $('#merchant-sidebar').classList.remove('is-open');
    $('#sidebar-scrim').hidden = true;
    $('#mobile-menu').setAttribute('aria-expanded', 'false');
    document.body.classList.remove('has-sidebar');
    if (sidebarReturnFocus instanceof HTMLElement && document.activeElement === $('#sidebar-close')) sidebarReturnFocus.focus();
  }

  function bindEvents() {
    loginForm.addEventListener('submit', login);
    $('#merchant-logout').addEventListener('click', logout);
    $('#venue-form').addEventListener('submit', saveVenue);
    $('#menu-form').addEventListener('submit', saveMenuItem);
    $('#promotion-form').addEventListener('submit', savePromotion);
    $('#password-form').addEventListener('submit', savePassword);
    $('#mobile-menu').addEventListener('click', openSidebar);
    $('#sidebar-close').addEventListener('click', closeSidebar);
    $('#sidebar-scrim').addEventListener('click', closeSidebar);
    $('#confirm-cancel').addEventListener('click', () => resolveConfirm(false));
    $('#confirm-accept').addEventListener('click', () => resolveConfirm(true));

    $('#venue-switcher').addEventListener('change', (event) => {
      state.activeVenueId = event.target.value;
      storageSet('mesto-merchant-venue', state.activeVenueId);
      renderWorkspace();
      toast(`Выбрано: ${activeVenue()?.title || 'заведение'}`);
    });

    $('#refresh-workspace').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.classList.add('is-loading');
      button.disabled = true;
      try {
        await loadWorkspace({ quiet: true });
        toast('Данные обновлены.');
      } catch {
        // Ошибка уже показана в loadWorkspace.
      } finally {
        button.classList.remove('is-loading');
        button.disabled = false;
      }
    });

    $('#menu-search').addEventListener('input', renderMenu);
    $('#menu-section-filter').addEventListener('change', renderMenu);
    $('#venue-form').elements.description.addEventListener('input', (event) => updateCharacterCount(event.target));

    document.addEventListener('click', (event) => {
      const viewButton = event.target.closest('[data-merchant-view]');
      if (viewButton) setView(viewButton.dataset.merchantView);

      if (event.target.closest('[data-new-menu]')) openMenuDialog();
      if (event.target.closest('[data-new-promotion]')) openPromotionDialog();
      if (event.target.closest('[data-open-password]')) openPasswordDialog(false);

      const editButton = event.target.closest('[data-edit]');
      if (editButton) {
        const source = editButton.dataset.edit === 'menu' ? state.workspace.menu : state.workspace.promotions;
        const item = source.find((entry) => entry.id === editButton.dataset.id);
        if (editButton.dataset.edit === 'menu') openMenuDialog(item);
        else openPromotionDialog(item);
      }

      const deleteButton = event.target.closest('[data-delete]');
      if (deleteButton) removeItem(deleteButton.dataset.delete, deleteButton.dataset.id);

      const closeButton = event.target.closest('[data-close-dialog]');
      if (closeButton) closeDialog(closeButton.closest('dialog'));

      const closePassword = event.target.closest('[data-close-password]');
      if (closePassword && passwordDialog.dataset.forced !== 'true') closeDialog(passwordDialog);

      const passwordToggle = event.target.closest('[data-password-toggle]');
      if (passwordToggle) {
        const input = passwordToggle.closest('.input-shell').querySelector('input');
        const visible = input.type === 'text';
        input.type = visible ? 'password' : 'text';
        passwordToggle.setAttribute('aria-label', visible ? 'Показать пароль' : 'Скрыть пароль');
      }
    });

    [menuDialog, promotionDialog].forEach((dialog) => {
      dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        closeDialog(dialog);
      });
    });
    passwordDialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      if (passwordDialog.dataset.forced !== 'true') closeDialog(passwordDialog);
    });
    confirmDialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      resolveConfirm(false);
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) closeSidebar();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && $('#merchant-sidebar').classList.contains('is-open')) closeSidebar();
    });
  }

  initialize();
})();
