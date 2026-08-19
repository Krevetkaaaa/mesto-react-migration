import type {
  EditorialMenuItem,
  EditorialVenue,
} from "./editorial-venues";

interface HomeFeaturedVenueSeed {
  readonly key: string;
  readonly slug: string;
  readonly name: string;
  readonly type: string;
  readonly category: string;
  readonly city: string;
  readonly cuisine: string;
  readonly description: string;
  readonly hours: string;
  readonly averageCheck: string;
  readonly features: readonly string[];
  readonly image: string;
  readonly imageAlt: string;
  readonly tag: string;
  readonly subtitle: string;
  readonly rating: number;
  readonly reviews: string;
  readonly reviewCount: number | null;
  readonly source: string;
  readonly pet: boolean;
  readonly parking: boolean;
  readonly isNew: boolean;
  readonly search: string;
  readonly menu: readonly EditorialMenuItem[];
}

function defineHomeFeaturedVenue(seed: HomeFeaturedVenueSeed): EditorialVenue {
  return {
    key: seed.key,
    databaseId: null,
    slug: seed.slug,
    name: seed.name,
    city: seed.city,
    address: "",
    description: seed.description,
    categories: [seed.category],
    category: seed.category,
    cuisine: seed.cuisine,
    hours: seed.hours,
    averageCheck: seed.averageCheck,
    phones: [],
    website: "",
    features: seed.features,
    coordinates: [],
    photos: [seed.image],
    mapsUrl: "",
    source: seed.source,
    rating: seed.rating,
    reviewCount: seed.reviewCount,
    presentation: {
      type: `${seed.type} · ${seed.city}`,
      rating: String(seed.rating),
      reviews: seed.reviews,
      price: seed.averageCheck,
      image: seed.image,
      text: seed.description,
    },
    card: {
      imageAlt: seed.imageAlt,
      tag: seed.tag,
      subtitle: seed.subtitle,
      reviews: seed.reviews,
    },
    filters: {
      category: seed.category,
      city: seed.city,
      cuisine: seed.cuisine,
      source: seed.source,
      award: "",
      pet: seed.pet,
      parking: seed.parking,
      score: seed.rating,
      isNew: seed.isNew,
      search: seed.search,
    },
    extras: {
      wifi: true,
      menu: seed.menu,
    },
  };
}

/**
 * Stable home-only editorial cards.
 *
 * They deliberately live outside `EDITORIAL_VENUES`: adding the two legacy
 * home cards to the catalog fallback would change catalog totals and frozen
 * collection counts. Explicit slugs give every card an addressable React
 * detail route without coupling public identity to its display title.
 */
export const HOME_FEATURED_VENUES = [
  defineHomeFeaturedVenue({
    key: "marea",
    slug: "barkas",
    name: "Баркас",
    type: "Ресторан",
    category: "Рестораны",
    city: "Севастополь",
    cuisine: "Средиземноморская",
    description: "Ресторан черноморской кухни с винным бутиком и спокойной атмосферой у воды. Подходит для неспешного ужина и особенного повода.",
    hours: "12:00–00:00",
    averageCheck: "от 1 300 ₽",
    features: ["Средиземноморская кухня", "Парковка рядом", "Есть веранда"],
    image: "assets/venue-restaurant-unsplash.jpg",
    imageAlt: "Тёплый интерьер ресторана",
    tag: "Чёрное море",
    subtitle: "Черноморская и средиземноморская кухня",
    rating: 4.9,
    reviews: "редакционная оценка",
    reviewCount: null,
    source: "yandex",
    pet: false,
    parking: true,
    isNew: false,
    search: "баркас ресторан средиземноморская кухня море севастополь",
    menu: [
      ["Тартар из тунца", "с авокадо и цитрусом", "890 ₽"],
      ["Черноморская рыба", "на гриле, сезонные овощи", "1 240 ₽"],
      ["Павлова с инжиром", "воздушный крем и ягоды", "620 ₽"],
    ],
  }),
  defineHomeFeaturedVenue({
    key: "zerno",
    slug: "zerno",
    name: "Зерно",
    type: "Кофейня",
    category: "Кофейни",
    city: "Симферополь",
    cuisine: "Кофе и десерты",
    description: "Светлая спешелти-кофейня с фильтр-кофе, сезонной выпечкой и столиками для работы или долгого завтрака.",
    hours: "08:00–22:00",
    averageCheck: "от 450 ₽",
    features: ["Можно с питомцами", "Парковка рядом", "Wi‑Fi"],
    image: "assets/venue-coffee-unsplash.jpg",
    imageAlt: "Интерьер спешелти-кофейни",
    tag: "Завтраки",
    subtitle: "Спешелти-кофейня",
    rating: 4.8,
    reviews: "191 отзыв",
    reviewCount: 191,
    source: "editorial",
    pet: true,
    parking: true,
    isNew: true,
    search: "зерно кофейня кофе завтраки симферополь",
    menu: [
      ["Фильтр-кофе", "свежеобжаренное зерно", "260 ₽"],
      ["Сырники", "с фермерской сметаной", "420 ₽"],
      ["Круассан с миндалём", "выпечка из печи", "290 ₽"],
    ],
  }),
  defineHomeFeaturedVenue({
    key: "sova",
    slug: "gio-restaurant-bar",
    name: "Gio restaurant & bar",
    type: "Бар",
    category: "Бары",
    city: "Севастополь",
    cuisine: "Европейская",
    description: "Ресторан и бар для поздних встреч: авторские коктейли, вечерний свет и меню для долгих разговоров.",
    hours: "17:00–02:00",
    averageCheck: "от 800 ₽",
    features: ["До 02:00", "Парковка рядом", "Авторские коктейли"],
    image: "assets/venue-cocktail-unsplash.jpg",
    imageAlt: "Авторский коктейль в баре",
    tag: "До 02:00",
    subtitle: "Европейская кухня и коктейли",
    rating: 4.7,
    reviews: "редакционная оценка",
    reviewCount: null,
    source: "yandex",
    pet: false,
    parking: true,
    isNew: false,
    search: "gio restaurant bar коктейли вечер севастополь",
    menu: [
      ["Gio Negroni", "авторский твист на классике", "720 ₽"],
      ["Тунец татаки", "кунжут, понзу, зелень", "940 ₽"],
      ["Бриошь с крабом", "сливочный соус и икра", "780 ₽"],
    ],
  }),
] as const satisfies readonly EditorialVenue[];

export function findHomeFeaturedVenueBySlug(slug: string) {
  return HOME_FEATURED_VENUES.find((venue) => venue.slug === slug) ?? null;
}
