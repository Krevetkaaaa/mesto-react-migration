import { z } from "zod";

import type { HttpClient } from "./http";
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

const uploadResponseSchema = z.object({ url: z.string().url() }).loose();
const receiptSchema = z.object({
  id: z.string().regex(UUID_PATTERN, "Expected UUID"),
  status: z.literal("pending"),
}).loose();
const venueResponseSchema = z.object({ submission: receiptSchema }).loose();
const reviewResponseSchema = z.object({ review: receiptSchema }).loose();

function base64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function uploadSubmissionImage(http: HttpClient, command: SubmissionImage) {
  const response = await http.request({
    method: "POST",
    path: "/api/uploads",
    body: {
      name: command.name,
      type: command.type,
      data: `data:${command.type};base64,${base64(command.bytes)}`,
    },
    schema: uploadResponseSchema,
  });
  return response.url;
}

class HttpSubmissions implements Submissions {
  constructor(private readonly http: HttpClient) {}

  async submitVenue(draft: VenueSubmissionDraft) {
    const normalized = normalizeVenueSubmissionDraft(draft);
    const photos: string[] = [];
    for (const image of normalized.images ?? []) {
      photos.push(await uploadSubmissionImage(this.http, image));
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
        photos,
      },
      schema: venueResponseSchema,
    });
    return response.submission;
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
