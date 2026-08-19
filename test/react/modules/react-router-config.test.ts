import { describe, expect, it } from "vitest";

import config from "../../../react-router.config";

describe("React Router deployment config", () => {
  it("ships the complete route manifest so Vercel navigation never depends on /__manifest", () => {
    expect(config.routeDiscovery).toEqual({ mode: "initial" });
  });
});
