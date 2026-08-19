import { describe, expect, it } from "vitest";

import { ApplicationError } from "../../../app/lib/application-error";
import type { CatalogVenue } from "../../../app/lib/domain";
import { defaultCatalogUrlState } from "../../../app/modules/catalog-url-state";
import { createPublicCatalogExperience } from "../../../app/modules/public-catalog-experience";
import { FakeVenueCatalog } from "../../../app/modules/venue-catalog";

function item(slug: string, overrides: Partial<CatalogVenue> = {}): CatalogVenue {
  return {
    key: slug,
    databaseId: null,
    slug,
    name: slug,
    city: "Симферополь",
    address: "",
    description: "",
    categories: ["Рестораны"],
    category: "Рестораны",
    cuisine: "Европейская",
    hours: "",
    averageCheck: "",
    phones: [],
    website: "",
    features: [],
    coordinates: [],
    photos: [],
    mapsUrl: "",
    source: "editorial",
    rating: null,
    reviewCount: null,
    ...overrides,
  };
}

describe("public catalog experience", () => {
  it("keeps API ownership when the production database is configured", async () => {
    const catalog = new FakeVenueCatalog({
      items: [item("api-low", { rating: 4.1 }), item("api-high", { rating: 4.9 })],
      databaseConfigured: true,
    });
    const experience = createPublicCatalogExperience(catalog, {
      editorialItems: [item("demo")],
    });

    const snapshot = await experience.load(defaultCatalogUrlState());

    expect(snapshot.items.map(({ slug }) => slug)).toEqual(["api-high", "api-low"]);
    expect(snapshot.source).toBe("database");
    expect(snapshot.errorMessage).toBeNull();
  });

  it("uses fixed editorial records only when the database is unavailable", async () => {
    const editorial = item("pet-place", {
      cuisine: "Кофе и десерты",
      features: ["Можно с питомцами", "Парковка рядом"],
    });
    const experience = createPublicCatalogExperience(
      new FakeVenueCatalog({ databaseConfigured: false }),
      { editorialItems: [editorial, item("other")] },
    );
    const snapshot = await experience.load({
      ...defaultCatalogUrlState(),
      cuisine: "Кофе и десерты",
      petFriendly: true,
      parking: true,
    });

    expect(snapshot.items.map(({ slug }) => slug)).toEqual(["pet-place"]);
    expect(snapshot.source).toBe("editorial-fallback");
    expect(snapshot.nextPage).toBeNull();
  });

  it("returns a retryable fallback snapshot instead of destroying the route", async () => {
    const catalog = new FakeVenueCatalog();
    catalog.failNext(new ApplicationError("unavailable", "upstream detail must stay private"));
    const experience = createPublicCatalogExperience(catalog, {
      editorialItems: [item("safe-fallback")],
    });

    const snapshot = await experience.load(defaultCatalogUrlState());

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.errorMessage).toContain("Показана подборка редакции");
    expect(snapshot.errorMessage).not.toContain("upstream");
  });

  it("loads cumulative pages for addressable load-more state", async () => {
    const catalog = new FakeVenueCatalog({
      items: Array.from({ length: 101 }, (_, index) => item(`venue-${String(index).padStart(3, "0")}`)),
    });
    const snapshot = await createPublicCatalogExperience(catalog).load({
      ...defaultCatalogUrlState(),
      sort: "new",
      page: 2,
    });

    expect(snapshot.items).toHaveLength(100);
    expect(snapshot.nextPage).toBe(3);
  });
});
