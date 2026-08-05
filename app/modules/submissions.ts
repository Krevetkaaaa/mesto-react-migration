import { ControllableFake, cloneValue } from "../lib/controllable-fake";
import {
  normalizeReviewSubmissionDraft,
  normalizeVenueSubmissionDraft,
} from "../lib/submission-normalization";

export interface SubmissionImage {
  name: string;
  type: "image/jpeg" | "image/png" | "image/webp";
  bytes: Uint8Array;
}

export interface VenueSubmissionDraft {
  contactEmail?: string;
  title: string;
  city: string;
  category: string;
  cuisine?: string;
  description: string;
  address?: string;
  phone?: string;
  website?: string;
  hours?: string;
  averageCheck?: string;
  features?: readonly string[];
  images?: readonly SubmissionImage[];
}

export interface ReviewSubmissionDraft {
  venueId?: string | null;
  externalVenueId?: string | null;
  venueTitle: string;
  authorName?: string;
  rating: number;
  review: string;
}

export interface SubmissionReceipt {
  id: string;
  status: "pending";
}

export interface Submissions {
  submitVenue(draft: VenueSubmissionDraft): Promise<SubmissionReceipt>;
  submitReview(draft: ReviewSubmissionDraft): Promise<SubmissionReceipt>;
}

export class FakeSubmissions extends ControllableFake implements Submissions {
  private readonly venues: Array<{ draft: VenueSubmissionDraft; receipt: SubmissionReceipt }> = [];
  private readonly reviews: Array<{ draft: ReviewSubmissionDraft; receipt: SubmissionReceipt }> = [];
  private nextVenue = 1;
  private nextReview = 1;

  venueSubmissions() {
    return cloneValue(this.venues);
  }

  reviewSubmissions() {
    return cloneValue(this.reviews);
  }

  async submitVenue(draft: VenueSubmissionDraft) {
    await this.throwPlannedFailure();
    const normalized = normalizeVenueSubmissionDraft(draft);
    const receipt: SubmissionReceipt = {
      id: `80000000-0000-4000-8000-${String(this.nextVenue++).padStart(12, "0")}`,
      status: "pending",
    };
    this.venues.push({ draft: cloneValue(normalized), receipt });
    return cloneValue(receipt);
  }

  async submitReview(draft: ReviewSubmissionDraft) {
    await this.throwPlannedFailure();
    const normalized = normalizeReviewSubmissionDraft(draft);
    const receipt: SubmissionReceipt = {
      id: `70000000-0000-4000-8000-${String(this.nextReview++).padStart(12, "0")}`,
      status: "pending",
    };
    this.reviews.push({ draft: cloneValue(normalized), receipt });
    return cloneValue(receipt);
  }
}
