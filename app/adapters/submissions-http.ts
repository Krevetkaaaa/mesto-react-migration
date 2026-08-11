import { z } from "zod";

import type { HttpClient } from "./http";
import { ApplicationError } from "../lib/application-error";
import type {
  ReviewSubmissionDraft,
  SubmissionImage,
  Submissions,
  VenueSubmissionDraft,
} from "../modules/submissions";
import {
  normalizeReviewSubmissionDraft,
  normalizeVenueSubmissionDraft,
} from "../lib/submission-normalization";
import { UUID_PATTERN } from "../lib/identifiers";

const mediaIdSchema = z.string().regex(UUID_PATTERN, "Expected UUID");
const signResponseSchema = z.object({
  mediaId: mediaIdSchema,
  uploadUrl: z.url(),
  expiresAt: z.iso.datetime(),
  maxBytes: z.number().int().positive(),
}).loose();
const finalizeResponseSchema = z.object({
  media: z.object({ id: mediaIdSchema, status: z.literal("processed") }).loose(),
}).loose();
const releaseResponseSchema = z.object({ released: z.array(mediaIdSchema) }).loose();
const receiptSchema = z.object({
  id: mediaIdSchema,
  status: z.literal("pending"),
}).loose();
const venueResponseSchema = z.object({ submission: receiptSchema }).loose();
const reviewResponseSchema = z.object({ review: receiptSchema }).loose();

async function uploadSubmissionImage(
  http: HttpClient,
  command: SubmissionImage,
  onSigned: (mediaId: string) => void,
) {
  const signed = await http.request({
    method: "POST",
    path: "/api/uploads/sign",
    body: { name: command.name, type: command.type, size: command.bytes.byteLength },
    schema: signResponseSchema,
  });
  onSigned(signed.mediaId);
  if (command.bytes.byteLength > signed.maxBytes) {
    throw new ApplicationError("validation", "Image exceeds the server upload limit", {
      code: "MEDIA_TOO_LARGE",
    });
  }

  await http.uploadSigned({
    url: signed.uploadUrl,
    bytes: command.bytes,
    contentType: command.type,
  });

  const finalized = await http.request({
    method: "POST",
    path: "/api/uploads/finalize",
    body: { mediaId: signed.mediaId },
    schema: finalizeResponseSchema,
  });
  return finalized.media.id;
}

class HttpSubmissions implements Submissions {
  constructor(
    private readonly http: HttpClient,
  ) {}

  private async release(mediaIds: readonly string[]) {
    if (!mediaIds.length) return;
    await this.http.request({
      method: "POST",
      path: "/api/uploads/release",
      body: { mediaIds },
      schema: releaseResponseSchema,
    }).catch(() => undefined);
  }

  async submitVenue(draft: VenueSubmissionDraft) {
    const normalized = normalizeVenueSubmissionDraft(draft);
    const mediaIds: string[] = [];
    try {
      for (const image of normalized.images ?? []) {
        await uploadSubmissionImage(
          this.http,
          image,
          (mediaId) => mediaIds.push(mediaId),
        );
      }
      const response = await this.http.request({
        method: "POST",
        path: "/api/submissions",
        body: {
          contactEmail: normalized.contactEmail ?? "",
          title: normalized.title,
          city: normalized.city,
          category: normalized.category,
          cuisine: normalized.cuisine ?? "",
          description: normalized.description,
          address: normalized.address ?? "",
          phone: normalized.phone ?? "",
          website: normalized.website ?? "",
          hours: normalized.hours ?? "",
          averageCheck: normalized.averageCheck ?? "",
          features: [...(normalized.features ?? [])],
          mediaIds,
        },
        schema: venueResponseSchema,
      });
      return response.submission;
    } catch (error) {
      await this.release(mediaIds);
      throw error;
    }
  }

  async submitReview(draft: ReviewSubmissionDraft) {
    const normalized = normalizeReviewSubmissionDraft(draft);
    const response = await this.http.request({
      method: "POST",
      path: "/api/reviews",
      body: {
        venueId: normalized.venueId ?? null,
        externalVenueId: normalized.externalVenueId ?? null,
        venueTitle: normalized.venueTitle,
        authorName: normalized.authorName ?? "",
        rating: normalized.rating,
        review: normalized.review,
      },
      schema: reviewResponseSchema,
    });
    return response.review;
  }
}

export function createHttpSubmissions(http: HttpClient): Submissions {
  return new HttpSubmissions(http);
}
