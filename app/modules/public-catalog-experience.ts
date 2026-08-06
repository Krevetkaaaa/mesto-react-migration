import type { CatalogVenue } from "../lib/domain";
import type { CatalogPage, VenueCatalog } from "./venue-catalog";
import {
  CATALOG_PAGE_SIZE,
  type CatalogUrlState,
} from "./catalog-url-state";

export type CatalogSource = "database" | "editorial-fallback";

export interface PublicCatalogSnapshot {
  state: CatalogUrlState;
  items: readonly CatalogVenue[];
  total: number;
  visibleCount: number;
  source: CatalogSource;
  databaseConfigured: boolean;
  nextPage: number | null;
  errorMessage: string | null;
}

export interface PublicCatalogExperienceOptions {
  editorialItems?: readonly CatalogVenue[];
}

function supportsFeature(item: CatalogVenue, pattern: RegExp) {
  return pattern.test(item.features.join(" ").toLocaleLowerCase("ru-RU"));
}

function localFilters(items: readonly CatalogVenue[], state: CatalogUrlState) {
  return items.filter((item) => {
    if (state.cuisine !== "all" && item.cuisine !== state.cuisine) return false;
    if (state.petFriendly && !supportsFeature(item, /питомц|с собак|животн/)) return false;
    if (state.parking && !supportsFeature(item, /парков/)) return false;
    return true;
  });
}

function stableSort(items: readonly CatalogVenue[], state: CatalogUrlState) {
  const positioned = items.map((item, index) => ({ item, index }));
  if (state.sort === "popular") {
    positioned.sort((left, right) => (
      (right.item.rating ?? -1) - (left.item.rating ?? -1)
      || (right.item.reviewCount ?? -1) - (left.item.reviewCount ?? -1)
      || left.index - right.index
    ));
  } else if (state.sort === "mixed") {
    positioned.sort((left, right) => (
      left.item.slug.localeCompare(right.item.slug, "ru") || left.index - right.index
    ));
  }
  return positioned.map(({ item }) => item);
}

function dedupe(items: readonly CatalogVenue[]) {
  const slugs = new Set<string>();
  return items.filter((item) => {
    if (slugs.has(item.slug)) return false;
    slugs.add(item.slug);
    return true;
  });
}

async function databasePages(
  catalog: VenueCatalog,
  state: CatalogUrlState,
  signal?: AbortSignal,
): Promise<{ items: CatalogVenue[]; lastPage: CatalogPage }> {
  const items: CatalogVenue[] = [];
  let lastPage: CatalogPage | null = null;
  let offset = 0;
  for (let page = 1; page <= state.page; page += 1) {
    lastPage = await catalog.search({
      query: state.query,
      city: state.city,
      category: state.category,
      offset,
      limit: CATALOG_PAGE_SIZE,
      ...(signal ? { signal } : {}),
    });
    items.push(...lastPage.items);
    if (lastPage.nextOffset === null) break;
    offset = lastPage.nextOffset;
  }
  if (!lastPage) throw new Error("Catalog page was not loaded");
  return { items: dedupe(items), lastPage };
}

function fallbackItems(items: readonly CatalogVenue[], state: CatalogUrlState) {
  const query = state.query.toLocaleLowerCase("ru-RU");
  return items.filter((item) => {
    if (state.city !== "all" && item.city !== state.city) return false;
    if (state.category !== "all" && item.category !== state.category) return false;
    if (!query) return true;
    return [item.name, item.description, item.city, item.category, item.cuisine, item.address]
      .join(" ")
      .toLocaleLowerCase("ru-RU")
      .includes(query);
  });
}

export function createPublicCatalogExperience(
  catalog: VenueCatalog,
  options: PublicCatalogExperienceOptions = {},
) {
  const editorialItems = options.editorialItems ?? [];

  return {
    async load(state: CatalogUrlState, signal?: AbortSignal): Promise<PublicCatalogSnapshot> {
      try {
        const { items, lastPage } = await databasePages(catalog, state, signal);
        const usesFallback = !lastPage.databaseConfigured;
        const sourceItems = usesFallback ? fallbackItems(editorialItems, state) : items;
        const visibleItems = stableSort(localFilters(sourceItems, state), state);
        const total = usesFallback ? sourceItems.length : lastPage.total;
        return {
          state,
          items: visibleItems,
          total,
          visibleCount: visibleItems.length,
          source: usesFallback ? "editorial-fallback" : "database",
          databaseConfigured: lastPage.databaseConfigured,
          nextPage: !usesFallback && lastPage.nextOffset !== null ? state.page + 1 : null,
          errorMessage: null,
        };
      } catch (error) {
        if (signal?.aborted) throw error;
        const sourceItems = fallbackItems(editorialItems, state);
        const visibleItems = stableSort(localFilters(sourceItems, state), state);
        return {
          state,
          items: visibleItems,
          total: sourceItems.length,
          visibleCount: visibleItems.length,
          source: "editorial-fallback",
          databaseConfigured: false,
          nextPage: null,
          errorMessage: "Не удалось обновить каталог. Показана подборка редакции.",
        };
      }
    },
  };
}
