import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { PrettySelect } from "../../../app/components/public/home/PrettySelect";

const OPTIONS = [
  { label: "Alpha", value: "alpha" },
  { label: "Bravo", value: "bravo" },
  { label: "Charlie", value: "charlie" },
] as const;

describe("PrettySelect", () => {
  it("opens, moves focus, and commits a selection from the keyboard", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <PrettySelect
        ariaLabel="City"
        defaultValue="alpha"
        name="city"
        options={OPTIONS}
      />,
    );
    const trigger = screen.getByRole("button", { name: "City: Alpha" });
    const nativeSelect = container.querySelector<HTMLSelectElement>('select[name="city"]');

    trigger.focus();
    await user.keyboard("{ArrowDown}");

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(screen.getByRole("option", { name: "Alpha" })).toHaveFocus());

    await user.keyboard("{ArrowDown}{Enter}");

    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAccessibleName("City: Bravo");
    expect(nativeSelect).toHaveValue("bravo");
    expect(screen.getByRole("option", { name: "Bravo" })).toHaveAttribute("aria-selected", "true");
  });

  it("supports boundary navigation and Escape without changing the value", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <PrettySelect
        ariaLabel="City"
        defaultValue="bravo"
        name="city"
        options={OPTIONS}
      />,
    );
    const trigger = screen.getByRole("button", { name: "City: Bravo" });

    trigger.focus();
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(screen.getByRole("option", { name: "Bravo" })).toHaveFocus());
    await user.keyboard("{End}");
    expect(screen.getByRole("option", { name: "Charlie" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("option", { name: "Alpha" })).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelector<HTMLSelectElement>('select[name="city"]')).toHaveValue("bravo");
  });

  it("keeps one roving option tabbable and closes before Tab leaves the control", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <PrettySelect ariaLabel="City" defaultValue="bravo" name="city" options={OPTIONS} />
        <button type="button">Next control</button>
      </div>,
    );
    const trigger = screen.getByRole("button", { name: "City: Bravo" });

    trigger.focus();
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(screen.getByRole("option", { name: "Bravo" })).toHaveFocus());
    expect(screen.getAllByRole("option").map((option) => option.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);

    await user.keyboard("{Tab}");

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Next control" })).toHaveFocus();
  });
});
