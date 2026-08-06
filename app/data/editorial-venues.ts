import type { CatalogVenue } from "../lib/domain";

export type EditorialMenuItem = readonly [
  title: string,
  description: string,
  price: string,
];

export interface EditorialVenuePresentation {
  readonly type: string;
  readonly rating: string;
  readonly reviews: string;
  readonly price: string;
  readonly image: string;
  readonly text: string;
}

export interface EditorialVenueCardPresentation {
  readonly imageAlt: string;
  readonly tag: string;
  readonly subtitle: string;
  readonly reviews: string;
}

export interface EditorialVenueFilters {
  readonly category: string;
  readonly city: string;
  readonly cuisine: string;
  readonly source: string;
  readonly award: string;
  readonly pet: boolean;
  readonly parking: boolean;
  readonly score: number;
  readonly isNew: boolean;
  readonly search: string;
}

export interface EditorialVenueExtras {
  readonly wifi: boolean;
  readonly menu: readonly EditorialMenuItem[];
}

/**
 * Frozen editorial fallback used by the legacy populated-catalog baseline.
 *
 * `key` intentionally preserves the legacy `data-venue` identity used by
 * favorites. `slug` is an explicit public-route identity; it must never be
 * regenerated from the display title at runtime.
 */
export interface EditorialVenue extends CatalogVenue {
  readonly presentation: EditorialVenuePresentation;
  readonly card: EditorialVenueCardPresentation;
  readonly filters: EditorialVenueFilters;
  readonly extras: EditorialVenueExtras;
}

export const EDITORIAL_VENUES = [
  {
    key: "marea",
    databaseId: null,
    slug: "barkas",
    name: "Баркас",
    city: "Севастополь",
    address: "",
    description: "Ресторан черноморской кухни с винным бутиком и спокойной атмосферой у воды. Подходит для неспешного ужина и особенного повода.",
    categories: ["Рестораны"],
    category: "Рестораны",
    cuisine: "Средиземноморская",
    hours: "12:00–00:00",
    averageCheck: "от 1 300 ₽",
    phones: [],
    website: "",
    features: ["Средиземноморская кухня", "Парковка рядом", "Есть веранда"],
    coordinates: [],
    photos: ["assets/venue-restaurant-unsplash.jpg"],
    mapsUrl: "",
    source: "yandex",
    rating: 4.9,
    reviewCount: null,
    presentation: {
      type: "Ресторан · Севастополь",
      rating: "4.9",
      reviews: "редакционная оценка",
      price: "от 1 300 ₽",
      image: "assets/venue-restaurant-unsplash.jpg",
      text: "Ресторан черноморской кухни с винным бутиком и спокойной атмосферой у воды. Подходит для неспешного ужина и особенного повода.",
    },
    card: {
      imageAlt: "Тёплый интерьер ресторана",
      tag: "Чёрное море",
      subtitle: "Черноморская и средиземноморская кухня",
      reviews: "редакционная оценка",
    },
    filters: {
      category: "Рестораны",
      city: "Севастополь",
      cuisine: "Средиземноморская",
      source: "yandex",
      award: "",
      pet: false,
      parking: true,
      score: 4.9,
      isNew: false,
      search: "баркас ресторан средиземноморская кухня море севастополь",
    },
    extras: {
      wifi: true,
      menu: [
        ["Тартар из тунца", "с авокадо и цитрусом", "890 ₽"],
        ["Черноморская рыба", "на гриле, сезонные овощи", "1 240 ₽"],
        ["Павлова с инжиром", "воздушный крем и ягоды", "620 ₽"],
      ],
    },
  },
  {
    key: "pristan",
    databaseId: null,
    slug: "ayvazovskiy",
    name: "Айвазовский",
    city: "Симферополь",
    address: "",
    description: "Ресторанный комплекс с европейской и авторской кухней. Перед визитом советуем проверить часы работы и актуальное меню.",
    categories: ["Рестораны"],
    category: "Рестораны",
    cuisine: "Европейская",
    hours: "12:00–23:00",
    averageCheck: "от 1 100 ₽",
    phones: [],
    website: "",
    features: ["Европейская кухня", "Авторская кухня", "Парковка рядом"],
    coordinates: [],
    photos: ["assets/real-dining-night.jpg"],
    mapsUrl: "",
    source: "yandex",
    rating: 4.8,
    reviewCount: null,
    presentation: {
      type: "Ресторан · Симферополь",
      rating: "4.8",
      reviews: "редакционная оценка",
      price: "от 1 100 ₽",
      image: "assets/real-dining-night.jpg",
      text: "Ресторанный комплекс с европейской и авторской кухней. Перед визитом советуем проверить часы работы и актуальное меню.",
    },
    card: {
      imageAlt: "Интерьер ресторана Айвазовский",
      tag: "Реальное место",
      subtitle: "Европейская и авторская кухня",
      reviews: "редакционная оценка",
    },
    filters: {
      category: "Рестораны",
      city: "Симферополь",
      cuisine: "Европейская",
      source: "yandex",
      award: "",
      pet: true,
      parking: true,
      score: 4.8,
      isNew: true,
      search: "айвазовский ресторан европейская кухня симферополь",
    },
    extras: {
      wifi: true,
      menu: [
        ["Томлёная телятина", "картофель, демиглас", "1 180 ₽"],
        ["Кальмар на гриле", "соус ромеско", "890 ₽"],
        ["Шоколадный фондан", "мороженое и вишня", "490 ₽"],
      ],
    },
  },
  {
    key: "beluga",
    databaseId: null,
    slug: "beluga-stor",
    name: "Белуга Стор",
    city: "Симферополь",
    address: "просп. Кирова, 19",
    description: "Ресторан рыбы и морепродуктов на проспекте Кирова, 19. В карточке Яндекс Карт отмечена доставка продуктов.",
    categories: ["Рестораны"],
    category: "Рестораны",
    cuisine: "",
    hours: "до 23:00",
    averageCheck: "По меню",
    phones: [],
    website: "",
    features: ["Рыба и морепродукты", "Доставка продуктов", "просп. Кирова, 19"],
    coordinates: [],
    photos: ["assets/venue-restaurant-unsplash.jpg"],
    mapsUrl: "https://yandex.ru/maps/org/beluga_stor/106259641007/",
    source: "yandex",
    rating: 5,
    reviewCount: 392,
    presentation: {
      type: "Ресторан · Симферополь",
      rating: "5.0",
      reviews: "392 оценки на Картах",
      price: "По меню",
      image: "assets/venue-restaurant-unsplash.jpg",
      text: "Ресторан рыбы и морепродуктов на проспекте Кирова, 19. В карточке Яндекс Карт отмечена доставка продуктов.",
    },
    card: {
      imageAlt: "Интерьер ресторана",
      tag: "Яндекс Карты",
      subtitle: "Ресторан · Симферополь",
      reviews: "392 оценки",
    },
    filters: {
      category: "Рестораны",
      city: "Симферополь",
      cuisine: "all",
      source: "yandex",
      award: "",
      pet: false,
      parking: false,
      score: 5,
      isNew: true,
      search: "белуга стор ресторан рыба морепродукты симферополь",
    },
    extras: { wifi: false, menu: [] },
  },
  {
    key: "gnezdo",
    databaseId: null,
    slug: "gnezdo",
    name: "Gnezdo",
    city: "Симферополь",
    address: "ул. Пушкина, 9",
    description: "Публичная карточка на Яндекс Картах: ресторан и кафе на улице Пушкина, 9.",
    categories: ["Рестораны"],
    category: "Рестораны",
    cuisine: "",
    hours: "График на Картах",
    averageCheck: "По меню",
    phones: [],
    website: "",
    features: ["Ресторан и кафе", "ул. Пушкина, 9", "График на Картах"],
    coordinates: [],
    photos: ["assets/real-dining-night.jpg"],
    mapsUrl: "",
    source: "yandex",
    rating: 5,
    reviewCount: 289,
    presentation: {
      type: "Ресторан · Симферополь",
      rating: "5.0",
      reviews: "289 оценок на Картах",
      price: "По меню",
      image: "assets/real-dining-night.jpg",
      text: "Публичная карточка на Яндекс Картах: ресторан и кафе на улице Пушкина, 9.",
    },
    card: {
      imageAlt: "Интерьер ресторана",
      tag: "Выбор Места",
      subtitle: "Ресторан · Симферополь",
      reviews: "289 оценок",
    },
    filters: {
      category: "Рестораны",
      city: "Симферополь",
      cuisine: "all",
      source: "yandex",
      award: "mesto-choice",
      pet: false,
      parking: false,
      score: 5,
      isNew: true,
      search: "gnezdo ресторан кафе симферополь",
    },
    extras: { wifi: false, menu: [] },
  },
  {
    key: "volna",
    databaseId: null,
    slug: "volna",
    name: "Волна",
    city: "Ялта",
    address: "ул. Дражинского, 50",
    description: "Публичная карточка на Яндекс Картах: ресторан на улице Дражинского, 50 в Ялте.",
    categories: ["Рестораны"],
    category: "Рестораны",
    cuisine: "",
    hours: "График на Картах",
    averageCheck: "По меню",
    phones: [],
    website: "",
    features: ["Ресторан", "ул. Дражинского, 50", "График на Картах"],
    coordinates: [],
    photos: ["assets/real-restaurant-interior.jpg"],
    mapsUrl: "",
    source: "yandex",
    rating: 4.9,
    reviewCount: 23,
    presentation: {
      type: "Ресторан · Ялта",
      rating: "4.9",
      reviews: "23 оценки на Картах",
      price: "По меню",
      image: "assets/real-restaurant-interior.jpg",
      text: "Публичная карточка на Яндекс Картах: ресторан на улице Дражинского, 50 в Ялте.",
    },
    card: {
      imageAlt: "Интерьер ресторана",
      tag: "Яндекс Карты",
      subtitle: "Ресторан · Ялта",
      reviews: "23 оценки",
    },
    filters: {
      category: "Рестораны",
      city: "Ялта",
      cuisine: "all",
      source: "yandex",
      award: "",
      pet: false,
      parking: false,
      score: 4.9,
      isNew: true,
      search: "волна ресторан ялта",
    },
    extras: { wifi: false, menu: [] },
  },
  {
    key: "paititi",
    databaseId: null,
    slug: "paititi",
    name: "Paititi",
    city: "Ялта",
    address: "ул. Рузвельта, 12А",
    description: "Публичная карточка на Яндекс Картах: ресторан и кафе на улице Рузвельта, 12А.",
    categories: ["Рестораны"],
    category: "Рестораны",
    cuisine: "",
    hours: "График на Картах",
    averageCheck: "По меню",
    phones: [],
    website: "",
    features: ["Ресторан и кафе", "ул. Рузвельта, 12А", "График на Картах"],
    coordinates: [],
    photos: ["assets/real-dining-night.jpg"],
    mapsUrl: "",
    source: "yandex",
    rating: 5,
    reviewCount: 967,
    presentation: {
      type: "Ресторан · Ялта",
      rating: "5.0",
      reviews: "967 оценок на Картах",
      price: "По меню",
      image: "assets/real-dining-night.jpg",
      text: "Публичная карточка на Яндекс Картах: ресторан и кафе на улице Рузвельта, 12А.",
    },
    card: {
      imageAlt: "Интерьер ресторана",
      tag: "Выбор Места",
      subtitle: "Ресторан · Ялта",
      reviews: "967 оценок",
    },
    filters: {
      category: "Рестораны",
      city: "Ялта",
      cuisine: "all",
      source: "yandex",
      award: "mesto-choice",
      pet: false,
      parking: false,
      score: 5,
      isNew: true,
      search: "paititi ресторан кафе ялта",
    },
    extras: { wifi: false, menu: [] },
  },
  {
    key: "omega",
    databaseId: null,
    slug: "omega",
    name: "Омега",
    city: "Севастополь",
    address: "ул. Ерошенко, 19",
    description: "Публичная карточка на Яндекс Картах: ресторан и кафе на улице Ерошенко, 19.",
    categories: ["Рестораны"],
    category: "Рестораны",
    cuisine: "",
    hours: "График на Картах",
    averageCheck: "1 500–2 500 ₽",
    phones: [],
    website: "",
    features: ["Ресторан и кафе", "ул. Ерошенко, 19", "График на Картах"],
    coordinates: [],
    photos: ["assets/real-restaurant-interior.jpg"],
    mapsUrl: "",
    source: "yandex",
    rating: 4.8,
    reviewCount: 122,
    presentation: {
      type: "Ресторан · Севастополь",
      rating: "4.8",
      reviews: "122 оценки на Картах",
      price: "1 500–2 500 ₽",
      image: "assets/real-restaurant-interior.jpg",
      text: "Публичная карточка на Яндекс Картах: ресторан и кафе на улице Ерошенко, 19.",
    },
    card: {
      imageAlt: "Интерьер ресторана",
      tag: "Яндекс Карты",
      subtitle: "Ресторан · Севастополь",
      reviews: "122 оценки",
    },
    filters: {
      category: "Рестораны",
      city: "Севастополь",
      cuisine: "all",
      source: "yandex",
      award: "",
      pet: false,
      parking: false,
      score: 4.8,
      isNew: true,
      search: "омега ресторан кафе севастополь",
    },
    extras: { wifi: false, menu: [] },
  },
] as const satisfies readonly EditorialVenue[];

export function findEditorialVenueBySlug(slug: string) {
  return EDITORIAL_VENUES.find((venue) => venue.slug === slug) ?? null;
}
