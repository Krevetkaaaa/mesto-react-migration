import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublicHomeMarkup, type HomeFeaturedVenue } from "../../../app/components/public/PublicHomeMarkup";
import { HOME_FEATURED_VENUES } from "../../../app/data/home-featured-venues";
import { PublicHomeView } from "../../../app/routes/public-home";

const databaseVenue: HomeFeaturedVenue = {
  key: "mesto-30000000-0000-4000-8000-000000000001",
  databaseId: "30000000-0000-4000-8000-000000000001",
  slug: "database-cafe",
  name: "Кафе из базы",
  city: "Симферополь",
  address: "ул. Пушкина, 10",
  description: "Карточка опубликованного заведения.",
  categories: ["Кафе"],
  category: "Кафе",
  cuisine: "Европейская",
  hours: "09:00–22:00",
  averageCheck: "900 ₽",
  phones: [],
  website: "",
  features: ["Wi-Fi"],
  photos: ["/assets/venue-cafe-unsplash.jpg"],
  mapsUrl: "",
  source: "mesto",
  rating: 4.7,
  reviewCount: 27,
};

function LocationProbe() {
  const location = useLocation();
  return <output data-location-state={JSON.stringify(location.state)} data-testid="location">{location.pathname}{location.search}</output>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderDocument() {
  const markup = renderToStaticMarkup(<PublicHomeView />);
  return new DOMParser().parseFromString(
    `<!doctype html><body>${markup}</body>`,
    "text/html",
  );
}

describe("React home cutover SSR contract", () => {
  it("does not serialize the retired app.js runtime or legacy dialogs", () => {
    const document = renderDocument();

    expect(document.querySelector('script[src*="app.js"]')).toBeNull();
    expect(document.querySelector("#categories-view, #catalog-view, #profile-view")).toBeNull();
    expect(document.querySelector(
      "#venue-dialog, #auth-dialog, #register-dialog, #review-dialog, #submission-dialog, #favorites-dialog",
    )).toBeNull();
    expect(document.querySelector("main")?.getAttribute("data-react-route")).toBe("home");
  });

  it("serializes the canonical GET search fields and three addressable editorial cards", () => {
    const document = renderDocument();
    const form = document.querySelector<HTMLFormElement>('#venue-search[action="/catalog"]');
    const cards = [...document.querySelectorAll<HTMLElement>("#popular .home-featured-venue-card")];

    expect(form?.method.toLowerCase()).toBe("get");
    expect(form?.querySelector('input[name="q"]')).not.toBeNull();
    expect(form?.querySelector('select[name="city"]')).not.toBeNull();
    expect(cards).toHaveLength(3);
    expect(cards.map((card) => card.dataset.venue)).toEqual(
      HOME_FEATURED_VENUES.map(({ key }) => key),
    );

    for (const venue of HOME_FEATURED_VENUES) {
      const card = document.querySelector<HTMLElement>(
        `#popular .home-featured-venue-card[data-venue="${venue.key}"]`,
      );
      const expectedHref = `/venue/${venue.slug}?from=${encodeURIComponent("/")}`;
      expect(card?.querySelectorAll(`a.home-venue-card-link[href="${expectedHref}"]`)).toHaveLength(1);
      expect(card?.querySelectorAll("a")).toHaveLength(1);
      expect(card?.querySelector("a button, button a")).toBeNull();
    }
  });

  it("keeps database cards on the legacy address/source presentation", () => {
    const markup = renderToStaticMarkup(
      <PublicHomeView featuredVenues={[...HOME_FEATURED_VENUES, databaseVenue]} />,
    );
    const document = new DOMParser().parseFromString(`<!doctype html><body>${markup}</body>`, "text/html");
    const card = document.querySelector<HTMLElement>(
      `.home-database-venue-card[data-venue="${databaseVenue.key}"]`,
    );

    expect(card?.querySelector(".venue-meta--source")?.textContent).toContain(databaseVenue.address);
    expect(card?.querySelector(".venue-source-note")?.textContent).toBe("Опубликовано в каталоге «Места»");
    expect(card?.querySelector(".card-rating-badge")?.textContent).toContain("4.7");
    expect(card?.querySelector(".venue-card-description")?.textContent).toBe(databaseVenue.description);
    expect(card?.querySelector(".venue-amenities")).not.toBeNull();
    expect(card?.querySelector(".venue-card-action")).not.toBeNull();
    expect(card?.querySelector(".venue-price")).toBeNull();
    expect(card?.classList.contains("catalog-venue-card")).toBe(true);
    expect(card?.classList.contains("home-stored-card")).toBe(true);
    expect(card?.dataset.branchCount).toBe("1");
    expect(Array.from(card?.querySelectorAll(".venue-body > *") ?? []).map(({ className }) => className)).toEqual([
      "",
      "",
      "venue-card-description",
      "venue-meta venue-meta--source",
      "venue-source-note",
      "venue-amenities",
      "venue-card-action",
    ]);
    expect(card?.querySelectorAll("a.home-venue-card-link")).toHaveLength(1);
  });

  it("uses React Router for the single whole-card keyboard target", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <PublicHomeMarkup interactiveHome />
        <LocationProbe />
      </MemoryRouter>,
    );

    const cardLink = screen.getByRole("link", { name: "Открыть карточку Баркас" });
    expect(cardLink).toHaveAttribute("data-venue-focus-surface", "home");
    expect(cardLink).toHaveAttribute("data-venue-focus-key", "marea");
    expect(cardLink).toHaveAttribute("data-venue-focus-action", "overlay");
    cardLink.focus();
    expect(cardLink).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(screen.getByTestId("location")).toHaveTextContent("/venue/barkas?from=%2F");
    expect(screen.getByTestId("location")).toHaveAttribute("data-location-state", JSON.stringify({
      venueInvoker: { surface: "home", venueKey: "marea", action: "overlay" },
    }));
  });

  it("does not arm the source history entry for a modified new-tab gesture", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    const replaceState = vi.spyOn(window.history, "replaceState");
    render(
      <MemoryRouter initialEntries={["/"]}>
        <PublicHomeMarkup interactiveHome />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Открыть карточку Баркас" }), { ctrlKey: true });

    expect(replaceState).not.toHaveBeenCalled();
  });
});
