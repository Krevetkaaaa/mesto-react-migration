import { validationError } from "./application-error";
import { normalizeEmail } from "./auth-normalization";
import type { MembershipRole, Venue } from "./domain";
import { requireUuid } from "./identifiers";
import {
  enumValueOr,
  requireEnumValue,
  sanitizeText,
} from "./input-normalization";
import type {
  AdminVenueDraft,
  CreateMerchantCommand,
  ModerationCommand,
  UpdateMerchantCommand,
} from "../modules/admin-console";
import {
  isStrongPassword,
  TEMPORARY_PASSWORD_VALIDATION_MESSAGE,
} from "../../password-policy.mjs";

export type NormalizedAdminVenueDraft = Omit<Venue, "id" | "createdAt" | "updatedAt">;

const membershipRoles = ["owner", "manager", "content_editor", "analyst"] as const;
const venueSources = ["editorial", "community", "merchant"] as const;
const venueStatuses = ["draft", "published", "archived"] as const;
const moderationTargets = ["submission", "review"] as const;
const moderationDecisions = ["approved", "rejected"] as const;
const merchantStatuses = ["active", "suspended"] as const;

function venueIds(values: readonly string[]) {
  return [...new Set(values.map((value) => requireUuid(value, "Venue id")))].slice(0, 100);
}

export function normalizeAdminVenueDraft(draft: AdminVenueDraft): NormalizedAdminVenueDraft {
  const title = sanitizeText(draft.title, 160);
  const city = sanitizeText(draft.city, 80);
  const category = sanitizeText(draft.category, 100);
  const description = sanitizeText(draft.description, 2500);
  if (!title || !city || !category || !description) {
    throw validationError("Venue title, city, category and description are required");
  }
  const website = sanitizeText(draft.website ?? "", 300);
  const slug = sanitizeText(draft.slug ?? "", 160)
    || title.toLocaleLowerCase("ru-RU").replace(/[^a-zа-яё0-9]+/giu, "-").replace(/^-|-$/g, "");
  return {
    slug,
    title,
    city,
    category,
    cuisine: sanitizeText(draft.cuisine ?? "", 100),
    description,
    address: sanitizeText(draft.address ?? "", 300),
    phone: sanitizeText(draft.phone ?? "", 60),
    website: /^https?:\/\//i.test(website) ? website : "",
    hours: sanitizeText(draft.hours ?? "", 200),
    averageCheck: sanitizeText(draft.averageCheck ?? "", 100),
    features: (draft.features ?? []).map((item) => sanitizeText(item, 100)).filter(Boolean).slice(0, 20),
    photos: (draft.photos ?? []).map((item) => item.trim()).filter((item) => /^https?:\/\//i.test(item)).slice(0, 12),
    source: enumValueOr(draft.source, venueSources, "editorial"),
    status: enumValueOr(draft.status, venueStatuses, "published"),
  };
}

export interface NormalizedCreateMerchant {
  displayName: string;
  username: string;
  email: string;
  password?: string;
  venueIds: readonly string[];
  membershipRole: MembershipRole;
}

export function normalizeCreateMerchant(command: CreateMerchantCommand): NormalizedCreateMerchant {
  const displayName = sanitizeText(command.displayName, 120);
  const username = sanitizeText(command.username, 48).toLowerCase();
  const email = normalizeEmail(command.email ?? "")
    || `${username}@accounts.mesto.guide`;
  if (!displayName || !/^[a-z0-9._-]{3,48}$/.test(username)) {
    throw validationError("Merchant name, username and email are invalid");
  }
  if (command.password !== undefined && !isStrongPassword(command.password)) {
    throw validationError(TEMPORARY_PASSWORD_VALIDATION_MESSAGE);
  }
  return {
    displayName,
    username,
    email,
    ...(command.password === undefined ? {} : { password: command.password }),
    venueIds: venueIds(command.venueIds),
    membershipRole: requireEnumValue(command.membershipRole, membershipRoles, "Membership role"),
  };
}

export interface NormalizedUpdateMerchant {
  userId: string;
  displayName?: string;
  assignments?: {
    venueIds: readonly string[];
    membershipRole: MembershipRole;
  };
}

export function normalizeUpdateMerchant(command: UpdateMerchantCommand): NormalizedUpdateMerchant {
  return {
    userId: requireUuid(command.userId, "Merchant id"),
    ...(command.displayName === undefined
      ? {}
      : { displayName: sanitizeText(command.displayName, 120) }),
    ...(command.assignments === undefined
      ? {}
      : {
          assignments: {
            venueIds: venueIds(command.assignments.venueIds),
            membershipRole: requireEnumValue(
              command.assignments.membershipRole,
              membershipRoles,
              "Membership role",
            ),
          },
        }),
  };
}

export function normalizeResetPassword(password?: string) {
  if (password === undefined) return undefined;
  if (!isStrongPassword(password)) throw validationError(TEMPORARY_PASSWORD_VALIDATION_MESSAGE);
  return password;
}

export function normalizeModerationCommand(command: ModerationCommand): ModerationCommand {
  return {
    target: requireEnumValue(command.target, moderationTargets, "Moderation target"),
    id: requireUuid(command.id, "Moderation id"),
    decision: requireEnumValue(command.decision, moderationDecisions, "Moderation decision"),
    note: sanitizeText(command.note ?? "", 600),
  };
}

export function normalizeMerchantStatus(value: unknown): "active" | "suspended" {
  return requireEnumValue(value, merchantStatuses, "Merchant status");
}
