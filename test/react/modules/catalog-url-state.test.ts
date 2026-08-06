import { describe, expect, it } from "vitest";

import {
  CATALOG_PAGE_SIZE,
  MAX_CATALOG_PAGE,
  catalogHref,
  catalogOffset,
  catalogSearchParams,
  cityCatalogHref,
  cityForSlug,
  defaultCatalogUrlState,
  parseCatalogUrl,
  slugForCity,
} from "../../../app/modules/catalog-url-state";

describe("catalog URL state", () => {
  it("uses compact stable defaults", () => {
    const state = defaultCatalogUrlState();

    expect(parseCatalogUrl(new URLSearchParams())).toEqual(state);
    expect(catalogSearchParams(state).toString()).toBe("");
    expect(catalogHref(state)).toBe("/catalog");
    expect(catalogOffset(state)).toBe(0);
  });

  it("round-trips addressable filters and pagination", () => {
    const state = {
      query: "тихий сад",
      city: "Симферополь",
      category: "Рестораны",
      cuisine: "Европейская",
      sort: "new" as const,
      petFriendly: true,
      parking: true,
      page: 3,
    };

    const params = catalogSearchParams(state);

    expect(parseCatalogUrl(params)).toEqual(state);
    expect(catalogHref(state)).toBe(`/catalog?${params.toString()}`);
    expect(catalogOffset(state)).toBe(CATALOG_PAGE_SIZE * 2);
  });

  it("normalizes hostile and unsupported values at the boundary", () => {
    const params = new URLSearchParams({
      q: "  ужин<script>  ",
      city: "   ",
      category: "Рестораны\u0000",
      cuisine: "all",
      sort: "random",
      pet: "yes",
      parking: "true",
      page: "999999",
    });

    expect(parseCatalogUrl(params)).toEqual({
      query: "ужин script",
      city: "all",
      category: "Рестораны",
      cuisine: "all",
      sort: "popular",
      petFriendly: false,
      parking: true,
      page: MAX_CATALOG_PAGE,
    });
  });

  it("maps canonical city slugs without guessing unknown cities", () => {
    expect(cityForSlug("SIMFEROPOL")).toBe("Симферополь");
    expect(slugForCity("Ялта")).toBe("yalta");
    expect(cityForSlug("unknown-city")).toBeNull();
    expect(slugForCity("Неизвестный город")).toBeNull();
  });

  it("builds a city route while keeping the city out of its query", () => {
    const state = {
      query: "",
      category: "Рестораны",
      cuisine: "all",
      sort: "popular" as const,
      petFriendly: false,
      parking: false,
      page: 2,
    };

    expect(cityCatalogHref("yalta", state)).toBe(
      "/city/yalta?category=%D0%A0%D0%B5%D1%81%D1%82%D0%BE%D1%80%D0%B0%D0%BD%D1%8B&page=2",
    );
  });
});
