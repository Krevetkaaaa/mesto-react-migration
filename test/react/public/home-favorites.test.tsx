import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router";

import { HOME_FEATURED_VENUES } from "../../../app/data/home-featured-venues";

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
  useOptionalPublicAccount: () => mocks.account,
}));

import { PublicHomeMarkup } from "../../../app/components/public/PublicHomeMarkup";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <PublicHomeMarkup interactiveHome featuredVenues={[HOME_FEATURED_VENUES[0]]} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("React home favorite feedback", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    mocks.account.favoriteKeys = new Set();
    mocks.account.pendingFavoriteKeys = new Set();
    mocks.account.status = "authenticated";
    mocks.account.toggleFavorite.mockReset();
    mocks.account.toggleFavorite.mockResolvedValue("saved");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves the legacy key while the slug remains URL-only and shows fixed feedback", async () => {
    const user = userEvent.setup();
    renderHome();

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
        text: HOME_FEATURED_VENUES[0].description,
      },
    });
    expect(await screen.findByText("Место сохранено в избранном.")).toHaveTextContent("Место сохранено в избранном");
    expect(document.querySelector(".home-favorite-toast")).toHaveClass("toast", "is-visible");
    expect(document.querySelector(".flying-heart")).not.toBeNull();
  });

  it("keeps rollback errors visible in the fixed live region", async () => {
    mocks.account.toggleFavorite.mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole("button", { name: "Добавить в избранное" }));

    expect(await screen.findByText(/Изменение отменено/)).toBeVisible();
    expect(document.querySelector(".home-favorite-toast")).toHaveClass("toast", "is-visible");
  });

  it("offers actionable guest routes and sends a repeated heart click to registration", async () => {
    mocks.account.status = "anonymous";
    const user = userEvent.setup();
    renderHome();
    const favorite = screen.getByRole("button", { name: "Добавить в избранное" });

    await user.click(favorite);
    await screen.findByText(/Нажмите на сердце ещё раз/);
    const feedback = document.querySelector(".home-favorite-toast");
    expect(feedback).toHaveClass("is-actionable");
    expect(screen.getByRole("link", { name: "Войти" })).toHaveAttribute("href", "/login?returnTo=%2F");
    expect(screen.getByRole("link", { name: "Регистрация" })).toHaveAttribute("href", "/register?returnTo=%2F");

    await user.click(favorite);
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/register?returnTo=%2F"));
    expect(mocks.account.toggleFavorite).not.toHaveBeenCalled();
  });
});
