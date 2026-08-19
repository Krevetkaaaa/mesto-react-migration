import { describe, expect, it } from "vitest";

import {
  EDITORIAL_VENUES,
  findEditorialVenueBySlug,
} from "../../../app/data/editorial-venues";

describe("editorial catalog fallback", () => {
  it("contains exactly the legacy restaurant cards used by the populated baseline", () => {
    expect(EDITORIAL_VENUES.map((venue) => venue.key)).toEqual([
      "marea",
      "pristan",
      "beluga",
      "gnezdo",
      "volna",
      "paititi",
      "omega",
    ]);
    expect(EDITORIAL_VENUES.every((venue) => (
      venue.category === "Рестораны" && venue.filters.category === "Рестораны"
    ))).toBe(true);
  });

  it("uses explicit stable route slugs without changing legacy favorite keys", () => {
    expect(Object.fromEntries(EDITORIAL_VENUES.map(({ key, slug }) => [key, slug]))).toEqual({
      marea: "barkas",
      pristan: "ayvazovskiy",
      beluga: "beluga-stor",
      gnezdo: "gnezdo",
      volna: "volna",
      paititi: "paititi",
      omega: "omega",
    });
    expect(new Set(EDITORIAL_VENUES.map((venue) => venue.key)).size).toBe(EDITORIAL_VENUES.length);
    expect(new Set(EDITORIAL_VENUES.map((venue) => venue.slug)).size).toBe(EDITORIAL_VENUES.length);
  });

  it("preserves the legacy detail, card, filter, feature, image, and menu fields", () => {
    expect(findEditorialVenueBySlug("barkas")).toMatchObject({
      key: "marea",
      name: "Баркас",
      city: "Севастополь",
      cuisine: "Средиземноморская",
      hours: "12:00–00:00",
      averageCheck: "от 1 300 ₽",
      features: ["Средиземноморская кухня", "Парковка рядом", "Есть веранда"],
      photos: ["assets/venue-restaurant-unsplash.jpg"],
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
    });

    expect(findEditorialVenueBySlug("beluga-stor")).toMatchObject({
      key: "beluga",
      mapsUrl: "https://yandex.ru/maps/org/beluga_stor/106259641007/",
      reviewCount: 392,
      presentation: { reviews: "392 оценки на Картах" },
      card: { reviews: "392 оценки" },
    });
    expect(findEditorialVenueBySlug("missing")).toBeNull();
  });
});
