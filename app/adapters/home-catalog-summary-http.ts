import { z } from "zod";

import type { HttpClient } from "./http";
import type {
  HomeCatalogSummary,
  HomeCatalogSummaryGateway,
} from "../modules/home-catalog-summary";

const countMapSchema = z.record(z.string(), z.number().int().nonnegative());

const homeCatalogSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  byCategory: countMapSchema,
  byCity: countMapSchema,
  source: z.literal("database"),
  databaseConfigured: z.boolean(),
}).loose();

class HttpHomeCatalogSummary implements HomeCatalogSummaryGateway {
  constructor(private readonly http: HttpClient) {}

  async load(signal?: AbortSignal): Promise<HomeCatalogSummary> {
    return this.http.request({
      path: "/api/venues",
      query: { summary: 1 },
      ...(signal ? { signal } : {}),
      schema: homeCatalogSummarySchema,
    });
  }
}

export function createHttpHomeCatalogSummary(
  http: HttpClient,
): HomeCatalogSummaryGateway {
  return new HttpHomeCatalogSummary(http);
}
