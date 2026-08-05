import { z } from "zod";

import type {
  AdminDashboard,
  CatalogVenue,
  Favorite,
  Membership,
  MenuItem,
  MerchantAccount,
  Promotion,
  Review,
  User,
  Venue,
  VenueSubmission,
} from "../lib/domain";
import { UUID_PATTERN } from "../lib/identifiers";

const text = z.string().nullish().transform((value) => value ?? "");
const nullableText = z.string().nullish().transform((value) => value ?? null);
const uuid = z.string().regex(UUID_PATTERN, "Expected UUID").transform((value) => value.toLowerCase());
const nullableUuid = uuid.nullish().transform((value) => value ?? null);
const textList = z.array(z.string()).optional().default([]);
const coordinates = z.union([
  z.tuple([]),
  z.tuple([z.number(), z.number()]),
]);

export const userWireSchema = z.object({
  id: uuid,
  username: text,
  name: text,
  email: text,
  hasEmail: z.boolean(),
  phone: text,
  role: z.enum(["customer", "merchant", "admin"]),
  status: z.enum(["invited", "active", "suspended"]),
  mustChangePassword: z.boolean(),
}).loose().transform((value): User => ({
  id: value.id,
  username: value.username,
  name: value.name,
  email: value.email,
  hasEmail: value.hasEmail,
  phone: value.phone,
  role: value.role,
  status: value.status,
  mustChangePassword: value.mustChangePassword,
}));

const favoriteSnapshotWireSchema = z.object({
  title: text,
  type: text,
  rating: text,
  image: text,
  text,
}).loose().optional().default({
  title: "",
  type: "",
  rating: "",
  image: "",
  text: "",
});

export const favoriteWireSchema = z.object({
  venue_key: z.string().min(1),
  venue_id: nullableUuid,
  external_venue_id: nullableText,
  snapshot: favoriteSnapshotWireSchema,
  created_at: nullableText,
}).loose().transform((value): Favorite => ({
  venueKey: value.venue_key,
  venueId: value.venue_id,
  externalVenueId: value.external_venue_id,
  snapshot: value.snapshot,
  createdAt: value.created_at,
}));

export const catalogVenueWireSchema = z.object({
  id: z.string().min(1),
  databaseId: nullableUuid,
  name: z.string().min(1),
  city: text,
  address: text,
  description: text,
  categories: textList,
  category: text,
  cuisine: text,
  hours: text,
  averageCheck: text,
  phones: textList,
  website: text,
  features: textList,
  coordinates: coordinates.optional().default([]),
  photos: textList,
  mapsUrl: text,
  source: text,
  rating: z.number().nullable().optional().default(null),
  reviewCount: z.number().int().nonnegative().nullable().optional().default(null),
}).loose().transform((value): CatalogVenue => ({
  key: value.id,
  databaseId: value.databaseId,
  name: value.name,
  city: value.city,
  address: value.address,
  description: value.description,
  categories: value.categories,
  category: value.category,
  cuisine: value.cuisine,
  hours: value.hours,
  averageCheck: value.averageCheck,
  phones: value.phones,
  website: value.website,
  features: value.features,
  coordinates: value.coordinates,
  photos: value.photos,
  mapsUrl: value.mapsUrl,
  source: value.source,
  rating: value.rating,
  reviewCount: value.reviewCount,
}));

export const venueWireSchema = z.object({
  id: uuid,
  slug: text,
  title: z.string().min(1),
  city: text,
  category: text,
  cuisine: text,
  description: text,
  address: text,
  phone: text,
  website: text,
  hours: text,
  average_check: text,
  features: textList,
  photos: textList,
  source: text,
  status: z.enum(["draft", "published", "archived"]).optional().default("draft"),
  created_at: nullableText,
  updated_at: nullableText,
}).loose().transform((value): Venue => ({
  id: value.id,
  slug: value.slug,
  title: value.title,
  city: value.city,
  category: value.category,
  cuisine: value.cuisine,
  description: value.description,
  address: value.address,
  phone: value.phone,
  website: value.website,
  hours: value.hours,
  averageCheck: value.average_check,
  features: value.features,
  photos: value.photos,
  source: value.source,
  status: value.status,
  createdAt: value.created_at,
  updatedAt: value.updated_at,
}));

export const menuItemWireSchema = z.object({
  id: uuid,
  venue_id: uuid,
  section: text,
  title: z.string().min(1),
  description: text,
  price: z.number().nonnegative().nullable().optional().default(null),
  photo_url: text,
  is_available: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
}).loose().transform((value): MenuItem => ({
  id: value.id,
  venueId: value.venue_id,
  section: value.section,
  title: value.title,
  description: value.description,
  price: value.price,
  photoUrl: value.photo_url,
  isAvailable: value.is_available,
  sortOrder: value.sort_order,
}));

export const promotionWireSchema = z.object({
  id: uuid,
  venue_id: uuid,
  title: z.string().min(1),
  description: text,
  starts_at: nullableText,
  ends_at: nullableText,
  status: z.enum(["draft", "active", "archived"]).optional().default("draft"),
}).loose().transform((value): Promotion => ({
  id: value.id,
  venueId: value.venue_id,
  title: value.title,
  description: value.description,
  startsAt: value.starts_at,
  endsAt: value.ends_at,
  status: value.status,
}));

const reviewWireShape = {
  id: uuid,
  venue_id: nullableUuid,
  venue_title: text,
  author_name: text,
  rating: z.number().int().min(1).max(5),
  body: text,
  created_at: nullableText,
  moderation_note: text,
};

function normalizedReview(
  value: z.output<ReturnType<typeof z.object<typeof reviewWireShape>>> & {
    status: "pending" | "approved" | "rejected";
  },
): Review {
  return {
  id: value.id,
  venueId: value.venue_id,
  venueTitle: value.venue_title,
  authorName: value.author_name,
  rating: value.rating,
  body: value.body,
  status: value.status,
  createdAt: value.created_at,
  moderationNote: value.moderation_note,
  };
}

export const publishedReviewWireSchema = z.object({
  ...reviewWireShape,
  status: z.literal("approved").optional().default("approved"),
}).loose().transform(normalizedReview);

export const moderationReviewWireSchema = z.object({
  ...reviewWireShape,
  status: z.enum(["pending", "approved", "rejected"]),
}).loose().transform(normalizedReview);

export const submissionWireSchema = z.object({
  id: uuid,
  title: z.string().min(1),
  city: text,
  category: text,
  cuisine: text,
  description: text,
  address: text,
  phone: text,
  website: text,
  hours: text,
  average_check: text,
  features: textList,
  photos: textList,
  contact_name: text,
  contact_email: text,
  status: z.enum(["pending", "approved", "rejected"]),
  created_at: nullableText,
  moderation_note: text,
}).loose().transform((value): VenueSubmission => ({
  id: value.id,
  title: value.title,
  city: value.city,
  category: value.category,
  cuisine: value.cuisine,
  description: value.description,
  address: value.address,
  phone: value.phone,
  website: value.website,
  hours: value.hours,
  averageCheck: value.average_check,
  features: value.features,
  photos: value.photos,
  contactName: value.contact_name,
  contactEmail: value.contact_email,
  status: value.status,
  createdAt: value.created_at,
  moderationNote: value.moderation_note,
}));

export const membershipWireSchema = z.object({
  id: text,
  user_id: uuid,
  venue_id: uuid,
  membership_role: z.enum(["owner", "manager", "content_editor", "analyst"]),
}).loose().transform((value): Membership => ({
  id: value.id || `${value.user_id}:${value.venue_id}`,
  userId: value.user_id,
  venueId: value.venue_id,
  role: value.membership_role,
}));

export const adminDashboardWireSchema = z.object({
  stats: z.object({
    venues: z.number().int().nonnegative(),
    pendingVenues: z.number().int().nonnegative(),
    pendingReviews: z.number().int().nonnegative(),
    merchants: z.number().int().nonnegative(),
    cities: z.number().int().nonnegative(),
  }).loose(),
  venues: z.array(venueWireSchema),
  submissions: z.array(submissionWireSchema),
  reviews: z.array(moderationReviewWireSchema),
  databaseConfigured: z.boolean(),
}).loose().transform((value): AdminDashboard => value);

const merchantMembershipWireSchema = z.object({
  id: text,
  user_id: uuid.optional(),
  venue_id: uuid,
  membership_role: z.enum(["owner", "manager", "content_editor", "analyst"]),
  venue: venueWireSchema.nullable().optional().default(null),
}).loose();

export const merchantAccountWireSchema = z.object({
  id: uuid.optional(),
  user_id: uuid.optional(),
  display_name: text,
  username: text,
  email: text,
  status: z.enum(["invited", "active", "suspended"]),
  created_at: nullableText,
  last_login_at: nullableText,
  last_sign_in_at: nullableText,
  memberships: z.array(merchantMembershipWireSchema).optional().default([]),
}).loose().refine((value) => Boolean(value.id || value.user_id), {
  message: "Merchant id is required",
}).transform((value): MerchantAccount => {
  const id = value.id ?? value.user_id ?? "";
  return {
    id,
    displayName: value.display_name,
    username: value.username,
    email: value.email,
    status: value.status,
    createdAt: value.created_at,
    lastLoginAt: value.last_login_at ?? value.last_sign_in_at,
    memberships: value.memberships.map((membership) => ({
      id: membership.id || `${id}:${membership.venue_id}`,
      userId: membership.user_id ?? id,
      venueId: membership.venue_id,
      role: membership.membership_role,
      venue: membership.venue,
    })),
  };
});
