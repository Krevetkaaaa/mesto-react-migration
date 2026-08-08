import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLayoutEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation, useNavigate } from "react-router";

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

function NavigationProbe({ observations }: { observations: string[] }) {
  const account = usePublicAccount();
  const location = useLocation();
  const navigate = useNavigate();

  useLayoutEffect(() => {
    observations.push(`${location.pathname}:${account.status}`);
  }, [account.status, location.pathname, observations]);

  return (
    <>
      <output>{account.status}:{location.pathname}</output>
      <button type="button" onClick={() => { void navigate("/profile"); }}>profile</button>
    </>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
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

  it("exposes restoring synchronously instead of stale anonymous after pathname changes", async () => {
    const nextSession = deferred<{ status: "authenticated"; user: typeof user; favoriteKeys: string[] }>();
    const observations: string[] = [];
    mocks.current
      .mockResolvedValueOnce({ status: "anonymous" })
      .mockReturnValueOnce(nextSession.promise);

    render(
      <MemoryRouter initialEntries={["/catalog"]}>
        <PublicAccountProvider><NavigationProbe observations={observations} /></PublicAccountProvider>
      </MemoryRouter>,
    );
    await screen.findByText("anonymous:/catalog");

    await userEvent.click(screen.getByRole("button", { name: "profile" }));

    await screen.findByText("restoring:/profile");
    expect(observations).not.toContain("/profile:anonymous");

    nextSession.resolve({ status: "authenticated", user, favoriteKeys: [] });
    await screen.findByText("authenticated:/profile");
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
