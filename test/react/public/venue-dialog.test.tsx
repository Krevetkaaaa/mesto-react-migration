import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router";

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
