import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { VenueSubmissionDialog } from "../../../app/components/public/submission/VenueSubmissionDialog";
import type {
  SubmissionReceipt,
  Submissions,
} from "../../../app/modules/submissions";

const receipt: SubmissionReceipt = {
  id: "80000000-0000-4000-8000-000000000001",
  status: "pending",
};

function submissionsWith(
  submitVenue: Submissions["submitVenue"],
): Submissions {
  return {
    submitVenue,
    submitReview: vi.fn<Submissions["submitReview"]>(() => Promise.resolve(receipt)),
  };
}

function renderDialog(
  submitVenue: Submissions["submitVenue"],
  overrides: Partial<ComponentProps<typeof VenueSubmissionDialog>> = {},
) {
  return render(
    <VenueSubmissionDialog
      open
      onClose={vi.fn()}
      submissions={submissionsWith(submitVenue)}
      {...overrides}
    />,
  );
}

function validJpeg() {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]);
  const file = new File([bytes], "venue.jpg", { type: "image/jpeg" });
  Object.defineProperty(file, "arrayBuffer", {
    configurable: true,
    value: vi.fn(() => Promise.resolve(bytes.slice().buffer)),
  });
  return { bytes, file };
}

describe("VenueSubmissionDialog", () => {
  it("is an accessible native dialog and delegates button and Escape closing", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const submitVenue = vi.fn<Submissions["submitVenue"]>(() => Promise.resolve(receipt));
    const view = renderDialog(submitVenue, { onClose });

    const dialog = screen.getByRole("dialog", { name: "Добавить место в каталог" });
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog).toHaveClass("form-dialog", "submission-dialog");
    expect(dialog).toHaveAttribute("aria-describedby", "submission-description");
    expect(screen.getByLabelText("Ваше имя")).toHaveAttribute("readonly");
    expect(screen.getByText(/Берём из текущего профиля/u)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    view.rerender(
      <VenueSubmissionDialog
        open={false}
        onClose={onClose}
        submissions={submissionsWith(submitVenue)}
      />,
    );
    view.rerender(
      <VenueSubmissionDialog
        open
        onClose={onClose}
        submissions={submissionsWith(submitVenue)}
      />,
    );

    const cancel = new Event("cancel", { cancelable: true });
    fireEvent(dialog, cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("maps every supported field and image bytes, then reports success", async () => {
    const user = userEvent.setup();
    let finishSubmission!: (value: SubmissionReceipt) => void;
    const pendingSubmission = new Promise<SubmissionReceipt>((resolve) => {
      finishSubmission = resolve;
    });
    const submitVenue = vi.fn<Submissions["submitVenue"]>(() => pendingSubmission);
    const onSubmitted = vi.fn();
    renderDialog(submitVenue, {
      defaultContactName: "Анна",
      defaultContactEmail: "anna@example.test",
      onSubmitted,
    });

    fireEvent.change(screen.getByLabelText("Название заведения"), {
      target: { value: "Маяк" },
    });
    fireEvent.change(screen.getByLabelText("Город"), {
      target: { value: "Ялта" },
    });
    fireEvent.change(screen.getByLabelText("Категория"), {
      target: { value: "Рестораны" },
    });
    fireEvent.change(screen.getByLabelText("Кухня"), {
      target: { value: "Средиземноморская" },
    });
    fireEvent.change(screen.getByLabelText("Адрес"), {
      target: { value: "ул. Морская, 1" },
    });
    fireEvent.change(screen.getByLabelText("Телефон"), {
      target: { value: "+7 978 000-00-00" },
    });
    fireEvent.change(screen.getByLabelText("Сайт"), {
      target: { value: "https://mayak.example" },
    });
    fireEvent.change(screen.getByLabelText("Режим работы"), {
      target: { value: "ежедневно, 09:00–23:00" },
    });
    fireEvent.change(screen.getByLabelText("Средний чек"), {
      target: { value: "1 500 ₽" },
    });
    fireEvent.change(screen.getByLabelText("Особенности"), {
      target: { value: "Парковка, Wi-Fi; терраса" },
    });
    fireEvent.change(screen.getByLabelText("Описание"), {
      target: { value: "Ресторан у моря с локальной кухней." },
    });

    const { bytes, file } = validJpeg();
    await user.upload(screen.getByLabelText(/Фото заведения/u), file);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /Отправить на модерацию/u }));

    await waitFor(() => expect(submitVenue).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: /Загружаем фотографии/u })).toBeDisabled();

    const draft = submitVenue.mock.calls[0]?.[0];
    expect(draft).toMatchObject({
      contactEmail: "anna@example.test",
      title: "Маяк",
      city: "Ялта",
      category: "Рестораны",
      cuisine: "Средиземноморская",
      description: "Ресторан у моря с локальной кухней.",
      address: "ул. Морская, 1",
      phone: "+7 978 000-00-00",
      website: "https://mayak.example",
      hours: "ежедневно, 09:00–23:00",
      averageCheck: "1 500 ₽",
      features: ["Парковка", "Wi-Fi", "терраса"],
    });
    expect(draft).not.toHaveProperty("contactName");
    expect(draft?.images).toHaveLength(1);
    expect(draft?.images?.[0]).toMatchObject({
      name: "venue.jpg",
      type: "image/jpeg",
    });
    expect(draft?.images?.[0]?.bytes).toEqual(bytes);

    await act(async () => {
      finishSubmission(receipt);
      await pendingSubmission;
    });

    expect(screen.getByRole("status")).toHaveTextContent("Заявка отправлена на модерацию");
    expect(screen.getByRole("button", { name: /Заявка отправлена/u })).toBeDisabled();
    expect(onSubmitted).toHaveBeenCalledWith(receipt);
  });

  it("requires publication consent before reading or submitting the form", async () => {
    const submitVenue = vi.fn<Submissions["submitVenue"]>(() => Promise.resolve(receipt));
    renderDialog(submitVenue);

    fireEvent.submit(document.querySelector("#submission-form")!);

    expect(await screen.findByRole("alert")).toHaveTextContent("Подтвердите согласие");
    expect(submitVenue).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "more than six images",
      files: Array.from({ length: 7 }, (_, index) => (
        new File([new Uint8Array([index + 1])], `venue-${index}.jpg`, { type: "image/jpeg" })
      )),
      message: "не более 6 фотографий",
    },
    {
      label: "an unsupported MIME type",
      files: [new File(["not an image"], "venue.gif", { type: "image/gif" })],
      message: "только JPG, PNG и WebP",
    },
    {
      label: "an image larger than 6 MiB",
      files: [Object.assign(
        new File([new Uint8Array([1])], "venue.png", { type: "image/png" }),
        {},
      )],
      message: "до 6 МБ",
      oversize: true,
    },
  ])("rejects $label before calling the submission port", async ({ files, message, oversize }) => {
    if (oversize) {
      Object.defineProperty(files[0], "size", {
        configurable: true,
        value: 6 * 1024 * 1024 + 1,
      });
    }
    const submitVenue = vi.fn<Submissions["submitVenue"]>(() => Promise.resolve(receipt));
    renderDialog(submitVenue);

    fireEvent.change(screen.getByLabelText(/Фото заведения/u), {
      target: { files },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.submit(document.querySelector("#submission-form")!);

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(submitVenue).not.toHaveBeenCalled();
  });

  it("shows submission errors and allows a retry", async () => {
    const submitVenue = vi.fn<Submissions["submitVenue"]>(() => Promise.resolve(receipt));
    submitVenue.mockRejectedValueOnce(new Error("Сервис временно недоступен"));
    renderDialog(submitVenue);

    fireEvent.click(screen.getByRole("checkbox"));
    const form = document.querySelector("#submission-form")!;
    fireEvent.submit(form);

    expect(await screen.findByRole("alert")).toHaveTextContent("Сервис временно недоступен");
    expect(screen.getByRole("button", { name: /Отправить на модерацию/u })).toBeEnabled();

    fireEvent.submit(form);
    expect(await screen.findByRole("status")).toHaveTextContent("Заявка отправлена на модерацию");
    expect(submitVenue).toHaveBeenCalledTimes(2);
  });
});
