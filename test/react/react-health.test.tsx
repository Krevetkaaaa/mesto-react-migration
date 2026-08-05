import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  HEALTH_PAYLOAD,
  headers,
  loader,
  meta,
  ReactHealthView,
} from "../../app/routes/react-health";

describe("React health route", () => {
  it("returns a deterministic non-cacheable health response", async () => {
    const response = loader();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    await expect(response.json()).resolves.toEqual(HEALTH_PAYLOAD);
  });

  it("marks the route as noindex", () => {
    expect(meta()).toContainEqual({
      name: "robots",
      content: "noindex,nofollow",
    });
  });

  it("forwards loader cache and robots headers to the document response", () => {
    const loaderHeaders = loader().headers;
    const responseHeaders = headers({
      actionHeaders: new Headers(),
      errorHeaders: undefined,
      loaderHeaders,
      parentHeaders: new Headers(),
    });

    expect(responseHeaders.get("cache-control")).toBe("no-store, max-age=0");
    expect(responseHeaders.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("renders the explicit health marker", () => {
    const { container } = render(<ReactHealthView payload={HEALTH_PAYLOAD} />);

    expect(screen.getByRole("heading", { name: "React foundation работает" })).toBeVisible();
    expect(container.querySelector("[data-react-health='ok']")).toBeInTheDocument();
  });
});
