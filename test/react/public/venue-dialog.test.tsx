import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, MemoryRouter, RouterProvider, useLocation } from "react-router";

import type { PublicAccountStatus } from "../../../app/components/public/account/PublicAccountProvider";
import type { User } from "../../../app/lib/domain";
import type { PublicVenueDetail } from "../../../app/modules/public-catalog.server";

const mocks = vi.hoisted(() => {
  const account: {
    favoriteKeys: Set<string>;
    pendingFavoriteKeys: Set<string>;
    status: PublicAccountStatus;
    toggleFavorite: ReturnType<typeof vi.fn>;
    user: User | null;
  } = {
    favoriteKeys: new Set<string>(),
    pendingFavoriteKeys: new Set<string>(),
    status: "authenticated",
    toggleFavorite: vi.fn(),
    user: {
      id: "10000000-0000-4000-8000-000000000001",
      username: "anna",
      name: "Анна",
      email: "anna@example.test",
      hasEmail: true,
      phone: "",
      role: "customer",
      status: "active",
      mustChangePassword: false,
    },
  };
  return {
    account,
    browserHttpClient: vi.fn(),
    createHttpSubmissions: vi.fn(),
    http: { kind: "browser-http" },
    submitReview: vi.fn(),
  };
});

vi.mock("../../../app/components/public/account/PublicAccountProvider", () => ({
  usePublicAccount: () => mocks.account,
}));

vi.mock("../../../app/adapters/http", () => ({
  createBrowserHttpClient: mocks.browserHttpClient,
}));

vi.mock("../../../app/adapters/submissions-http", () => ({
  createHttpSubmissions: mocks.createHttpSubmissions,
}));

import { VenueDialog } from "../../../app/components/public/venue/VenueDialog";
import { VenueReturnFocusRestorer, venueFocusData, venueInvokerNavigationState } from "../../../app/components/public/venue/venue-return-focus";

const detail = {
  venue: {
    id: "30000000-0000-4000-8000-000000000001",
    slug: "barkas",
    title: "Баркас",
    city: "Симферополь",
    category: "Ресторан",
    cuisine: "Европейская",
    description: "Тихое место в центре города",
    address: "Улица, 1",
    phone: "",
    website: "",
    hours: "10:00–22:00",
    averageCheck: "1 200 ₽",
    features: ["Wi-Fi"],
    photos: [],
    source: "editorial",
    status: "published" as const,
    createdAt: null,
    updatedAt: null,
  },
  venueKey: "marea",
  // The route slug is intentionally supplied here to prove the UI boundary
  // still posts the stable legacy key used by historic favorites/reviews.
  externalVenueId: "barkas",
  menuItems: [],
  promotions: [],
} satisfies PublicVenueDetail;

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

const catalogTitleInvoker = { surface: "catalog", venueKey: "marea", action: "title" } as const;
const catalogActionInvoker = { surface: "catalog", venueKey: "marea", action: "action" } as const;

function CatalogHarness() {
  return (
    <>
      <VenueReturnFocusRestorer surface="catalog" />
      <h1 id="catalog-title">Каталог</h1>
      <a {...venueFocusData(catalogTitleInvoker)} href={`/venue/${detail.venue.slug}?from=%2Fcatalog`} onClick={(event) => event.preventDefault()}>Баркас</a>
      <a {...venueFocusData(catalogActionInvoker)} href={`/venue/${detail.venue.slug}?from=%2Fcatalog`} onClick={(event) => event.preventDefault()}>Открыть карточку</a>
      <LocationProbe />
    </>
  );
}

function renderVenueRoute({
  direct = false,
  invoker = catalogTitleInvoker,
  additionalState,
  unsafeState,
}: {
  additionalState?: Record<string, unknown>;
  direct?: boolean;
  invoker?: typeof catalogTitleInvoker | typeof catalogActionInvoker;
  unsafeState?: unknown;
} = {}) {
  const router = createMemoryRouter([{
    path: "/catalog",
    element: <CatalogHarness />,
  }, {
    path: "/venue/:venueSlug",
    element: <><VenueDialog detail={detail} returnTo="/catalog" /><LocationProbe /></>,
  }], {
    initialEntries: direct
      ? [{
        pathname: `/venue/${detail.venue.slug}`,
        search: "?from=%2Fcatalog",
        state: unsafeState,
      }]
      : ["/catalog", {
        pathname: `/venue/${detail.venue.slug}`,
        search: "?from=%2Fcatalog",
        state: { ...additionalState, ...venueInvokerNavigationState(invoker) },
      }],
    initialIndex: direct ? 0 : 1,
  });
  return { router, ...render(<RouterProvider router={router} />) };
}

function renderVenue(returnTo = "/catalog") {
  return render(
    <MemoryRouter initialEntries={[`/venue/${detail.venue.slug}?from=${encodeURIComponent(returnTo)}`]}>
      <VenueDialog detail={detail} returnTo={returnTo} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("VenueDialog review flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.account.favoriteKeys = new Set();
    mocks.account.pendingFavoriteKeys = new Set();
    mocks.account.status = "authenticated";
    mocks.account.user = {
      id: "10000000-0000-4000-8000-000000000001",
      username: "anna",
      name: "Анна",
      email: "anna@example.test",
      hasEmail: true,
      phone: "",
      role: "customer",
      status: "active",
      mustChangePassword: false,
    };
    mocks.browserHttpClient.mockReturnValue(mocks.http);
    mocks.createHttpSubmissions.mockReturnValue({ submitReview: mocks.submitReview });
    mocks.submitReview.mockResolvedValue({
      id: "70000000-0000-4000-8000-000000000001",
      status: "pending",
    });
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  });

  it("opens an accessible dialog and submits through the Submissions seam", async () => {
    let resolveSubmission: ((value: { id: string; status: "pending" }) => void) | undefined;
    mocks.submitReview.mockImplementationOnce(() => new Promise((resolve) => {
      resolveSubmission = resolve;
    }));
    const user = userEvent.setup();
    renderVenue("/");

    await user.click(screen.getByRole("button", { name: "Добавить отзыв" }));
    const reviewDialog = screen.getByRole("dialog", { name: "Добавить отзыв" });
    expect(reviewDialog).toHaveAttribute("open");
    expect(within(reviewDialog).getByRole("textbox", { name: "Ваше имя" }))
      .toHaveValue("Анна");
    expect(within(reviewDialog).getByRole("textbox", { name: "Ваше имя" }))
      .toHaveAttribute("readonly");
    expect(within(reviewDialog).getByText("Имя берётся из вашего профиля."))
      .toHaveAttribute("id", "review-author-help");

    await user.selectOptions(within(reviewDialog).getByRole("combobox", { name: "Оценка" }), "4");
    await user.type(within(reviewDialog).getByRole("textbox", { name: "Отзыв" }), "Очень приятное место для спокойного семейного ужина.");
    await user.click(within(reviewDialog).getByRole("checkbox", { name: /основан на моём посещении/i }));
    await user.click(within(reviewDialog).getByRole("button", { name: /Отправить отзыв/i }));

    expect(await within(reviewDialog).findByRole("status")).toHaveTextContent("Отправляем отзыв");
    expect(within(reviewDialog).getByRole("button", { name: /Отправляем/i })).toBeDisabled();
    expect(within(reviewDialog).getByRole("button", { name: "Закрыть отзыв" })).toBeDisabled();
    const cancel = new Event("cancel", { cancelable: true });
    fireEvent(reviewDialog, cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(reviewDialog).toHaveAttribute("open");
    fireEvent.submit(within(reviewDialog).getByRole("button", { name: /Отправляем/i }).closest("form")!);
    expect(mocks.browserHttpClient).toHaveBeenCalledOnce();
    expect(mocks.createHttpSubmissions).toHaveBeenCalledWith(mocks.http);
    expect(mocks.submitReview).toHaveBeenCalledTimes(1);
    expect(mocks.submitReview).toHaveBeenCalledWith({
      venueId: null,
      externalVenueId: "marea",
      venueTitle: "Баркас",
      authorName: "Анна",
      rating: 4,
      review: "Очень приятное место для спокойного семейного ужина.",
    });

    resolveSubmission?.({ id: "70000000-0000-4000-8000-000000000001", status: "pending" });
    expect(await within(reviewDialog).findByText("Спасибо! Отзыв отправлен на модерацию редакции.")).toHaveAttribute("role", "status");
  });

  it("enforces consent and the twenty-character review policy before the adapter", async () => {
    const user = userEvent.setup();
    renderVenue();
    await user.click(screen.getByRole("button", { name: "Добавить отзыв" }));
    const reviewDialog = screen.getByRole("dialog", { name: "Добавить отзыв" });
    const form = within(reviewDialog).getByRole("button", { name: /Отправить отзыв/i }).closest("form");
    const review = within(reviewDialog).getByRole("textbox", { name: "Отзыв" });
    const consent = within(reviewDialog).getByRole("checkbox", { name: /основан на моём посещении/i });
    expect(review).toHaveAttribute("minlength", "20");
    expect(consent).toBeRequired();

    await user.type(review, "Достаточно подробный отзыв о посещении заведения.");
    fireEvent.submit(form!);
    expect(await within(reviewDialog).findByRole("alert")).toHaveTextContent("Подтвердите");

    await user.click(consent);
    await user.clear(review);
    await user.type(review, "Слишком короткий");
    fireEvent.submit(form!);
    expect(await within(reviewDialog).findByRole("alert")).toHaveTextContent("не менее 20 символов");
    expect(mocks.createHttpSubmissions).not.toHaveBeenCalled();
    expect(mocks.submitReview).not.toHaveBeenCalled();
  });

  it("shows an API failure without closing the review dialog", async () => {
    mocks.submitReview.mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();
    renderVenue();
    await user.click(screen.getByRole("button", { name: "Добавить отзыв" }));
    const reviewDialog = screen.getByRole("dialog", { name: "Добавить отзыв" });
    await user.type(within(reviewDialog).getByRole("textbox", { name: "Отзыв" }), "Очень приятное место для спокойного семейного ужина.");
    await user.click(within(reviewDialog).getByRole("checkbox", { name: /основан на моём посещении/i }));
    await user.click(within(reviewDialog).getByRole("button", { name: /Отправить отзыв/i }));

    expect(await within(reviewDialog).findByRole("alert")).toHaveTextContent("Не удалось отправить отзыв");
    expect(reviewDialog).toHaveAttribute("open");
    expect(within(reviewDialog).getByRole("button", { name: /Отправить отзыв/i })).toBeEnabled();
  });

  it("gives anonymous visitors an explicit login route with a safe home return", () => {
    mocks.account.status = "anonymous";
    mocks.account.user = null;
    renderVenue("/");

    const login = screen.getByRole("link", { name: /Войти, чтобы оставить отзыв/i });
    const loginUrl = new URL(login.getAttribute("href")!, "https://mesto.example");
    expect(loginUrl.pathname).toBe("/login");
    expect(loginUrl.searchParams.get("returnTo")).toBe("/venue/barkas?from=%2F");
    expect(screen.queryByRole("dialog", { name: "Добавить отзыв" })).not.toBeInTheDocument();
  });

  it("returns to the home page when a venue opened from home is closed", async () => {
    const user = userEvent.setup();
    renderVenue("/");
    await user.click(screen.getByRole("button", { name: "Закрыть" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/));
  });

  it.each([
    ["close button", catalogTitleInvoker, async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: "Закрыть" }))],
    ["native Escape lifecycle", catalogActionInvoker, () => {
      const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: "Баркас" });
      fireEvent(dialog, new Event("cancel", { cancelable: true }));
      dialog.close();
    }],
  ])("replaces the venue route and restores the exact logical catalog invoker after %s", async (_label, invoker, close) => {
    const user = userEvent.setup();
    const { router } = renderVenueRoute({ additionalState: { unrelated: "kept" }, invoker });
    await close(user);

    const expectedName = invoker.action === "title" ? "Баркас" : "Открыть карточку";
    await waitFor(() => expect(screen.getByRole("link", { name: expectedName })).toHaveFocus());
    expect(router.state.location.pathname).toBe("/catalog");
    expect(router.state.location.state).toEqual({
      unrelated: "kept",
      venueReturnFocus: invoker,
    });

    await router.navigate(-1);
    await waitFor(() => expect(router.state.location.pathname).toBe("/catalog"));
    expect(screen.queryByRole("dialog", { name: "Баркас" })).not.toBeInTheDocument();
  });

  it("falls back to the catalog heading for a direct route without trusting arbitrary state", async () => {
    const user = userEvent.setup();
    const { router } = renderVenueRoute({
      direct: true,
      unsafeState: {
        venueInvoker: { surface: "catalog", venueKey: 'marea"][autofocus]', action: "title" },
      },
    });
    await user.click(screen.getByRole("button", { name: "Закрыть" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Каталог" })).toHaveFocus());
    expect(router.state.location.pathname).toBe("/catalog");
  });

  it("uses the stable legacy key when favoriting an editorial route slug", async () => {
    mocks.account.toggleFavorite.mockResolvedValueOnce("saved");
    const user = userEvent.setup();
    renderVenue("/");

    await user.click(screen.getByRole("button", { name: "Добавить в избранное" }));

    expect(mocks.account.toggleFavorite).toHaveBeenCalledWith({
      venueKey: "marea",
      venueId: null,
      externalVenueId: "marea",
      snapshot: {
        slug: "barkas",
        title: "Баркас",
        type: "Ресторан · Симферополь",
        rating: "",
        image: "/assets/venue-restaurant-unsplash.jpg",
        text: "Тихое место в центре города",
      },
    });
  });
});
