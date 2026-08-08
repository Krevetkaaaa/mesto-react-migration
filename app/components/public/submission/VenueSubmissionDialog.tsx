import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";

import { createBrowserHttpClient } from "../../../adapters/http";
import { createHttpSubmissions } from "../../../adapters/submissions-http";
import { isApplicationError } from "../../../lib/application-error";
import type {
  SubmissionImage,
  SubmissionReceipt,
  Submissions,
  VenueSubmissionDraft,
} from "../../../modules/submissions";

const MAX_IMAGE_COUNT = 6;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

type SubmissionPhase = "idle" | "pending" | "success";
type SubmissionImageType = (typeof IMAGE_TYPES)[number];

export interface VenueSubmissionDialogProps {
  open: boolean;
  onClose: () => void;
  submissions?: Submissions;
  defaultContactName?: string;
  defaultContactEmail?: string;
  onSubmitted?: (receipt: SubmissionReceipt) => void;
}

function isSubmissionImageType(type: string): type is SubmissionImageType {
  return IMAGE_TYPES.some((candidate) => candidate === type);
}

function textField(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

function splitFeatures(value: string) {
  return value
    .split(/[,;]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function submissionErrorMessage(error: unknown) {
  if (isApplicationError(error)) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Не удалось отправить заявку. Попробуйте ещё раз.";
}

async function readSubmissionImages(files: readonly File[]): Promise<SubmissionImage[]> {
  if (files.length > MAX_IMAGE_COUNT) {
    throw new Error("Можно добавить не более 6 фотографий.");
  }

  const images: SubmissionImage[] = [];
  for (const file of files) {
    if (!isSubmissionImageType(file.type)) {
      throw new Error("Поддерживаются только JPG, PNG и WebP.");
    }
    if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
      throw new Error("Размер каждой фотографии должен быть от 1 байта до 6 МБ.");
    }
    images.push({
      name: file.name,
      type: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  }
  return images;
}

function buildVenueDraft(data: FormData, images: readonly SubmissionImage[]): VenueSubmissionDraft {
  return {
    contactEmail: textField(data, "contactEmail"),
    title: textField(data, "title"),
    city: textField(data, "city"),
    category: textField(data, "category"),
    cuisine: textField(data, "cuisine"),
    description: textField(data, "description"),
    address: textField(data, "address"),
    phone: textField(data, "phone"),
    website: textField(data, "website"),
    hours: textField(data, "hours"),
    averageCheck: textField(data, "averageCheck"),
    features: splitFeatures(textField(data, "features")),
    images,
  };
}

export function VenueSubmissionDialog({
  open,
  onClose,
  submissions: providedSubmissions,
  defaultContactName = "",
  defaultContactEmail = "",
  onSubmitted,
}: VenueSubmissionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const pendingRef = useRef(false);
  const [defaultSubmissions] = useState<Submissions>(() => (
    providedSubmissions ?? createHttpSubmissions(createBrowserHttpClient())
  ));
  const submissions = providedSubmissions ?? defaultSubmissions;
  const [phase, setPhase] = useState<SubmissionPhase>("idle");
  const [error, setError] = useState("");
  const [pendingLabel, setPendingLabel] = useState("Отправляем…");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute("open", "");
      }
    } else if (!open && dialog.open) {
      try {
        dialog.close();
      } catch {
        dialog.removeAttribute("open");
      }
    }
  }, [open]);

  function close() {
    if (pendingRef.current) return;
    formRef.current?.reset();
    setError("");
    setPhase("idle");
    onClose();
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget || pendingRef.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const outside = event.clientX < bounds.left
      || event.clientX > bounds.right
      || event.clientY < bounds.top
      || event.clientY > bounds.bottom;
    if (outside) close();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;

    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get("consent") !== "on") {
      setError("Подтвердите согласие на проверку и публикацию заявки.");
      return;
    }

    const fileInput = form.elements.namedItem("photos");
    const files = fileInput instanceof HTMLInputElement && fileInput.files
      ? Array.from(fileInput.files)
      : [];

    pendingRef.current = true;
    setError("");
    setPendingLabel(files.length ? "Загружаем фотографии…" : "Отправляем…");
    setPhase("pending");

    try {
      const images = await readSubmissionImages(files);
      const receipt = await submissions.submitVenue(buildVenueDraft(data, images));
      form.reset();
      setPhase("success");
      onSubmitted?.(receipt);
    } catch (submissionError) {
      setError(submissionErrorMessage(submissionError));
      setPhase("idle");
    } finally {
      pendingRef.current = false;
    }
  }

  return (
    <dialog
      id="submission-dialog"
      className="form-dialog submission-dialog"
      aria-labelledby="submission-title"
      aria-describedby="submission-description"
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={handleBackdropClick}
    >
      <button
        className="dialog-close"
        type="button"
        aria-label="Закрыть"
        disabled={phase === "pending"}
        onClick={close}
      >×</button>
      <div className="form-dialog-inner">
        <p className="eyebrow">Карточка заведения</p>
        <h2 id="submission-title">Добавить место в каталог</h2>
        <p className="form-lead" id="submission-description">
          Заявка попадёт на проверку редакции. После одобрения карточка появится в выбранном городе.
        </p>
        <form id="submission-form" ref={formRef} aria-busy={phase === "pending"} onSubmit={(event) => { void submit(event); }}>
          <div className="form-grid">
            <div className="form-field"><label htmlFor="submission-contact-name">Ваше имя</label><input id="submission-contact-name" name="contactName" type="text" autoComplete="name" defaultValue={defaultContactName} aria-describedby="submission-contact-name-note" readOnly /><small className="form-field-note" id="submission-contact-name-note">Берём из текущего профиля; изменить имя можно в личном кабинете.</small></div>
            <label>Почта для связи<input name="contactEmail" type="email" autoComplete="email" placeholder="you@example.com" defaultValue={defaultContactEmail} required /></label>
            <label>Название заведения<input name="title" type="text" placeholder="Например, Marea" required /></label>
            <label>Город<select name="city" required><option value="">Выберите город</option><option>Симферополь</option><option>Ялта</option><option>Севастополь</option><option>Алушта</option><option>Евпатория</option><option>Феодосия</option></select></label>
            <label>Категория<select name="category" required><option value="">Выберите категорию</option><option>Рестораны</option><option>Кафе</option><option>Кофейни</option><option>Кондитерские</option><option>Пиццерии</option><option>Фаст-кэжуал</option><option>Бары</option><option>Гастробары</option><option>Караоке-клубы</option><option>Суши-бары</option><option>Кальян-бары</option><option>Банкетные залы</option></select></label>
            <label>Кухня<select name="cuisine"><option>Европейская</option><option>Средиземноморская</option><option>Итальянская</option><option>Грузинская</option><option>Паназиатская</option><option>Японская</option><option>Мясная</option><option>Рыбная</option><option>Вегетарианская</option><option>Кофе и десерты</option></select></label>
            <label>Адрес<input name="address" type="text" placeholder="Улица, дом" /></label>
            <label>Телефон<input name="phone" type="tel" autoComplete="tel" placeholder="+7 (978) 000-00-00" /></label>
            <label>Сайт<input name="website" type="url" placeholder="https://example.ru" /></label>
            <label>Режим работы<input name="hours" type="text" placeholder="ежедневно, 09:00–23:00" /></label>
            <label>Средний чек<input name="averageCheck" type="text" placeholder="Например, 1 500 ₽" /></label>
            <label>Особенности<input name="features" type="text" placeholder="Парковка, Wi‑Fi, можно с собакой" /></label>
          </div>
          <label>Описание<textarea name="description" rows={4} placeholder="Расскажите про атмосферу, меню и важные детали" required /></label>
          <label className="upload-field"><span><svg><use href="#camera" /></svg>Фото заведения</span><input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple /><small>Можно добавить до 6 фотографий, JPG/PNG/WebP</small></label>
          <label className="check-field"><input name="consent" type="checkbox" required /><span>Я подтверждаю, что информация актуальна и разрешаю публикацию после модерации.</span></label>
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          {phase === "success" ? <p className="form-lead" role="status">Заявка отправлена на модерацию — спасибо за вклад в каталог.</p> : null}
          <button className="primary-action full" type="submit" disabled={phase === "pending" || phase === "success"}>
            {phase === "pending" ? pendingLabel : phase === "success" ? "Заявка отправлена" : "Отправить на модерацию"} <svg><use href="#arrow" /></svg>
          </button>
        </form>
      </div>
    </dialog>
  );
}
