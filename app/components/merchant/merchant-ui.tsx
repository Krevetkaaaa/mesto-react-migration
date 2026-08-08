import type { CSSProperties } from "react";

import { MESTO_TIME_ZONE } from "../../lib/locale";

export type MerchantView = "overview" | "venue" | "menu" | "promotions" | "reviews";
export type MerchantPermission = "venue" | "menu" | "promotions" | "reviews" | "analytics";

export const viewMeta: Readonly<Record<MerchantView, readonly [string, string]>> = {
  overview: ["Рабочее пространство", "Добрый день"],
  venue: ["Публичная карточка", "О заведении"],
  menu: ["Кухня заведения", "Меню"],
  promotions: ["Предложения для гостей", "Акции"],
  reviews: ["Мнение гостей", "Отзывы"],
};

export const permissionLabels: Readonly<Record<MerchantPermission, string>> = {
  venue: "Редактирование карточки",
  menu: "Управление меню",
  promotions: "Управление акциями",
  reviews: "Просмотр отзывов",
  analytics: "Просмотр статистики",
};

export function permissionsForRole(value: string | null | undefined): readonly MerchantPermission[] {
  if (value === "owner" || value === "manager") return ["venue", "menu", "promotions", "reviews", "analytics"];
  if (value === "content_editor") return ["venue", "menu", "promotions"];
  if (value === "analyst") return ["reviews", "analytics"];
  return [];
}

export function initials(value: string | null | undefined) {
  const parts = String(value || "М").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "М";
}

export function plural(number: number, forms: readonly [string, string, string]) {
  const value = Math.abs(number) % 100;
  const last = value % 10;
  if (value > 10 && value < 20) return `${number} ${forms[2]}`;
  if (last > 1 && last < 5) return `${number} ${forms[1]}`;
  if (last === 1) return `${number} ${forms[0]}`;
  return `${number} ${forms[2]}`;
}

export function stars(rating: number) {
  const rounded = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return `${"★".repeat(rounded)}${"☆".repeat(5 - rounded)}`;
}

export function formatMoney(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "Цена не указана";
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value)} ₽`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "Не указано";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Не указано";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: MESTO_TIME_ZONE,
  }).format(date);
}

export function toLocalInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function safeImage(value: string | null | undefined) {
  const image = String(value || "").trim();
  if (/^\/(?!\/)/.test(image)) return image.replace(/["\\\n\r]/g, "");
  try {
    const url = new URL(image);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

export function coverStyle(value: string | null | undefined): CSSProperties | undefined {
  const image = safeImage(value);
  return image
    ? { backgroundImage: `linear-gradient(135deg, rgba(11,29,44,.14), rgba(11,29,44,.34)), url("${image}")` }
    : undefined;
}

export type IconName =
  | "arrow" | "chevron" | "clock" | "close" | "edit" | "external" | "grid"
  | "hamburger" | "help" | "location" | "lock" | "logout" | "menu" | "more"
  | "plus" | "refresh" | "save" | "search" | "shield" | "star" | "store"
  | "tag" | "trash" | "user" | "eye";

export function MerchantIcon({ name }: { name: IconName }) {
  return <svg aria-hidden="true"><use href={`#icon-${name}`} /></svg>;
}

export function MerchantSprite() {
  return (
    <svg className="svg-sprite" aria-hidden="true">
      <symbol id="icon-user" viewBox="0 0 24 24"><path d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" /></symbol>
      <symbol id="icon-lock" viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></symbol>
      <symbol id="icon-eye" viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></symbol>
      <symbol id="icon-help" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.3 2.3 0 1 1 3.6 1.9c-.9.6-1.4 1-1.4 2.1M12 17h.01"/></symbol>
      <symbol id="icon-arrow" viewBox="0 0 24 24"><path d="M5 12h14M14 7l5 5-5 5"/></symbol>
      <symbol id="icon-close" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></symbol>
      <symbol id="icon-grid" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></symbol>
      <symbol id="icon-store" viewBox="0 0 24 24"><path d="M4 10v10h16V10M3 10l2-6h14l2 6"/><path d="M3 10a3 3 0 0 0 5 2 3 3 0 0 0 4 0 3 3 0 0 0 4 0 3 3 0 0 0 5-2M9 20v-5h6v5"/></symbol>
      <symbol id="icon-menu" viewBox="0 0 24 24"><path d="M7 3v7a2 2 0 0 1-2 2V3M7 3v17M16 3c-2 2-2 7 0 9h2V3h-2Zm2 9v8"/></symbol>
      <symbol id="icon-tag" viewBox="0 0 24 24"><path d="m20 13-7 7L4 11V4h7l9 9Z"/><circle cx="8.5" cy="8.5" r="1"/></symbol>
      <symbol id="icon-star" viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></symbol>
      <symbol id="icon-logout" viewBox="0 0 24 24"><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10"/></symbol>
      <symbol id="icon-hamburger" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></symbol>
      <symbol id="icon-chevron" viewBox="0 0 24 24"><path d="m7 9 5 5 5-5"/></symbol>
      <symbol id="icon-refresh" viewBox="0 0 24 24"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6l-2 2M5.5 15A7 7 0 0 0 18 18l2-2"/></symbol>
      <symbol id="icon-external" viewBox="0 0 24 24"><path d="M14 5h5v5M19 5l-9 9"/><path d="M19 14v5H5V5h5"/></symbol>
      <symbol id="icon-shield" viewBox="0 0 24 24"><path d="M12 3 4 6v5c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6l-8-3Z"/><path d="m9 12 2 2 4-5"/></symbol>
      <symbol id="icon-edit" viewBox="0 0 24 24"><path d="m14 5 5 5M4 20l3.5-.8L19 7.7 16.3 5 4.8 16.5 4 20Z"/></symbol>
      <symbol id="icon-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
      <symbol id="icon-search" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></symbol>
      <symbol id="icon-save" viewBox="0 0 24 24"><path d="M5 3h12l2 2v16H5V3Z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></symbol>
      <symbol id="icon-trash" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></symbol>
      <symbol id="icon-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></symbol>
      <symbol id="icon-location" viewBox="0 0 24 24"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></symbol>
      <symbol id="icon-more" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></symbol>
    </svg>
  );
}
