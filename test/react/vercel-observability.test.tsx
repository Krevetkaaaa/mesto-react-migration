import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StaticVercelObservability, vercelObservabilityInternals } from "../../app/components/VercelObservability";

describe("Vercel observability", () => {
  it.each([
    ["/", "/"],
    ["/catalog", "/catalog"],
    ["/city/yalta", "/city/[citySlug]"],
    ["/venue/quiet-garden", "/venue/[venueSlug]"],
    ["/merchant/overview", "/merchant/[view]"],
    ["/admin/reviews", "/admin/[view]"],
    ["/attacker-controlled/path", "/[unmatched]"],
  ])("uses a bounded route name for %s", (pathname, route) => {
    expect(vercelObservabilityInternals.routeTemplate(pathname)).toBe(route);
  });

  it("renders same-origin scripts for intentionally non-hydrated public documents", () => {
    render(<StaticVercelObservability pathname="/help" />);

    const scripts = document.querySelectorAll("script[src^='/_vercel/']");
    expect(scripts).toHaveLength(2);
    expect(Array.from(scripts, (script) => script.getAttribute("src"))).toEqual([
      "/_vercel/insights/script.js",
      "/_vercel/speed-insights/script.js",
    ]);
  });
});
