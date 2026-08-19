import { validationError } from "./application-error";
import { normalizeEmail } from "./auth-normalization";
import { isEnumValue, isUnknownArray, sanitizeText } from "./input-normalization";
import { normalizeUuid } from "./identifiers";
import type {
  ReviewSubmissionDraft,
  SubmissionImage,
  VenueSubmissionDraft,
} from "../modules/submissions";

const maxImageBytes = 6 * 1024 * 1024;
const imageTypes = ["image/jpeg", "image/png", "image/webp"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasImageSignature(image: SubmissionImage) {
  const bytes = image.bytes;
  if (image.type === "image/jpeg") {
    return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (image.type === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length > signature.length && signature.every((value, index) => bytes[index] === value);
  }
  return bytes.length > 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

export function normalizeSubmissionImages(images: readonly SubmissionImage[] = []) {
  const rawImages: unknown = images;
  if (!isUnknownArray(rawImages) || rawImages.length > 6) {
    throw validationError("A venue submission accepts at most six images");
  }
  return rawImages.map((rawImage) => {
    if (!isRecord(rawImage)) {
      throw validationError("Image name, MIME type or bytes are invalid");
    }
    const { name: rawName, type, bytes } = rawImage;
    if (typeof rawName !== "string"
      || !isEnumValue(type, imageTypes)
      || !(bytes instanceof Uint8Array)) {
      throw validationError("Image name, MIME type or bytes are invalid");
    }
    const image: SubmissionImage = { name: rawName, type, bytes };
    const name = sanitizeText(image.name, 80);
    if (!name || image.bytes.byteLength === 0 || image.bytes.byteLength > maxImageBytes || !hasImageSignature(image)) {
      throw validationError("Image name, size or signature is invalid");
    }
    return {
      name,
      type: image.type,
      bytes: new Uint8Array(image.bytes),
    } satisfies SubmissionImage;
  });
}

export function normalizeVenueSubmissionDraft(draft: VenueSubmissionDraft): VenueSubmissionDraft {
  const title = sanitizeText(draft.title, 160);
  const city = sanitizeText(draft.city, 80);
  const category = sanitizeText(draft.category, 100);
  const description = sanitizeText(draft.description, 2000);
  if (!title || !city || !category || !description) {
    throw validationError("Venue title, city, category and description are required");
  }
  const website = sanitizeText(draft.website ?? "", 300);
  const contactEmail = draft.contactEmail === undefined || draft.contactEmail.trim() === ""
    ? undefined
    : normalizeEmail(draft.contactEmail);
  if (draft.contactEmail !== undefined && draft.contactEmail.trim() !== "" && !contactEmail) {
    throw validationError("Contact email is invalid");
  }
  return {
    ...(contactEmail === undefined ? {} : { contactEmail }),
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
    images: normalizeSubmissionImages(draft.images),
  };
}

export function normalizeReviewSubmissionDraft(draft: ReviewSubmissionDraft): ReviewSubmissionDraft {
  if (!Number.isInteger(draft.rating) || draft.rating < 1 || draft.rating > 5) {
    throw validationError("Review rating must be between one and five");
  }
  const venueTitle = sanitizeText(draft.venueTitle, 160);
  const review = sanitizeText(draft.review, 3000);
  if (!venueTitle || review.length < 20) {
    throw validationError("Review text must contain at least twenty characters");
  }
  return {
    venueId: normalizeUuid(draft.venueId),
    externalVenueId: sanitizeText(draft.externalVenueId ?? "", 160) || null,
    venueTitle,
    authorName: sanitizeText(draft.authorName ?? "", 120),
    rating: draft.rating,
    review,
  };
}
