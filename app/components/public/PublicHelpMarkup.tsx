/**
 * Trusted static markup ported mechanically from help.html.
 * It contains no user-derived data and intentionally uses literal JSX instead
 * without raw HTML injection so the legacy DOM contract remains reviewable.
 */
export function PublicHelpMarkup() {
  return (
    <>
    <a className="skip-link" href="#content">Перейти к содержанию</a>

    <header className="site-header">
      <a className="brand" href="/" aria-label="Место — на главную">
        <svg className="brand-pin" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.25"/></svg>
        <span>Место</span>
        <span className="brand-orb" aria-hidden="true"><svg className="brand-star" viewBox="0 0 24 24"><path d="M12 1.5c.7 6.3 1.9 9.5 8.5 10.5-6.6 1-7.8 4.2-8.5 10.5C11.3 16.2 10.1 13 3.5 12c6.6-1 7.8-4.2 8.5-10.5Z"/></svg></span>
      </a>
      <nav aria-label="Навигация по сайту">
        <a href="/#popular">Рестораны</a>
        <a href="/#categories">Категории</a>
        <a href="/#collections">Подборки</a>
      </nav>
      <button className="theme-toggle" type="button" data-theme-toggle="" aria-label="Сменить цветовую тему">
        <span className="theme-toggle-glyph" aria-hidden="true"><i className="theme-sun"></i><i className="theme-moon"></i><i className="theme-star">✦</i></span>
        <span className="sr-only" data-theme-status="" aria-live="polite">Включена светлая тема</span>
      </button>
      <a className="back-link" href="/">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H6m5-6-6 6 6 6"/></svg>
        На главную
      </a>
    </header>

    <main id="content" data-react-route="help">
      <section className="hero" aria-labelledby="page-title">
        <div className="hero-copy">
          <p className="eyebrow">Помощь и документы</p>
          <h1 id="page-title">Всё важное —<br />без мелкого шрифта</h1>
          <p>Ответы о каталоге, отзывах и сотрудничестве. Мы собрали правила в одном месте и написали их человеческим языком.</p>
        </div>
        <div className="hero-card" aria-label="Быстрая навигация">
          <span className="hero-card-mark" aria-hidden="true">М</span>
          <div>
            <strong>Нужен быстрый ответ?</strong>
            <p>Начните с частых вопросов — возможно, решение уже здесь.</p>
          </div>
          <a href="#faq">Открыть FAQ <span aria-hidden="true">→</span></a>
        </div>
      </section>

      <div className="help-layout">
        <aside className="contents" aria-label="Разделы помощи">
          <p>Содержание</p>
          <nav>
            <a href="#faq"><span>01</span>Вопросы и ответы</a>
            <a href="#partners"><span>02</span>Партнёрам</a>
            <a href="#rules"><span>03</span>Правила сервиса</a>
            <a href="#privacy"><span>04</span>Конфиденциальность</a>
            <a href="#terms"><span>05</span>Соглашение</a>
          </nav>
        </aside>

        <div className="articles">
          <section className="article" id="faq" aria-labelledby="faq-title">
            <header>
              <p className="section-number">01</p>
              <div><p className="eyebrow">Коротко о главном</p><h2 id="faq-title">Вопросы и ответы</h2></div>
            </header>
            <div className="faq-list">
              <details open>
                <summary>Как найти подходящее заведение?</summary>
                <p>Укажите город и запрос в поиске или откройте категорию. В каталоге можно уточнить кухню, наличие парковки и возможность прийти с питомцем.</p>
              </details>
              <details>
                <summary>Откуда берутся сведения о местах?</summary>
                <p>Мы объединяем данные заведений, информацию от пользователей и доступные актуальные источники. Рестораторы могут уточнять сведения о своём заведении, а редакция проверяет изменения перед публикацией.</p>
              </details>
              <details>
                <summary>Как добавить новое заведение?</summary>
                <p>На главной странице нажмите «Добавить заведение», заполните карточку и приложите фотографии. После проверки редакцией место появится в каталоге.</p>
              </details>
              <details>
                <summary>Почему мой отзыв не появился сразу?</summary>
                <p>Отзывы проходят автоматическую и редакционную проверку. Обычно это занимает немного времени. Мы не публикуем оскорбления, рекламу и тексты, не относящиеся к личному опыту посещения.</p>
              </details>
              <details>
                <summary>Как сохранить место в избранное?</summary>
                <p>Авторизуйтесь и нажмите на сердце в карточке заведения. Сохранённые места будут доступны в личном кабинете на любом вашем устройстве.</p>
              </details>
              <details>
                <summary>Что означает знак «Выбор Места»?</summary>
                <p>Это собственная отметка редакции «Места». Её получают заведения с устойчиво высокой оценкой, заполненной карточкой и хорошей репутацией у гостей. Отметка не продаётся.</p>
              </details>
            </div>
          </section>

          <section className="article" id="partners" aria-labelledby="partners-title">
            <header>
              <p className="section-number">02</p>
              <div><p className="eyebrow">Для заведений</p><h2 id="partners-title">Партнёрам</h2></div>
            </header>
            <p className="lead">«Место» помогает ресторанам, кафе и барам поддерживать точную карточку и общаться с гостями без лишнего шума.</p>
            <div className="feature-grid">
              <article><span>01</span><h3>Управление карточкой</h3><p>Обновляйте описание, контакты, часы работы, фотографии и особенности заведения.</p></article>
              <article><span>02</span><h3>Меню и акции</h3><p>Публикуйте актуальные позиции меню и предложения, чтобы гости видели их до визита.</p></article>
              <article><span>03</span><h3>Отзывы гостей</h3><p>Следите за опубликованной обратной связью в кабинете своего заведения.</p></article>
              <article><span>04</span><h3>Сводка</h3><p>Контролируйте карточки, позиции меню, активные акции и количество отзывов.</p></article>
            </div>
            <div className="action-card">
              <div><strong>Заведения ещё нет в каталоге?</strong><p>Отправьте информацию на модерацию — это бесплатно.</p></div>
              <a href="/?open=submission#guide">Добавить заведение <span aria-hidden="true">→</span></a>
            </div>
          </section>

          <section className="article" id="rules" aria-labelledby="rules-title">
            <header>
              <p className="section-number">03</p>
              <div><p className="eyebrow">Принципы каталога</p><h2 id="rules-title">Правила сервиса</h2></div>
            </header>
            <div className="prose">
              <h3>Достоверность информации</h3>
              <p>Публикуйте сведения, которые можно проверить: настоящее название, адрес, контакты, режим работы и фотографии самого заведения. Не выдавайте рекламу или чужую карточку за собственную.</p>
              <h3>Честные отзывы</h3>
              <p>Пишите только о личном опыте. Запрещены угрозы, дискриминация, персональные данные третьих лиц, массовые повторы, заказные оценки и ссылки рекламного характера.</p>
              <h3>Фотографии и права</h3>
              <p>Загружая фотографию, вы подтверждаете, что вправе её публиковать. Изображение должно относиться к месту, блюду или событию и не нарушать права людей в кадре.</p>
              <h3>Модерация</h3>
              <p>Редакция вправе уточнить сведения, скрыть спорный материал или отклонить публикацию с объяснением причины. Повторное нарушение может привести к ограничению доступа.</p>
              <h3>Обновления</h3>
              <p>Правила могут меняться вместе с сервисом. Актуальная версия всегда опубликована на этой странице.</p>
            </div>
          </section>

          <section className="article" id="privacy" aria-labelledby="privacy-title">
            <header>
              <p className="section-number">04</p>
              <div><p className="eyebrow">Ваши данные</p><h2 id="privacy-title">Конфиденциальность</h2></div>
            </header>
            <div className="prose">
              <p>Мы используем данные только для работы сервиса: создания аккаунта, сохранения избранного, публикации отправленных материалов, защиты от злоупотреблений и улучшения каталога.</p>
              <h3>Что может храниться</h3>
              <p>Имя профиля, адрес электронной почты, способ входа, сохранённые места, отправленные отзывы и заявки. Пароли обрабатываются системой авторизации и не отображаются сотрудникам «Места».</p>
              <h3>Передача третьим сторонам</h3>
              <p>Мы не продаём персональные данные. Техническим подрядчикам передаётся только необходимый минимум для хранения данных, авторизации и стабильной работы сайта.</p>
              <h3>Ваш контроль</h3>
              <p>Вы можете выйти из аккаунта в любой момент. Самостоятельное удаление аккаунта появится вместе с запуском службы поддержки; до этого сервис не публикует контактные данные пользователя и использует их только для работы профиля.</p>
            </div>
          </section>

          <section className="article" id="terms" aria-labelledby="terms-title">
            <header>
              <p className="section-number">05</p>
              <div><p className="eyebrow">Условия использования</p><h2 id="terms-title">Пользовательское соглашение</h2></div>
            </header>
            <div className="prose">
              <p>Пользуясь «Местом», вы соглашаетесь соблюдать правила сервиса и законы, применимые к публикуемым материалам. Каталог предназначен для личного выбора заведений и добросовестного обмена опытом.</p>
              <h3>Аккаунт</h3>
              <p>Вы отвечаете за сохранность доступа к аккаунту и действия, совершённые из него. Указывайте актуальные данные и не передавайте доступ посторонним.</p>
              <h3>Контент пользователя</h3>
              <p>Права на ваш контент остаются у вас. Вы разрешаете «Месту» показывать и технически обрабатывать его в рамках работы каталога, пока материал опубликован.</p>
              <h3>Информация о заведениях</h3>
              <p>Мы стремимся поддерживать данные актуальными, но рекомендуем уточнять критичные детали — режим работы, цены и доступность услуг — непосредственно у заведения.</p>
              <h3>Ограничение доступа</h3>
              <p>Мы можем ограничить доступ при нарушении правил, попытках повредить сервис или обойти механизмы безопасности.</p>
            </div>
            <p className="updated">Редакция от 22 июля 2026 года</p>
          </section>
        </div>
      </div>
    </main>

    <footer>
      <a className="brand footer-brand" href="/" aria-label="Место — на главную">
        <svg className="brand-pin" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.25"/></svg>
        <span>Место</span>
        <span className="brand-orb" aria-hidden="true"><svg className="brand-star" viewBox="0 0 24 24"><path d="M12 1.5c.7 6.3 1.9 9.5 8.5 10.5-6.6 1-7.8 4.2-8.5 10.5C11.3 16.2 10.1 13 3.5 12c6.6-1 7.8-4.2 8.5-10.5Z"/></svg></span>
      </a>
      <p>Город начинается с любимых мест.</p>
      <nav aria-label="Документы"><a href="#rules">Правила</a><a href="#privacy">Конфиденциальность</a><a href="#terms">Соглашение</a></nav>
      <small>© 2026 Место. Все права защищены.</small>
    </footer>

    </>
  );
}
