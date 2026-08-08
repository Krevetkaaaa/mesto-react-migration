import { createHttpHomeCatalogSummary } from "../adapters/home-catalog-summary-http";
import { createServerHttpClient } from "../adapters/http";
import { EDITORIAL_VENUES } from "../data/editorial-venues";
import { createHomeCatalogSummary } from "./home-catalog-summary";

export function loadHomeCatalogSummary(request: Request) {
  const gateway = createHttpHomeCatalogSummary(
    createServerHttpClient({ request }),
  );
  return createHomeCatalogSummary(gateway, EDITORIAL_VENUES).load(request.signal);
}
