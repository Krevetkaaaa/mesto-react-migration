const venueData = {
  marea: { title: 'Баркас', type: 'Ресторан · Севастополь', rating: '4.9', reviews: 'редакционная оценка', price: 'от 1 300 ₽', image: 'assets/venue-restaurant-unsplash.jpg', text: 'Ресторан черноморской кухни с винным бутиком и спокойной атмосферой у воды. Подходит для неспешного ужина и особенного повода.', features: ['Средиземноморская кухня', 'Парковка рядом', 'Есть веранда'] },
  zerno: { title: 'Зерно', type: 'Кофейня · Симферополь', rating: '4.8', reviews: '191 отзыв', price: 'от 450 ₽', image: 'assets/venue-coffee-unsplash.jpg', text: 'Светлая спешелти-кофейня с фильтр-кофе, сезонной выпечкой и столиками для работы или долгого завтрака.', features: ['Можно с питомцами', 'Парковка рядом', 'Wi‑Fi'] },
  sova: { title: 'Gio restaurant & bar', type: 'Бар · Севастополь', rating: '4.7', reviews: 'редакционная оценка', price: 'от 800 ₽', image: 'assets/venue-cocktail-unsplash.jpg', text: 'Ресторан и бар для поздних встреч: авторские коктейли, вечерний свет и меню для долгих разговоров.', features: ['До 02:00', 'Парковка рядом', 'Авторские коктейли'] },
  syrniki: { title: 'Утро', type: 'Кафе · Симферополь', rating: '4.9', reviews: '87 отзывов', price: 'от 600 ₽', image: 'assets/venue-cafe-unsplash.jpg', text: 'Кафе для тех, кто никуда не спешит: завтраки весь день, хорошее зерно и десерты, которые хочется делить.', features: ['Можно с питомцами', 'Завтраки весь день', 'Есть веранда'] },
  lapsha: { title: 'Лапша', type: 'Фаст-кэжуал · Симферополь', rating: '4.6', reviews: '64 отзыва', price: 'от 520 ₽', image: 'assets/card-coffee.png', text: 'Быстрые обеды, домашние бульоны и открытая кухня для тех, кто хочет вкусно поесть без долгого ожидания.', features: ['Обеденное меню', 'Быстрая подача', 'Самовывоз'] },
  pristan: { title: 'Айвазовский', type: 'Ресторан · Симферополь', rating: '4.8', reviews: 'редакционная оценка', price: 'от 1 100 ₽', image: 'assets/real-dining-night.jpg', text: 'Ресторанный комплекс с европейской и авторской кухней. Перед визитом советуем проверить часы работы и актуальное меню.', features: ['Европейская кухня', 'Авторская кухня', 'Парковка рядом'] },
  sahara: { title: 'Сахара', type: 'Кондитерская · Ялта', rating: '4.7', reviews: '58 отзывов', price: 'от 380 ₽', image: 'assets/card-dessert.png', text: 'Небольшая кондитерская с десертами ручной работы, тёплым светом и чашкой кофе после прогулки.', features: ['Можно с питомцами', 'Витрина десертов', 'Навынос'] },
  portofino: { title: 'Портофино', type: 'Пиццерия · Ялта', rating: '4.6', reviews: '124 отзыва', price: 'от 900 ₽', image: 'assets/real-restaurant-interior.jpg', text: 'Итальянская кухня, пицца из печи и большой стол для компании.', features: ['Можно с питомцами', 'Своя парковка', 'Пицца из печи'] },
  nabrerezhnaya: { title: 'Набережная', type: 'Гастробар · Севастополь', rating: '4.8', reviews: '102 отзыва', price: 'от 950 ₽', image: 'assets/card-bar.png', text: 'Гастробар с компактным меню, коктейлями и вечерним ритмом города.', features: ['До 01:00', 'Парковка рядом', 'Авторские коктейли'] },
  taro: { title: 'Таро', type: 'Кафе · Алушта', rating: '4.7', reviews: '73 отзыва', price: 'от 620 ₽', image: 'assets/card-coffee.png', text: 'Кафе на каждый день: завтраки, спокойная музыка и столики у окна.', features: ['Можно с питомцами', 'Своя парковка', 'Завтраки весь день'] },
  'krym-bakery': { title: 'Крымская пекарня', type: 'Кофейня · Евпатория', rating: '4.5', reviews: '41 отзыв', price: 'от 310 ₽', image: 'assets/card-dessert.png', text: 'Свежая выпечка, хлеб и кофе для прогулки у моря.', features: ['Выпечка весь день', 'Парковка рядом', 'Навынос'] },
  beluga: { title: 'Белуга Стор', type: 'Ресторан · Симферополь', rating: '5.0', reviews: '392 оценки на Картах', price: 'По меню', image: 'assets/venue-restaurant-unsplash.jpg', mapsUrl: 'https://yandex.ru/maps/org/beluga_stor/106259641007/', text: 'Ресторан рыбы и морепродуктов на проспекте Кирова, 19. В карточке Яндекс Карт отмечена доставка продуктов.', features: ['Рыба и морепродукты', 'Доставка продуктов', 'просп. Кирова, 19'] },
  gnezdo: { title: 'Gnezdo', type: 'Ресторан · Симферополь', rating: '5.0', reviews: '289 оценок на Картах', price: 'По меню', image: 'assets/real-dining-night.jpg', text: 'Публичная карточка на Яндекс Картах: ресторан и кафе на улице Пушкина, 9.', features: ['Ресторан и кафе', 'ул. Пушкина, 9', 'График на Картах'] },
  'el-pastor': { title: 'Эль Пастор', type: 'Бар · Симферополь', rating: '5.0', reviews: '1 343 оценки на Картах', price: 'По меню', image: 'assets/venue-cocktail-unsplash.jpg', text: 'Публичная карточка на Яндекс Картах: бар и ресторан на улице Ушинского, 4.', features: ['Бар и ресторан', 'ул. Ушинского, 4', 'График на Картах'] },
  bemine: { title: 'BEmine Гастро-Кафе', type: 'Кафе · Симферополь', rating: '5.0', reviews: '5 325 оценок на Картах', price: '998–1 998 ₽', image: 'assets/venue-cafe-unsplash.jpg', text: 'Публичная карточка на Яндекс Картах: кафе и ресторан на улице Горького, 1.', features: ['Кафе и ресторан', 'ул. Горького, 1', 'График на Картах'] },
  monroe: { title: 'Монро', type: 'Караоке-клуб · Симферополь', rating: '4.9', reviews: '2 018 оценок на Картах', price: '997 ₽ и выше', image: 'assets/card-bar.png', text: 'Публичная карточка на Яндекс Картах: ресторан и караоке-клуб на проспекте Кирова, 27.', features: ['Ресторан и караоке', 'просп. Кирова, 27', 'График на Картах'] },
  volna: { title: 'Волна', type: 'Ресторан · Ялта', rating: '4.9', reviews: '23 оценки на Картах', price: 'По меню', image: 'assets/real-restaurant-interior.jpg', text: 'Публичная карточка на Яндекс Картах: ресторан на улице Дражинского, 50 в Ялте.', features: ['Ресторан', 'ул. Дражинского, 50', 'График на Картах'] },
  krasnov: { title: 'Краснов', type: 'Банкетный зал · Ялта', rating: '4.9', reviews: '47 оценок на Картах', price: '2 000–5 001 ₽', image: 'assets/venue-restaurant-unsplash.jpg', text: 'Публичная карточка на Яндекс Картах: ресторан и банкетный зал на улице имени Архитектора Н. П. Краснова, 2.', features: ['Ресторан и банкетный зал', 'ул. Краснова, 2', 'График на Картах'] },
  paititi: { title: 'Paititi', type: 'Ресторан · Ялта', rating: '5.0', reviews: '967 оценок на Картах', price: 'По меню', image: 'assets/real-dining-night.jpg', text: 'Публичная карточка на Яндекс Картах: ресторан и кафе на улице Рузвельта, 12А.', features: ['Ресторан и кафе', 'ул. Рузвельта, 12А', 'График на Картах'] },
  'selyam-aleykum': { title: 'Селям Алейкум', type: 'Кафе · Ялта', rating: '4.9', reviews: '1 700 оценок на Картах', price: '250–800 ₽', image: 'assets/venue-cafe-unsplash.jpg', text: 'Публичная карточка на Яндекс Картах: ресторан и кафе на улице Дражинского, 50Б.', features: ['Ресторан и кафе', 'ул. Дражинского, 50Б', 'График на Картах'] },
  terrasa: { title: 'Терраса', type: 'Караоке-клуб · Ялта', rating: '4.4', reviews: '459 оценок на Картах', price: '1 500–4 000 ₽', image: 'assets/card-bar.png', text: 'Публичная карточка на Яндекс Картах: ресторан и караоке-клуб на набережной имени В. И. Ленина, 14Ф.', features: ['Ресторан и караоке', 'наб. Ленина, 14Ф', 'Круглосуточно'] },
  omega: { title: 'Омега', type: 'Ресторан · Севастополь', rating: '4.8', reviews: '122 оценки на Картах', price: '1 500–2 500 ₽', image: 'assets/real-restaurant-interior.jpg', text: 'Публичная карточка на Яндекс Картах: ресторан и кафе на улице Ерошенко, 19.', features: ['Ресторан и кафе', 'ул. Ерошенко, 19', 'График на Картах'] },
  'asian-kitchen-bar': { title: 'Asian Kitchen Bar', type: 'Суши-бар · Севастополь', rating: '5.0', reviews: '703 оценки на Картах', price: '1 000–1 500 ₽', image: 'assets/venue-cocktail-unsplash.jpg', text: 'Публичная карточка на Яндекс Картах: ресторан и суши-бар на проспекте Нахимова, 5А.', features: ['Ресторан и суши-бар', 'просп. Нахимова, 5А', 'График на Картах'] },
  oranzhereya: { title: 'Оранжерея', type: 'Кальян-бар · Севастополь', rating: '4.9', reviews: '2 475 оценок на Картах', price: '1 000–2 500 ₽', image: 'assets/card-bar.png', text: 'Публичная карточка на Яндекс Картах: ресторан и кальян-бар на улице Очаковцев, 21А.', features: ['Ресторан и кальян-бар', 'ул. Очаковцев, 21А', 'График на Картах'] },
  snezhinka: { title: 'Арт-кафе Снежинка', type: 'Кафе · Севастополь', rating: '4.9', reviews: '1 741 оценка на Картах', price: 'По меню', image: 'assets/venue-cafe-unsplash.jpg', text: 'Публичная карточка на Яндекс Картах: ресторан и кафе на Большой Морской улице, 19.', features: ['Ресторан и кафе', 'Большая Морская, 19', 'График на Картах'] },
  'restaurant-sevastopol': { title: 'Ресторан Севастополь', type: 'Банкетный зал · Севастополь', rating: '5.0', reviews: '508 оценок на Картах', price: '500–1 000 ₽', image: 'assets/venue-restaurant-unsplash.jpg', text: 'Публичная карточка на Яндекс Картах: ресторан и банкетный зал на проспекте Нахимова, 8.', features: ['Ресторан и банкетный зал', 'просп. Нахимова, 8', 'График на Картах'] },
  'kavabanga-pushkina': { title: 'Кавабанга · Пушкина', type: 'Кофейня · Симферополь', rating: '4.6', reviews: '232 оценки на Картах', price: 'Капучино от 140 ₽', image: 'assets/venue-coffee-unsplash.jpg', text: 'Публичная карточка на Яндекс Картах: кофейня и кофе с собой на улице Пушкина, 9А.', features: ['Кофейня', 'ул. Пушкина, 9А', 'График на Картах'] },
  'kavabanga-franko': { title: 'Кавабанга · Франко', type: 'Кофейня · Симферополь', rating: '4.7', reviews: '286 оценок на Картах', price: 'Капучино от 160 ₽', image: 'assets/venue-coffee-unsplash.jpg', text: 'Публичная карточка на Яндекс Картах: кофейня и кафе на бульваре Ивана Франко, 12.', features: ['Кофейня и кафе', 'бул. Ивана Франко, 12', 'График на Картах'] },
  prostor: { title: 'Простор', type: 'Кофейня · Симферополь', rating: '4.9', reviews: '822 оценки на Картах', price: 'Капучино от 190 ₽', image: 'assets/card-dessert.png', text: 'Публичная карточка на Яндекс Картах: кофейня и кондитерская на бульваре Ивана Франко, 2.', features: ['Кофейня и кондитерская', 'бул. Ивана Франко, 2', 'График на Картах'] },
  'park-coffee': { title: 'Парк кофе', type: 'Кофейня · Симферополь', rating: '5.0', reviews: '527 оценок на Картах', price: 'По меню', image: 'assets/venue-coffee-unsplash.jpg', text: 'Публичная карточка на Яндекс Картах: кофейня на улице Фрунзе, 32.', features: ['Кофейня', 'ул. Фрунзе, 32', 'График на Картах'] },
  'coffee-85': { title: 'Кофейня 85°С', type: 'Кофейня · Симферополь', rating: '5.0', reviews: '50 оценок на Картах', price: 'Капучино от 150 ₽', image: 'assets/venue-coffee-unsplash.jpg', mapsUrl: 'https://yandex.ru/maps/org/kofeynya_85_s/183092255405/', text: 'Кофейня и кафе на бульваре Ленина, 10. В карточке Яндекс Карт отмечены кофе с собой, доставка, еда навынос и возможность прийти с собакой.', features: ['Можно с собакой', 'Кофе с собой', 'Еда навынос'] }
};

const venueExtras = {
  marea: { hours: '12:00–00:00', wifi: true, menu: [['Тартар из тунца', 'с авокадо и цитрусом', '890 ₽'], ['Черноморская рыба', 'на гриле, сезонные овощи', '1 240 ₽'], ['Павлова с инжиром', 'воздушный крем и ягоды', '620 ₽']] },
  zerno: { hours: '08:00–22:00', wifi: true, menu: [['Фильтр-кофе', 'свежеобжаренное зерно', '260 ₽'], ['Сырники', 'с фермерской сметаной', '420 ₽'], ['Круассан с миндалём', 'выпечка из печи', '290 ₽']] },
  sova: { hours: '17:00–02:00', wifi: true, menu: [['Gio Negroni', 'авторский твист на классике', '720 ₽'], ['Тунец татаки', 'кунжут, понзу, зелень', '940 ₽'], ['Бриошь с крабом', 'сливочный соус и икра', '780 ₽']] },
  syrniki: { hours: '08:00–21:00', wifi: true, menu: [['Драники с лососем', 'яйцо пашот и зелень', '690 ₽'], ['Сырники', 'вишня, сметана, фисташка', '490 ₽'], ['Флет уайт', 'спешелти зерно', '280 ₽']] },
  lapsha: { hours: '10:00–22:00', wifi: true, menu: [['Рамен с цыплёнком', 'наваристый бульон, лапша', '590 ₽'], ['Удон с говядиной', 'овощи и соус терияки', '640 ₽'], ['Матча-тоник', 'цитрус и лед', '290 ₽']] },
  pristan: { hours: '12:00–23:00', wifi: true, menu: [['Томлёная телятина', 'картофель, демиглас', '1 180 ₽'], ['Кальмар на гриле', 'соус ромеско', '890 ₽'], ['Шоколадный фондан', 'мороженое и вишня', '490 ₽']] },
  sahara: { hours: '09:00–21:00', wifi: true, menu: [['Эклер ванильный', 'заварной крем и глазурь', '260 ₽'], ['Медовик', 'тонкие коржи и сметанный крем', '360 ₽'], ['Капучино', 'свежеобжаренное зерно', '250 ₽']] },
  portofino: { hours: '11:00–23:00', wifi: true, menu: [['Пицца маргарита', 'томаты, моцарелла, базилик', '690 ₽'], ['Паста с креветками', 'сливочный соус и лимон', '820 ₽'], ['Тирамису', 'классический рецепт', '430 ₽']] },
  nabrerezhnaya: { hours: '16:00–01:00', wifi: true, menu: [['Коктейль «Берег»', 'джин, персик, жасмин', '680 ₽'], ['Тартин с ростбифом', 'пиклс и горчица', '590 ₽'], ['Запечённый баклажан', 'тахини, томаты, зелень', '520 ₽']] },
  taro: { hours: '09:00–22:00', wifi: true, menu: [['Яйца бенедикт', 'лосось, голландез, бриошь', '650 ₽'], ['Тост с авокадо', 'яйцо, томаты, семечки', '490 ₽'], ['Раф ванильный', 'мягкий кофе и сливки', '310 ₽']] },
  'krym-bakery': { hours: '08:00–20:00', wifi: true, menu: [['Хлеб на закваске', 'выпечка сегодняшнего утра', '150 ₽'], ['Булочка с корицей', 'сливочная глазурь', '190 ₽'], ['Американо', 'двойной эспрессо', '180 ₽']] },
  beluga: { hours: 'до 23:00', wifi: false, menu: [] },
  gnezdo: { hours: 'График на Картах', wifi: false, menu: [] },
  'el-pastor': { hours: 'График на Картах', wifi: false, menu: [] },
  bemine: { hours: 'График на Картах', wifi: false, menu: [] },
  monroe: { hours: 'График на Картах', wifi: false, menu: [] },
  volna: { hours: 'График на Картах', wifi: false, menu: [] },
  krasnov: { hours: 'График на Картах', wifi: false, menu: [] },
  paititi: { hours: 'График на Картах', wifi: false, menu: [] },
  'selyam-aleykum': { hours: 'График на Картах', wifi: false, menu: [] },
  terrasa: { hours: 'Круглосуточно', wifi: false, menu: [] },
  omega: { hours: 'График на Картах', wifi: false, menu: [] },
  'asian-kitchen-bar': { hours: 'График на Картах', wifi: false, menu: [] },
  oranzhereya: { hours: 'График на Картах', wifi: false, menu: [] },
  snezhinka: { hours: 'График на Картах', wifi: false, menu: [] },
  'restaurant-sevastopol': { hours: 'График на Картах', wifi: false, menu: [] },
  'kavabanga-pushkina': { hours: 'График на Картах', wifi: false, menu: [] },
  'kavabanga-franko': { hours: 'График на Картах', wifi: false, menu: [] },
  prostor: { hours: 'График на Картах', wifi: false, menu: [] },
  'park-coffee': { hours: 'График на Картах', wifi: false, menu: [] },
  'coffee-85': { hours: 'до 21:00', wifi: false, menu: [] }
};

document.querySelectorAll('button.venue-card[data-venue]').forEach((button) => {
  const card = document.createElement('article');
  Array.from(button.attributes).forEach((attribute) => {
    if (attribute.name !== 'type') card.setAttribute(attribute.name, attribute.value);
  });
  card.append(...button.childNodes);
  button.replaceWith(card);
});

const dialog = document.querySelector('#venue-dialog');
const dialogImage = dialog.querySelector('.dialog-media img');
const dialogType = dialog.querySelector('.eyebrow');
const dialogTitle = dialog.querySelector('#venue-dialog-title');
const dialogRating = dialog.querySelector('.dialog-rating');
const dialogDescription = dialog.querySelector('.dialog-description');
const dialogPrice = dialog.querySelector('.dialog-average-value');
const dialogFeatures = dialog.querySelector('.feature-list');
const toast = document.querySelector('.toast');
const cards = Array.from(document.querySelectorAll('.venue-card[data-venue]'));
const venueGrid = document.querySelector('.venue-grid');
const catalogView = document.querySelector('#catalog-view');
const categoriesView = document.querySelector('#categories-view');
const profileView = document.querySelector('#profile-view');
const catalogGrid = document.querySelector('#catalog-grid');
const catalogCount = document.querySelector('#catalog-count');
const catalogTitle = document.querySelector('#catalog-title');
const catalogEyebrow = document.querySelector('#catalog-eyebrow');
const catalogCopy = document.querySelector('#catalog-copy');
const catalogHero = document.querySelector('#catalog-hero');
const catalogCategoryInput = document.querySelector('#catalog-category');
const catalogVenuesStatus = document.querySelector('#catalog-venues-status');
const catalogLoadMore = document.querySelector('#catalog-load-more');
const heroCityInput = document.querySelector('#venue-search select[name="city"]');
const homeSections = Array.from(document.querySelectorAll('main > section:not(#catalog-view):not(#categories-view):not(#profile-view):not(#platform)'));
let toastTimeout;
let activeVenue;
let catalogFilter = 'all';
let catalogCity = 'all';
let catalogCuisine = 'all';
let catalogSort = 'popular';
let catalogPet = false;
let catalogParking = false;
const favoriteVenueIds = new Set();
const favoriteSnapshots = new Map();
let isAuthenticated = false;
let currentUser = null;
let favoriteAccessPrompted = false;
let catalogRequestController;
const catalogVenueIds = new Set();
let storedVenueCards = [];
let catalogNextSkip = null;
let catalogFound = 0;
let catalogRequestContext = null;
let catalogDatabaseConfigured = null;
let homeStoredVenueCards = [];
let catalogRequestSequence = 0;
const catalogRequestCache = new Map();

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

function iconMarkup(icon) {
  return `<svg aria-hidden="true"><use href="#${icon}"></use></svg>`;
}

function featureIcon(feature) {
  const text = String(feature).toLowerCase();
  if (text.includes('питомц')) return iconMarkup('paw');
  if (text.includes('с собак') || text.includes('животн')) return iconMarkup('paw');
  if (text.includes('парков')) return iconMarkup('park');
  if (text.includes('wi-fi') || text.includes('wifi') || /вай.?фай/.test(text)) return iconMarkup('wifi');
  if (text.includes('телефон') || /^\+\d/.test(text)) return iconMarkup('phone');
  if (text.includes('00:') || text.includes('режим') || text.includes('график') || text.includes('круглосуточно')) return iconMarkup('clock');
  if (text.includes('коктейл')) return iconMarkup('cocktail');
  if (text.includes('выпеч') || text.includes('десерт')) return iconMarkup('cake');
  return iconMarkup('sparkle');
}

function featureClass(feature) {
  const text = String(feature).toLowerCase();
  if (text.includes('питомц') || text.includes('с собак') || text.includes('животн')) return 'feature--pet';
  if (text.includes('парков')) return 'feature--parking';
  if (text.includes('wi-fi') || text.includes('wifi') || /вай.?фай/.test(text)) return 'feature--wifi';
  if (text.includes('телефон') || /^\+\d/.test(text)) return 'feature--phone';
  if (text.includes('00:') || text.includes('режим') || text.includes('график') || text.includes('круглосуточно')) return 'feature--hours';
  if (text.includes('улиц') || text.includes('проспект') || text.includes('шоссе') || text.includes('переул')) return 'feature--address';
  return 'feature--category';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character]);
}

function normalizeVenueCategory(categories = []) {
  const value = String(categories.join(' ')).toLowerCase();
  if (value.includes('суши')) return 'Суши-бары';
  if (value.includes('кальян')) return 'Кальян-бары';
  if (value.includes('караоке')) return 'Караоке-клубы';
  if (value.includes('банкет')) return 'Банкетные залы';
  if (value.includes('кейтер')) return 'Кейтеринг';
  if (value.includes('доставк')) return 'Доставка еды';
  if (value.includes('столов')) return 'Столовые';
  if (value.includes('пекар')) return 'Пекарни';
  if (value.includes('быстрое питание')) return 'Быстрое питание';
  if (value.includes('пицц')) return 'Пиццерии';
  if (value.includes('кондитер') || value.includes('десерт')) return 'Кондитерские';
  if (value.includes('кофейн') || value.includes('кофе с собой')) return 'Кофейни';
  if (value.includes('гастробар') || value.includes('гастро-бар')) return 'Гастробары';
  if (value.includes('бар') || value.includes('паб')) return 'Бары';
  if (value.includes('кафе')) return 'Кафе';
  return 'Рестораны';
}

function imageForStoredVenue(category) {
  if (category === 'Кофейни') return 'assets/venue-coffee-unsplash.jpg';
  if (category === 'Кафе') return 'assets/venue-cafe-unsplash.jpg';
  if (category === 'Кондитерские') return 'assets/card-dessert.png';
  if (['Пиццерии', 'Пекарни', 'Быстрое питание', 'Фаст-кэжуал'].includes(category)) return 'assets/real-restaurant-interior.jpg';
  if (category === 'Суши-бары') return 'assets/real-dining-night.jpg';
  if (['Бары', 'Гастробары', 'Кальян-бары', 'Караоке-клубы'].includes(category)) return 'assets/venue-cocktail-unsplash.jpg';
  return 'assets/venue-restaurant-unsplash.jpg';
}

function normalizedName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .trim();
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function websiteLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (_) {
    return 'Сайт заведения';
  }
}

function phoneHref(phone) {
  return `tel:${String(phone || '').replace(/[^+\d]/g, '')}`;
}

function branchWord(count) {
  const ending = count % 100 >= 11 && count % 100 <= 14 ? 5 : count % 10;
  if (ending === 1) return 'адрес';
  if (ending >= 2 && ending <= 4) return 'адреса';
  return 'адресов';
}

function activeVenueId() {
  return Object.keys(venueData).find((key) => venueData[key] === activeVenue);
}

function getVenueExtras(id) {
  return venueExtras[id] || { hours: '10:00–22:00', wifi: true, menu: [] };
}

function yandexMapsUrl(venue) {
  return venue.mapsUrl || `https://yandex.ru/maps/?text=${encodeURIComponent(`${venue.title} ${venue.type.replace('·', '')}`)}`;
}

function venueAddress(venue) {
  if (venue.address) return venue.address;
  const addressFeature = venue.features.find((feature) => /(ул\.|улиц|просп|наб\.|бульвар|переул|шоссе|адрес)/i.test(feature));
  return addressFeature || venue.type.split('·')[1]?.trim() || 'Республика Крым';
}

function renderDialogDetails() {
  if (!activeVenue) return;
  const id = activeVenueId();
  const extras = getVenueExtras(id);
  const mapsHref = yandexMapsUrl(activeVenue);
  const address = venueAddress(activeVenue);
  const hasParking = activeVenue.features.some((feature) => /парков/i.test(feature));
  const isPetFriendly = activeVenue.features.some((feature) => /(питом|собак)/i.test(feature));
  const highlightedFeatures = activeVenue.features.filter((feature) => !/(ул\.|улиц|просп|наб\.|бульвар)/i.test(feature)).slice(0, 4);

  dialogDescription.textContent = activeVenue.text;
  dialogFeatures.className = 'feature-list';
  dialogFeatures.innerHTML = highlightedFeatures.map((feature) => `<span class="venue-feature ${featureClass(feature)}">${featureIcon(feature)}${escapeHtml(feature)}</span>`).join('');
  const promotions = dialog.querySelector('.dialog-promotions');
  promotions.hidden = true;
  promotions.replaceChildren();

  dialog.querySelector('.dialog-about-copy').textContent = activeVenue.text;
  dialog.querySelector('.dialog-about-list').innerHTML = [
    `<div><dt>${iconMarkup('wifi')}Wi‑Fi</dt><dd>${extras.wifi ? 'Бесплатный' : 'Уточняйте у заведения'}</dd></div>`,
    `<div><dt>${iconMarkup('clock')}Режим работы</dt><dd>${escapeHtml(extras.hours || 'График на Картах')}</dd></div>`,
    `<div><dt>${iconMarkup('park')}Парковка</dt><dd>${hasParking ? 'Есть рядом' : 'Уточняйте у заведения'}</dd></div>`,
    `<div><dt>${iconMarkup('paw')}С питомцами</dt><dd>${isPetFriendly ? 'Можно' : 'Уточняйте у заведения'}</dd></div>`
  ].join('');

  const menu = extras.menu.length
    ? extras.menu
    : [['Актуальное меню', 'Состав и цены доступны в официальной карточке заведения', 'Открыть']];
  const menuImages = [activeVenue.image, 'assets/card-dessert.png', 'assets/real-dining-night.jpg'];
  dialog.querySelector('.dialog-menu-list').innerHTML = menu.slice(0, 3).map(([title, description, price], index) => `<a class="dialog-menu-item" href="${escapeHtml(mapsHref)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(menuImages[index] || activeVenue.image)}" alt="" /><span><b>${escapeHtml(title)}</b><small>${escapeHtml(description)}</small></span><strong>${escapeHtml(price)}</strong></a>`).join('');
  const menuSource = dialog.querySelector('.dialog-menu-source');
  menuSource.href = mapsHref;

  dialog.querySelector('.dialog-review-score b').textContent = activeVenue.rating || '—';
  dialog.querySelector('.dialog-review-score small').textContent = activeVenue.reviews || 'Оценка уточняется';
  dialog.querySelector('.dialog-review-copy').textContent = activeVenue.text;

  const mapCard = dialog.querySelector('.dialog-map-card');
  mapCard.href = mapsHref;
  dialog.querySelector('.dialog-map-address').textContent = address;
}

function merchantPrice(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(amount)} ₽` : 'Уточнить';
}

async function loadPublicVenueContent(venue) {
  if (!venue?.databaseId) return;
  try {
    const payload = await requestJson(`/api/venue-content?venueId=${encodeURIComponent(venue.databaseId)}`);
    if (activeVenue !== venue) return;
    const menu = Array.isArray(payload.menu) ? payload.menu : [];
    if (menu.length) {
      const menuList = dialog.querySelector('.dialog-menu-list');
      menuList.innerHTML = menu.slice(0, 8).map((item) => {
        const image = /^https?:\/\//i.test(String(item.photo_url || '')) ? item.photo_url : venue.image;
        return `<article class="dialog-menu-item"><img src="${escapeHtml(image)}" alt="" /><span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.description || item.section || 'Позиция меню')}</small></span><strong>${escapeHtml(merchantPrice(item.price))}</strong></article>`;
      }).join('');
      const source = dialog.querySelector('.dialog-menu-source');
      source.href = venue.website || yandexMapsUrl(venue);
      source.innerHTML = `Меню от заведения ${iconMarkup('external')}`;
    }
    const promotions = Array.isArray(payload.promotions) ? payload.promotions : [];
    const promotionBox = dialog.querySelector('.dialog-promotions');
    promotionBox.hidden = promotions.length === 0;
    promotionBox.innerHTML = promotions.slice(0, 2).map((item) => `<article>${iconMarkup('sparkle')}<span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.description || 'Актуальное предложение заведения')}</small></span></article>`).join('');
  } catch {
    // Статическая карточка остаётся полностью рабочей, если дополнительный контент недоступен.
  }
}

function openVenue(id) {
  activeVenue = venueData[id];
  if (!activeVenue) return;
  dialogImage.src = activeVenue.image;
  dialogImage.alt = activeVenue.title;
  const galleryImages = [activeVenue.image, 'assets/real-dining-night.jpg', 'assets/venue-restaurant-unsplash.jpg', 'assets/card-dessert.png'];
  dialog.querySelectorAll('.dialog-thumbnails img').forEach((image, index) => {
    image.src = galleryImages[index] || activeVenue.image;
    image.alt = index === 0 ? activeVenue.title : '';
  });
  dialogType.textContent = activeVenue.type;
  dialogTitle.textContent = activeVenue.title;
  dialogRating.classList.toggle('is-source', !activeVenue.rating);
  dialogRating.innerHTML = activeVenue.rating
    ? `<b>${activeVenue.rating}</b> <i>★★★★★</i> ${activeVenue.reviews}`
    : `${iconMarkup('logo-star')} Карточка каталога «Места»`;
  dialogPrice.textContent = activeVenue.price;
  dialog.querySelector('.dialog-heart')?.classList.toggle('is-saved', favoriteVenueIds.has(id));
  renderDialogDetails();
  if (dialog.open) dialog.close();
  dialog.showModal();
  loadPublicVenueContent(activeVenue);
}

function renderCardDetails(card) {
  const id = card.dataset.venue;
  const venue = venueData[id];
  const extras = getVenueExtras(id);
  const body = card.querySelector('.venue-body');
  const image = card.querySelector('.venue-image');
  const petFriendly = card.dataset.pet === '1';
  const hasParking = card.dataset.parking === '1';
  const amenities = [
    ...(petFriendly ? [{ icon: 'paw', label: 'Можно с питомцами', kind: 'pet' }] : []),
    ...(extras.wifi ? [{ icon: 'wifi', label: 'Wi‑Fi', kind: 'wifi' }] : []),
    ...(hasParking ? [{ icon: 'park', label: 'Парковка', kind: 'parking' }] : []),
    { icon: 'clock', label: extras.hours, kind: 'hours' }
  ];

  if (body && !body.querySelector('.venue-amenities')) {
    body.insertAdjacentHTML('beforeend', `<span class="venue-amenities">${amenities.map((item) => `<span class="venue-amenity${item.kind ? ` venue-amenity--${item.kind}` : ''}"><i class="venue-amenity-icon" aria-hidden="true">${iconMarkup(item.icon)}</i><span>${escapeHtml(item.label)}</span></span>`).join('')}</span>`);
  }
  if (body && venue && !body.querySelector('.venue-card-description')) {
    const summary = String(venue.text || '').replace(/\s+/g, ' ').trim();
    body.querySelector('small')?.insertAdjacentHTML('afterend', `<span class="venue-card-description">${escapeHtml(summary.length > 138 ? `${summary.slice(0, 135).trim()}…` : summary)}</span>`);
  }
  if (body && !body.querySelector('.venue-card-action')) {
    body.insertAdjacentHTML('beforeend', `<button class="venue-card-action" type="button">Подробнее ${iconMarkup('arrow')}</button>`);
  }
  if (image && venue && !image.querySelector('.card-rating-badge')) {
    const ratingLabel = venue.rating ? `${iconMarkup('star')}<b>${escapeHtml(venue.rating)}</b>` : `${iconMarkup('logo-star')}<b>Проверяем</b>`;
    image.insertAdjacentHTML('beforeend', `<span class="card-rating-badge">${ratingLabel}</span>`);
  }
  if (petFriendly && image && !image.querySelector('.pet-badge')) {
    image.insertAdjacentHTML('beforeend', `<span class="pet-badge" data-tooltip="Можно с питомцами" aria-label="Можно с питомцами">${iconMarkup('paw')}</span>`);
  }
  card.querySelectorAll('.fav').forEach((heart) => {
    if (heart.tagName !== 'BUTTON') {
      const button = document.createElement('button');
      button.className = heart.className;
      button.type = 'button';
      button.innerHTML = heart.innerHTML;
      heart.replaceWith(button);
      heart = button;
    }
    heart.setAttribute('aria-label', 'Добавить в избранное');
    heart.dataset.tooltip = 'Добавить в избранное';
  });
}

function requestFavoriteAccess() {
  if (isAuthenticated) return true;
  if (favoriteAccessPrompted) {
    favoriteAccessPrompted = false;
    openRegister();
    return false;
  }
  favoriteAccessPrompted = true;
  showToast('Авторизируйтесь или зарегистрируйтесь, чтобы сохранять места. Нажмите на сердце ещё раз — откроем регистрацию.');
  return false;
}

async function toggleFavorite(id, source) {
  if (!requestFavoriteAccess()) return;
  const willSave = !favoriteVenueIds.has(id);
  if (willSave) favoriteVenueIds.add(id); else favoriteVenueIds.delete(id);
  document.querySelectorAll(`.venue-card[data-venue="${id}"] .fav`).forEach((heart) => {
    heart.classList.toggle('is-saved', willSave);
    heart.setAttribute('aria-label', willSave ? 'Удалить из избранного' : 'Добавить в избранное');
    heart.dataset.tooltip = willSave ? 'Убрать из избранного' : 'Добавить в избранное';
  });
  document.querySelector('.dialog-heart')?.classList.toggle('is-saved', willSave);
  if (willSave) animateFavorite(source);
  renderFavorites();
  try {
    const venue = venueData[id] || favoriteSnapshots.get(id) || {};
    await requestJson('/api/favorites', {
      method: willSave ? 'POST' : 'DELETE',
      body: JSON.stringify({
        venueKey: id,
        venueId: venue.databaseId || null,
        externalVenueId: venue.databaseId ? null : id,
        snapshot: { title: venue.title, type: venue.type, rating: venue.rating, image: venue.image, text: venue.text }
      })
    });
    if (willSave) favoriteSnapshots.set(id, venue);
    else favoriteSnapshots.delete(id);
    showToast(willSave ? 'Добавлено в избранное' : 'Удалено из избранного');
  } catch (error) {
    if (willSave) favoriteVenueIds.delete(id); else favoriteVenueIds.add(id);
    document.querySelectorAll('.venue-card[data-venue]').forEach((card) => {
      if (card.dataset.venue === id) card.querySelectorAll('.fav').forEach((heart) => heart.classList.toggle('is-saved', !willSave));
    });
    document.querySelector('.dialog-heart')?.classList.toggle('is-saved', !willSave);
    renderFavorites();
    showToast(error.message || 'Не удалось обновить избранное');
  }
}

function bindVenueCard(card) {
  renderCardDetails(card);
  if (card.dataset.award && !card.querySelector('.mesto-choice-badge')) {
    const badge = card.querySelector('.venue-image .tag') || document.createElement('span');
    badge.className = 'mesto-choice-badge';
    badge.dataset.tooltip = 'Фирменная отметка редакции «Места»';
    badge.setAttribute('aria-label', 'Выбор редакции Места');
    badge.innerHTML = '<svg aria-hidden="true"><use href="#logo-star"></use></svg><span>Выбор Места</span>';
    if (!badge.isConnected) card.querySelector('.venue-image')?.appendChild(badge);
    const body = card.querySelector('.venue-body');
    if (body && !body.querySelector('.venue-curation-note')) body.insertAdjacentHTML('beforeend', '<span class="venue-curation-note"><svg aria-hidden="true"><use href="#logo-star"></use></svg>Рекомендует редакция «Места»</span>');
  }
  card.addEventListener('click', () => openVenue(card.dataset.venue));
  card.querySelectorAll('.fav').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleFavorite(card.dataset.venue, button);
  }));
  card.querySelectorAll('.fav').forEach((heart) => heart.classList.toggle('is-saved', favoriteVenueIds.has(card.dataset.venue)));
}

function showView(view) {
  const isHome = view === 'home';
  document.body.classList.toggle('is-home-view', isHome);
  homeSections.forEach((section) => { section.hidden = !isHome; });
  catalogView.hidden = view !== 'catalog';
  categoriesView.hidden = view !== 'categories';
  profileView.hidden = view !== 'profile';
  window.requestAnimationFrame(() => observeMotionScope(isHome ? document.querySelector('main') : document.querySelector(`.${view}-view`)));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function catalogMatches(card) {
  const categories = String(card.dataset.categories || card.dataset.category || '').split('|').filter(Boolean);
  const city = card.dataset.city || '';
  const cuisine = card.dataset.cuisine || '';
  const petMatch = !catalogPet || card.dataset.pet === '1';
  const parkingMatch = !catalogParking || card.dataset.parking === '1';
  return (catalogFilter === 'all' || categories.includes(catalogFilter)) && (catalogCuisine === 'all' || cuisine === catalogCuisine) && (catalogCity === 'all' || city === catalogCity) && petMatch && parkingMatch;
}

function normalizedVenueTitle(card) {
  return String(venueData[card?.dataset?.venue]?.title || card?.dataset?.venue || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .trim();
}

function renderCatalog() {
  const sortCards = (source) => [...source].sort((a, b) => {
    if (catalogSort === 'new') return Number(b.dataset.new || 0) - Number(a.dataset.new || 0);
    if (catalogSort === 'mixed') return (a.dataset.venue || '').localeCompare(b.dataset.venue || '');
    return Number(b.dataset.score || 0) - Number(a.dataset.score || 0);
  });
  const editorialCards = sortCards(cards.filter(catalogMatches));
  const editorialTitles = new Set(editorialCards.map(normalizedVenueTitle));
  const databaseCards = sortCards(storedVenueCards.filter(catalogMatches).filter((card) => !editorialTitles.has(normalizedVenueTitle(card))));
  const sorted = [];
  const rows = Math.max(editorialCards.length, Math.ceil(databaseCards.length / 2));
  for (let index = 0; index < rows; index += 1) {
    if (editorialCards[index]) sorted.push(editorialCards[index]);
    if (databaseCards[index * 2]) sorted.push(databaseCards[index * 2]);
    if (databaseCards[index * 2 + 1]) sorted.push(databaseCards[index * 2 + 1]);
  }
  catalogGrid.innerHTML = '';
  sorted.forEach((card) => {
    const copy = card.cloneNode(true);
    copy.hidden = false;
    copy.classList.remove('is-extra');
    catalogGrid.appendChild(copy);
    bindVenueCard(copy);
  });
  observeMotionScope(catalogGrid);
  catalogCount.textContent = `${sorted.length} ${placeWord(sorted.length)}`;
  if (catalogVenuesStatus) {
    if (catalogDatabaseConfigured === false) catalogVenuesStatus.textContent = 'Подборка редакции';
    else if (storedVenueCards.length) catalogVenuesStatus.textContent = `${storedVenueCards.length}${catalogFound > storedVenueCards.length ? ` из ${catalogFound}` : ''} ${cardWord(storedVenueCards.length)} из базы`;
    else if (catalogDatabaseConfigured === true) catalogVenuesStatus.textContent = 'В базе пока нет мест по этим фильтрам';
  }
  if (!sorted.length) catalogGrid.innerHTML = '<p class="catalog-empty">По этим параметрам пока нет заведений. Попробуйте изменить город или кухню.</p>';
}

function syncCatalogHeading() {
  const category = catalogFilter;
  catalogEyebrow.textContent = category === 'all' ? 'Каталог мест' : `Категория · ${category}`;
  catalogTitle.textContent = category === 'all' ? 'Все места города' : category;
  catalogCopy.textContent = category === 'all' ? 'Популярные и новые заведения, собранные в одном списке.' : `Все заведения категории «${category}» — с рейтингами, кухней и важными деталями.`;
  if (catalogHero) {
    const themes = {
      all: 'assets/crimea-coast-hero.jpg',
      Рестораны: 'assets/venue-restaurant-unsplash.jpg',
      Кафе: 'assets/venue-cafe-unsplash.jpg',
      Кофейни: 'assets/venue-coffee-unsplash.jpg',
      Кондитерские: 'assets/card-dessert.png',
      Пиццерии: 'assets/real-restaurant-interior.jpg',
      Пекарни: 'assets/card-dessert.png',
      'Фаст-кэжуал': 'assets/card-restaurant.png',
      'Быстрое питание': 'assets/card-restaurant.png',
      Бары: 'assets/venue-cocktail-unsplash.jpg',
      Гастробары: 'assets/venue-cocktail-unsplash.jpg',
      'Караоке-клубы': 'assets/card-bar.png',
      'Кальян-бары': 'assets/card-bar.png',
      'Суши-бары': 'assets/real-dining-night.jpg',
      'Банкетные залы': 'assets/venue-restaurant-unsplash.jpg'
    };
    const themeImage = themes[category] || themes.all;
    catalogHero.style.setProperty('--catalog-hero-image', `url("${themeImage}")`);
    catalogHero.style.backgroundImage = `linear-gradient(90deg,rgba(7,22,39,.9) 0%,rgba(15,43,66,.68) 48%,rgba(14,42,61,.23) 100%),linear-gradient(180deg,rgba(108,167,204,.08),rgba(8,26,42,.42)),url("${themeImage}")`;
    catalogHero.dataset.categoryTheme = category === 'all' ? 'all' : normalizedName(category).replace(/\s+/g, '-');
  }
}

function openCatalog(category = 'all') {
  clearStoredVenues();
  catalogFilter = category;
  catalogCity = 'all';
  catalogCuisine = 'all';
  catalogPet = false;
  catalogParking = false;
  if (catalogCategoryInput) catalogCategoryInput.value = category;
  const catalogCityInput = document.querySelector('#catalog-city');
  const catalogCuisineInput = document.querySelector('#catalog-cuisine');
  catalogCityInput.value = 'all';
  catalogCuisineInput.value = 'all';
  syncPrettySelect(catalogCategoryInput);
  syncPrettySelect(catalogCityInput);
  syncPrettySelect(catalogCuisineInput);
  document.querySelector('#catalog-pet').checked = false;
  document.querySelector('#catalog-parking').checked = false;
  syncCatalogHeading();
  renderCatalog();
  showView('catalog');
}

function openCategories() {
  showView('categories');
}

function applyCatalogFilter(filter = '') {
  const query = filter.trim().toLowerCase();
  let visible = 0;
  cards.forEach((card) => {
    const haystack = `${card.dataset.categories || card.dataset.category || ''} ${card.dataset.search || ''}`.toLowerCase();
    const match = !query || haystack.includes(query);
    card.hidden = !match;
    if (match) visible += 1;
  });
  venueGrid.classList.toggle('is-filtered', visible < 4);
  document.querySelector('#popular').scrollIntoView({ behavior: 'smooth', block: 'start' });
  showToast(visible ? `Нашли мест: ${visible}` : 'По этому фильтру пока нет мест');
}

function clearStoredVenues({ abort = true } = {}) {
  if (abort) catalogRequestController?.abort();
  catalogVenueIds.clear();
  storedVenueCards = [];
  catalogNextSkip = null;
  catalogFound = 0;
  catalogRequestContext = null;
  catalogDatabaseConfigured = null;
  if (catalogLoadMore) catalogLoadMore.hidden = true;
  if (catalogVenuesStatus) catalogVenuesStatus.textContent = '';
}

function groupStoredVenueItems(items) {
  const groups = new Map();
  items.forEach((item, index) => {
    const key = `${normalizedName(item.name) || `venue-${index}`}|${normalizedName(item.city)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return Array.from(groups.values());
}

function createStoredVenueCards(items, fallbackCity) {
  return groupStoredVenueItems(items).map((group, index) => {
    const item = group[0];
    const city = item.city || fallbackCity || 'Республика Крым';
    const categories = uniqueValues(group.flatMap((branch) => Array.isArray(branch.categories) ? branch.categories : []));
    const category = item.category || normalizeVenueCategory(categories);
    const classifiedCategories = uniqueValues([category, ...categories.map((candidate) => normalizeVenueCategory([candidate]))]);
    const primaryCategory = item.category || categories[0] || category;
    const branches = group.map((branch) => ({
      address: branch.address || `${city}, адрес уточняется`,
      hours: branch.hours || 'Часы работы уточняются',
      phones: Array.isArray(branch.phones) ? branch.phones.filter(Boolean) : [],
      website: branch.website || '',
      mapsUrl: branch.mapsUrl || '',
      coordinates: Array.isArray(branch.coordinates) ? branch.coordinates : []
    })).filter((branch, branchIndex, source) => source.findIndex((candidate) => normalizedName(candidate.address) === normalizedName(branch.address)) === branchIndex);
    const hours = branches[0]?.hours || 'Часы работы уточняются';
    const address = branches[0]?.address || `${city}, адрес уточняется`;
    const phones = uniqueValues(branches.flatMap((branch) => branch.phones)).slice(0, 4);
    const sourceFeatures = uniqueValues(group.flatMap((branch) => Array.isArray(branch.features) ? branch.features : [])).slice(0, 10);
    const features = uniqueValues([...categories.slice(0, 4), ...sourceFeatures]);
    const normalizedFeatures = features.join(' ').toLowerCase();
    const petFriendly = /питомц|с собак|животн/.test(normalizedFeatures);
    const hasParking = /парков/.test(normalizedFeatures);
    const hasWifi = /wi-?fi|вай-?фай/.test(normalizedFeatures);
    const sourceId = String(item.databaseId || item.id || normalizedName(item.name) || index).replace(/[^a-zа-я0-9_-]/gi, '-');
    const id = item.databaseId ? `mesto-${item.databaseId}` : `catalog-${sourceId}`;
    const image = group.flatMap((branch) => Array.isArray(branch.photos) ? branch.photos : []).find(Boolean) || imageForStoredVenue(category);
    const branchSummary = branches.length > 1 ? ` Сеть представлена по ${branches.length} адресам.` : '';

    venueData[id] = {
      title: item.name,
      type: `${primaryCategory} · ${city}`,
      rating: item.rating ? String(item.rating) : '',
      reviews: item.reviewCount ? `${item.reviewCount} ${reviewWord(item.reviewCount)}` : '',
      price: item.averageCheck || 'Уточнить в заведении',
      image,
      databaseId: item.databaseId || null,
      source: item.source || 'mesto',
      mapsUrl: item.mapsUrl,
      website: group.find((branch) => branch.website)?.website || '',
      address,
      phones,
      branches,
      text: item.description || `${address}. ${hours}.${branchSummary}`,
      features
    };
    venueExtras[id] = { hours, wifi: hasWifi, menu: [] };

    const card = document.createElement('article');
    card.className = 'venue-card catalog-venue-card';
    card.dataset.venue = id;
    card.dataset.category = category;
    card.dataset.categories = classifiedCategories.join('|');
    card.dataset.city = city;
    card.dataset.cuisine = item.cuisine || 'all';
    card.dataset.source = 'mesto';
    card.dataset.pet = petFriendly ? '1' : '0';
    card.dataset.parking = hasParking ? '1' : '0';
    card.dataset.score = item.rating ? String(item.rating) : '0';
    card.dataset.new = '1';
    if (/выбор места|рекомендует редакция/.test(normalizedFeatures)) card.dataset.award = 'mesto-choice';
    card.dataset.branchCount = String(branches.length);
    card.dataset.search = `${item.name} ${categories.join(' ')} ${branches.map((branch) => branch.address).join(' ')} ${city}`.toLowerCase();
    const branchBadge = branches.length > 1
      ? `<span class="branch-badge" data-tooltip="У сети ${branches.length} ${branchWord(branches.length)} в ${escapeHtml(city)}">${iconMarkup('pin')}<b>${branches.length}</b><span>${branchWord(branches.length)}</span></span>`
      : '';
    card.innerHTML = `<span class="venue-image"><img src="${escapeHtml(image)}" alt="${escapeHtml(item.name)}" loading="lazy" /><button class="fav" type="button" aria-label="Добавить в избранное"><svg><use href="#heart" /></svg></button>${branchBadge}</span><span class="venue-body"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(primaryCategory)} · ${escapeHtml(city)}</small><span class="venue-meta venue-meta--source">${iconMarkup('pin')} ${escapeHtml(address)}</span><span class="venue-source-note">Опубликовано в каталоге «Места»</span></span>`;
    return card;
  });
}

function renderStoredVenues(items, city, { append = false, payload = {} } = {}) {
  if (!append) {
    catalogVenueIds.clear();
    storedVenueCards = [];
  }
  createStoredVenueCards(items, city).forEach((card) => {
    if (catalogVenueIds.has(card.dataset.venue)) return;
    catalogVenueIds.add(card.dataset.venue);
    storedVenueCards.push(card);
  });
  catalogDatabaseConfigured = payload.databaseConfigured !== false;
  catalogFound = Number(payload.found ?? catalogFound ?? 0);
  catalogNextSkip = Number.isFinite(payload.nextSkip) ? payload.nextSkip : null;
  if (catalogLoadMore) catalogLoadMore.hidden = catalogNextSkip === null;
  renderCatalog();
}

async function fetchCatalogPayload({ query = '', city = 'all', category = '', skip = 0, signal, force = false } = {}) {
  const endpoint = new URL('/api/venues', window.location.origin);
  if (query) endpoint.searchParams.set('query', query);
  endpoint.searchParams.set('city', city || 'all');
  if (category && category !== 'all') endpoint.searchParams.set('category', category);
  endpoint.searchParams.set('results', '50');
  endpoint.searchParams.set('skip', String(skip));
  const cacheKey = endpoint.toString();
  if (!force && catalogRequestCache.has(cacheKey)) return catalogRequestCache.get(cacheKey);
  const response = await fetch(endpoint, { headers: { Accept: 'application/json' }, signal });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || 'Не удалось загрузить каталог');
  catalogRequestCache.set(cacheKey, payload);
  return payload;
}

async function loadCatalogVenues({ query = '', city = 'all', category = '', force = false } = {}) {
  const requestSequence = ++catalogRequestSequence;
  clearStoredVenues();
  catalogRequestContext = { query, city, category };
  renderCatalog();
  catalogView.classList.add('is-catalog-loading');
  if (catalogVenuesStatus) catalogVenuesStatus.textContent = 'Обновляем каталог…';

  const requestController = new AbortController();
  catalogRequestController = requestController;

  try {
    const payload = await fetchCatalogPayload({ query, city, category, skip: 0, signal: requestController.signal, force });
    if (requestSequence !== catalogRequestSequence) return;
    catalogRequestContext = { query, city: payload.city || city, category };
    renderStoredVenues(Array.isArray(payload.items) ? payload.items : [], payload.city || city, { payload });
  } catch (error) {
    if (error.name === 'AbortError') return;
    catalogDatabaseConfigured = false;
    if (catalogVenuesStatus) catalogVenuesStatus.textContent = 'Показана подборка редакции';
    showToast(error.message || 'Не удалось обновить каталог');
  } finally {
    if (catalogRequestController === requestController) catalogView.classList.remove('is-catalog-loading');
  }
}

async function loadMoreCatalogVenues() {
  if (!catalogRequestContext || catalogNextSkip === null || !catalogLoadMore) return;
  const requestedSkip = catalogNextSkip;
  catalogLoadMore.disabled = true;
  catalogLoadMore.firstChild.textContent = 'Загружаем… ';
  try {
    const payload = await fetchCatalogPayload({ ...catalogRequestContext, skip: requestedSkip });
    renderStoredVenues(Array.isArray(payload.items) ? payload.items : [], payload.city || catalogRequestContext.city, { append: true, payload });
  } catch (error) {
    showToast(error.message || 'Не удалось загрузить следующую страницу заведений');
  } finally {
    catalogLoadMore.disabled = false;
    catalogLoadMore.firstChild.textContent = 'Показать ещё 50 заведений ';
  }
}

function inventoryCards() {
  const result = [];
  const titles = new Set();
  [...cards, ...homeStoredVenueCards].forEach((card) => {
    const title = normalizedVenueTitle(card);
    if (!title || titles.has(title)) return;
    titles.add(title);
    result.push(card);
  });
  return result;
}

function renderHomepageStoredVenues(items, city) {
  venueGrid.querySelectorAll('.home-stored-card').forEach((card) => card.remove());
  const staticTitles = new Set(cards.map(normalizedVenueTitle));
  homeStoredVenueCards = createStoredVenueCards(items, city)
    .filter((card) => !staticTitles.has(normalizedVenueTitle(card)));
  homeStoredVenueCards.slice(0, 3).forEach((card) => {
    card.classList.add('home-stored-card');
    venueGrid.appendChild(card);
    bindVenueCard(card);
  });
  setupVenueCounters();
  syncCatalogTotals();
  observeMotionScope(venueGrid);
}

async function loadHomepageVenues() {
  try {
    const city = heroCityInput?.value || 'Симферополь';
    const payload = await fetchCatalogPayload({ city });
    renderHomepageStoredVenues(Array.isArray(payload.items) ? payload.items : [], payload.city || city);
  } catch (_) {
    setupVenueCounters();
    syncCatalogTotals();
  }
}

function catalogRequestParameters(category = catalogFilter) {
  const city = catalogCity || 'all';
  const normalizedCategory = category === 'all' ? '' : category;
  return { query: '', city, category: normalizedCategory };
}

function animateFavorite(source) {
  const destination = document.querySelector('.favorites-button');
  if (!destination || !source) return;
  const start = source.getBoundingClientRect();
  const end = destination.getBoundingClientRect();
  const startX = start.left + start.width / 2;
  const startY = start.top + start.height / 2;
  const endX = end.left + end.width / 2;
  const endY = end.top + end.height / 2;
  const flying = document.createElement('span');
  flying.className = 'flying-heart';
  flying.innerHTML = '<svg aria-hidden="true"><use href="#heart"></use></svg>';
  flying.style.left = `${startX}px`;
  flying.style.top = `${startY}px`;
  document.body.appendChild(flying);
  const flight = flying.animate([
    { left: `${startX}px`, top: `${startY}px`, transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
    { offset: 0.58, left: `${startX + (endX - startX) * 0.52}px`, top: `${Math.min(startY, endY) - 76}px`, transform: 'translate(-50%, -50%) scale(1.22) rotate(-13deg)', opacity: 1 },
    { left: `${endX}px`, top: `${endY}px`, transform: 'translate(-50%, -50%) scale(.4) rotate(18deg)', opacity: 0 }
  ], { duration: 760, easing: 'cubic-bezier(.17,.82,.28,1)', fill: 'forwards' });
  const removeFlyingHeart = () => flying.remove();
  flight.finished.then(removeFlyingHeart).catch(removeFlyingHeart);
  // A defensive cleanup covers interrupted Web Animations (for example, if the
  // card disappears while the user switches views) and prevents stale hearts.
  window.setTimeout(removeFlyingHeart, 900);
  destination.animate([
    { transform: 'scale(1)' },
    { offset: 0.5, transform: 'scale(1.18)' },
    { transform: 'scale(1)' }
  ], { duration: 330, easing: 'ease-out' });
}

function renderFavorites() {
  const count = favoriteVenueIds.size;
  const counter = document.querySelector('.favorites-count');
  if (counter) {
    counter.hidden = count === 0;
    counter.textContent = String(count);
  }
  const entries = Array.from(favoriteVenueIds).map((id) => ({ id, venue: venueData[id] || favoriteSnapshots.get(id) })).filter((item) => item.venue);
  const markup = entries.length ? entries.map(({ id, venue }) => `<button class="favorite-row" type="button" data-venue="${escapeHtml(id)}"><img src="${escapeHtml(venue.image || 'assets/venue-restaurant-unsplash.jpg')}" alt="${escapeHtml(venue.title || 'Заведение')}" /><span><b>${escapeHtml(venue.title || 'Заведение')}</b><small>${escapeHtml(venue.type || 'Место в каталоге')}${venue.rating ? ` · ${escapeHtml(venue.rating)}` : ''}</small></span><svg aria-hidden="true"><use href="#arrow"></use></svg></button>`).join('') : '<p class="favorites-empty">Пока пусто. Сохраните место сердечком — оно появится в вашем списке.</p>';
  document.querySelectorAll('#favorites-list, #profile-saved-list').forEach((list) => {
    list.innerHTML = markup;
    list.querySelectorAll('[data-venue]').forEach((row) => row.addEventListener('click', () => {
      document.querySelector('#favorites-dialog')?.close();
      openVenue(row.dataset.venue);
    }));
  });
}

function setupVenueCounters() {
  const counters = Array.from(document.querySelectorAll('[data-venue-count]'));
  if (!counters.length) return;
  const target = inventoryCards().length;
  const format = (value) => new Intl.NumberFormat('ru-RU').format(value);

  counters.forEach((counter) => {
    counter.setAttribute('aria-label', format(target));
    counter.textContent = format(target);
  });
  const collectionMatches = {
    breakfast: (card) => /Кофейни|Кафе|Кондитерские|Пекарни/.test(card.dataset.categories || card.dataset.category || '') || /завтрак|кофе|выпеч/.test(card.dataset.search || ''),
    sea: (card) => ['Ялта', 'Севастополь', 'Алушта', 'Феодосия', 'Судак', 'Балаклава', 'Гурзуф'].includes(card.dataset.city),
    date: (card) => Number(card.dataset.score || 0) >= 4.8 && /Рестораны|Бары|Гастробары/.test(card.dataset.categories || card.dataset.category || ''),
    pet: (card) => card.dataset.pet === '1'
  };
  Object.entries(collectionMatches).forEach(([name, predicate]) => {
    const count = inventoryCards().filter(predicate).length;
    document.querySelectorAll(`[data-collection-count="${name}"]`).forEach((label) => { label.textContent = `${count} ${placeWord(count)}`; });
  });
}

function placeWord(count) {
  const remainder = Math.abs(count) % 100;
  const lastDigit = remainder % 10;
  if (remainder > 10 && remainder < 20) return 'мест';
  if (lastDigit === 1) return 'место';
  if (lastDigit >= 2 && lastDigit <= 4) return 'места';
  return 'мест';
}

function cardWord(count) {
  const remainder = Math.abs(count) % 100;
  const lastDigit = remainder % 10;
  if (remainder > 10 && remainder < 20) return 'карточек';
  if (lastDigit === 1) return 'карточка';
  if (lastDigit >= 2 && lastDigit <= 4) return 'карточки';
  return 'карточек';
}

function reviewWord(count) {
  const remainder = Math.abs(count) % 100;
  const lastDigit = remainder % 10;
  if (remainder > 10 && remainder < 20) return 'отзывов';
  if (lastDigit === 1) return 'отзыв';
  if (lastDigit >= 2 && lastDigit <= 4) return 'отзыва';
  return 'отзывов';
}

function syncCatalogTotals() {
  const allCards = inventoryCards();
  document.querySelectorAll('[data-category-count]').forEach((label) => {
    const count = allCards.filter((card) => String(card.dataset.categories || card.dataset.category || '').split('|').includes(label.dataset.categoryCount)).length;
    label.textContent = `${count} ${placeWord(count)}`;
  });
  document.querySelectorAll('[data-city-count]').forEach((label) => {
    const count = allCards.filter((card) => card.dataset.city === label.dataset.cityCount).length;
    label.textContent = count ? `${count} ${placeWord(count)}` : 'Скоро';
    const cityButton = label.closest('[data-city-filter]');
    if (cityButton) {
      cityButton.disabled = count === 0;
      cityButton.setAttribute('aria-disabled', String(count === 0));
    }
  });
}

const motionQueries = '.section-heading, .app-promo-copy, .app-phones, .newsletter, .place-stats, .platform, .categories-view-inner, .catalog-inner, .profile-inner, .site-footer';
const cardMotionQueries = '.category-card, .venue-card, .collection-card, .city-card, .category-tile, .how-grid article';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let motionObserver;

function observeMotionScope(scope = document) {
  if (reducedMotion || !motionObserver || !scope) return;
  const targets = scope.matches?.(motionQueries) ? [scope] : Array.from(scope.querySelectorAll(motionQueries));
  targets.forEach((target) => {
    if (target.dataset.motionObserved) return;
    target.dataset.motionObserved = 'true';
    target.classList.add('motion-reveal');
    motionObserver.observe(target);
  });
  Array.from(scope.querySelectorAll(cardMotionQueries)).forEach((card) => {
    if (card.dataset.motionObserved) return;
    card.dataset.motionObserved = 'true';
    const group = card.closest('.category-grid, .venue-grid, .collection-grid, .city-list, .categories-full-grid, .catalog-grid, .how-grid');
    const groupIndex = group ? Array.from(group.querySelectorAll(':scope > *')).indexOf(card) : 0;
    card.style.setProperty('--motion-delay', `${Math.min(Math.max(groupIndex, 0), 7) * 45}ms`);
    card.classList.add('motion-item');
    motionObserver.observe(card);
  });
}

function setupMotion() {
  if (reducedMotion || !('IntersectionObserver' in window)) return;
  document.body.classList.add('motion-ready');
  motionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-revealed');
      motionObserver.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -42px' });
  observeMotionScope(document);
}

function setupPremiumDepth() {
  const stage = document.querySelector('[data-tilt-stage]');
  if (!stage || reducedMotion) return;

  const canTilt = window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  let pointerFrame = 0;

  if (canTilt) {
    stage.addEventListener('pointermove', (event) => {
      if (pointerFrame) return;
      pointerFrame = window.requestAnimationFrame(() => {
        const rect = stage.getBoundingClientRect();
        const x = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - .5) * 2));
        const y = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - .5) * 2));
        stage.style.setProperty('--promo-x', `${(x * 2.6).toFixed(2)}deg`);
        stage.style.setProperty('--promo-y', `${(y * -2).toFixed(2)}deg`);
        pointerFrame = 0;
      });
    }, { passive: true });
    stage.addEventListener('pointerleave', () => {
      if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
      pointerFrame = 0;
      stage.style.setProperty('--promo-x', '0deg');
      stage.style.setProperty('--promo-y', '0deg');
    });
  }

}

function setupPhoneDemo() {
  const stage = document.querySelector('[data-tilt-stage]');
  const featured = stage?.querySelector('[data-phone-featured]');
  const image = featured?.querySelector('[data-phone-featured-image]');
  const title = featured?.querySelector('[data-phone-featured-title]');
  const meta = featured?.querySelector('[data-phone-featured-meta]');
  const rating = featured?.querySelector('[data-phone-featured-rating]');
  const toggle = stage?.querySelector('[data-phone-demo-toggle]');
  const icon = toggle?.querySelector('[data-phone-demo-icon]');
  if (!stage || !featured || !image || !title || !meta || !rating || !toggle || !icon) return;

  const demos = [
    { image: 'assets/venue-restaurant-unsplash.jpg', title: 'Баркас', meta: 'Ресторан · Симферополь', rating: '4.9' },
    { image: 'assets/venue-cocktail-unsplash.jpg', title: 'Gio', meta: 'Бар · Ялта', rating: '4.8' },
    { image: 'assets/venue-cafe-unsplash.jpg', title: 'Утро', meta: 'Кафе · у моря', rating: '4.9' }
  ];
  demos.slice(1).forEach((demo) => {
    const preload = new Image();
    preload.src = demo.image;
  });

  let index = 0;
  let interval = 0;
  let swapTimer = 0;
  let manualPause = false;
  let interactionPause = false;
  let sceneVisible = true;

  const stop = () => {
    if (interval) window.clearInterval(interval);
    interval = 0;
  };
  const showNext = () => {
    featured.classList.add('is-swapping');
    window.clearTimeout(swapTimer);
    swapTimer = window.setTimeout(() => {
      index = (index + 1) % demos.length;
      const demo = demos[index];
      image.src = demo.image;
      title.textContent = demo.title;
      meta.textContent = demo.meta;
      rating.textContent = demo.rating;
      featured.classList.remove('is-swapping');
    }, 190);
  };
  const schedule = () => {
    stop();
    if (manualPause || interactionPause || !sceneVisible || document.hidden || reducedMotion) return;
    interval = window.setInterval(showNext, 4400);
  };
  const syncToggle = () => {
    toggle.setAttribute('aria-pressed', String(manualPause));
    toggle.setAttribute('aria-label', manualPause ? 'Продолжить анимацию макетов' : 'Приостановить анимацию макетов');
    icon.textContent = manualPause ? '▶' : 'Ⅱ';
    stage.classList.toggle('is-demo-paused', manualPause);
  };

  if (reducedMotion) {
    toggle.hidden = true;
    return;
  }
  stage.addEventListener('pointerenter', () => {
    interactionPause = true;
    stop();
  }, { passive: true });
  stage.addEventListener('pointerleave', () => {
    interactionPause = false;
    schedule();
  }, { passive: true });
  stage.addEventListener('focusin', () => {
    interactionPause = true;
    stop();
  });
  stage.addEventListener('focusout', () => {
    window.setTimeout(() => {
      interactionPause = stage.contains(document.activeElement);
      schedule();
    }, 0);
  });
  toggle.addEventListener('click', () => {
    manualPause = !manualPause;
    syncToggle();
    schedule();
  });
  document.addEventListener('visibilitychange', schedule);
  if ('IntersectionObserver' in window) {
    const sceneObserver = new IntersectionObserver(([entry]) => {
      sceneVisible = Boolean(entry?.isIntersecting);
      schedule();
    }, { rootMargin: '160px 0px' });
    sceneObserver.observe(stage);
  }
  syncToggle();
  schedule();
}

const additionalCatalogueCategories = [
  { name: 'Караоке-клубы', icon: 'cocktail', style: 'bar' },
  { name: 'Суши-бары', icon: 'restaurant', style: 'dining' },
  { name: 'Кальян-бары', icon: 'cocktail', style: 'bar' },
  { name: 'Банкетные залы', icon: 'restaurant', style: 'dining' },
  { name: 'Кейтеринг', icon: 'restaurant', style: 'dining' },
  { name: 'Доставка еды', icon: 'bolt', style: 'casual' },
  { name: 'Столовые', icon: 'restaurant', style: 'dining' },
  { name: 'Пекарни', icon: 'cake', style: 'dessert' },
  { name: 'Быстрое питание', icon: 'bolt', style: 'casual' }
];

function registerAdditionalCategories() {
  [catalogCategoryInput, document.querySelector('#submission-form select[name="category"]')]
    .filter(Boolean)
    .forEach((select) => {
      additionalCatalogueCategories.forEach(({ name }) => {
        if (Array.from(select.options).some((option) => option.value === name)) return;
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
      });
    });

  const categoryGrid = document.querySelector('.categories-full-grid');
  if (!categoryGrid) return;
  additionalCatalogueCategories.forEach(({ name, icon, style }) => {
    if (categoryGrid.querySelector(`[data-filter-category="${name}"]`)) return;
    categoryGrid.insertAdjacentHTML('beforeend', `<button class="category-tile ${style}" type="button" data-filter-category="${name}"><svg><use href="#${icon}" /></svg><span>${name}</span><small data-category-count="${name}">0 мест</small></button>`);
  });
}

function syncPrettySelect(select) {
  const root = select?.closest('.pretty-select');
  if (!root) return;
  const selected = select.options[select.selectedIndex];
  const label = root.querySelector('.pretty-select-value');
  if (label) label.textContent = selected?.textContent || '';
  const toggle = root.querySelector('.pretty-select-button');
  if (toggle) toggle.setAttribute('aria-label', `${select.dataset.prettyLabel || 'Выбрать'}: ${selected?.textContent || ''}`);
  root.querySelectorAll('.pretty-select-option').forEach((option) => {
    const isSelected = option.dataset.value === select.value;
    option.classList.toggle('is-selected', isSelected);
    option.setAttribute('aria-selected', String(isSelected));
  });
}

function closePrettySelect(root, restoreFocus = false) {
  if (!root) return;
  root.classList.remove('is-open');
  root.querySelector('.pretty-select-button')?.setAttribute('aria-expanded', 'false');
  if (restoreFocus) root.querySelector('.pretty-select-button')?.focus();
}

function enhancePrettySelect(select) {
  if (!select || select.closest('.pretty-select')) return;
  const root = document.createElement('div');
  root.className = 'pretty-select';
  select.parentNode.insertBefore(root, select);
  root.appendChild(select);
  select.classList.add('pretty-select-native');
  select.setAttribute('aria-hidden', 'true');
  select.tabIndex = -1;
  select.dataset.prettyLabel = select.getAttribute('aria-label') || select.closest('label')?.firstChild?.textContent?.trim() || 'Выбрать';

  const toggle = document.createElement('button');
  toggle.className = 'pretty-select-button';
  toggle.type = 'button';
  toggle.setAttribute('aria-haspopup', 'listbox');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.innerHTML = '<span class="pretty-select-value"></span><i aria-hidden="true"></i>';

  const menu = document.createElement('div');
  menu.className = 'pretty-select-menu';
  menu.setAttribute('role', 'listbox');
  Array.from(select.options).forEach((nativeOption) => {
    const option = document.createElement('button');
    option.className = 'pretty-select-option';
    option.type = 'button';
    option.dataset.value = nativeOption.value;
    option.setAttribute('role', 'option');
    option.textContent = nativeOption.textContent;
    option.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      select.value = nativeOption.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      syncPrettySelect(select);
      closePrettySelect(root, true);
    });
    menu.appendChild(option);
  });

  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const shouldOpen = !root.classList.contains('is-open');
    document.querySelectorAll('.pretty-select.is-open').forEach((item) => closePrettySelect(item));
    root.classList.toggle('is-open', shouldOpen);
    toggle.setAttribute('aria-expanded', String(shouldOpen));
  });
  toggle.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePrettySelect(root);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!root.classList.contains('is-open')) toggle.click();
      (menu.querySelector('.is-selected') || menu.firstElementChild)?.focus();
    }
  });
  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePrettySelect(root, true);
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const options = Array.from(menu.querySelectorAll('.pretty-select-option'));
    const currentIndex = options.indexOf(document.activeElement);
    const nextIndex = event.key === 'ArrowDown' ? Math.min(currentIndex + 1, options.length - 1) : Math.max(currentIndex - 1, 0);
    options[nextIndex]?.focus();
  });
  select.addEventListener('change', () => syncPrettySelect(select));
  root.append(toggle, menu);
  syncPrettySelect(select);
}

function setupPrettySelects() {
  document.querySelectorAll('.search-panel select, .catalog-controls select, .form-dialog select').forEach(enhancePrettySelect);
  document.addEventListener('click', (event) => {
    document.querySelectorAll('.pretty-select.is-open').forEach((root) => {
      if (!root.contains(event.target)) closePrettySelect(root);
    });
  });
}

registerAdditionalCategories();
setupPrettySelects();
cards.forEach(bindVenueCard);
renderFavorites();
setupVenueCounters();
syncCatalogTotals();
setupMotion();
setupPremiumDepth();
setupPhoneDemo();
syncCatalogHeading();
loadHomepageVenues();
document.querySelectorAll('.saved-list [data-venue]').forEach((card) => card.addEventListener('click', () => openVenue(card.dataset.venue)));
dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
});
const filterIcons = { Кофейни: 'coffee', Рестораны: 'restaurant', Кафе: 'coffee', Кондитерские: 'cake', 'Фаст-кэжуал': 'bolt', Бары: 'cocktail', 'Караоке-клубы': 'cocktail', 'Суши-бары': 'restaurant', 'Кальян-бары': 'cocktail', 'Банкетные залы': 'restaurant', Кейтеринг: 'restaurant', 'Доставка еды': 'bolt', Столовые: 'restaurant', Пекарни: 'cake', 'Быстрое питание': 'bolt' };
document.querySelectorAll('.quick-filters button').forEach((filter) => {
  const icon = filterIcons[filter.dataset.filter];
  if (icon && !filter.querySelector('svg')) filter.insertAdjacentHTML('afterbegin', `<svg aria-hidden="true"><use href="#${icon}"></use></svg>`);
});
document.querySelectorAll('.quick-filters button').forEach((filter) => filter.addEventListener('click', () => {
  document.querySelectorAll('.quick-filters button').forEach((button) => button.classList.remove('is-selected'));
  filter.classList.add('is-selected');
  openCatalog(filter.dataset.filter);
  loadCatalogVenues(catalogRequestParameters(filter.dataset.filter));
}));
document.querySelectorAll('[data-filter-category]').forEach((category) => category.addEventListener('click', (event) => {
  event.preventDefault();
  openCatalog(category.dataset.filterCategory);
  loadCatalogVenues(catalogRequestParameters(category.dataset.filterCategory));
}));
document.querySelectorAll('[data-collection]').forEach((collection) => collection.addEventListener('click', (event) => {
  event.preventDefault();
  const type = collection.dataset.collection;
  if (type === 'breakfast') {
    openCatalog('Кофейни');
    loadCatalogVenues({ city: 'all', category: 'Кофейни' });
    return;
  }
  if (type === 'sea') {
    openCatalog('Рестораны');
    catalogCity = 'Ялта';
    const citySelector = document.querySelector('#catalog-city');
    citySelector.value = 'Ялта';
    syncPrettySelect(citySelector);
    renderCatalog();
    loadCatalogVenues({ city: 'Ялта', category: 'Рестораны' });
    return;
  }
  if (type === 'pet') {
    openCatalog('all');
    catalogPet = true;
    document.querySelector('#catalog-pet').checked = true;
    renderCatalog();
    loadCatalogVenues(catalogRequestParameters());
    return;
  }
  openCatalog('Рестораны');
  loadCatalogVenues({ city: 'all', category: 'Рестораны' });
}));
document.querySelector('#venue-search').addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const query = String(formData.get('query') || '').trim() || 'где поесть';
  const city = String(formData.get('city') || 'Симферополь');
  openCatalog('all');
  catalogCity = city;
  const citySelector = document.querySelector('#catalog-city');
  if (Array.from(citySelector.options).some((option) => option.value === city)) {
    citySelector.value = city;
    syncPrettySelect(citySelector);
  }
  renderCatalog();
  loadCatalogVenues({ query, city });
});
document.querySelector('#catalog-refresh')?.addEventListener('click', () => loadCatalogVenues({ ...catalogRequestParameters(), force: true }));
catalogLoadMore?.addEventListener('click', loadMoreCatalogVenues);
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => {
  const view = button.dataset.view;
  document.querySelectorAll('[data-view]').forEach((item) => {
    const isCurrent = item === button;
    item.classList.toggle('is-active', isCurrent);
    item.setAttribute('aria-selected', String(isCurrent));
  });
  document.querySelectorAll('[data-dashboard]').forEach((dashboard) => dashboard.classList.toggle('is-visible', dashboard.dataset.dashboard === view));
}));
document.querySelectorAll('[data-show-all]').forEach((button) => button.addEventListener('click', () => {
  openCatalog('all');
  loadCatalogVenues(catalogRequestParameters());
}));
document.querySelectorAll('[data-open-categories]').forEach((button) => button.addEventListener('click', (event) => {
  event.preventDefault();
  openCategories();
}));
document.querySelectorAll('[data-show-cities]').forEach((button) => button.addEventListener('click', () => {
  openCatalog('all');
  loadCatalogVenues(catalogRequestParameters());
}));
document.querySelectorAll('[data-city-filter]').forEach((button) => button.addEventListener('click', () => {
  openCatalog('all');
  catalogCity = button.dataset.cityFilter;
  const selector = document.querySelector('#catalog-city');
  if (Array.from(selector.options).some((option) => option.value === catalogCity)) {
    selector.value = catalogCity;
    syncPrettySelect(selector);
  }
  renderCatalog();
  loadCatalogVenues(catalogRequestParameters());
}));
document.querySelectorAll('[data-home-link]').forEach((link) => link.addEventListener('click', (event) => {
  event.preventDefault();
  document.querySelector('#favorites-dialog')?.close();
  showView('home');
  const target = link.getAttribute('href');
  if (target && target !== '#guide') document.querySelector(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}));
document.querySelectorAll('.main-nav a[href^="#"]:not([data-open-categories])').forEach((link) => link.addEventListener('click', (event) => {
  event.preventDefault();
  showView('home');
  const target = document.querySelector(link.getAttribute('href'));
  if (target) window.setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
}));
document.querySelector('[data-open-profile]')?.addEventListener('click', () => {
  if (isAuthenticated) showView('profile');
  else {
    showToast('Войдите или зарегистрируйтесь, чтобы открыть личный кабинет');
    openAuth();
  }
});
document.querySelector('#catalog-city')?.addEventListener('change', (event) => {
  catalogCity = event.target.value;
  renderCatalog();
  loadCatalogVenues(catalogRequestParameters());
});
catalogCategoryInput?.addEventListener('change', (event) => {
  catalogFilter = event.target.value;
  syncCatalogHeading();
  renderCatalog();
  loadCatalogVenues(catalogRequestParameters());
});
document.querySelector('#catalog-cuisine')?.addEventListener('change', (event) => { catalogCuisine = event.target.value; renderCatalog(); });
document.querySelector('#catalog-sort')?.addEventListener('change', (event) => { catalogSort = event.target.value; renderCatalog(); });
document.querySelector('#catalog-pet')?.addEventListener('change', (event) => { catalogPet = event.target.checked; renderCatalog(); });
document.querySelector('#catalog-parking')?.addEventListener('change', (event) => { catalogParking = event.target.checked; renderCatalog(); });
document.querySelectorAll('.dialog-heart').forEach((button) => button.addEventListener('click', (event) => {
  event.stopPropagation();
  if (!activeVenue) return;
  toggleFavorite(activeVenueId(), button);
}));
document.querySelectorAll('.quick-actions button').forEach((button) => button.addEventListener('click', () => showToast('Действие будет доступно после подключения сервера')));
dialog.querySelector('.dialog-route-action')?.addEventListener('click', () => {
  if (!activeVenue) return;
  window.open(yandexMapsUrl(activeVenue), '_blank', 'noopener,noreferrer');
});

function bindFormDialog(dialogElement) {
  if (!dialogElement) return;
  dialogElement.querySelector('.dialog-close')?.addEventListener('click', () => dialogElement.close());
  dialogElement.addEventListener('click', (event) => {
    const box = dialogElement.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialogElement.close();
  });
}

const authDialog = document.querySelector('#auth-dialog');
const registerDialog = document.querySelector('#register-dialog');
const reviewDialog = document.querySelector('#review-dialog');
const submissionDialog = document.querySelector('#submission-dialog');
const favoritesDialog = document.querySelector('#favorites-dialog');
const loginTrigger = document.querySelector('[data-open-auth]');

bindFormDialog(authDialog);
bindFormDialog(registerDialog);
bindFormDialog(reviewDialog);
bindFormDialog(submissionDialog);
bindFormDialog(favoritesDialog);

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || 'Не удалось выполнить запрос');
  return payload;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Не удалось прочитать файл ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function uploadSubmissionPhotos(fileList) {
  const files = Array.from(fileList || []).slice(0, 6);
  const urls = [];
  for (const file of files) {
    if (file.size > 6 * 1024 * 1024) throw new Error(`${file.name}: файл больше 6 МБ`);
    const data = await fileToDataUrl(file);
    const result = await requestJson('/api/uploads', {
      method: 'POST',
      body: JSON.stringify({ name: file.name, type: file.type, data })
    });
    urls.push(result.url);
  }
  return urls;
}

function setFormPending(form, pending, label) {
  const button = form.querySelector('button[type="submit"]');
  if (!button) return;
  if (!button.dataset.label) button.dataset.label = button.innerHTML;
  button.disabled = pending;
  button.innerHTML = pending ? label : button.dataset.label;
}

function openAuth() {
  if (isAuthenticated) {
    showView('profile');
    return;
  }
  if (!authDialog) return;
  if (registerDialog?.open) registerDialog.close();
  authDialog.showModal();
}

function openRegister() {
  if (isAuthenticated) {
    showView('profile');
    return;
  }
  if (!registerDialog) return;
  if (authDialog?.open) authDialog.close();
  registerDialog.showModal();
}

function initials(name) {
  return String(name || 'М').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'М';
}

function renderAuthState(user, favorites = []) {
  currentUser = user || null;
  isAuthenticated = Boolean(user);
  favoriteAccessPrompted = false;
  const trigger = document.querySelector('.login-trigger');
  if (trigger) {
    trigger.textContent = isAuthenticated ? initials(user.name) : 'Войти';
    trigger.classList.toggle('profile-button', isAuthenticated);
    trigger.setAttribute('aria-label', isAuthenticated ? 'Открыть личный кабинет' : 'Войти или зарегистрироваться');
  }
  const registerTrigger = document.querySelector('.register-trigger');
  if (registerTrigger) registerTrigger.hidden = isAuthenticated;
  document.querySelectorAll('[data-profile-name]').forEach((element) => { element.textContent = user?.name || 'Ваш профиль'; });
  document.querySelectorAll('[data-profile-email]').forEach((element) => { element.textContent = user?.email || ''; });
  document.querySelectorAll('[data-profile-avatar]').forEach((element) => { element.textContent = initials(user?.name); });
  document.querySelectorAll('[data-logout]').forEach((button) => { button.hidden = !isAuthenticated; });
  document.querySelectorAll('.merchant-profile-link').forEach((link) => { link.hidden = user?.role !== 'merchant'; });
  if (!isAuthenticated) {
    favoriteVenueIds.clear();
    favoriteSnapshots.clear();
  } else if (Array.isArray(favorites)) {
    favoriteVenueIds.clear();
    favoriteSnapshots.clear();
    favorites.forEach((item) => {
      const id = item.venue_key;
      if (!id) return;
      const snapshot = { ...(item.snapshot || {}), databaseId: item.venue_id || null, source: item.venue_id ? 'mesto' : 'external' };
      favoriteVenueIds.add(id);
      favoriteSnapshots.set(id, snapshot);
      if (!venueData[id] && snapshot.title) venueData[id] = snapshot;
    });
  }
  document.querySelectorAll('.venue-card[data-venue]').forEach((card) => card.querySelector('.fav')?.classList.toggle('is-saved', favoriteVenueIds.has(card.dataset.venue)));
  const reviewName = document.querySelector('#review-form [name="authorName"]');
  if (reviewName && user?.name) reviewName.value = user.name;
  const submissionName = document.querySelector('#submission-form [name="contactName"]');
  const submissionEmail = document.querySelector('#submission-form [name="contactEmail"]');
  if (submissionName && user?.name) submissionName.value = user.name;
  if (submissionEmail && user?.email) submissionEmail.value = user.email;
  renderFavorites();
}

function formError(form, message = '') {
  const box = form?.querySelector('.auth-error');
  if (!box) return;
  box.textContent = message;
  box.hidden = !message;
}

async function restoreSession() {
  try {
    const payload = await requestJson('/api/auth/session');
    renderAuthState(payload.user, payload.favorites);
  } catch {
    renderAuthState(null);
  }
}

async function completeOAuthSession() {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const queryParams = new URLSearchParams(window.location.search);
  const oauthError = hashParams.get('error_description') || hashParams.get('error');
  const accessToken = hashParams.get('access_token');
  const externalProvider = ['vk', 'yandex'].includes(queryParams.get('oauth')) ? queryParams.get('oauth') : '';
  if (oauthError) {
    window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
    showToast('Вход через Google отменён или не был завершён');
    return false;
  }
  if (!accessToken && externalProvider) {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('oauth');
    window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    try {
      const session = await requestJson('/api/auth/session');
      if (!session.user) throw new Error('Сессия не создана');
      renderAuthState(session.user, session.favorites || []);
      showToast(`Вход через ${externalProvider === 'vk' ? 'VK' : 'Яндекс'} выполнен`);
      return true;
    } catch (error) {
      showToast(error.message || 'Не удалось завершить вход');
      return false;
    }
  }
  if (!accessToken) return false;
  window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
  try {
    const payload = await requestJson('/api/auth/oauth-session', { method: 'POST', body: JSON.stringify({ accessToken }) });
    const session = await requestJson('/api/auth/session').catch(() => ({ user: payload.user, favorites: [] }));
    renderAuthState(session.user || payload.user, session.favorites || []);
    showToast('Вход через Google выполнен');
    return true;
  } catch (error) {
    showToast(error.message || 'Не удалось завершить вход');
    return false;
  }
}

let authProviders = { google: false, yandex: false, vk: false };
let pendingPublicAction = new URLSearchParams(window.location.search).get('open') || '';

function consumePublicAction() {
  if (!['submission', 'favorites', 'profile'].includes(pendingPublicAction)) return;
  if (!isAuthenticated) {
    openAuth();
    return;
  }
  const action = pendingPublicAction;
  pendingPublicAction = '';
  const url = new URL(window.location.href);
  url.searchParams.delete('open');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  if (action === 'submission') submissionDialog?.showModal();
  if (action === 'favorites') {
    renderFavorites();
    favoritesDialog?.showModal();
  }
  if (action === 'profile') showView('profile');
}

async function loadAuthProviders() {
  try { authProviders = await requestJson('/api/auth/providers'); } catch { authProviders = { google: false, yandex: false, vk: false }; }
  document.querySelectorAll('[data-social]').forEach((button) => {
    const available = Boolean(authProviders[button.dataset.social]);
    button.classList.toggle('is-unavailable', !available);
    button.setAttribute('aria-label', available ? `Продолжить через ${button.textContent.trim()}` : `${button.textContent.trim()}: подключение пока недоступно`);
    button.title = available ? `Продолжить через ${button.textContent.trim()}` : 'Способ входа готов к подключению после добавления OAuth-ключей';
  });
}

document.querySelectorAll('[data-open-auth]').forEach((button) => button.addEventListener('click', () => isAuthenticated ? showView('profile') : openAuth()));
document.querySelectorAll('[data-open-register]').forEach((button) => button.addEventListener('click', () => isAuthenticated ? showView('profile') : openRegister()));
document.querySelector('#auth-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  formError(form);
  setFormPending(form, true, 'Проверяем…');
  try {
    const payload = await requestJson('/api/auth/login', { method: 'POST', body: JSON.stringify(data) });
    renderAuthState(payload.user, []);
    authDialog?.close();
    form.reset();
    const session = await requestJson('/api/auth/session');
    renderAuthState(session.user, session.favorites);
    consumePublicAction();
    showToast('Вход выполнен — добро пожаловать в «Место»');
  } catch (error) {
    formError(form, error.message || 'Неверный логин или пароль.');
  } finally {
    setFormPending(form, false, '');
  }
});
document.querySelector('#register-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  formError(form);
  setFormPending(form, true, 'Создаём профиль…');
  try {
    const payload = await requestJson('/api/auth/register', { method: 'POST', body: JSON.stringify(data) });
    renderAuthState(payload.user, []);
    registerDialog?.close();
    form.reset();
    consumePublicAction();
    showToast('Профиль создан — теперь можно сохранять места');
  } catch (error) {
    formError(form, error.message || 'Не удалось создать профиль.');
  } finally {
    setFormPending(form, false, '');
  }
});
document.querySelectorAll('[data-social]').forEach((button) => button.addEventListener('click', () => {
  const provider = button.dataset.social;
  if (authProviders[provider]) {
    const oauthUrl = new URL('/api/auth/oauth', window.location.origin);
    oauthUrl.searchParams.set('provider', provider);
    if (provider !== 'google') {
      const returnUrl = new URL(window.location.href);
      returnUrl.searchParams.set('oauth', provider);
      oauthUrl.searchParams.set('returnTo', `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`);
    }
    window.location.assign(`${oauthUrl.pathname}${oauthUrl.search}`);
    return;
  }
  document.querySelectorAll('.social-auth-note').forEach((note) => {
    note.textContent = `${provider === 'google' ? 'Google' : provider === 'yandex' ? 'Яндекс' : 'VK'} временно недоступен. Выберите другой способ входа.`;
  });
}));
document.querySelectorAll('[data-logout]').forEach((button) => button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    await requestJson('/api/auth/logout', { method: 'POST', body: '{}' });
    renderAuthState(null);
    showView('home');
    showToast('Вы вышли из аккаунта');
  } catch (error) {
    showToast(error.message || 'Не удалось завершить сеанс');
  } finally {
    button.disabled = false;
  }
}));
document.querySelectorAll('[data-open-favorites]').forEach((button) => button.addEventListener('click', () => {
  if (!requestFavoriteAccess()) return;
  renderFavorites();
  favoritesDialog?.showModal();
}));
document.querySelectorAll('[data-open-review]').forEach((button) => button.addEventListener('click', () => {
  if (!isAuthenticated) {
    showToast('Войдите или зарегистрируйтесь, чтобы оставить отзыв');
    openAuth();
    return;
  }
  reviewDialog?.showModal();
}));
document.querySelector('#review-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const externalVenueId = Object.keys(venueData).find((id) => venueData[id] === activeVenue) || '';
  setFormPending(form, true, 'Отправляем…');
  try {
    await requestJson('/api/reviews', {
      method: 'POST',
      body: JSON.stringify({
        venueId: activeVenue?.databaseId || null,
        externalVenueId,
        venueTitle: activeVenue?.title || 'Заведение',
        authorName: data.get('authorName'),
        rating: data.get('rating'),
        review: data.get('review')
      })
    });
    reviewDialog?.close();
    form.reset();
    showToast('Спасибо! Отзыв отправлен на модерацию редакции');
  } catch (error) {
    showToast(error.message || 'Не удалось отправить отзыв');
  } finally {
    setFormPending(form, false, '');
  }
});
document.querySelectorAll('[data-open-submission]').forEach((button) => button.addEventListener('click', () => {
  if (!isAuthenticated) {
    showToast('Войдите или зарегистрируйтесь, чтобы предложить заведение');
    openAuth();
    return;
  }
  submissionDialog?.showModal();
}));
document.querySelector('#submission-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const photos = form.elements.photos?.files || [];
  const features = String(data.get('features') || '').split(/[,;]+/).map((item) => item.trim()).filter(Boolean);
  setFormPending(form, true, photos.length ? 'Загружаем фотографии…' : 'Отправляем…');
  try {
    const photoUrls = await uploadSubmissionPhotos(photos);
    await requestJson('/api/submissions', {
      method: 'POST',
      body: JSON.stringify({
        contactName: data.get('contactName'),
        contactEmail: data.get('contactEmail'),
        title: data.get('title'),
        city: data.get('city'),
        category: data.get('category'),
        cuisine: data.get('cuisine'),
        description: data.get('description'),
        address: data.get('address'),
        phone: data.get('phone'),
        website: data.get('website'),
        hours: data.get('hours'),
        averageCheck: data.get('averageCheck'),
        features,
        photos: photoUrls
      })
    });
    submissionDialog?.close();
    form.reset();
    showToast('Заявка отправлена на модерацию — спасибо за вклад в каталог');
  } catch (error) {
    showToast(error.message || 'Не удалось отправить заявку');
  } finally {
    setFormPending(form, false, '');
  }
});
const mobileNav = document.querySelector('.mobile-nav');
const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
let mobileMenuReturnFocus = null;
function setMobileMenu(open) {
  if (!mobileNav || !mobileMenuToggle) return;
  if (open) mobileMenuReturnFocus = document.activeElement;
  mobileNav.hidden = !open;
  mobileMenuToggle.setAttribute('aria-expanded', String(open));
  mobileMenuToggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  document.body.classList.toggle('has-mobile-menu', open);
  if (open) window.setTimeout(() => mobileNav.querySelector('.mobile-nav-close')?.focus(), 0);
  else if (mobileMenuReturnFocus instanceof HTMLElement) mobileMenuReturnFocus.focus();
}
mobileMenuToggle?.addEventListener('click', () => setMobileMenu(mobileNav?.hidden));
mobileNav?.querySelector('.mobile-nav-close')?.addEventListener('click', () => setMobileMenu(false));
mobileNav?.addEventListener('click', (event) => {
  if (event.target === mobileNav || event.target.closest('a,[data-open-auth],[data-open-register],[data-open-favorites]')) setMobileMenu(false);
});
document.addEventListener('keydown', (event) => {
  if (!mobileNav || mobileNav.hidden) return;
  if (event.key === 'Escape') return setMobileMenu(false);
  if (event.key !== 'Tab') return;
  const focusable = Array.from(mobileNav.querySelectorAll('button:not([disabled]),a[href]')).filter((element) => !element.hidden);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

loadAuthProviders();
completeOAuthSession().then(async (completed) => {
  if (!completed) await restoreSession();
  consumePublicAction();
});
