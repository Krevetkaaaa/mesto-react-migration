import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { createRoutesStub } from "react-router";

import { AdminWorkspace } from "../../../app/components/admin/AdminWorkspace";
import { formatAdminDate } from "../../../app/components/admin/admin-ui";
import { ApplicationError } from "../../../app/lib/application-error";
import type { AdminWorkspaceSnapshot } from "../../../app/modules/admin-console";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN,
  TEMPORARY_PASSWORD_ERROR_MESSAGE,
  TEMPORARY_PASSWORD_HINT,
} from "../../../password-policy.mjs";

const venue = {
  id: "30000000-0000-4000-8000-000000000001",
  slug: "quiet-garden",
  title: "Тихий сад",
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
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-02T10:00:00.000Z",
};

const merchant = {
  id: "20000000-0000-4000-8000-000000000001",
  displayName: "Мария",
  username: "maria.owner",
  email: "maria@example.test",
  status: "active" as const,
  createdAt: "2026-08-01T10:00:00.000Z",
  lastLoginAt: null,
  memberships: [{
    id: "40000000-0000-4000-8000-000000000001",
    userId: "20000000-0000-4000-8000-000000000001",
    venueId: venue.id,
    role: "owner" as const,
    venue,
  }],
};

const overview = {
  stats: { venues: 1, pendingVenues: 0, pendingReviews: 0, merchants: 1, cities: 1 },
  venues: [venue],
  submissions: [],
  reviews: [],
  databaseConfigured: true,
};

function renderWorkspace(workspace: AdminWorkspaceSnapshot, view: "overview" | "merchants") {
  const Stub = createRoutesStub([{
    path: "/admin",
    action: async ({ request }) => {
      const form = await request.formData();
      const rawIntent = form.get("intent");
      const intent = typeof rawIntent === "string" ? rawIntent : "";
      if (intent === "merchant.password.reset") {
        return {
          ok: true,
          intent,
          message: "Временный пароль создан.",
          credentials: { password: "TemporaryPass99" },
          credentialContext: { name: "Мария", email: "maria@example.test" },
        };
      }
      return { ok: true, intent, message: "Готово." };
    },
    children: [{
      path: view,
      Component: () => <AdminWorkspace workspace={workspace} activeView={view} routeActionData={undefined} />,
    }],
  }]);
  return render(<Stub initialEntries={[`/admin/${view}`]} />);
}

describe("AdminWorkspace", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
    };
  });

  it("formats SSR text in the product timezone instead of the server timezone", () => {
    const previousTimeZone = process.env.TZ;
    process.env.TZ = "UTC";
    try {
      expect(formatAdminDate("2026-08-01T21:30:00.000Z")).toBe("02 авг., 00:30");
    } finally {
      if (previousTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimeZone;
    }
  });

  it("keeps the rest of the dashboard usable when merchants fail", () => {
    const workspace: AdminWorkspaceSnapshot = {
      overview,
      merchants: {
        status: "unavailable",
        error: new ApplicationError("unavailable", "Сервис аккаунтов недоступен"),
      },
    };
    const result = renderWorkspace(workspace, "overview");
    expect(screen.getByText("Последние заявки")).toBeInTheDocument();
    expect(screen.getByText("Тихий сад")).toBeInTheDocument();
    result.unmount();

    renderWorkspace(workspace, "merchants");
    expect(screen.getByRole("alert")).toHaveTextContent("Сервис аккаунтов недоступен");
  });

  it("uses semantic tables with scoped row and column headers", () => {
    renderWorkspace({ overview, merchants: { status: "ready", items: [merchant] } }, "merchants");
    const table = screen.getByRole("table", { name: "Рестораторы и назначенные заведения" });
    expect(table.querySelectorAll("thead th[scope='col']")).toHaveLength(6);
    expect(table.querySelector("tbody th[scope='row']")).toHaveTextContent("Мария");
  });

  it("emits a Chrome v-mode-safe merchant login pattern", async () => {
    const user = userEvent.setup();
    renderWorkspace({ overview, merchants: { status: "ready", items: [merchant] } }, "merchants");
    await user.click(screen.getByRole("button", { name: "+ Добавить ресторатора" }));
    expect(screen.getByRole("textbox", { name: "Логин" })).toHaveAttribute("pattern", "[A-Za-z0-9._\\-]{3,48}");
    const password = screen.getByPlaceholderText("Оставьте пустым, чтобы создать автоматически");
    expect(password).toHaveAttribute("minlength", String(PASSWORD_MIN_LENGTH));
    expect(password).toHaveAttribute("pattern", PASSWORD_PATTERN);
    expect(password).toHaveAttribute("title", TEMPORARY_PASSWORD_ERROR_MESSAGE);
    expect(screen.getByText(TEMPORARY_PASSWORD_HINT)).toBeInTheDocument();
  });

  it("removes one-time credentials from the DOM after the dialog closes", async () => {
    const user = userEvent.setup();
    renderWorkspace({ overview, merchants: { status: "ready", items: [merchant] } }, "merchants");

    await user.click(screen.getByRole("button", { name: "Новый пароль" }));
    await user.click(screen.getByRole("button", { name: "Создать пароль" }));
    expect(await screen.findByText("TemporaryPass99")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Готово" }));
    await waitFor(() => expect(screen.queryByText("TemporaryPass99")).not.toBeInTheDocument());
  });
});
