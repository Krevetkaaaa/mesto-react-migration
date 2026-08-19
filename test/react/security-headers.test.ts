import { describe, expect, it } from "vitest";

import { SECURITY_HEADERS } from "../../app/lib/security-headers";
import { contentSecurityPolicyWithNonce, createCspNonce } from "../../app/lib/security-headers.server";
import { publicCatalogHeaders } from "../../app/lib/public-catalog-route";
import {
  publicVenueDocumentCacheTags,
  publicVenueEntityCacheTag,
} from "../../app/lib/public-cache-tags";
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

  it("keeps the base policy strict and limits inline compatibility to style attributes", () => {
    const policy = SECURITY_HEADERS["Content-Security-Policy"];
    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/u);
    expect(policy).toContain("style-src 'self' https://fonts.googleapis.com");
    expect(policy).toContain("style-src-attr 'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
  });

  it("adds one validated nonce to SSR script and style elements", () => {
    const nonce = createCspNonce();
    const policy = contentSecurityPolicyWithNonce(nonce);

    expect(nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/u);
    expect(policy).toContain(`script-src 'self' 'nonce-${nonce}'`);
    expect(policy).toContain(`style-src 'self' 'nonce-${nonce}' https://fonts.googleapis.com`);
    expect(() => contentSecurityPolicyWithNonce("bad nonce; script-src *")).toThrow(TypeError);
  });

  it("keeps document cache tags aligned with API invalidation tags", () => {
    const id = "30000000-0000-4000-8000-000000000001";
    expect(publicVenueEntityCacheTag(id.toUpperCase())).toBe(`mesto-venue-${id}`);
    expect(publicVenueDocumentCacheTags(id)).toBe(`mesto-venues,mesto-venue-${id}`);
    expect(publicVenueDocumentCacheTags("unsafe-id")).toBe("mesto-venues");
    expect(new Headers(publicCatalogHeaders({
      loaderHeaders: new Headers({ "Vercel-Cache-Tag": publicVenueDocumentCacheTags(id) }),
    })).get("Vercel-Cache-Tag")).toBe(`mesto-venues,mesto-venue-${id}`);
  });
});
