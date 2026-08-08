import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PublicHomeView } from "../../../app/routes/public-home";
import type { HomeCatalogSummary } from "../../../app/modules/home-catalog-summary";

const fixtureSummary: HomeCatalogSummary = {
  total: 3,
  byCategory: { "Рестораны": 2, "Кофейни": 1 },
  byCity: { "Симферополь": 2, "Ялта": 1 },
  source: "database",
  databaseConfigured: true,
};

function fixtureDocument() {
  const markup = renderToStaticMarkup(
    <PublicHomeView catalogSummary={fixtureSummary} />,
  );
  return new DOMParser().parseFromString(
    `<!doctype html><body>${markup}</body>`,
    "text/html",
  );
}

function catalogUrl(document: Document, selector: string) {
  const href = document.querySelector<HTMLAnchorElement>(selector)?.getAttribute("href");
  if (!href) throw new Error(`Missing canonical href for ${selector}`);
  return new URL(href, "https://mesto.example.test");
}

describe("home catalog summary markup", () => {
  it("SSR-renders every existing total/category/city slot from one summary", () => {
    const document = fixtureDocument();

    expect(document.querySelector("main")?.dataset.homeCatalogSource).toBe("database");
    expect([...document.querySelectorAll("[data-venue-count]")].map((node) => node.textContent)).toEqual([
      "3",
      "3",
      "3",
    ]);
    expect([...document.querySelectorAll('[data-category-count="Кофейни"]')].map((node) => node.textContent)).toEqual([
      "1 место",
      "1 место",
    ]);
    expect(document.querySelector('[data-city-count="Ялта"]')?.textContent).toBe("1 место");
    expect(document.querySelector('[data-venue-total-label="venues"]')?.textContent).toBe("3 заведения");
    expect(document.querySelector('[data-venue-total-label="places"]')?.textContent).toContain("3 места уже в каталоге");
    expect(document.querySelector('[data-venue-total-label="catalog-stat"]')?.textContent).toBe("заведения в каталоге");
  });

  it("keeps category, city, and collection destinations honest without JavaScript", () => {
    const document = fixtureDocument();

    expect(catalogUrl(document, '.category-card[data-filter-category="Кофейни"]').searchParams.get("category")).toBe("Кофейни");
    expect(catalogUrl(document, '.city-card[data-city-filter="Ялта"]').searchParams.get("city")).toBe("Ялта");

    const expectedCollections = {
      breakfast: { category: "Кофейни" },
      sea: { city: "Ялта", category: "Рестораны" },
      date: { category: "Рестораны" },
      pet: { pet: "1" },
    };
    for (const [collection, expected] of Object.entries(expectedCollections)) {
      const card = document.querySelector<HTMLAnchorElement>(`[data-collection="${collection}"]`);
      const url = catalogUrl(document, `[data-collection="${collection}"]`);
      expect(Object.fromEntries(url.searchParams)).toEqual(expected);
      expect(card?.querySelector("small")?.textContent).toBe("Смотреть места");
    }
    expect(document.querySelectorAll("[data-collection-count]")).toHaveLength(0);
  });
});
