import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";

import { ProfileView } from "../../../app/components/public/account/AccountViews";
import { PUBLIC_VENUE_IMAGE_FALLBACK } from "../../../app/lib/public-asset";
import type { Favorite, User } from "../../../app/lib/domain";

const user: User = {
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

describe("public account image boundary", () => {
  it("fails closed when a stored favorite contains an unsafe image URL", () => {
    const favorite: Favorite = {
      venueKey: "unsafe-image",
      venueId: null,
      externalVenueId: "unsafe-image",
      snapshot: {
        slug: "unsafe-image",
        title: "Безопасная карточка",
        type: "Кофейня",
        rating: "",
        image: "javascript:alert(1)",
        text: "Описание",
      },
      createdAt: null,
    };

    const router = createMemoryRouter([{
      path: "/",
      element: <ProfileView favorites={[favorite]} user={user} />,
    }]);
    const { container } = render(<RouterProvider router={router} />);

    expect(container.querySelector(".favorite-row img"))
      .toHaveAttribute("src", PUBLIC_VENUE_IMAGE_FALLBACK);
  });
});
