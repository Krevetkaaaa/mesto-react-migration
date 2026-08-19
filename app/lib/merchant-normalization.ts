import { validationError } from "./application-error";
import { enumValueOr, isUnknownArray, sanitizeText } from "./input-normalization";
import type {
  MenuItemDraft,
  PromotionDraft,
  VenuePatch,
} from "../modules/merchant-workspace";

export interface NormalizedMenuItemDraft {
  section: string;
  title: string;
  description: string;
  price: number | null;
  photoUrl: string;
  isAvailable: boolean;
  sortOrder: number;
}

export interface NormalizedPromotionDraft {
  title: string;
  description: string;
  startsAt: string | null;
  endsAt: string | null;
  status: "draft" | "active" | "archived";
}

export function normalizeMenuItemDraft(draft: MenuItemDraft): NormalizedMenuItemDraft {
  const title = sanitizeText(draft.title, 160);
  if (!title) throw validationError("Menu item title is required");
  if (draft.price !== null && draft.price !== undefined && (!Number.isFinite(draft.price) || draft.price < 0)) {
    throw validationError("Menu item price is invalid");
  }
  const photoUrl = draft.photoUrl?.trim() ?? "";
  return {
    section: sanitizeText(draft.section ?? "", 100) || "Основное меню",
    title,
    description: sanitizeText(draft.description ?? "", 600),
    price: draft.price ?? null,
    photoUrl: /^https?:\/\//i.test(photoUrl) ? photoUrl.slice(0, 500) : "",
    isAvailable: draft.isAvailable ?? true,
    sortOrder: Number.isInteger(draft.sortOrder) ? draft.sortOrder ?? 0 : 0,
  };
}

function dateValue(value: string | null | undefined, label: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw validationError(`${label} is invalid`);
  return date.toISOString();
}

export function normalizePromotionDraft(draft: PromotionDraft): NormalizedPromotionDraft {
  const title = sanitizeText(draft.title, 160);
  if (!title) throw validationError("Promotion title is required");
  const startsAt = dateValue(draft.startsAt, "Promotion start date");
  const endsAt = dateValue(draft.endsAt, "Promotion end date");
  if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) {
    throw validationError("Promotion end date cannot be before its start date");
  }
  return {
    title,
    description: sanitizeText(draft.description ?? "", 1000),
    startsAt,
    endsAt,
    status: enumValueOr(draft.status, ["draft", "active", "archived"], "draft"),
  };
}

export function normalizeVenuePatch(patch: VenuePatch): VenuePatch {
  const website = patch.website?.trim();
  if (website && !/^https?:\/\//i.test(website)) {
    throw validationError("Venue website must use http or https");
  }
  const rawFeatures: unknown = patch.features;
  if (rawFeatures !== undefined && !isUnknownArray(rawFeatures)) {
    throw validationError("Venue features must be an array");
  }
  const features = rawFeatures?.map((item) => sanitizeText(String(item), 100)).filter(Boolean).slice(0, 20);
  return {
    ...(patch.title === undefined ? {} : { title: sanitizeText(patch.title, 160) }),
    ...(patch.category === undefined ? {} : { category: sanitizeText(patch.category, 100) }),
    ...(patch.cuisine === undefined ? {} : { cuisine: sanitizeText(patch.cuisine, 100) }),
    ...(patch.description === undefined ? {} : { description: sanitizeText(patch.description, 2500) }),
    ...(patch.address === undefined ? {} : { address: sanitizeText(patch.address, 300) }),
    ...(patch.phone === undefined ? {} : { phone: sanitizeText(patch.phone, 60) }),
    ...(patch.website === undefined ? {} : { website: website?.slice(0, 300) ?? "" }),
    ...(patch.hours === undefined ? {} : { hours: sanitizeText(patch.hours, 200) }),
    ...(patch.averageCheck === undefined ? {} : { averageCheck: sanitizeText(patch.averageCheck, 100) }),
    ...(features === undefined
      ? {}
      : { features }),
  };
}
