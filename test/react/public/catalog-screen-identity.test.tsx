import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";

import { EDITORIAL_VENUES } from "../../../app/data/editorial-venues";
import { defaultCatalogUrlState } from "../../../app/modules/catalog-url-state";

const mocks = vi.hoisted(() => ({
  account: {
    favoriteKeys: new Set<string>(),
    pendingFavoriteKeys: new Set<string>(),
    status: "authenticated",
    toggleFavorite: vi.fn(),
    user: null,
  },
}));

vi.mock("../../../app/components/public/account/PublicAccountProvider", () => ({
  usePublicAccount: () => mocks.account,
}));

import { CatalogScreen } from "../../../app/components/public/catalog/CatalogScreen";

function renderCatalog() {
  const item = EDITORIAL_VENUES[0];
  const router = createMemoryRouter([{
    path: "*",
    element: <CatalogScreen cityLanding snapshot={{
      state: { ...defaultCatalogUrlState(), city: "Севастополь" },
      items: [item],
      total: 1,
      visibleCount: 1,
      source: "editorial-fallback",
      databaseConfigured: false,
      nextPage: null,
      errorMessage: null,
    }} />,
  }], { initialEntries: ["/city/sevastopol"] });
  return render(<RouterProvider router={router} />);
}

describe("catalog editorial identity", () => {
  beforeEach(() => {
    mocks.account.favoriteKeys = new Set();
    mocks.account.pendingFavoriteKeys = new Set();
    mocks.account.toggleFavorite.mockReset();
    mocks.account.toggleFavorite.mockResolvedValue("saved");
  });

  it("roots nested-route assets and posts the stable key instead of the route slug", async () => {
    const user = userEvent.setup();
    renderCatalog();

    expect(screen.getByRole("img", { name: "Баркас" })).toHaveAttribute(
      "src",
      "/assets/venue-restaurant-unsplash.jpg",
    );
    await user.click(screen.getByRole("button", { name: "Добавить в избранное" }));

    expect(mocks.account.toggleFavorite).toHaveBeenCalledWith({
      venueKey: "marea",
      venueId: null,
      externalVenueId: "marea",
      snapshot: {
        slug: "barkas",
        title: "Баркас",
        type: "Рестораны · Севастополь",
        rating: "4.9",
        image: "/assets/venue-restaurant-unsplash.jpg",
        text: EDITORIAL_VENUES[0].description,
      },
    });
  });
});
