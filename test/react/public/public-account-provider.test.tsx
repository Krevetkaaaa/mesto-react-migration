import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

const mocks = vi.hoisted(() => ({
  completeOAuth: vi.fn(),
  current: vi.fn(),
  remove: vi.fn(),
  save: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("../../../app/adapters/http", () => ({
  createBrowserHttpClient: () => ({}),
}));

vi.mock("../../../app/adapters/session-http", () => ({
  createHttpSession: () => ({
    completeOAuth: mocks.completeOAuth,
    current: mocks.current,
    signOut: mocks.signOut,
  }),
}));

vi.mock("../../../app/adapters/favorites-http", () => ({
  createHttpFavorites: () => ({ remove: mocks.remove, save: mocks.save }),
}));

import {
  PublicAccountProvider,
  usePublicAccount,
} from "../../../app/components/public/account/PublicAccountProvider";

const user = {
  id: "10000000-0000-4000-8000-000000000001",
  username: "anna",
  name: "Анна",
  email: "anna@example.test",
  hasEmail: true,
  phone: "",
  role: "customer" as const,
  status: "active" as const,
  mustChangePassword: false,
};

function Probe() {
  const account = usePublicAccount();
  return (
    <>
      <output>{account.status}:{[...account.favoriteKeys].join(",")}</output>
      <button type="button" onClick={() => { void account.toggleFavorite({
        venueKey: "tihiy-sad",
        externalVenueId: "tihiy-sad",
        venueId: null,
        snapshot: {
          slug: "tihiy-sad",
          title: "Тихий сад",
          type: "Ресторан · Симферополь",
          rating: "",
          image: "/assets/venue.jpg",
          text: "Описание",
        },
      }); }}>favorite</button>
    </>
  );
}

function renderProvider() {
  return render(
    <MemoryRouter initialEntries={["/catalog"]}>
      <PublicAccountProvider><Probe /></PublicAccountProvider>
    </MemoryRouter>,
  );
}

describe("PublicAccountProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.completeOAuth.mockResolvedValue(user);
    mocks.remove.mockResolvedValue(undefined);
    mocks.save.mockResolvedValue({});
    mocks.signOut.mockResolvedValue(undefined);
  });

  it("distinguishes anonymous and unavailable session restoration", async () => {
    mocks.current.mockResolvedValueOnce({ status: "anonymous" });
    const first = renderProvider();
    await screen.findByText("anonymous:");
    first.unmount();

    mocks.current.mockRejectedValueOnce(new Error("network unavailable"));
    renderProvider();
    await screen.findByText("unavailable:");
  });

  it("owns optimistic favorite state for all descendant routes", async () => {
    mocks.current.mockResolvedValueOnce({ status: "authenticated", user, favoriteKeys: [] });
    renderProvider();
    await screen.findByText("authenticated:");

    await userEvent.click(screen.getByRole("button", { name: "favorite" }));

    await waitFor(() => expect(screen.getByText("authenticated:tihiy-sad")).toBeVisible());
    expect(mocks.save).toHaveBeenCalledWith({
      venueKey: "tihiy-sad",
      externalVenueId: "tihiy-sad",
      venueId: null,
      snapshot: {
        slug: "tihiy-sad",
        title: "Тихий сад",
        type: "Ресторан · Симферополь",
        rating: "",
        image: "/assets/venue.jpg",
        text: "Описание",
      },
    });
  });
});
