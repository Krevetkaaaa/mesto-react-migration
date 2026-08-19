import { describe, expect, it } from "vitest";

import {
  PUBLIC_VENUE_IMAGE_FALLBACK,
  publicAssetUrl,
} from "../../../app/lib/public-asset";

describe("publicAssetUrl", () => {
  it("normalizes approved local assets and preserves safe root-relative URLs", () => {
    expect(publicAssetUrl("assets/venue.jpg")).toBe("/assets/venue.jpg");
    expect(publicAssetUrl("./assets/venue.jpg?width=720#hero"))
      .toBe("/assets/venue.jpg?width=720#hero");
    expect(publicAssetUrl("/uploads/venue.webp")).toBe("/uploads/venue.webp");
  });

  it("allows credential-free HTTP(S) image URLs", () => {
    expect(publicAssetUrl("https://cdn.example.test/venue.webp"))
      .toBe("https://cdn.example.test/venue.webp");
    expect(publicAssetUrl("http://images.example.test/venue.jpg"))
      .toBe("http://images.example.test/venue.jpg");
  });

  it.each([
    "",
    "//tracker.example.test/venue.jpg",
    "/\\\\tracker.example.test/venue.jpg",
    "javascript:alert(1)",
    "data:image/svg+xml,<svg onload=alert(1) />",
    "file:///C:/secret.jpg",
    "blob:https://mesto.example.test/id",
    "https://user:password@cdn.example.test/venue.jpg",
    "relative/venue.jpg",
  ])("fails closed for an unsafe image URL: %s", (value) => {
    expect(publicAssetUrl(value)).toBe(PUBLIC_VENUE_IMAGE_FALLBACK);
  });
});
