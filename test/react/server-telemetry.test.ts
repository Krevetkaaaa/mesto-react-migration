import { afterEach, describe, expect, it, vi } from "vitest";

import {
  beginDocumentRequest,
  documentRequestId,
  documentTelemetryInternals,
  resetDocumentTelemetryForTests,
} from "../../app/lib/telemetry.server";

describe("SSR telemetry", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    resetDocumentTelemetryForTests();
  });

  it("preserves only a valid incoming request id", () => {
    const valid = "123e4567-e89b-42d3-a456-426614174000";
    expect(documentRequestId(new Request("https://mesto.example.test/", {
      headers: { "X-Request-ID": valid },
    }))).toBe(valid);
    expect(documentRequestId(new Request("https://mesto.example.test/", {
      headers: { "X-Request-ID": "not-a-request-id" },
    }))).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it("uses bounded route and provider identifiers", () => {
    expect(documentTelemetryInternals.routeTemplate("/venue/quiet-garden")).toBe("/venue/[venueSlug]");
    expect(documentTelemetryInternals.routeTemplate("/catalog")).toBe("/catalog");
    expect(documentTelemetryInternals.routeTemplate("/attacker-controlled/path")).toBe("/[unmatched]");
    expect(documentTelemetryInternals.safeProviderId("fra1::request_123")).toBe("fra1::request_123");
    expect(documentTelemetryInternals.safeProviderId("bad provider id")).toBeUndefined();
  });

  it("logs no URL query, cookies or request body", () => {
    vi.stubEnv("MESTO_TELEMETRY_LOGS", "1");
    const lines: Array<Record<string, unknown>> = [];
    vi.spyOn(console, "log").mockImplementation((line) => {
      lines.push(JSON.parse(String(line)) as Record<string, unknown>);
    });
    const request = new Request("https://mesto.example.test/venue/private-slug?token=secret", {
      method: "POST",
      headers: { Cookie: "session=secret" },
      body: "password=secret",
    });
    const telemetry = beginDocumentRequest(request, "123e4567-e89b-42d3-a456-426614174000");
    telemetry.complete(200);

    expect(lines.map(({ event }) => event)).toEqual(["ssr.request.start", "ssr.request.complete"]);
    expect(lines[0]?.route).toBe("/venue/[venueSlug]");
    expect(JSON.stringify(lines)).not.toMatch(/token|cookie|password|private-slug|secret/iu);
  });
});
