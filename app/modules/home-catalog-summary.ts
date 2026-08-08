import type { CatalogVenue } from "../lib/domain";

export type HomeCatalogSummarySource = "database" | "editorial-fallback";

export interface HomeCatalogSummary {
  readonly total: number;
  readonly byCategory: Readonly<Record<string, number>>;
  readonly byCity: Readonly<Record<string, number>>;
  readonly source: HomeCatalogSummarySource;
  readonly databaseConfigured: boolean;
}

export interface HomeCatalogSummaryGateway {
  load(signal?: AbortSignal): Promise<HomeCatalogSummary>;
}

function countBy(
  items: readonly CatalogVenue[],
  select: (item: CatalogVenue) => string,
) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = select(item).trim();
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries(counts);
}

export function createEditorialHomeCatalogSummary(
  items: readonly CatalogVenue[],
): HomeCatalogSummary {
  return {
    total: items.length,
    byCategory: countBy(items, (item) => item.category),
    byCity: countBy(items, (item) => item.city),
    source: "editorial-fallback",
    databaseConfigured: false,
  };
}

export function createHomeCatalogSummary(
  gateway: HomeCatalogSummaryGateway,
  editorialItems: readonly CatalogVenue[],
) {
  const editorialFallback = createEditorialHomeCatalogSummary(editorialItems);

  return {
    async load(signal?: AbortSignal): Promise<HomeCatalogSummary> {
      try {
        const summary = await gateway.load(signal);
        return summary.databaseConfigured ? summary : editorialFallback;
      } catch (error) {
        if (signal?.aborted) throw error;
        return editorialFallback;
      }
    },
  };
}
