import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  headers as helpHeaders,
  links as helpLinks,
  loader as helpLoader,
  meta as helpMeta,
} from "../../../app/routes/public-help";
import {
  headers as homeHeaders,
  links as homeLinks,
  loader as homeLoader,
  meta as homeMeta,
} from "../../../app/routes/public-home";
import { SECURITY_HEADERS } from "../../../app/lib/security-headers";

const fixtureSummary = {
  total: 3,
  byCategory: { "Рестораны": 2, "Кофейни": 1 },
  byCity: { "Симферополь": 2, "Ялта": 1 },
  source: "database",
  databaseConfigured: true,
};

function argsFor<T extends (args: never) => unknown>(
  _handler: T,
  value: Record<string, unknown>,
): Parameters<T>[0] {
  return value as Parameters<T>[0];
}

describe("public route server contracts", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(
      JSON.stringify(fixtureSummary),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ))));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("derives canonical URLs from the trusted request URL", async () => {
    const request = new Request("https://preview.example.test/source?ignored=true");

    await expect(homeLoader(argsFor(homeLoader, { request }))).resolves.toEqual({
      canonicalUrl: "https://preview.example.test/",
      openGraphImageUrl: "https://preview.example.test/assets/mesto-hero.png",
      catalogSummary: fixtureSummary,
    });
    expect(helpLoader(argsFor(helpLoader, { request }))).toEqual({
      canonicalUrl: "https://preview.example.test/help",
      openGraphImageUrl: "https://preview.example.test/assets/mesto-hero.png",
    });
  });

  it("uses only the origin portion of a valid configured public URL", () => {
    vi.stubEnv("MESTO_PUBLIC_ORIGIN", "https://mesto.example.test/ignored/path");
    const request = new Request("http://internal.example.test/help");

    expect(helpLoader(argsFor(helpLoader, { request })).canonicalUrl).toBe(
      "https://mesto.example.test/help",
    );
  });

  it("rejects a non-HTTP configured origin and falls back to the request", async () => {
    vi.stubEnv("MESTO_PUBLIC_ORIGIN", "file:///tmp/not-public");
    const request = new Request("https://safe.example.test/");

    expect((await homeLoader(argsFor(homeLoader, { request }))).canonicalUrl).toBe(
      "https://safe.example.test/",
    );
  });

  it("publishes canonical and Open Graph metadata for both routes", async () => {
    const homeRequest = new Request("https://mesto.example.test/");
    const homeData = await homeLoader(argsFor(homeLoader, { request: homeRequest }));
    const helpRequest = new Request("https://mesto.example.test/help");
    const helpData = helpLoader(argsFor(helpLoader, { request: helpRequest }));

    for (const { canonicalUrl, descriptors } of [
      {
        canonicalUrl: "https://mesto.example.test/",
        descriptors: homeMeta(argsFor(homeMeta, { data: homeData })),
      },
      {
        canonicalUrl: "https://mesto.example.test/help",
        descriptors: helpMeta(argsFor(helpMeta, { data: helpData })),
      },
    ]) {
      expect(descriptors).toEqual(expect.arrayContaining([
        expect.objectContaining({ tagName: "link", rel: "canonical", href: canonicalUrl }),
        expect.objectContaining({ property: "og:url", content: canonicalUrl }),
        expect.objectContaining({
          property: "og:image",
          content: "https://mesto.example.test/assets/mesto-hero.png",
        }),
      ]));
    }
  });

  it("keeps the frozen stylesheet order", () => {
    expect(homeLinks().filter(({ rel }) => rel === "stylesheet").map(({ href }) => href)).toEqual([
      "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap",
      "/styles.css?v=auth-merchant-3",
      "/gastro-theme.css?v=premium-foundation-3",
      "/ambient-premium.css?v=premium-2",
      "/phone-premium.css?v=premium-1",
      "/editorial-sections.css?v=premium-2",
    ]);
    expect(helpLinks().filter(({ rel }) => rel === "stylesheet").map(({ href }) => href)).toEqual([
      "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap",
      "/help.css?v=theme-1",
    ]);
  });

  it.each([["home", homeHeaders], ["help", helpHeaders]])(
    "returns public cache and MIME-sniffing policy for %s",
    (_name, headers) => {
      expect(headers()).toEqual({
        ...SECURITY_HEADERS,
        "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=120",
      });
    },
  );
});
