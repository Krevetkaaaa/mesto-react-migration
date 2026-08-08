import type { MembershipRole, MerchantAccount, Venue } from "../../lib/domain";
import { MESTO_TIME_ZONE } from "../../lib/locale";

export type AdminView = "overview" | "submissions" | "reviews" | "venues" | "merchants";

export const adminViews = new Set<AdminView>([
  "overview",
  "submissions",
  "reviews",
  "venues",
  "merchants",
]);

export const viewTitles: Record<AdminView, string> = {
  overview: "Добрый день",
  submissions: "Модерация",
  reviews: "Отзывы",
  venues: "Каталог заведений",
  merchants: "Рестораторы",
};

export const membershipRoleLabels: Record<MembershipRole, string> = {
  owner: "Владелец",
  manager: "Управляющий",
  content_editor: "Редактор контента",
  analyst: "Аналитик",
};

export function formatAdminDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: MESTO_TIME_ZONE,
  }).format(date);
}

export function merchantEmail(value: string) {
  return /@accounts\.mesto\.guide$/i.test(value) ? "" : value;
}

export function merchantRole(merchant: MerchantAccount): MembershipRole {
  return merchant.memberships[0]?.role ?? "owner";
}

export function merchantVenues(merchant: MerchantAccount, venues: readonly Venue[]) {
  return merchant.memberships
    .map((membership) => membership.venue ?? venues.find((venue) => venue.id === membership.venueId))
    .filter((venue): venue is Venue => Boolean(venue));
}

export function listInput(value: string) {
  return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
}
