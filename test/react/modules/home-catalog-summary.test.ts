import { describe, expect, it } from "vitest";

import { createHttpHomeCatalogSummary } from "../../../app/adapters/home-catalog-summary-http";
import type { HttpClient, HttpRequest } from "../../../app/adapters/http";
import { EDITORIAL_VENUES } from "../../../app/data/editorial-venues";
import {
  createEditorialHomeCatalogSummary,
  createHomeCatalogSummary,
  type HomeCatalogSummary,
  type HomeCatalogSummaryGateway,
} from "../../../app/modules/home-catalog-summary";

const databaseSummary: HomeCatalogSummary = {
  total: 3,
  byCategory: { "Рестораны": 2, "Кофейни": 1 },
  byCity: { "Симферополь": 2, "Ялта": 1 },
  source: "database",
  databaseConfigured: true,
};

function gateway(load: HomeCatalogSummaryGateway["load"]): HomeCatalogSummaryGateway {
  return { load };
}

describe("HomeCatalogSummary", () => {
  it("keeps a configured database aggregate authoritative", async () => {
    const summary = createHomeCatalogSummary(
      gateway(() => Promise.resolve(databaseSummary)),
      EDITORIAL_VENUES,
    );

    await expect(summary.load()).resolves.toEqual(databaseSummary);
  });

  it.each(["unconfigured", "error"] as const)(
    "uses the exact catalog editorial set for the %s fallback",
    async (condition) => {
      const source = condition === "unconfigured"
        ? gateway(() => Promise.resolve({
            total: 0,
            byCategory: {},
            byCity: {},
            source: "database",
            databaseConfigured: false,
          }))
        : gateway(() => Promise.reject(new Error("Catalog unavailable")));

      await expect(
        createHomeCatalogSummary(source, EDITORIAL_VENUES).load(),
      ).resolves.toEqual({
        total: 7,
        byCategory: { "Рестораны": 7 },
        byCity: { "Севастополь": 2, "Симферополь": 3, "Ялта": 2 },
        source: "editorial-fallback",
        databaseConfigured: false,
      });
    },
  );

  it("does not hide an aborted request behind editorial content", async () => {
    const controller = new AbortController();
    const aborted = new DOMException("Aborted", "AbortError");
    const source = gateway(() => {
      controller.abort();
      return Promise.reject(aborted);
    });

    await expect(
      createHomeCatalogSummary(source, EDITORIAL_VENUES).load(controller.signal),
    ).rejects.toBe(aborted);
  });

  it("counts prototype-shaped catalog labels as ordinary data", () => {
    const summary = createEditorialHomeCatalogSummary([
      { ...EDITORIAL_VENUES[0], category: "constructor", city: "__proto__" },
      { ...EDITORIAL_VENUES[1], category: "constructor", city: "toString" },
    ]);

    expect(Object.hasOwn(summary.byCategory, "constructor")).toBe(true);
    expect(summary.byCategory.constructor).toBe(2);
    expect(Object.hasOwn(summary.byCity, "__proto__")).toBe(true);
    expect(summary.byCity.__proto__).toBe(1);
    expect(Object.hasOwn(summary.byCity, "toString")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(summary.byCity, "toString")?.value).toBe(1);
  });

  it("owns the one HTTP contract used by the server loader", async () => {
    let recorded: HttpRequest<unknown> | undefined;
    const http: HttpClient = {
      request<T>(request: HttpRequest<T>): Promise<T> {
        recorded = request;
        return Promise.resolve(request.schema.parse(databaseSummary));
      },
    };

    await expect(createHttpHomeCatalogSummary(http).load()).resolves.toEqual(databaseSummary);
    expect(recorded).toMatchObject({
      path: "/api/venues",
      query: { summary: 1 },
    });
  });
});
