import { sanitizeText } from "../lib/input-normalization";

export const CATALOG_PAGE_SIZE = 50;
export const MAX_CATALOG_PAGE = 20;

export const CATALOG_SORTS = ["popular", "new", "mixed"] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export interface CatalogUrlState {
  query: string;
  city: string;
  category: string;
  cuisine: string;
  sort: CatalogSort;
  petFriendly: boolean;
  parking: boolean;
  page: number;
}

const DEFAULT_STATE: CatalogUrlState = {
  query: "",
  city: "all",
  category: "all",
  cuisine: "all",
  sort: "popular",
  petFriendly: false,
  parking: false,
  page: 1,
};

const CITY_BY_SLUG = {
  simferopol: "Симферополь",
  yalta: "Ялта",
  sevastopol: "Севастополь",
  alushta: "Алушта",
  yevpatoria: "Евпатория",
  feodosiya: "Феодосия",
  sudak: "Судак",
  kerch: "Керчь",
  bakhchisaray: "Бахчисарай",
  balaklava: "Балаклава",
  saki: "Саки",
  gurzuf: "Гурзуф",
} as const;

export type CitySlug = keyof typeof CITY_BY_SLUG;

export const PUBLIC_CITY_SLUGS = Object.freeze(
  Object.keys(CITY_BY_SLUG) as CitySlug[],
);

const SLUG_BY_CITY: ReadonlyMap<string, CitySlug> = new Map(
  Object.entries(CITY_BY_SLUG).map(([slug, city]) => [city, slug as CitySlug]),
);

function normalizedChoice(value: string | null, maxLength = 80) {
  return sanitizeText(value ?? "", maxLength) || "all";
}

function normalizedPage(value: string | null) {
  const page = Number(value);
  if (!Number.isInteger(page) || page < 1) return 1;
  return Math.min(page, MAX_CATALOG_PAGE);
}

function normalizedSort(value: string | null): CatalogSort {
  return CATALOG_SORTS.includes(value as CatalogSort)
    ? value as CatalogSort
    : "popular";
}

function enabled(value: string | null) {
  return value === "1" || value === "true";
}

export function parseCatalogUrl(searchParams: URLSearchParams): CatalogUrlState {
  return {
    query: sanitizeText(searchParams.get("q") ?? "", 120),
    city: normalizedChoice(searchParams.get("city")),
    category: normalizedChoice(searchParams.get("category")),
    cuisine: normalizedChoice(searchParams.get("cuisine")),
    sort: normalizedSort(searchParams.get("sort")),
    petFriendly: enabled(searchParams.get("pet")),
    parking: enabled(searchParams.get("parking")),
    page: normalizedPage(searchParams.get("page")),
  };
}

export function catalogOffset(state: Pick<CatalogUrlState, "page">) {
  return (state.page - 1) * CATALOG_PAGE_SIZE;
}

export function catalogSearchParams(state: CatalogUrlState) {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.city !== DEFAULT_STATE.city) params.set("city", state.city);
  if (state.category !== DEFAULT_STATE.category) params.set("category", state.category);
  if (state.cuisine !== DEFAULT_STATE.cuisine) params.set("cuisine", state.cuisine);
  if (state.sort !== DEFAULT_STATE.sort) params.set("sort", state.sort);
  if (state.petFriendly) params.set("pet", "1");
  if (state.parking) params.set("parking", "1");
  if (state.page > 1) params.set("page", String(Math.min(state.page, MAX_CATALOG_PAGE)));
  return params;
}

export function catalogHref(state: CatalogUrlState) {
  const query = catalogSearchParams(state).toString();
  return query ? `/catalog?${query}` : "/catalog";
}

export function cityForSlug(slug: string) {
  return CITY_BY_SLUG[slug.toLocaleLowerCase("en-US") as CitySlug] ?? null;
}

export function slugForCity(city: string) {
  return SLUG_BY_CITY.get(city) ?? null;
}

export function cityCatalogHref(slug: CitySlug, state: Omit<CatalogUrlState, "city">) {
  const query = catalogSearchParams({ ...state, city: "all" }).toString();
  return query ? `/city/${slug}?${query}` : `/city/${slug}`;
}

export function defaultCatalogUrlState(): CatalogUrlState {
  return { ...DEFAULT_STATE };
}
