import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ReactRouter from "react-router";

const routeState = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof ReactRouter>("react-router");

  return {
    ...actual,
    Links: () => <link data-route-links="true" rel="stylesheet" href="/route.css" />,
    Meta: () => <meta data-route-meta="true" name="description" content="route" />,
    useLocation: () => ({
      hash: "",
      key: "test",
      pathname: routeState.pathname,
      search: "",
      state: null,
    }),
  };
});

import { ErrorBoundary, Layout } from "../../app/root";

describe("public routing root", () => {
  beforeEach(() => {
    routeState.pathname = "/";
  });

  it.each([
    ["/", true, true],
    ["/help", true, false],
    ["/__react/health", false, false],
  ])("renders the transitional document contract for %s", (pathname, hasTheme, isHome) => {
    routeState.pathname = pathname;

    const html = renderToStaticMarkup(
      <Layout>
        <main>route</main>
      </Layout>,
    );

    expect(html.includes('src="/theme.js?v=theme-1"')).toBe(hasTheme);
    expect(html.includes('<body class="is-home-view">')).toBe(isHome);
    expect(html).not.toContain("react-router");

    if (hasTheme) {
      expect(html.indexOf('src="/theme.js?v=theme-1"')).toBeLessThan(
        html.indexOf('data-route-links="true"'),
      );
    }
  });

  it.each([
    [{ data: null, internal: false, status: 404, statusText: "Not Found" }, "404 — Страница не найдена"],
    [new Error("boom"), "500 — Ошибка приложения"],
  ])("renders noindex error metadata for %#", (error, title) => {
    const html = renderToStaticMarkup(<ErrorBoundary error={error} params={{}} />);

    expect(html).toContain(`<title>${title}</title>`);
    expect(html).toContain('<meta name="robots" content="noindex,nofollow"/>');
  });
});
