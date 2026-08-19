import { useEffect, useRef, useState, type FormEvent } from "react";

import { createBrowserHttpClient } from "../../../adapters/http";
import { createHttpSubmissions } from "../../../adapters/submissions-http";
import { isApplicationError } from "../../../lib/application-error";
import type { PublicVenueDetail } from "../../../modules/public-catalog.server";

type SubmissionState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; message: string }
  | { status: "success" };

function fieldValue(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function submissionErrorMessage(error: unknown) {
  if (!isApplicationError(error)) return "Не удалось отправить отзыв. Попробуйте ещё раз.";
  if (error.kind === "unauthorized") return "Сеанс завершён. Войдите снова и повторите отправку.";
  if (error.kind === "rate-limited") return "Слишком много попыток. Подождите немного и повторите отправку.";
  if (error.kind === "validation") return "Проверьте оценку и текст отзыва.";
  return "Сервис отзывов временно недоступен. Попробуйте ещё раз позже.";
}

export function ReviewDialog({
  authorName,
  detail,
  onClose,
}: {
  authorName: string;
  detail: PublicVenueDetail;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pendingRef = useRef(false);
  const [submission, setSubmission] = useState<SubmissionState>({ status: "idle" });
  const { venue } = detail;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, [onClose]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingRef.current) return;

    const form = new FormData(event.currentTarget);
    const rating = Number(fieldValue(form, "rating"));
    const review = fieldValue(form, "review").trim();
    const consent = form.get("consent") === "on";

    if (!consent) {
      setSubmission({ status: "error", message: "Подтвердите, что отзыв основан на вашем посещении." });
      return;
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      setSubmission({ status: "error", message: "Выберите оценку от 1 до 5." });
      return;
    }
    if (review.length < 20) {
      setSubmission({ status: "error", message: "Отзыв должен содержать не менее 20 символов." });
      return;
    }

    pendingRef.current = true;
    setSubmission({ status: "pending" });
    try {
      const submissions = createHttpSubmissions(createBrowserHttpClient());
      const externalVenueId = detail.externalVenueId ? detail.venueKey : null;
      await submissions.submitReview({
        venueId: externalVenueId ? null : venue.id,
        externalVenueId,
        venueTitle: venue.title,
        authorName: fieldValue(form, "authorName"),
        rating,
        review,
      });
      setSubmission({ status: "success" });
    } catch (error) {
      setSubmission({ status: "error", message: submissionErrorMessage(error) });
    } finally {
      pendingRef.current = false;
    }
  };

  return (
    <dialog
      ref={dialogRef}
      id="review-dialog"
      className="form-dialog review-dialog"
      aria-labelledby="review-title"
      onCancel={(event) => {
        if (pendingRef.current) event.preventDefault();
      }}
      onClick={(event) => {
        if (pendingRef.current) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) {
          event.currentTarget.close();
        }
      }}
    >
      <button className="dialog-close" type="button" aria-label="Закрыть отзыв" disabled={submission.status === "pending"} onClick={() => dialogRef.current?.close()}>×</button>
      <div className="form-dialog-inner">
        <p className="eyebrow">Ваше впечатление</p>
        <h2 id="review-title">Добавить отзыв</h2>
        {submission.status === "success" ? (
          <>
            <p className="form-lead" role="status">Спасибо! Отзыв отправлен на модерацию редакции.</p>
            <button className="primary-action full" type="button" onClick={() => dialogRef.current?.close()}>Готово <svg><use href="#arrow" /></svg></button>
          </>
        ) : (
          <>
            <p className="form-lead">Оценка и текст появятся в карточке после проверки редакцией.</p>
            <form aria-busy={submission.status === "pending"} onSubmit={(event) => { void submit(event); }}>
              <label>
                Ваше имя
                <input
                  name="authorName"
                  type="text"
                  autoComplete="name"
                  aria-label="Ваше имя"
                  aria-describedby="review-author-help"
                  value={authorName || "Гость"}
                  readOnly
                />
                <small id="review-author-help">Имя берётся из вашего профиля.</small>
              </label>
              <label>Оценка<select name="rating" defaultValue="5" required><option value="5">5 — отлично</option><option value="4">4 — хорошо</option><option value="3">3 — нормально</option><option value="2">2 — есть замечания</option><option value="1">1 — не понравилось</option></select></label>
              <label>Отзыв<textarea name="review" rows={5} minLength={20} maxLength={3000} placeholder="Что вам понравилось: атмосфера, кухня, сервис?" required /></label>
              <label className="check-field"><input name="consent" type="checkbox" required /><span>Подтверждаю, что отзыв основан на моём посещении.</span></label>
              {submission.status === "error" ? <p className="auth-error" role="alert">{submission.message}</p> : null}
              {submission.status === "pending" ? <p className="form-lead" role="status">Отправляем отзыв…</p> : null}
              <button className="primary-action full" type="submit" disabled={submission.status === "pending"}>{submission.status === "pending" ? "Отправляем…" : "Отправить отзыв"} <svg><use href="#arrow" /></svg></button>
            </form>
          </>
        )}
      </div>
    </dialog>
  );
}
