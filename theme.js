(function () {
  'use strict';

  const storageKey = 'mesto-color-theme';
  const themes = [
    { id: 'light', label: 'Светлая', color: '#f6f1ea' },
    { id: 'graphite', label: 'Графитовая', color: '#171819' },
    { id: 'midnight', label: 'Тёмно-синяя', color: '#0d1727' }
  ];

  function readTheme() {
    try {
      const saved = window.localStorage.getItem(storageKey);
      return themes.some((theme) => theme.id === saved) ? saved : 'light';
    } catch (_error) {
      return 'light';
    }
  }

  function themeById(id) {
    return themes.find((theme) => theme.id === id) || themes[0];
  }

  function applyTheme(id, persist) {
    const active = themeById(id);
    const activeIndex = themes.findIndex((theme) => theme.id === active.id);
    const next = themes[(activeIndex + 1) % themes.length];

    document.documentElement.dataset.theme = active.id;
    document.documentElement.style.colorScheme = active.id === 'light' ? 'light' : 'dark';

    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute('content', active.color);

    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.dataset.activeTheme = active.id;
      button.setAttribute('aria-label', `Тема: ${active.label.toLowerCase()}. Включить: ${next.label.toLowerCase()}`);
      button.setAttribute('title', `Тема: ${active.label}. Следующая — ${next.label.toLowerCase()}`);
      const status = button.querySelector('[data-theme-status]');
      if (status) status.textContent = `Включена ${active.label.toLowerCase()} тема`;
    });

    if (persist) {
      try {
        window.localStorage.setItem(storageKey, active.id);
      } catch (_error) {
        // The theme still works when private browsing blocks local storage.
      }
    }

    window.dispatchEvent(new CustomEvent('mesto:themechange', { detail: { theme: active.id } }));
  }

  applyTheme(readTheme(), false);

  function connectThemeButtons() {
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      if (button.dataset.themeConnected === 'true') return;
      button.dataset.themeConnected = 'true';
      button.addEventListener('click', () => {
        const activeIndex = themes.findIndex((theme) => theme.id === document.documentElement.dataset.theme);
        applyTheme(themes[(activeIndex + 1) % themes.length].id, true);
      });
    });
    applyTheme(document.documentElement.dataset.theme || readTheme(), false);
  }

  function observeThemeButtons() {
    const root = document.body || document.documentElement;
    const observer = new MutationObserver((records) => {
      const addedThemeControl = records.some((record) => Array.from(record.addedNodes).some((node) => (
        node instanceof Element
        && (node.matches('[data-theme-toggle]') || node.querySelector('[data-theme-toggle]'))
      )));
      if (addedThemeControl) connectThemeButtons();
    });
    observer.observe(root, { childList: true, subtree: true });
  }

  function initializeThemeButtons() {
    connectThemeButtons();
    observeThemeButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeThemeButtons, { once: true });
  } else {
    initializeThemeButtons();
  }

  window.addEventListener('storage', (event) => {
    if (event.key === storageKey) applyTheme(event.newValue, false);
  });
})();
