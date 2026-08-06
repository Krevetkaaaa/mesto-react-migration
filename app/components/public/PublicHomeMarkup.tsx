/**
 * Trusted static markup ported mechanically from index.html.
 * It contains no user-derived data and intentionally uses literal JSX instead
 * without raw HTML injection so the legacy DOM contract remains reviewable.
 */
export function PublicHomeMarkup() {
  return (
    <>
    <svg className="svg-sprite" aria-hidden="true">
      <symbol id="arrow" viewBox="0 0 24 24"><path d="M5 12h13M14 6l6 6-6 6" /></symbol>
      <symbol id="search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></symbol>
      <symbol id="pin" viewBox="0 0 24 24"><path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.25" /></symbol>
      <symbol id="heart" viewBox="0 0 24 24"><path d="M20.8 8.7c0 5.2-8.8 10.5-8.8 10.5S3.2 13.9 3.2 8.7A4.7 4.7 0 0 1 12 6.3a4.7 4.7 0 0 1 8.8 2.4Z" /></symbol>
      <symbol id="paw" viewBox="0 0 24 24"><ellipse cx="12" cy="15.5" rx="4.5" ry="3.4" /><circle cx="5.5" cy="10" r="1.8" /><circle cx="10" cy="6.5" r="1.8" /><circle cx="14.5" cy="6.5" r="1.8" /><circle cx="18.5" cy="10" r="1.8" /></symbol>
      <symbol id="coffee" viewBox="0 0 24 24"><path d="M5 9h11v5.5A4.5 4.5 0 0 1 11.5 19h-2A4.5 4.5 0 0 1 5 14.5Z" /><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16M7 5c0 1 1 1 1 2M11 5c0 1 1 1 1 2" /></symbol>
      <symbol id="restaurant" viewBox="0 0 24 24"><path d="M7 4v7M4.5 4v3.5a2.5 2.5 0 0 0 5 0V4M7 11.5V20M16 4v16M16 4c3 1.5 3 5 0 6" /></symbol>
      <symbol id="cocktail" viewBox="0 0 24 24"><path d="M5 5h14l-6.3 7v6h3.3M10 18h5M8 8h8" /></symbol>
      <symbol id="bolt" viewBox="0 0 24 24"><path d="m13 3-8 10h6l-1 8 8-10h-6Z" /></symbol>
      <symbol id="park" viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="M9 16V8h3.3a2.8 2.8 0 1 1 0 5.6H9" /></symbol>
      <symbol id="bell" viewBox="0 0 24 24"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></symbol>
      <symbol id="grid" viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></symbol>
      <symbol id="chart" viewBox="0 0 24 24"><path d="M4 19V5M4 19h16M8 15l3-4 3 2 5-6" /></symbol>
      <symbol id="users" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.5-3.1 2.5-5 5.5-5s5 1.9 5.5 5M16 5.5a3 3 0 0 1 0 5.7M16 14a5.3 5.3 0 0 1 4.5 5" /></symbol>
      <symbol id="sliders" viewBox="0 0 24 24"><path d="M4 7h16M4 17h16M8 4v6M16 14v6" /></symbol>
      <symbol id="plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></symbol>
      <symbol id="camera" viewBox="0 0 24 24"><path d="M4 8h4l1.5-2h5L16 8h4v11H4Z" /><circle cx="12" cy="13.5" r="3.2" /></symbol>
      <symbol id="external" viewBox="0 0 24 24"><path d="M14 5h5v5M19 5l-8 8M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" /></symbol>
      <symbol id="star" viewBox="0 0 24 24"><path d="m12 3 2.7 5.4 6 .9-4.4 4.3 1 6.1-5.3-2.8-5.3 2.8 1-6.1L3.3 9.3l6-.9Z" /></symbol>
      <symbol id="cake" viewBox="0 0 24 24"><path d="M5 20h14M7 20v-6h10v6M6 14h12l-1.2-4H7.2ZM9 8V4M12 8V3M15 8V4" /></symbol>
      <symbol id="pizza" viewBox="0 0 24 24"><path d="M4 6c5.5-2.3 10.5-2.3 16 0l-8 14Z" /><circle cx="12" cy="11" r="1" /><circle cx="10" cy="15" r="1" /><circle cx="15" cy="15" r="1" /></symbol>
      <symbol id="menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></symbol>
      <symbol id="wifi" viewBox="0 0 24 24"><path d="M4.5 9.4a11 11 0 0 1 15 0M7.6 12.6a6.6 6.6 0 0 1 8.8 0M10.7 15.8a2.2 2.2 0 0 1 2.6 0" /><circle cx="12" cy="19" r="1" /></symbol>
      <symbol id="clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></symbol>
      <symbol id="phone" viewBox="0 0 24 24"><path d="M7.2 3.5 10 7.8 7.9 10c1.3 2.8 3.4 4.9 6.2 6.2l2.1-2.1 4.3 2.8v3c0 .7-.6 1.3-1.3 1.3C10.1 21.2 2.8 13.9 2.8 4.8c0-.7.6-1.3 1.3-1.3Z" /></symbol>
      <symbol id="sparkle" viewBox="0 0 24 24"><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5ZM19 16l.6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6Z" /></symbol>
      <symbol id="logo-star" viewBox="0 0 24 24"><path d="M12 1.5c.7 6.3 1.9 9.5 8.5 10.5-6.6 1-7.8 4.2-8.5 10.5C11.3 16.2 10.1 13 3.5 12c6.6-1 7.8-4.2 8.5-10.5Z" /></symbol>
      <symbol id="telegram" viewBox="0 0 24 24"><path d="m20.4 4.6-3 14.1c-.2 1-.8 1.2-1.6.8l-4.5-3.3-2.2 2.1c-.2.2-.5.4-.9.4l.3-4.5 8.2-7.4c.4-.3-.1-.5-.6-.2L6 13 1.6 11.6c-1-.3-1-1 .2-1.5l17.1-6.6c.8-.3 1.5.2 1.5 1.1Z" /></symbol>
      <symbol id="instagram" viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="3.6" /><circle cx="17.4" cy="6.8" r=".9" /></symbol>
    </svg>

    <header className="site-header">
      <a className="brand brand-mark" href="#guide" data-home-link="" aria-label="Место — на главную"><svg className="brand-pin"><use href="#pin" /></svg><span className="brand-word">Место</span><span className="brand-orb" aria-hidden="true"><svg><use href="#logo-star" /></svg></span></a>
      <nav className="main-nav" aria-label="Основная навигация">
        <a href="#popular">Рестораны</a><a href="#categories" data-open-categories="">Категории</a><a href="#collections">Подборки</a><a href="#how-it-works">О проекте</a><a href="#site-footer">Контакты</a>
      </nav>
      <div className="header-actions">
        <button className="mobile-menu-toggle" type="button" aria-label="Открыть меню" aria-expanded="false"><span></span><span></span></button>
        <button className="theme-toggle" type="button" data-theme-toggle="" aria-label="Сменить цветовую тему">
          <span className="theme-toggle-glyph" aria-hidden="true"><i className="theme-sun"></i><i className="theme-moon"></i><i className="theme-star">✦</i></span>
          <span className="sr-only" data-theme-status="" aria-live="polite">Включена светлая тема</span>
        </button>
        <button className="circle-button favorites-button" type="button" aria-label="Избранные" data-open-favorites=""><svg><use href="#heart" /></svg><span className="favorites-count" hidden>0</span></button>
        <button className="login-trigger" type="button" aria-label="Войти или зарегистрироваться" data-open-auth="">Войти</button>
        <button className="register-trigger" type="button" data-open-register="">Регистрация</button>
      </div>
    </header>

    <main data-react-route="home">
      <section className="guide-screen" id="guide" aria-labelledby="guide-title">
        <div className="hero-photo" role="img" aria-label="Побережье Крыма с горами и Чёрным морем"></div>
        <div className="hero-content">
          <p className="eyebrow hero-eyebrow">Ресторанный гид · Крым</p>
          <h1 id="guide-title">Лучшие места<br />в вашем городе</h1>
          <p className="hero-lead">Открывайте атмосферные рестораны, авторскую кухню и незабываемые впечатления.</p>
          <form className="search-panel" id="venue-search">
            <label className="search-field">
              <svg><use href="#search" /></svg>
              <input name="query" type="search" placeholder="Куда хотите сходить?" autoComplete="off" />
            </label>
            <label className="city-field">
              <svg><use href="#pin" /></svg>
              <select name="city" aria-label="Город"><option>Симферополь</option><option>Ялта</option><option>Севастополь</option><option>Алушта</option><option>Евпатория</option><option>Феодосия</option><option>Судак</option><option>Керчь</option><option>Бахчисарай</option><option>Балаклава</option><option>Саки</option><option>Гурзуф</option></select>
            </label>
            <label className="date-field">
              <svg><use href="#clock" /></svg>
              <select name="when" aria-label="Когда"><option>Сегодня</option><option>Сегодня вечером</option><option>На выходных</option></select>
            </label>
            <button className="search-button" type="submit">Найти <svg><use href="#arrow" /></svg></button>
          </form>
          <div className="quick-filters" aria-label="Быстрые фильтры">
            <button type="button" data-filter="Рестораны">Рестораны</button><button type="button" data-filter="Кафе">Кафе</button><button type="button" data-filter="Кофейни">Кофейни</button><button type="button" data-filter="Кондитерские">Кондитерские</button><button type="button" data-filter="Бары">Бары</button><button type="button" data-filter="Фаст-кэжуал">Фаст-кэжуал</button>
          </div>
        </div>
        <div className="hero-note" aria-live="polite"><span className="catalog-status" aria-hidden="true"></span><span className="catalog-total"><strong data-venue-count="" aria-label="31">31</strong> заведений</span><small>в каталоге онлайн</small></div>
      </section>

      <section className="content-section categories-section" id="categories" aria-labelledby="categories-title">
        <div className="section-heading">
          <div><p className="eyebrow">Выберите настроение</p><h2 id="categories-title">Категории заведений</h2></div>
          <button className="text-link" type="button" data-open-categories="">Все категории <svg><use href="#arrow" /></svg></button>
        </div>
        <div className="category-grid">
          <a className="category-card cafe" href="#popular" data-filter-category="Кафе"><svg><use href="#coffee" /></svg><span>Кафе</span><small data-category-count="Кафе">2 места</small></a>
          <a className="category-card dining" href="#popular" data-filter-category="Рестораны"><svg><use href="#restaurant" /></svg><span>Рестораны</span><small data-category-count="Рестораны">2 места</small></a>
          <a className="category-card coffee" href="#popular" data-filter-category="Кофейни"><svg><use href="#coffee" /></svg><span>Кофейни</span><small data-category-count="Кофейни">2 места</small></a>
          <a className="category-card dessert" href="#popular" data-filter-category="Кондитерские"><svg><use href="#cake" /></svg><span>Кондитерские</span><small data-category-count="Кондитерские">1 место</small></a>
          <a className="category-card pizza" href="#popular" data-filter-category="Пиццерии"><svg><use href="#pizza" /></svg><span>Пиццерии</span><small data-category-count="Пиццерии">1 место</small></a>
          <a className="category-card casual" href="#popular" data-filter-category="Фаст-кэжуал"><svg><use href="#bolt" /></svg><span>Фаст-кэжуал</span><small data-category-count="Фаст-кэжуал">1 место</small></a>
          <a className="category-card bar" href="#popular" data-filter-category="Бары"><svg><use href="#cocktail" /></svg><span>Бары</span><small data-category-count="Бары">1 место</small></a>
          <a className="category-card gastropub" href="#popular" data-filter-category="Гастробары"><svg><use href="#sparkle" /></svg><span>Гастробары</span><small data-category-count="Гастробары">1 место</small></a>
        </div>
      </section>

      <section className="content-section popular-section" id="popular" aria-labelledby="popular-title">
        <div className="section-heading">
          <div><p className="eyebrow">Выбор гостей</p><h2 id="popular-title">Популярные рестораны</h2></div>
          <button className="text-link" type="button" data-show-all="">Смотреть всё <svg><use href="#arrow" /></svg></button>
        </div>
        <div className="venue-grid">
          <button className="venue-card" type="button" data-venue="marea" data-category="Рестораны" data-city="Севастополь" data-cuisine="Средиземноморская" data-source="yandex" data-pet="0" data-parking="1" data-score="4.9" data-new="0" data-search="баркас ресторан средиземноморская кухня море севастополь">
            <span className="venue-image"><img src="assets/venue-restaurant-unsplash.jpg" alt="Тёплый интерьер ресторана" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Чёрное море</span></span>
            <span className="venue-body"><strong>Баркас</strong><small>Черноморская и средиземноморская кухня</small><span className="venue-meta"><b>4.9</b><i></i> редакционная оценка</span><span className="venue-price">от 1 300 ₽</span></span>
          </button>
          <button className="venue-card" type="button" data-venue="zerno" data-category="Кофейни" data-city="Симферополь" data-cuisine="Кофе и десерты" data-pet="1" data-parking="1" data-score="4.8" data-new="1" data-search="зерно кофейня кофе завтраки симферополь">
            <span className="venue-image"><img src="assets/venue-coffee-unsplash.jpg" alt="Интерьер спешелти-кофейни" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Завтраки</span></span>
            <span className="venue-body"><strong>Зерно</strong><small>Спешелти-кофейня</small><span className="venue-meta"><b>4.8</b><i></i> 191 отзыв</span><span className="venue-price">от 450 ₽</span></span>
          </button>
          <button className="venue-card" type="button" data-venue="sova" data-category="Бары" data-city="Севастополь" data-cuisine="Европейская" data-source="yandex" data-pet="0" data-parking="1" data-score="4.7" data-new="0" data-search="gio restaurant bar коктейли вечер севастополь">
            <span className="venue-image"><img src="assets/venue-cocktail-unsplash.jpg" alt="Авторский коктейль в баре" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">До 02:00</span></span>
            <span className="venue-body"><strong>Gio restaurant &amp; bar</strong><small>Европейская кухня и коктейли</small><span className="venue-meta"><b>4.7</b><i></i> редакционная оценка</span><span className="venue-price">от 800 ₽</span></span>
          </button>
          <button className="venue-card is-extra" type="button" data-venue="syrniki" data-category="Кафе" data-city="Симферополь" data-cuisine="Кофе и десерты" data-pet="1" data-parking="0" data-score="4.9" data-new="1" data-search="утро кафе десерт питомцы завтраки" hidden>
            <span className="venue-image"><img src="assets/venue-cafe-unsplash.jpg" alt="Уютный интерьер кафе" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">С питомцами</span></span>
            <span className="venue-body"><strong>Утро</strong><small>Кафе для медленных встреч</small><span className="venue-meta"><b>4.9</b><i></i> 87 отзывов</span><span className="venue-price">от 600 ₽</span></span>
          </button>
          <button className="venue-card is-extra" type="button" data-venue="lapsha" data-category="Фаст-кэжуал" data-city="Симферополь" data-cuisine="Паназиатская" data-pet="0" data-parking="0" data-score="4.6" data-new="1" data-search="лапша фаст кэжуал обед" hidden>
            <span className="venue-image"><img src="assets/card-coffee.png" alt="Быстрый обед в заведении Лапша" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Быстрый обед</span></span>
            <span className="venue-body"><strong>Лапша</strong><small>Фаст-кэжуал · обеды</small><span className="venue-meta"><b>4.6</b><i></i> 64 отзыва</span><span className="venue-price">от 520 ₽</span></span>
          </button>
          <button className="venue-card is-extra" type="button" data-venue="pristan" data-category="Рестораны" data-city="Симферополь" data-cuisine="Европейская" data-source="yandex" data-pet="1" data-parking="1" data-score="4.8" data-new="1" data-search="айвазовский ресторан европейская кухня симферополь" hidden>
            <span className="venue-image"><img src="assets/real-dining-night.jpg" alt="Интерьер ресторана Айвазовский" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Реальное место</span></span>
            <span className="venue-body"><strong>Айвазовский</strong><small>Европейская и авторская кухня</small><span className="venue-meta"><b>4.8</b><i></i> редакционная оценка</span><span className="venue-price">от 1 100 ₽</span></span>
          </button>
          <button className="venue-card is-extra" type="button" data-venue="sahara" data-category="Кондитерские" data-city="Ялта" data-cuisine="Кофе и десерты" data-pet="1" data-parking="0" data-score="4.7" data-new="1" data-search="сахара кондитерская ялта десерты торты кофе" hidden>
            <span className="venue-image"><img src="assets/card-dessert.png" alt="Десерт в кондитерской Сахара" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Авторские десерты</span></span>
            <span className="venue-body"><strong>Сахара</strong><small>Кондитерская и кофе</small><span className="venue-meta"><b>4.7</b><i></i> 58 отзывов</span><span className="venue-price">от 380 ₽</span></span>
          </button>
          <button className="venue-card is-extra" type="button" data-venue="portofino" data-category="Пиццерии" data-city="Ялта" data-cuisine="Итальянская" data-pet="1" data-parking="1" data-score="4.6" data-new="0" data-search="портофино пиццерия ялта итальянская пицца" hidden>
            <span className="venue-image"><img src="assets/real-restaurant-interior.jpg" alt="Зал пиццерии Портофино" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Печь на виду</span></span>
            <span className="venue-body"><strong>Портофино</strong><small>Итальянская кухня</small><span className="venue-meta"><b>4.6</b><i></i> 124 отзыва</span><span className="venue-price">от 900 ₽</span></span>
          </button>
          <button className="venue-card is-extra" type="button" data-venue="nabrerezhnaya" data-category="Гастробары" data-city="Севастополь" data-cuisine="Европейская" data-pet="0" data-parking="1" data-score="4.8" data-new="0" data-search="набережная гастробар севастополь коктейли европейская" hidden>
            <span className="venue-image"><img src="assets/card-bar.png" alt="Коктейльный бар Набережная" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Вечерний бар</span></span>
            <span className="venue-body"><strong>Набережная</strong><small>Гастробар и коктейли</small><span className="venue-meta"><b>4.8</b><i></i> 102 отзыва</span><span className="venue-price">от 950 ₽</span></span>
          </button>
          <button className="venue-card is-extra" type="button" data-venue="taro" data-category="Кафе" data-city="Алушта" data-cuisine="Европейская" data-pet="1" data-parking="1" data-score="4.7" data-new="1" data-search="таро кафе алушта завтраки европейская кухня" hidden>
            <span className="venue-image"><img src="assets/card-coffee.png" alt="Завтрак в кафе Таро" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Завтраки</span></span>
            <span className="venue-body"><strong>Таро</strong><small>Кафе для завтраков</small><span className="venue-meta"><b>4.7</b><i></i> 73 отзыва</span><span className="venue-price">от 620 ₽</span></span>
          </button>
          <button className="venue-card is-extra" type="button" data-venue="krym-bakery" data-category="Кофейни" data-city="Евпатория" data-cuisine="Кофе и десерты" data-pet="0" data-parking="1" data-score="4.5" data-new="1" data-search="крымская пекарня кофейня евпатория выпечка кофе" hidden>
            <span className="venue-image"><img src="assets/card-dessert.png" alt="Выпечка в Крымской пекарне" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Свежая выпечка</span></span>
            <span className="venue-body"><strong>Крымская пекарня</strong><small>Кофе и выпечка</small><span className="venue-meta"><b>4.5</b><i></i> 41 отзыв</span><span className="venue-price">от 310 ₽</span></span>
          </button>
          <button className="venue-card is-extra" type="button" data-venue="beluga" data-category="Рестораны" data-city="Симферополь" data-cuisine="all" data-source="yandex" data-pet="0" data-parking="0" data-score="5.0" data-new="1" data-search="белуга стор ресторан рыба морепродукты симферополь" hidden>
            <span className="venue-image"><img src="assets/venue-restaurant-unsplash.jpg" alt="Интерьер ресторана" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Яндекс Карты</span></span><span className="venue-body"><strong>Белуга Стор</strong><small>Ресторан · Симферополь</small><span className="venue-meta"><b>5.0</b><i></i> 392 оценки</span><span className="venue-price">По меню</span></span>
          </button>
          <button className="venue-card is-extra" type="button" data-venue="gnezdo" data-category="Рестораны" data-city="Симферополь" data-cuisine="all" data-source="yandex" data-award="mesto-choice" data-pet="0" data-parking="0" data-score="5.0" data-new="1" data-search="gnezdo ресторан кафе симферополь" hidden>
            <span className="venue-image"><img src="assets/real-dining-night.jpg" alt="Интерьер ресторана" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Выбор Места</span></span><span className="venue-body"><strong>Gnezdo</strong><small>Ресторан · Симферополь</small><span className="venue-meta"><b>5.0</b><i></i> 289 оценок</span><span className="venue-price">По меню</span></span>
          </button>
          <button className="venue-card is-extra" type="button" data-venue="el-pastor" data-category="Бары" data-city="Симферополь" data-cuisine="all" data-source="yandex" data-award="mesto-choice" data-pet="0" data-parking="0" data-score="5.0" data-new="1" data-search="эль пастор бар ресторан симферополь" hidden>
            <span className="venue-image"><img src="assets/venue-cocktail-unsplash.jpg" alt="Барный интерьер" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Выбор Места</span></span><span className="venue-body"><strong>Эль Пастор</strong><small>Бар · Симферополь</small><span className="venue-meta"><b>5.0</b><i></i> 1 343 оценки</span><span className="venue-price">По меню</span></span>
          </button>
          <button className="venue-card is-extra" type="button" data-venue="bemine" data-category="Кафе" data-city="Симферополь" data-cuisine="all" data-source="yandex" data-award="mesto-choice" data-pet="0" data-parking="0" data-score="5.0" data-new="1" data-search="bemine гастро кафе ресторан симферополь" hidden>
            <span className="venue-image"><img src="assets/venue-cafe-unsplash.jpg" alt="Интерьер кафе" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Выбор Места</span></span><span className="venue-body"><strong>BEmine Гастро-Кафе</strong><small>Кафе · Симферополь</small><span className="venue-meta"><b>5.0</b><i></i> 5 325 оценок</span><span className="venue-price">998–1 998 ₽</span></span>
          </button>
          <button className="venue-card is-extra" type="button" data-venue="monroe" data-category="Караоке-клубы" data-city="Симферополь" data-cuisine="all" data-source="yandex" data-award="mesto-choice" data-pet="0" data-parking="0" data-score="4.9" data-new="1" data-search="монро ресторан караоке клуб симферополь" hidden>
            <span className="venue-image"><img src="assets/card-bar.png" alt="Вечерний интерьер" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Выбор Места</span></span><span className="venue-body"><strong>Монро</strong><small>Караоке-клуб · Симферополь</small><span className="venue-meta"><b>4.9</b><i></i> 2 018 оценок</span><span className="venue-price">от 997 ₽</span></span>
          </button>
          <button className="venue-card is-extra" type="button" data-venue="volna" data-category="Рестораны" data-city="Ялта" data-cuisine="all" data-source="yandex" data-pet="0" data-parking="0" data-score="4.9" data-new="1" data-search="волна ресторан ялта" hidden>
            <span className="venue-image"><img src="assets/real-restaurant-interior.jpg" alt="Интерьер ресторана" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Яндекс Карты</span></span><span className="venue-body"><strong>Волна</strong><small>Ресторан · Ялта</small><span className="venue-meta"><b>4.9</b><i></i> 23 оценки</span><span className="venue-price">По меню</span></span>
          </button>
          <button className="venue-card is-extra" type="button" data-venue="krasnov" data-category="Банкетные залы" data-city="Ялта" data-cuisine="all" data-source="yandex" data-pet="0" data-parking="0" data-score="4.9" data-new="1" data-search="краснов ресторан банкетный зал ялта" hidden>
            <span className="venue-image"><img src="assets/venue-restaurant-unsplash.jpg" alt="Зал ресторана" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Яндекс Карты</span></span><span className="venue-body"><strong>Краснов</strong><small>Банкетный зал · Ялта</small><span className="venue-meta"><b>4.9</b><i></i> 47 оценок</span><span className="venue-price">2 000–5 001 ₽</span></span>
          </button>
          <button className="venue-card is-extra" type="button" data-venue="paititi" data-category="Рестораны" data-city="Ялта" data-cuisine="all" data-source="yandex" data-award="mesto-choice" data-pet="0" data-parking="0" data-score="5.0" data-new="1" data-search="paititi ресторан кафе ялта" hidden>
            <span className="venue-image"><img src="assets/real-dining-night.jpg" alt="Интерьер ресторана" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Выбор Места</span></span><span className="venue-body"><strong>Paititi</strong><small>Ресторан · Ялта</small><span className="venue-meta"><b>5.0</b><i></i> 967 оценок</span><span className="venue-price">По меню</span></span>
          </button>
          <button className="venue-card is-extra" type="button" data-venue="selyam-aleykum" data-category="Кафе" data-city="Ялта" data-cuisine="all" data-source="yandex" data-award="mesto-choice" data-pet="0" data-parking="0" data-score="4.9" data-new="1" data-search="селям алейкум ресторан кафе ялта" hidden>
            <span className="venue-image"><img src="assets/venue-cafe-unsplash.jpg" alt="Интерьер кафе" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Выбор Места</span></span><span className="venue-body"><strong>Селям Алейкум</strong><small>Кафе · Ялта</small><span className="venue-meta"><b>4.9</b><i></i> 1 700 оценок</span><span className="venue-price">250–800 ₽</span></span>
          </button>
          <button className="venue-card is-extra" type="button" data-venue="terrasa" data-category="Караоке-клубы" data-city="Ялта" data-cuisine="all" data-source="yandex" data-pet="0" data-parking="0" data-score="4.4" data-new="1" data-search="терраса ресторан караоке клуб ялта" hidden>
            <span className="venue-image"><img src="assets/card-bar.png" alt="Вечерний интерьер" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Круглосуточно</span></span><span className="venue-body"><strong>Терраса</strong><small>Караоке-клуб · Ялта</small><span className="venue-meta"><b>4.4</b><i></i> 459 оценок</span><span className="venue-price">1 500–4 000 ₽</span></span>
          </button>
          <button className="venue-card is-extra" type="button" data-venue="omega" data-category="Рестораны" data-city="Севастополь" data-cuisine="all" data-source="yandex" data-pet="0" data-parking="0" data-score="4.8" data-new="1" data-search="омега ресторан кафе севастополь" hidden>
            <span className="venue-image"><img src="assets/real-restaurant-interior.jpg" alt="Интерьер ресторана" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Яндекс Карты</span></span><span className="venue-body"><strong>Омега</strong><small>Ресторан · Севастополь</small><span className="venue-meta"><b>4.8</b><i></i> 122 оценки</span><span className="venue-price">1 500–2 500 ₽</span></span>
          </button>
          <button className="venue-card is-extra" type="button" data-venue="asian-kitchen-bar" data-category="Суши-бары" data-city="Севастополь" data-cuisine="all" data-source="yandex" data-award="mesto-choice" data-pet="0" data-parking="0" data-score="5.0" data-new="1" data-search="asian kitchen bar ресторан суши бар севастополь" hidden>
            <span className="venue-image"><img src="assets/venue-cocktail-unsplash.jpg" alt="Интерьер ресторана" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Выбор Места</span></span><span className="venue-body"><strong>Asian Kitchen Bar</strong><small>Суши-бар · Севастополь</small><span className="venue-meta"><b>5.0</b><i></i> 703 оценки</span><span className="venue-price">1 000–1 500 ₽</span></span>
          </button>
          <button className="venue-card is-extra" type="button" data-venue="oranzhereya" data-category="Кальян-бары" data-city="Севастополь" data-cuisine="all" data-source="yandex" data-award="mesto-choice" data-pet="0" data-parking="0" data-score="4.9" data-new="1" data-search="оранжерея ресторан кальян бар севастополь" hidden>
            <span className="venue-image"><img src="assets/card-bar.png" alt="Барный интерьер" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Выбор Места</span></span><span className="venue-body"><strong>Оранжерея</strong><small>Кальян-бар · Севастополь</small><span className="venue-meta"><b>4.9</b><i></i> 2 475 оценок</span><span className="venue-price">1 000–2 500 ₽</span></span>
          </button>
          <button className="venue-card is-extra" type="button" data-venue="snezhinka" data-category="Кафе" data-city="Севастополь" data-cuisine="all" data-source="yandex" data-award="mesto-choice" data-pet="0" data-parking="0" data-score="4.9" data-new="1" data-search="арт кафе снежинка ресторан севастополь" hidden>
            <span className="venue-image"><img src="assets/venue-cafe-unsplash.jpg" alt="Интерьер кафе" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Выбор Места</span></span><span className="venue-body"><strong>Арт-кафе Снежинка</strong><small>Кафе · Севастополь</small><span className="venue-meta"><b>4.9</b><i></i> 1 741 оценка</span><span className="venue-price">По меню</span></span>
          </button>
          <button className="venue-card is-extra" type="button" data-venue="restaurant-sevastopol" data-category="Банкетные залы" data-city="Севастополь" data-cuisine="all" data-source="yandex" data-award="mesto-choice" data-pet="0" data-parking="0" data-score="5.0" data-new="1" data-search="ресторан севастополь банкетный зал нахимова" hidden>
            <span className="venue-image"><img src="assets/venue-restaurant-unsplash.jpg" alt="Зал ресторана" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Выбор Места</span></span><span className="venue-body"><strong>Ресторан Севастополь</strong><small>Банкетный зал · Севастополь</small><span className="venue-meta"><b>5.0</b><i></i> 508 оценок</span><span className="venue-price">500–1 000 ₽</span></span>
          </button>
          <button className="venue-card is-extra" type="button" data-venue="kavabanga-pushkina" data-category="Кофейни" data-city="Симферополь" data-cuisine="Кофе и десерты" data-source="yandex" data-award="mesto-choice" data-pet="0" data-parking="0" data-score="4.6" data-new="1" data-search="кавабанга кофейня пушкина симферополь" hidden>
            <span className="venue-image"><img src="assets/venue-coffee-unsplash.jpg" alt="Интерьер кофейни" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Выбор Места</span></span><span className="venue-body"><strong>Кавабанга · Пушкина</strong><small>Кофейня · Симферополь</small><span className="venue-meta"><b>4.6</b><i></i> 232 оценки</span><span className="venue-price">Капучино от 140 ₽</span></span>
          </button>
          <button className="venue-card is-extra" type="button" data-venue="kavabanga-franko" data-category="Кофейни" data-city="Симферополь" data-cuisine="Кофе и десерты" data-source="yandex" data-award="mesto-choice" data-pet="0" data-parking="0" data-score="4.7" data-new="1" data-search="кавабанга кофейня франко симферополь" hidden>
            <span className="venue-image"><img src="assets/venue-coffee-unsplash.jpg" alt="Интерьер кофейни" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Выбор Места</span></span><span className="venue-body"><strong>Кавабанга · Франко</strong><small>Кофейня · Симферополь</small><span className="venue-meta"><b>4.7</b><i></i> 286 оценок</span><span className="venue-price">Капучино от 160 ₽</span></span>
          </button>
          <button className="venue-card is-extra" type="button" data-venue="prostor" data-category="Кофейни" data-city="Симферополь" data-cuisine="Кофе и десерты" data-source="yandex" data-award="mesto-choice" data-pet="0" data-parking="0" data-score="4.9" data-new="1" data-search="простор кофейня кондитерская симферополь" hidden>
            <span className="venue-image"><img src="assets/card-dessert.png" alt="Кофейня и десерты" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Выбор Места</span></span><span className="venue-body"><strong>Простор</strong><small>Кофейня · Симферополь</small><span className="venue-meta"><b>4.9</b><i></i> 822 оценки</span><span className="venue-price">Капучино от 190 ₽</span></span>
          </button>
          <button className="venue-card is-extra" type="button" data-venue="park-coffee" data-category="Кофейни" data-city="Симферополь" data-cuisine="Кофе и десерты" data-source="yandex" data-award="mesto-choice" data-pet="0" data-parking="0" data-score="5.0" data-new="1" data-search="парк кофе кофейня симферополь" hidden>
            <span className="venue-image"><img src="assets/venue-coffee-unsplash.jpg" alt="Интерьер кофейни" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Выбор Места</span></span><span className="venue-body"><strong>Парк кофе</strong><small>Кофейня · Симферополь</small><span className="venue-meta"><b>5.0</b><i></i> 527 оценок</span><span className="venue-price">По меню</span></span>
          </button>
          <button className="venue-card is-extra" type="button" data-venue="coffee-85" data-category="Кофейни" data-city="Симферополь" data-cuisine="Кофе и десерты" data-source="yandex" data-pet="0" data-parking="0" data-score="5.0" data-new="1" data-search="кофейня 85 с кафе симферополь" hidden>
            <span className="venue-image"><img src="assets/venue-coffee-unsplash.jpg" alt="Интерьер кофейни" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Яндекс Карты</span></span><span className="venue-body"><strong>Кофейня 85°С</strong><small>Кофейня · Симферополь</small><span className="venue-meta"><b>5.0</b><i></i> 50 оценок</span><span className="venue-price">Капучино от 150 ₽</span></span>
          </button>
        </div>
      </section>

      <section className="content-section app-promo" aria-labelledby="app-promo-title" data-tilt-stage="">
        <span className="app-promo-glow app-promo-glow--one" aria-hidden="true"></span>
        <span className="app-promo-glow app-promo-glow--two" aria-hidden="true"></span>
        <div className="app-promo-copy">
          <p className="eyebrow">Всегда под рукой</p>
          <h2 id="app-promo-title">Ваш город.<br />Ваши места.</h2>
          <p>Сохраняйте любимые рестораны, собирайте подборки и планируйте следующий вечер в «Место».</p>
          <div className="app-promo-points" aria-label="Возможности личного кабинета">
            <span><svg aria-hidden="true"><use href="#heart" /></svg>Избранное</span>
            <span><svg aria-hidden="true"><use href="#pin" /></svg>Маршруты</span>
            <span><svg aria-hidden="true"><use href="#star" /></svg>Отзывы</span>
          </div>
          <div className="app-promo-actions"><button type="button" data-open-profile="">Открыть профиль <svg><use href="#arrow" /></svg></button><div className="app-promo-meta"><span className="app-promo-live"><i className="catalog-live-dot" aria-hidden="true"></i><b data-venue-count="">31</b> мест уже в каталоге</span><button className="app-demo-toggle" type="button" data-phone-demo-toggle="" aria-pressed="false" aria-label="Приостановить анимацию макетов"><span aria-hidden="true" data-phone-demo-icon="">Ⅱ</span></button></div></div>
        </div>
        <div className="app-phones" aria-hidden="true" data-phone-scene="">
          <div className="phone phone-left" data-phone-depth="-1">
            <span className="phone-side-button phone-side-button--one"></span><span className="phone-side-button phone-side-button--two"></span>
            <span className="phone-notch"></span>
            <div className="phone-screen phone-feed">
              <div className="phone-status"><span>20:26</span><span>● ● ▰</span></div>
              <small>Добрый вечер</small>
              <b>Куда пойдём?</b>
              <div className="phone-search"><svg><use href="#search" /></svg><span>Ресторан или кухня</span></div>
              <article className="phone-place-card" data-phone-featured="">
                <span className="phone-place-photo"><img src="assets/venue-restaurant-unsplash.jpg" alt="" data-phone-featured-image="" /><i><span data-phone-featured-rating="">4.9</span> <svg><use href="#star" /></svg></i></span>
                <strong data-phone-featured-title="">Баркас</strong><small data-phone-featured-meta="">Ресторан · Симферополь</small>
              </article>
              <article className="phone-place-card phone-place-card--compact">
                <span className="phone-place-photo"><img src="assets/venue-coffee-unsplash.jpg" alt="" /><i>4.8 <svg><use href="#star" /></svg></i></span>
                <strong>Парк кофе</strong><small>Кофейня · рядом</small>
              </article>
            </div>
          </div>
          <div className="phone phone-right" data-phone-depth="1">
            <span className="phone-side-button phone-side-button--one"></span>
            <span className="phone-notch"></span>
            <div className="phone-screen phone-map">
              <div className="phone-status"><span>20:26</span><span>● ● ▰</span></div>
              <div className="phone-map-search"><svg><use href="#search" /></svg><span>Места рядом</span></div>
              <svg className="phone-map-canvas" viewBox="0 0 210 405" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                <defs>
                  <linearGradient id="phone-map-water" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#dce8e7" /><stop offset="1" stopColor="#bfd5d4" /></linearGradient>
                  <filter id="phone-map-shadow" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#4c3a26" floodOpacity=".25" /></filter>
                </defs>
                <rect width="210" height="405" fill="#f3eee7" />
                <path className="phone-map-park" d="M-20 25C28 5 50 35 81 22s43-29 86-14 52 5 69-3v94c-31 2-46-17-76-5s-38 31-74 21-58-6-106 16Z" />
                <path className="phone-map-water" d="M145-18c-7 44 4 71 31 93s24 51 1 79-25 61-7 94 11 67-31 102 4 68 34 79h66V-18Z" />
                <g className="phone-map-streets">
                  <path d="M-18 71C39 82 82 101 138 148s71 57 97 61" />
                  <path d="M18-12c4 68 41 99 64 151s20 115 7 159-6 84 26 126" />
                  <path d="M-16 244c44-34 74-32 116-21s67 4 109-43" />
                  <path d="M-25 351c51-20 86-9 124 9s75 11 126-14" />
                  <path d="M31 23c33 29 59 36 101 38s64 20 91 50" />
                  <path d="M-10 171c33-16 55-13 82 3s53 16 83 1" />
                </g>
                <path className="phone-map-route-halo" d="M26 337C52 301 28 264 60 232s76-9 89-50-29-52-12-92 43-34 55-55" />
                <path className="phone-map-route" d="M26 337C52 301 28 264 60 232s76-9 89-50-29-52-12-92 43-34 55-55" />
                <g className="phone-map-pin phone-map-pin--one" transform="translate(26 337)" filter="url(#phone-map-shadow)"><circle r="13" /><path d="M0 7s-5-5.2-5-9a5 5 0 1 1 10 0c0 3.8-5 9-5 9Z" /><circle cy="-2" r="1.8" /></g>
                <g className="phone-map-pin phone-map-pin--two" transform="translate(60 232)" filter="url(#phone-map-shadow)"><circle r="13" /><path d="M0 7s-5-5.2-5-9a5 5 0 1 1 10 0c0 3.8-5 9-5 9Z" /><circle cy="-2" r="1.8" /></g>
                <g className="phone-map-pin phone-map-pin--three" transform="translate(137 90)" filter="url(#phone-map-shadow)"><circle r="13" /><path d="M0 7s-5-5.2-5-9a5 5 0 1 1 10 0c0 3.8-5 9-5 9Z" /><circle cy="-2" r="1.8" /></g>
              </svg>
              <div className="phone-map-card"><img src="assets/venue-cafe-unsplash.jpg" alt="" /><span><strong>Зерно</strong><small>8 минут · 4.8</small></span><svg><use href="#arrow" /></svg></div>
            </div>
          </div>
          <span className="phone-scene-chip phone-scene-chip--rating"><svg><use href="#star" /></svg><b>4.9</b><small>выбор гостей</small></span>
          <span className="phone-scene-chip phone-scene-chip--saved"><svg><use href="#heart" /></svg><b>12</b><small>сохранено</small></span>
        </div>
      </section>

      <section className="content-section how-section" id="how-it-works" aria-labelledby="how-title">
        <div className="section-heading centered-heading"><div><p className="eyebrow">Простой выбор</p><h2 id="how-title">Как это работает</h2></div></div>
        <div className="how-grid" role="list">
          <article role="listitem"><span className="how-icon"><svg><use href="#search" /></svg></span><b>Выберите место</b><p>Найдите ресторан по городу, категории или настроению.</p><small>Категория, город и кухня</small></article>
          <article role="listitem"><span className="how-icon"><svg><use href="#clock" /></svg></span><b>Уточните детали</b><p>Проверьте часы работы, особенности и все адреса сети.</p><small>Меню, режим работы и удобства</small></article>
          <article role="listitem"><span className="how-icon"><svg><use href="#pin" /></svg></span><b>Откройте маршрут</b><p>Перейдите на карту и выберите удобную дорогу до заведения.</p><small>Карта, адрес и филиалы</small></article>
          <article role="listitem"><span className="how-icon"><svg><use href="#star" /></svg></span><b>Поделитесь</b><p>Сохраните ресторан и оставьте отзыв после визита.</p><small>Избранное, оценка и отзыв</small></article>
        </div>
      </section>

      <section className="content-section collections-section" id="collections" aria-labelledby="collections-title">
        <div className="section-heading">
          <div><p className="eyebrow">Готовые маршруты</p><h2 id="collections-title">Подборки</h2></div>
          <button type="button" className="text-link" data-show-all="">Все места <svg><use href="#arrow" /></svg></button>
        </div>
        <div className="collection-grid">
          <a className="collection-card breakfast" href="#catalog-view" data-collection="breakfast"><span className="collection-card-copy"><b>Лучшие завтраки<br />в городе</b><em>Кофе, выпечка и ранние открытия</em><small data-collection-count="breakfast">0 мест</small></span><i className="collection-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></i></a>
          <a className="collection-card sea" href="#catalog-view" data-collection="sea"><span className="collection-card-copy"><b>Ужин с видом<br />на воду</b><em>Террасы, набережные и морская кухня</em><small data-collection-count="sea">0 мест</small></span><i className="collection-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></i></a>
          <a className="collection-card date" href="#catalog-view" data-collection="date"><span className="collection-card-copy"><b>Для особенного<br />вечера</b><em>Камерные залы и вечерние меню</em><small data-collection-count="date">0 мест</small></span><i className="collection-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></i></a>
          <a className="collection-card pet" href="#catalog-view" data-collection="pet"><span className="collection-card-copy"><b>Где рады<br />питомцам</b><em>Проверенные pet-friendly места</em><small data-collection-count="pet">0 мест</small></span><i className="collection-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></i></a>
        </div>
      </section>

      <section className="content-section cities-section" id="cities" aria-labelledby="cities-title">
        <div className="section-heading"><div><h2 id="cities-title">Города Крыма</h2></div><button type="button" className="text-link" data-show-cities="">Открыть каталог <svg><use href="#arrow" /></svg></button></div>
        <div className="city-list">
          <button className="city-card city-card--featured simferopol" type="button" data-city-filter="Симферополь"><span className="city-card-copy"><b>Симферополь</b><small>Центр, парки и новые кофейни</small><span data-city-count="Симферополь">4 места</span></span><span className="city-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></span></button>
          <button className="city-card city-card--featured yalta" type="button" data-city-filter="Ялта"><span className="city-card-copy"><b>Ялта</b><small>Набережная и видовые рестораны</small><span data-city-count="Ялта">2 места</span></span><span className="city-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></span></button>
          <button className="city-card city-card--featured sevastopol" type="button" data-city-filter="Севастополь"><span className="city-card-copy"><b>Севастополь</b><small>Бухты, террасы и морская кухня</small><span data-city-count="Севастополь">3 места</span></span><span className="city-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></span></button>
          <button className="city-card alushta" type="button" data-city-filter="Алушта"><span className="city-card-copy"><b>Алушта</b><small>Завтраки у моря</small><span data-city-count="Алушта">1 место</span></span><span className="city-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></span></button>
          <button className="city-card evpatoria" type="button" data-city-filter="Евпатория"><span className="city-card-copy"><b>Евпатория</b><small>Старый город и семейные кафе</small><span data-city-count="Евпатория">1 место</span></span><span className="city-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></span></button>
          <button className="city-card feodosia" type="button" data-city-filter="Феодосия"><span className="city-card-copy"><b>Феодосия</b><small>Галереи и рестораны у воды</small><span data-city-count="Феодосия">0 мест</span></span><span className="city-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></span></button>
          <button className="city-card sudak" type="button" data-city-filter="Судак"><span className="city-card-copy"><b>Судак</b><small>Винные маршруты и виды</small><span data-city-count="Судак">0 мест</span></span><span className="city-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></span></button>
          <button className="city-card kerch" type="button" data-city-filter="Керчь"><span className="city-card-copy"><b>Керчь</b><small>Рыба и локальная кухня</small><span data-city-count="Керчь">0 мест</span></span><span className="city-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></span></button>
          <button className="city-card bahchisarai" type="button" data-city-filter="Бахчисарай"><span className="city-card-copy"><b>Бахчисарай</b><small>Крымскотатарская кухня</small><span data-city-count="Бахчисарай">0 мест</span></span><span className="city-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></span></button>
          <button className="city-card balaklava" type="button" data-city-filter="Балаклава"><span className="city-card-copy"><b>Балаклава</b><small>Ужин у бухты</small><span data-city-count="Балаклава">0 мест</span></span><span className="city-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></span></button>
          <button className="city-card saki" type="button" data-city-filter="Саки"><span className="city-card-copy"><b>Саки</b><small>Семейные места и кафе</small><span data-city-count="Саки">0 мест</span></span><span className="city-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></span></button>
          <button className="city-card gurzuf" type="button" data-city-filter="Гурзуф"><span className="city-card-copy"><b>Гурзуф</b><small>Улочки и террасы с видом</small><span data-city-count="Гурзуф">0 мест</span></span><span className="city-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></span></button>
        </div>
      </section>

      <section className="place-stats" aria-label="Место в цифрах"><div><b data-venue-count="" aria-label="31">31</b><span>заведение в каталоге</span></div><div><b>150+</b><span>поводов найти новое</span></div><div><b>20+</b><span>категорий и фильтров</span></div><div><b>4.8</b><span>средняя оценка мест</span></div></section>

      <section className="platform" id="platform" hidden aria-labelledby="platform-title">
        <div className="platform-intro"><p className="eyebrow">Одна система — три роли</p><h2 id="platform-title">У каждого<br /><em>своё место</em></h2><p>Показываем, как выглядит продукт для команды «Места»: от городской витрины до кабинета ресторатора.</p><div className="view-switcher" role="tablist" aria-label="Выберите вид продукта"><button className="is-active" type="button" role="tab" aria-selected="true" data-view="admin">Админ-панель</button><button type="button" role="tab" aria-selected="false" data-view="merchant">Кабинет ресторатора</button></div></div>
        <div className="dashboard-stage">
          <article className="dashboard admin-dashboard is-visible" data-dashboard="admin" aria-label="Демо админ-панели">
            <aside className="dashboard-sidebar"><a className="dashboard-brand brand-mark" href="#guide" aria-label="Место"><span className="brand-word">МЕСТ</span><span className="brand-orb" aria-hidden="true"><svg><use href="#logo-star" /></svg></span></a><p>Система управления</p><nav><a className="active" href="#platform"><svg><use href="#grid" /></svg>Обзор</a><a href="#platform"><svg><use href="#menu" /></svg>Заведения <b>12</b></a><a href="#platform"><svg><use href="#users" /></svg>Пользователи</a><a href="#platform"><svg><use href="#chart" /></svg>Статистика</a><a href="#platform"><svg><use href="#sliders" /></svg>Настройки</a></nav><a className="sidebar-bottom" href="#guide">← Вернуться в гид</a></aside>
            <div className="dashboard-content"><div className="dashboard-top"><div><p className="dash-kicker">Место · администрирование</p><h3>Добрый день, Ксения</h3></div><div className="dash-actions"><button className="period" type="button">1–7 июля 2026</button><button className="circle-button" type="button" aria-label="Уведомления"><svg><use href="#bell" /></svg></button><span className="avatar">КП</span></div></div>
              <div className="metrics"><div><span>Заявки на модерации</span><b>12</b><small className="up">+3 за сегодня</small></div><div><span>Посещения гида</span><b>18 542</b><small className="up">+34,2% к неделе</small></div><div><span>Переходы на сайт</span><b>2 845</b><small className="up">+10,8% к неделе</small></div><div><span>Новые отзывы</span><b>156</b><small className="up">+7,2% к неделе</small></div></div>
              <section className="analytics-card"><div className="chart-heading"><div><h4>Статистика за неделю</h4><span><i className="legend-violet"></i>Просмотры <i className="legend-blue"></i>Переходы</span></div><button type="button">По дням</button></div><svg className="line-chart" viewBox="0 0 700 250" role="img" aria-label="График просмотров и переходов за неделю"><g className="chart-grid"><path d="M45 35h625M45 80h625M45 125h625M45 170h625M45 215h625"/><path d="M45 20v195"/></g><polyline className="violet-line" points="48,130 150,70 250,148 350,76 450,110 555,65 660,135"/><polyline className="blue-line" points="48,175 150,135 250,180 350,132 450,170 555,130 660,176"/><g className="chart-dots"><circle cx="48" cy="130" r="4"/><circle cx="150" cy="70" r="4"/><circle cx="250" cy="148" r="4"/><circle cx="350" cy="76" r="4"/><circle cx="450" cy="110" r="4"/><circle cx="555" cy="65" r="4"/><circle cx="660" cy="135" r="4"/></g><g className="chart-labels"><text x="40" y="242">1 июл</text><text x="142" y="242">2 июл</text><text x="242" y="242">3 июл</text><text x="342" y="242">4 июл</text><text x="442" y="242">5 июл</text><text x="542" y="242">6 июл</text><text x="642" y="242">7 июл</text></g></svg></section>
              <div className="admin-lower"><section className="panel-card moderation"><div className="panel-title"><h4>Последние заявки</h4><button type="button">Открыть все</button></div><ul><li><img src="assets/card-restaurant.png" alt="" /><span><b>Ресторан «Прибой»</b><small>Ялта · Рестораны</small></span><time>12:42</time></li><li><img src="assets/card-coffee.png" alt="" /><span><b>Кофейня «Север»</b><small>Симферополь · Кофейни</small></span><time>11:08</time></li><li><img src="assets/card-bar.png" alt="" /><span><b>Бар «Линия»</b><small>Севастополь · Бары</small></span><time>Вчера</time></li></ul></section><section className="panel-card sources"><div className="panel-title"><h4>Источники переходов</h4></div><div className="source-wrap"><div className="donut"><b>18 542</b><span>визита</span></div><ul><li><i></i>Прямой заход <b>46%</b></li><li><i></i>Поиск <b>30%</b></li><li><i></i>Соцсети <b>15%</b></li><li><i></i>Реферальные <b>9%</b></li></ul></div></section></div>
            </div>
          </article>

          <article className="dashboard merchant-dashboard" data-dashboard="merchant" aria-label="Демо кабинета ресторатора">
            <aside className="dashboard-sidebar"><a className="dashboard-brand brand-mark" href="#guide" aria-label="Место"><span className="brand-word">МЕСТ</span><span className="brand-orb" aria-hidden="true"><svg><use href="#logo-star" /></svg></span></a><p>Кабинет ресторатора</p><nav><a className="active" href="#platform"><svg><use href="#grid" /></svg>Главная</a><a href="#platform"><svg><use href="#chart" /></svg>Статистика</a><a href="#platform"><svg><use href="#menu" /></svg>Меню</a><a href="#platform"><svg><use href="#camera" /></svg>Фотогалерея</a><a href="#platform"><svg><use href="#star" /></svg>Отзывы</a></nav><a className="sidebar-bottom" href="#guide">← Вернуться в гид</a></aside>
            <div className="dashboard-content"><div className="dashboard-top merchant-top"><div className="place-identity"><img src="assets/card-restaurant.png" alt="" /><div><p>Ваше заведение</p><h3>Marea <span>·</span> Ялта</h3></div></div><div className="dash-actions"><button className="period" type="button">1–7 июля 2026</button><button className="circle-button" type="button" aria-label="Уведомления"><svg><use href="#bell" /></svg></button><span className="avatar owner">МС</span></div></div>
              <div className="metrics merchant-metrics"><div><span>Просмотры карточки</span><b>5 842</b><small className="up">+12,5%</small></div><div><span>Переходы на сайт</span><b>1 248</b><small className="down">−8,3%</small></div><div><span>Построили маршрут</span><b>342</b><small className="up">+15,2%</small></div><div><span>Добавили в избранное</span><b>89</b><small className="up">+6,1%</small></div></div>
              <section className="analytics-card merchant-chart"><div className="chart-heading"><div><h4>Интерес к вашему месту</h4><span><i className="legend-violet"></i>Просмотры карточки</span></div><button type="button">По дням</button></div><svg className="line-chart" viewBox="0 0 700 225" role="img" aria-label="График просмотров заведения за неделю"><g className="chart-grid"><path d="M45 35h625M45 80h625M45 125h625M45 170h625"/><path d="M45 20v150"/></g><polyline className="violet-line soft-fill" points="48,145 150,112 250,52 350,108 450,87 555,35 660,20"/><g className="chart-dots"><circle cx="48" cy="145" r="4"/><circle cx="150" cy="112" r="4"/><circle cx="250" cy="52" r="4"/><circle cx="350" cy="108" r="4"/><circle cx="450" cy="87" r="4"/><circle cx="555" cy="35" r="4"/><circle cx="660" cy="20" r="4"/></g><g className="chart-labels"><text x="40" y="210">1 июл</text><text x="142" y="210">2 июл</text><text x="242" y="210">3 июл</text><text x="342" y="210">4 июл</text><text x="442" y="210">5 июл</text><text x="542" y="210">6 июл</text><text x="642" y="210">7 июл</text></g></svg></section>
              <section className="quick-actions"><div className="panel-title"><h4>Быстрые действия</h4></div><div><button type="button"><svg><use href="#sliders" /></svg>Изменить данные</button><button type="button"><svg><use href="#menu" /></svg>Обновить меню</button><button type="button"><svg><use href="#camera" /></svg>Добавить фото</button><button type="button"><svg><use href="#plus" /></svg>Создать акцию</button></div></section>
              <div className="merchant-lower"><section className="panel-card reviews"><div className="panel-title"><h4>Отзывы гостей</h4><button type="button">Смотреть все</button></div><ul><li><span className="review-avatar">АИ</span><p><b>Алина Игоревна</b><small>Атмосферно и спокойно, вернёмся на закат.</small><em>★★★★★</em></p></li><li><span className="review-avatar orange">ДС</span><p><b>Дмитрий Савельев</b><small>Красивый вид и внимательная команда.</small><em>★★★★★</em></p></li><li><span className="review-avatar blue">МБ</span><p><b>Мария Белова</b><small>Отличный вечер, особенно понравилось меню.</small><em>★★★★★</em></p></li></ul></section><section className="panel-card gallery"><div className="panel-title"><h4>Фотогалерея</h4><button type="button">Открыть</button></div><div><img src="assets/card-restaurant.png" alt="Интерьер ресторана" loading="lazy" /><img src="assets/card-dessert.png" alt="Десерт ресторана" loading="lazy" /><img src="assets/card-bar.png" alt="Напиток ресторана" loading="lazy" /></div></section></div>
            </div>
          </article>
        </div>
      </section>
      <section className="categories-view" id="categories-view" hidden aria-labelledby="all-categories-title">
        <div className="categories-view-inner">
          <button className="back-link" type="button" data-home-link="">← Вернуться на главную</button>
          <h1 id="all-categories-title">Все категории</h1>
          <p className="catalog-copy">Выберите формат — затем уточните кухню, город, парковку или возможность прийти с питомцем.</p>
          <div className="categories-full-grid">
            <button className="category-tile dining" type="button" data-filter-category="Рестораны"><svg><use href="#restaurant" /></svg><span>Рестораны</span><small data-category-count="Рестораны">2 места</small></button>
            <button className="category-tile cafe" type="button" data-filter-category="Кафе"><svg><use href="#coffee" /></svg><span>Кафе</span><small data-category-count="Кафе">2 места</small></button>
            <button className="category-tile coffee" type="button" data-filter-category="Кофейни"><svg><use href="#coffee" /></svg><span>Кофейни</span><small data-category-count="Кофейни">2 места</small></button>
            <button className="category-tile dessert" type="button" data-filter-category="Кондитерские"><svg><use href="#cake" /></svg><span>Кондитерские</span><small data-category-count="Кондитерские">1 место</small></button>
            <button className="category-tile pizza" type="button" data-filter-category="Пиццерии"><svg><use href="#pizza" /></svg><span>Пиццерии</span><small data-category-count="Пиццерии">1 место</small></button>
            <button className="category-tile casual" type="button" data-filter-category="Фаст-кэжуал"><svg><use href="#bolt" /></svg><span>Фаст-кэжуал</span><small data-category-count="Фаст-кэжуал">1 место</small></button>
            <button className="category-tile bar" type="button" data-filter-category="Бары"><svg><use href="#cocktail" /></svg><span>Бары</span><small data-category-count="Бары">1 место</small></button>
            <button className="category-tile gastropub" type="button" data-filter-category="Гастробары"><svg><use href="#cocktail" /></svg><span>Гастробары</span><small data-category-count="Гастробары">1 место</small></button>
            <button className="category-tile bar" type="button" data-filter-category="Караоке-клубы"><svg><use href="#cocktail" /></svg><span>Караоке-клубы</span><small data-category-count="Караоке-клубы">2 места</small></button>
            <button className="category-tile dining" type="button" data-filter-category="Суши-бары"><svg><use href="#restaurant" /></svg><span>Суши-бары</span><small data-category-count="Суши-бары">1 место</small></button>
            <button className="category-tile bar" type="button" data-filter-category="Кальян-бары"><svg><use href="#cocktail" /></svg><span>Кальян-бары</span><small data-category-count="Кальян-бары">1 место</small></button>
            <button className="category-tile dining" type="button" data-filter-category="Банкетные залы"><svg><use href="#restaurant" /></svg><span>Банкетные залы</span><small data-category-count="Банкетные залы">2 места</small></button>
          </div>
        </div>
      </section>

      <section className="catalog-view" id="catalog-view" hidden aria-labelledby="catalog-title">
        <div className="catalog-inner">
          <div className="catalog-hero" id="catalog-hero">
            <span className="catalog-hero-glow" aria-hidden="true"></span>
            <button className="back-link" type="button" data-home-link="">← Вернуться на главную</button>
            <p className="eyebrow" id="catalog-eyebrow">Каталог мест</p>
            <h1 id="catalog-title">Все места города</h1>
            <p className="catalog-copy" id="catalog-copy">Популярные и новые заведения, собранные в одном списке.</p>
          </div>
          <div className="catalog-controls">
            <label>Категория<select id="catalog-category"><option value="all">Все категории</option><option value="Рестораны">Рестораны</option><option value="Кафе">Кафе</option><option value="Кофейни">Кофейни</option><option value="Кондитерские">Кондитерские</option><option value="Пиццерии">Пиццерии</option><option value="Фаст-кэжуал">Фаст-кэжуал</option><option value="Бары">Бары</option><option value="Гастробары">Гастробары</option><option value="Караоке-клубы">Караоке-клубы</option><option value="Суши-бары">Суши-бары</option><option value="Кальян-бары">Кальян-бары</option><option value="Банкетные залы">Банкетные залы</option></select></label>
            <label>Город<select id="catalog-city"><option value="all">Все города</option><option value="Симферополь">Симферополь</option><option value="Ялта">Ялта</option><option value="Севастополь">Севастополь</option><option value="Алушта">Алушта</option><option value="Евпатория">Евпатория</option><option value="Феодосия">Феодосия</option><option value="Судак">Судак</option><option value="Керчь">Керчь</option><option value="Бахчисарай">Бахчисарай</option><option value="Балаклава">Балаклава</option><option value="Саки">Саки</option><option value="Гурзуф">Гурзуф</option></select></label>
            <label>Кухня<select id="catalog-cuisine"><option value="all">Любая кухня</option><option value="Европейская">Европейская</option><option value="Средиземноморская">Средиземноморская</option><option value="Итальянская">Итальянская</option><option value="Грузинская">Грузинская</option><option value="Паназиатская">Паназиатская</option><option value="Японская">Японская</option><option value="Мясная">Мясная</option><option value="Рыбная">Рыбная</option><option value="Вегетарианская">Вегетарианская</option><option value="Кофе и десерты">Кофе и десерты</option><option value="Фаст-кэжуал">Фаст-кэжуал</option></select></label>
            <label>Сортировка<select id="catalog-sort"><option value="popular">Сначала популярные</option><option value="new">Сначала новые</option><option value="mixed">Все вперемешку</option></select></label>
            <label className="filter-toggle"><input id="catalog-pet" type="checkbox" /><span><svg><use href="#paw" /></svg>С питомцами</span></label>
            <label className="filter-toggle"><input id="catalog-parking" type="checkbox" /><span><svg><use href="#park" /></svg>Есть парковка</span></label>
          </div>
          <div className="catalog-source-row">
            <div className="catalog-source-label"><span className="catalog-source-mark" aria-hidden="true"><svg><use href="#logo-star" /></svg></span><span><b>Единый каталог «Места»</b><small>Опубликованные карточки редакции, пользователей и владельцев заведений</small></span></div>
            <span id="catalog-venues-status" role="status" aria-live="polite"></span>
            <button className="catalog-refresh-action" id="catalog-refresh" type="button"><svg><use href="#search" /></svg>Обновить каталог</button>
          </div>
          <div className="catalog-toolbar"><span id="catalog-count">0 мест</span><button className="text-link" type="button" data-home-link="">К подборкам <svg><use href="#arrow" /></svg></button></div>
          <div className="venue-grid catalog-grid" id="catalog-grid"></div>
          <button className="catalog-load-more" id="catalog-load-more" type="button" hidden>Показать ещё 50 заведений <svg><use href="#arrow" /></svg></button>
          <p className="catalog-venues-note">В каталоге показываются только опубликованные карточки «Места». Для построения маршрута можно открыть внешнюю карту.</p>
        </div>
      </section>

      <section className="profile-view" id="profile-view" hidden aria-labelledby="profile-title">
        <div className="profile-inner"><button className="back-link" type="button" data-home-link="">← Вернуться на главную</button><div className="profile-heading"><span className="profile-large-avatar" data-profile-avatar="">М</span><div><p className="eyebrow">Личный кабинет</p><h1 id="profile-title" data-profile-name="">Ваш профиль</h1><p><span data-profile-email=""></span><br />Избранные места, отзывы и заявки — в одном кабинете.</p></div><div className="profile-actions"><a className="profile-action merchant-profile-link" href="/merchant" hidden>Кабинет ресторатора</a><button className="profile-action" type="button" data-open-submission=""><svg><use href="#plus" /></svg>Добавить заведение</button><button className="profile-action secondary" type="button" data-logout="">Выйти</button></div></div><div className="profile-grid"><section className="profile-card"><div><p className="eyebrow">Избранное</p><h2>Места, к которым хочется вернуться</h2></div><div className="saved-list" id="profile-saved-list"></div></section><section className="profile-card profile-review"><p className="eyebrow">Ваш голос</p><h2>Отзывы помогают выбирать лучше</h2><p>Откройте карточку заведения и поделитесь впечатлением — отзыв появится после модерации.</p><button className="black-action" type="button" data-home-link="">Найти место <svg><use href="#arrow" /></svg></button></section></div></div>
      </section>
    </main>

    <footer className="site-footer" id="site-footer"><div className="footer-main"><div className="footer-brand"><a className="brand brand-mark" href="#guide" data-home-link="" aria-label="Место — на главную"><svg className="brand-pin"><use href="#pin" /></svg><span className="brand-word">Место</span><span className="brand-orb" aria-hidden="true"><svg><use href="#logo-star" /></svg></span></a><p>Ваш гид по любимым ресторанам<br />и новым впечатлениям.</p></div><div className="footer-column"><h4>Навигация</h4><a href="#popular" data-home-link="">Рестораны</a><a href="#categories" data-open-categories="">Категории</a><a href="#collections" data-home-link="">Подборки</a><a href="#cities" data-home-link="">Города</a></div><div className="footer-column"><h4>Помощь</h4><a href="#how-it-works" data-home-link="">Как это работает</a><a href="/help#faq">Вопросы и ответы</a><a href="/help#partners">Партнёрам</a><a href="/help#rules">Правила сервиса</a></div><div className="footer-column footer-contacts"><h4>Для вас</h4><a href="/?open=favorites#guide">Избранное</a><a href="/?open=submission#guide">Добавить заведение</a><a href="/?open=profile#guide">Личный кабинет</a><span>Республика Крым</span></div></div><div className="footer-bottom"><small>© 2026 Место. Все права защищены.</small><span><a href="/help#privacy">Политика конфиденциальности</a><a href="/help#terms">Пользовательское соглашение</a></span></div></footer>

    <div className="mobile-nav" role="dialog" aria-modal="true" aria-label="Навигация" hidden><div className="mobile-nav-panel"><button type="button" className="mobile-nav-close" aria-label="Закрыть меню">×</button><a href="#popular" data-home-link="">Рестораны</a><a href="#categories" data-open-categories="">Категории</a><a href="#collections" data-home-link="">Подборки</a><a href="#how-it-works" data-home-link="">О проекте</a><a href="/help#faq">Помощь</a><button type="button" className="mobile-nav-action" data-open-favorites="">Избранное</button><button type="button" className="mobile-nav-action" data-open-auth="">Личный кабинет</button></div></div>

    <dialog id="venue-dialog" aria-labelledby="venue-dialog-title">
      <button className="dialog-close" type="button" aria-label="Закрыть">×</button>
      <div className="dialog-gallery">
        <div className="dialog-media"><img src="assets/card-restaurant.png" alt="" /><span className="dialog-photo-action">Смотреть фото <svg><use href="#camera" /></svg></span></div>
        <div className="dialog-thumbnails" aria-hidden="true"><img src="assets/venue-restaurant-unsplash.jpg" alt="" /><img src="assets/real-dining-night.jpg" alt="" /><img src="assets/card-restaurant.png" alt="" /><img src="assets/card-dessert.png" alt="" /></div>
      </div>
      <div className="dialog-content">
        <div className="dialog-title"><div><p className="eyebrow">Ресторан · Ялта</p><h2 id="venue-dialog-title">Marea</h2><span className="dialog-rating"><b>4.9</b> <i>★★★★★</i> 248 отзывов</span></div><button className="dialog-heart" type="button" aria-label="Добавить в избранное"><svg><use href="#heart" /></svg></button></div>
        <p className="dialog-description">Средиземноморская кухня, спокойный свет и открытая терраса с видом на море. Подходит для неспешного ужина и особенного повода.</p>
        <div className="feature-list"><span><svg><use href="#paw" /></svg>Можно с питомцами</span><span><svg><use href="#park" /></svg>Своя парковка</span><span><svg><use href="#external" /></svg>Есть веранда</span></div>
        <div className="dialog-promotions" hidden aria-live="polite"></div>
      </div>
      <div className="dialog-expanded">
        <section className="dialog-detail-section dialog-about-panel" aria-labelledby="dialog-about-title">
          <div className="dialog-section-heading"><h3 id="dialog-about-title">О заведении</h3></div>
          <p className="dialog-about-copy">Уютное место с внимательным сервисом, продуманным меню и атмосферой, ради которой хочется вернуться.</p>
          <dl className="dialog-about-list">
            <div><dt><svg><use href="#wifi" /></svg>Wi‑Fi</dt><dd>Бесплатный</dd></div>
            <div><dt><svg><use href="#clock" /></svg>Режим работы</dt><dd>10:00–22:00</dd></div>
            <div><dt><svg><use href="#park" /></svg>Парковка</dt><dd>Уточняйте у заведения</dd></div>
            <div><dt><svg><use href="#star" /></svg>Особенности</dt><dd>Авторская кухня</dd></div>
            <div><dt><svg><use href="#restaurant" /></svg>Средний чек</dt><dd className="dialog-average-value">от 1 300 ₽</dd></div>
          </dl>
        </section>
        <section className="dialog-detail-section dialog-menu-panel" aria-labelledby="dialog-menu-title">
          <div className="dialog-section-heading"><h3 id="dialog-menu-title">Меню</h3><a className="dialog-menu-source" href="https://yandex.ru/maps/" target="_blank" rel="noreferrer">Актуальное меню <svg><use href="#external" /></svg></a></div>
          <div className="dialog-menu-list"></div>
        </section>
        <section className="dialog-detail-section dialog-reviews-panel" aria-labelledby="dialog-reviews-title">
          <div className="dialog-section-heading"><h3 id="dialog-reviews-title">Отзывы</h3></div>
          <div className="dialog-review-layout"><div className="dialog-review-score"><b>4.9</b><span>★★★★★</span><small>Оценка гостей</small></div><article><header><span className="dialog-review-avatar">М</span><p><b>Редакция «Место»</b><small>Рекомендуем обратить внимание</small></p></header><p className="dialog-review-copy">Атмосферное место с аккуратной подачей и спокойным интерьером.</p></article></div>
          <button className="dialog-review-action" type="button" data-open-review=""><svg><use href="#star" /></svg>Добавить отзыв <svg><use href="#arrow" /></svg></button>
        </section>
        <section className="dialog-detail-section dialog-map-panel" aria-labelledby="dialog-map-title">
          <div className="dialog-section-heading"><h3 id="dialog-map-title">На карте</h3></div>
          <a className="dialog-map-card" href="https://yandex.ru/maps/" target="_blank" rel="noreferrer"><span className="dialog-map-pin"><svg><use href="#pin" /></svg></span><span><b className="dialog-map-address">Адрес заведения</b><small>Открыть на карте <svg><use href="#external" /></svg></small></span></a>
          <button className="dialog-route-action" type="button">Построить маршрут <svg><use href="#arrow" /></svg></button>
        </section>
      </div>
    </dialog>
    <dialog id="auth-dialog" className="form-dialog" aria-labelledby="auth-title"><button className="dialog-close" type="button" aria-label="Закрыть">×</button><div className="form-dialog-inner"><p className="eyebrow">Добро пожаловать в Место</p><h2 id="auth-title">Войти в аккаунт</h2><p className="form-lead">Сохраняйте любимые места и оставляйте отзывы.</p><form id="auth-form"><label>Почта или логин<input name="login" type="text" autoComplete="username" placeholder="you@example.com" required /></label><label>Пароль<input name="password" type="password" autoComplete="current-password" placeholder="Введите пароль" required /></label><p className="auth-error" role="alert" hidden></p><button className="primary-action full" type="submit">Войти <svg><use href="#arrow" /></svg></button></form><div className="form-divider"><span>или</span></div><div className="social-grid"><button type="button" data-social="google"><b>G</b>Google</button><button type="button" data-social="yandex"><b>Я</b>Яндекс</button><button type="button" data-social="vk"><b>VK</b>ВКонтакте</button></div><p className="social-auth-note" aria-live="polite"></p><button className="form-link" type="button" data-open-register="">Регистрация</button></div></dialog>
    <dialog id="register-dialog" className="form-dialog" aria-labelledby="register-title"><button className="dialog-close" type="button" aria-label="Закрыть">×</button><div className="form-dialog-inner"><p className="eyebrow">Новый аккаунт</p><h2 id="register-title">Создать профиль</h2><p className="form-lead">Один профиль для избранного, отзывов и новых заведений.</p><form id="register-form"><label>Имя<input name="name" type="text" autoComplete="name" placeholder="Как вас зовут?" required /></label><label>Логин<input name="username" type="text" autoComplete="username" placeholder="Например, alex" pattern="[A-Za-z0-9._-]{3,48}" title="От 3 до 48 латинских букв, цифр, точек, дефисов или подчёркиваний" required /></label><label>Почта<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></label><label>Пароль<input name="password" type="password" autoComplete="new-password" placeholder="Минимум 10 символов, буква и цифра" minLength={10} required /></label><p className="auth-error" role="alert" hidden></p><button className="primary-action full" type="submit">Создать аккаунт <svg><use href="#arrow" /></svg></button></form><div className="form-divider"><span>или</span></div><div className="social-grid"><button type="button" data-social="google"><b>G</b>Google</button><button type="button" data-social="yandex"><b>Я</b>Яндекс</button><button type="button" data-social="vk"><b>VK</b>ВКонтакте</button></div><p className="social-auth-note" aria-live="polite"></p><button className="form-link" type="button" data-open-auth="">Уже есть аккаунт</button></div></dialog>
    <dialog id="review-dialog" className="form-dialog review-dialog" aria-labelledby="review-title"><button className="dialog-close" type="button" aria-label="Закрыть">×</button><div className="form-dialog-inner"><p className="eyebrow">Ваше впечатление</p><h2 id="review-title">Добавить отзыв</h2><p className="form-lead">Оценка и текст появятся в карточке после проверки редакцией.</p><form id="review-form"><label>Ваше имя<input name="authorName" type="text" autoComplete="name" placeholder="Как вас представить?" required /></label><label>Оценка<select name="rating" required><option value="5">5 — отлично</option><option value="4">4 — хорошо</option><option value="3">3 — нормально</option><option value="2">2 — есть замечания</option><option value="1">1 — не понравилось</option></select></label><label>Отзыв<textarea name="review" rows={5} minLength={20} placeholder="Что вам понравилось: атмосфера, кухня, сервис?" required></textarea></label><label className="check-field"><input name="consent" type="checkbox" required /><span>Подтверждаю, что отзыв основан на моём посещении.</span></label><button className="primary-action full" type="submit">Отправить отзыв <svg><use href="#arrow" /></svg></button></form></div></dialog>
    <dialog id="submission-dialog" className="form-dialog submission-dialog" aria-labelledby="submission-title">
      <button className="dialog-close" type="button" aria-label="Закрыть">×</button>
      <div className="form-dialog-inner">
        <p className="eyebrow">Карточка заведения</p>
        <h2 id="submission-title">Добавить место в каталог</h2>
        <p className="form-lead">Заявка попадёт на проверку редакции. После одобрения карточка появится в выбранном городе.</p>
        <form id="submission-form">
          <div className="form-grid">
            <label>Ваше имя<input name="contactName" type="text" autoComplete="name" placeholder="Как к вам обращаться?" required /></label>
            <label>Почта для связи<input name="contactEmail" type="email" autoComplete="email" placeholder="you@example.com" required /></label>
            <label>Название заведения<input name="title" type="text" placeholder="Например, Marea" required /></label>
            <label>Город<select name="city" required><option value="">Выберите город</option><option>Симферополь</option><option>Ялта</option><option>Севастополь</option><option>Алушта</option><option>Евпатория</option><option>Феодосия</option></select></label>
            <label>Категория<select name="category" required><option value="">Выберите категорию</option><option>Рестораны</option><option>Кафе</option><option>Кофейни</option><option>Кондитерские</option><option>Пиццерии</option><option>Фаст-кэжуал</option><option>Бары</option><option>Гастробары</option><option>Караоке-клубы</option><option>Суши-бары</option><option>Кальян-бары</option><option>Банкетные залы</option></select></label>
            <label>Кухня<select name="cuisine"><option>Европейская</option><option>Средиземноморская</option><option>Итальянская</option><option>Грузинская</option><option>Паназиатская</option><option>Японская</option><option>Мясная</option><option>Рыбная</option><option>Вегетарианская</option><option>Кофе и десерты</option></select></label>
            <label>Адрес<input name="address" type="text" placeholder="Улица, дом" /></label>
            <label>Телефон<input name="phone" type="tel" autoComplete="tel" placeholder="+7 (978) 000-00-00" /></label>
            <label>Сайт<input name="website" type="url" placeholder="https://example.ru" /></label>
            <label>Режим работы<input name="hours" type="text" placeholder="ежедневно, 09:00–23:00" /></label>
            <label>Средний чек<input name="averageCheck" type="text" placeholder="Например, 1 500 ₽" /></label>
            <label>Особенности<input name="features" type="text" placeholder="Парковка, Wi‑Fi, можно с собакой" /></label>
          </div>
          <label>Описание<textarea name="description" rows={4} placeholder="Расскажите про атмосферу, меню и важные детали" required></textarea></label>
          <label className="upload-field"><span><svg><use href="#camera" /></svg>Фото заведения</span><input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple /><small>Можно добавить до 6 фотографий, JPG/PNG/WebP</small></label>
          <label className="check-field"><input name="consent" type="checkbox" required /><span>Я подтверждаю, что информация актуальна и разрешаю публикацию после модерации.</span></label>
          <button className="primary-action full" type="submit">Отправить на модерацию <svg><use href="#arrow" /></svg></button>
        </form>
      </div>
    </dialog>
    <dialog id="favorites-dialog" className="favorites-dialog" aria-labelledby="favorites-title"><button className="dialog-close" type="button" aria-label="Закрыть">×</button><div className="favorites-inner"><p className="eyebrow">Личный список</p><h2 id="favorites-title">Избранные места</h2><p className="form-lead">Сохраняйте места — они останутся здесь для следующего выбора.</p><div className="favorites-list" id="favorites-list"></div><button className="black-action" type="button" data-home-link="">Найти ещё место <svg><use href="#arrow" /></svg></button></div></dialog>
    <div className="toast" role="status" aria-live="polite"></div>
    </>
  );
}
