import { describe, expect, it } from "vitest";

import { SECURITY_HEADERS } from "../../app/lib/security-headers";
import { publicCatalogHeaders } from "../../app/lib/public-catalog-route";
import { adminRouteHeaders } from "../../app/modules/admin-console.server";
import { merchantRouteHeaders } from "../../app/modules/merchant-workspace.server";
import { publicAccountHeaders } from "../../app/modules/public-account.server";
import { headers as rootHeaders } from "../../app/root";

describe("React SSR security headers", () => {
  it("applies the shared policy at the root document boundary", () => {
    expect(rootHeaders()).toEqual(SECURITY_HEADERS);
  });

  it.each([
    ["catalog", publicCatalogHeaders],
    ["account", publicAccountHeaders],
    ["merchant", merchantRouteHeaders],
    ["admin", adminRouteHeaders],
  ])("keeps the shared policy on the %s response", (_name, routeHeaders) => {
    expect(routeHeaders()).toMatchObject(SECURITY_HEADERS);
  });

  it("keeps inline compatibility explicit without allowing eval", () => {
    const policy = SECURITY_HEADERS["Content-Security-Policy"];
    expect(policy).toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
    expect(policy).not.toContain("'unsafe-eval'");
  });
});
