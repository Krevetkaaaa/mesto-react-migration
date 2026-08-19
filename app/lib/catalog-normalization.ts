import { ApplicationError, validationError } from "./application-error";
import { sanitizeText } from "./input-normalization";
import type { CatalogSearch } from "../modules/venue-catalog";

const emptySearchAliases = new Set([
  "\u0433\u0434\u0435 \u043f\u043e\u0435\u0441\u0442\u044c",
  "\u0432\u0441\u0435 \u043c\u0435\u0441\u0442\u0430",
  "\u0437\u0430\u0432\u0435\u0434\u0435\u043d\u0438\u044f",
]);

export interface NormalizedCatalogSearch {
  query: string;
  city: string;
  category: string;
  offset: number;
  limit: number;
  signal?: AbortSignal;
}

export function normalizeCatalogSearch(query: CatalogSearch = {}): NormalizedCatalogSearch {
  const offset = query.offset ?? 0;
  const limit = query.limit ?? 50;
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw validationError("Catalog pagination is invalid");
  }
  if (query.signal?.aborted) {
    throw new ApplicationError("unavailable", "Catalog request was aborted");
  }
  const searchText = sanitizeText(query.query ?? "", 120);
  const normalizedAlias = searchText.toLocaleLowerCase("ru-RU");
  const semanticSearch = emptySearchAliases.has(normalizedAlias) ? "" : searchText;
  return {
    query: semanticSearch
      .replace(/[^\p{L}\p{N}\s._-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim(),
    city: sanitizeText(query.city ?? "", 80) || "all",
    category: sanitizeText(query.category ?? "", 80),
    offset: Math.min(offset, 100_000),
    limit,
    ...(query.signal === undefined ? {} : { signal: query.signal }),
  };
}
