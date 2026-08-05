import { ApplicationError } from "../lib/application-error";
import { ControllableFake, cloneValue } from "../lib/controllable-fake";
import type {
  AdminDashboard,
  AdminUser,
  MembershipRole,
  MerchantAccount,
  OneTimeCredentials,
  Venue,
} from "../lib/domain";
import { requireUuid } from "../lib/identifiers";
import {
  normalizeAdminVenueDraft,
  normalizeCreateMerchant,
  normalizeModerationCommand,
  normalizeMerchantStatus,
  normalizeResetPassword,
  normalizeUpdateMerchant,
} from "../lib/admin-normalization";

export type AdminSessionState =
  | { status: "anonymous" }
  | { status: "authenticated"; user: AdminUser };

export interface AdminSignInCommand {
  login: string;
  password: string;
}

export interface AdminVenueDraft {
  slug?: string;
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
  photos?: readonly string[];
  source?: "editorial" | "community" | "merchant";
  status?: "draft" | "published" | "archived";
}

export type SaveAdminVenueCommand =
  | { kind: "create"; draft: AdminVenueDraft }
  | { kind: "update"; id: string; draft: AdminVenueDraft };

export interface ModerationCommand {
  target: "submission" | "review";
  id: string;
  decision: "approved" | "rejected";
  note?: string;
}

export interface CreateMerchantCommand {
  displayName: string;
  username: string;
  email?: string;
  password?: string;
  venueIds: readonly string[];
  membershipRole: MembershipRole;
}

export interface UpdateMerchantCommand {
  userId: string;
  displayName?: string;
  assignments?: {
    venueIds: readonly string[];
    membershipRole: MembershipRole;
  };
}

export interface CreatedMerchant {
  merchantId: string;
  credentials: OneTimeCredentials;
}

export type AdminMerchantsState =
  | { status: "ready"; items: readonly MerchantAccount[] }
  | { status: "unavailable"; error: ApplicationError };

export interface AdminWorkspaceSnapshot {
  overview: AdminDashboard;
  merchants: AdminMerchantsState;
}

export type AdminCommand =
  | { type: "moderate"; command: ModerationCommand }
  | { type: "venue.save"; command: SaveAdminVenueCommand }
  | { type: "venue.delete"; id: string }
  | { type: "merchant.create"; command: CreateMerchantCommand }
  | { type: "merchant.update"; command: UpdateMerchantCommand }
  | { type: "merchant.status"; userId: string; status: "active" | "suspended" }
  | { type: "merchant.password.reset"; userId: string; password?: string };

export type AdminCommandResult =
  | { type: "completed" }
  | { type: "venue.saved"; venue: Venue }
  | { type: "merchant.created"; value: CreatedMerchant }
  | { type: "merchant.password.reset"; credentials: OneTimeCredentials };

export interface AdminConsole {
  currentSession(): Promise<AdminSessionState>;
  signIn(command: AdminSignInCommand): Promise<AdminUser>;
  signOut(): Promise<void>;
  load(): Promise<AdminWorkspaceSnapshot>;
  execute(command: AdminCommand): Promise<AdminCommandResult>;
}

export interface FakeAdminConsoleOptions {
  login?: string;
  password?: string;
  authenticated?: boolean;
  dashboard: AdminDashboard;
  merchants?: readonly MerchantAccount[];
  merchantsFailure?: ApplicationError;
  now?: () => string;
}

function fakeUuid(namespace: string, value: number) {
  return `${namespace}-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

export class FakeAdminConsole extends ControllableFake implements AdminConsole {
  private readonly login: string;
  private password: string;
  private session: AdminUser | undefined;
  private readonly dashboardState: AdminDashboard;
  private readonly merchantState: MerchantAccount[];
  private readonly now: () => string;
  private nextVenue = 1;
  private nextMerchant = 1;
  private nextPassword = 1;
  private merchantsFailure: ApplicationError | undefined;

  constructor(options: FakeAdminConsoleOptions) {
    super();
    this.login = options.login ?? "editor";
    this.password = options.password ?? "AdminPass123";
    this.session = options.authenticated ? { login: this.login, role: "admin" } : undefined;
    this.dashboardState = cloneValue(options.dashboard);
    this.merchantState = cloneValue([...(options.merchants ?? [])]);
    this.merchantsFailure = options.merchantsFailure;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  failNextMerchants(error: ApplicationError) {
    this.merchantsFailure = error;
  }

  private requireSession() {
    if (!this.session) {
      throw new ApplicationError("unauthorized", "Administrator authentication is required", { status: 401 });
    }
    return this.session;
  }

  private newVenueId(namespace: string) {
    let id: string;
    do {
      id = fakeUuid(namespace, this.nextVenue++);
    } while (this.dashboardState.venues.some((venue) => venue.id === id));
    return id;
  }

  private newMerchantId() {
    let id: string;
    do {
      id = fakeUuid("20000000", this.nextMerchant++);
    } while (this.merchantState.some((merchant) => merchant.id === id));
    return id;
  }

  private currentDashboard() {
    const published = this.dashboardState.venues.filter((venue) => venue.status === "published");
    return cloneValue({
      ...this.dashboardState,
      stats: {
        venues: published.length,
        pendingVenues: this.dashboardState.submissions.filter((item) => item.status === "pending").length,
        pendingReviews: this.dashboardState.reviews.filter((item) => item.status === "pending").length,
        merchants: this.merchantState.length,
        cities: new Set(published.map((venue) => venue.city).filter(Boolean)).size,
      },
    });
  }

  async currentSession(): Promise<AdminSessionState> {
    await this.throwPlannedFailure();
    return this.session
      ? { status: "authenticated", user: cloneValue(this.session) }
      : { status: "anonymous" };
  }

  async signIn(command: AdminSignInCommand) {
    await this.throwPlannedFailure();
    if (command.login !== this.login || command.password !== this.password) {
      throw new ApplicationError("unauthorized", "Invalid administrator credentials", { status: 401 });
    }
    this.session = { login: this.login, role: "admin" };
    return cloneValue(this.session);
  }

  async signOut() {
    await this.throwPlannedFailure();
    this.session = undefined;
  }

  async load(): Promise<AdminWorkspaceSnapshot> {
    await this.throwPlannedFailure();
    this.requireSession();
    const overview = this.currentDashboard();
    const merchantsError = this.merchantsFailure;
    this.merchantsFailure = undefined;
    if (merchantsError
      && !["unavailable", "unknown", "rate-limited"].includes(merchantsError.kind)) {
      throw merchantsError;
    }
    return {
      overview,
      merchants: merchantsError
        ? { status: "unavailable", error: merchantsError }
        : { status: "ready", items: cloneValue(this.merchantState) },
    };
  }

  async execute(command: AdminCommand): Promise<AdminCommandResult> {
    await this.throwPlannedFailure();
    this.requireSession();
    switch (command.type) {
      case "moderate":
        this.moderate(command.command);
        return { type: "completed" };
      case "venue.save":
        return { type: "venue.saved", venue: this.saveVenue(command.command) };
      case "venue.delete":
        this.deleteVenue(command.id);
        return { type: "completed" };
      case "merchant.create":
        return { type: "merchant.created", value: this.createMerchant(command.command) };
      case "merchant.update":
        this.updateMerchant(command.command);
        return { type: "completed" };
      case "merchant.status":
        this.setMerchantStatus(command.userId, command.status);
        return { type: "completed" };
      case "merchant.password.reset":
        return {
          type: "merchant.password.reset",
          credentials: this.resetMerchantPassword(command.userId, command.password),
        };
    }
  }

  private moderate(command: ModerationCommand) {
    const normalized = normalizeModerationCommand(command);
    const items = normalized.target === "submission"
      ? this.dashboardState.submissions
      : this.dashboardState.reviews;
    const item = items.find((candidate) => candidate.id === normalized.id);
    if (!item) throw new ApplicationError("validation", "Moderation item was not found", { status: 400 });
    if (item.status !== "pending") {
      throw new ApplicationError("validation", "Moderation item was already processed", { status: 400 });
    }
    item.status = normalized.decision;
    item.moderationNote = normalized.note ?? "";

    if (normalized.target === "submission" && normalized.decision === "approved") {
      const submission = item as (typeof this.dashboardState.submissions)[number];
      const venue: Venue = {
        id: this.newVenueId("30000000"),
        slug: `${submission.title.toLocaleLowerCase("ru-RU").replace(/[^a-zа-яё0-9]+/giu, "-").replace(/^-|-$/g, "")}-${submission.id.slice(0, 8)}`,
        title: submission.title,
        city: submission.city,
        category: submission.category,
        cuisine: submission.cuisine,
        description: submission.description,
        address: submission.address,
        phone: submission.phone,
        website: submission.website,
        hours: submission.hours,
        averageCheck: submission.averageCheck,
        features: [...submission.features],
        photos: [...submission.photos],
        source: "community",
        status: "published",
        createdAt: this.now(),
        updatedAt: this.now(),
      };
      (this.dashboardState.venues as Venue[]).push(venue);
    }
  }

  private saveVenue(command: SaveAdminVenueCommand) {
    const draft = normalizeAdminVenueDraft(command.draft);
    const venues = this.dashboardState.venues as Venue[];
    if (command.kind === "update") {
      const id = requireUuid(command.id, "Venue id");
      const index = venues.findIndex((venue) => venue.id === id);
      if (index === -1) throw new ApplicationError("not-found", "Venue was not found", { status: 404 });
      const updated: Venue = {
        ...venues[index]!,
        ...draft,
        id,
        updatedAt: this.now(),
      };
      venues[index] = updated;
      return cloneValue(updated);
    }
    const venue: Venue = {
      ...draft,
      id: this.newVenueId("31000000"),
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    venues.push(venue);
    return cloneValue(venue);
  }

  private deleteVenue(id: string) {
    const venueId = requireUuid(id, "Venue id");
    const venues = this.dashboardState.venues as Venue[];
    const index = venues.findIndex((venue) => venue.id === venueId);
    if (index === -1) return;
    venues.splice(index, 1);
    for (const merchant of this.merchantState) {
      merchant.memberships = merchant.memberships.filter((membership) => membership.venueId !== venueId);
    }
  }

  private createMerchant(command: CreateMerchantCommand) {
    const normalized = normalizeCreateMerchant(command);
    if (this.merchantState.some((merchant) => merchant.username === normalized.username || merchant.email === normalized.email)) {
      throw new ApplicationError("conflict", "Merchant account already exists", { status: 409 });
    }
    const assignedVenues = normalized.venueIds.map((venueId) => {
      const venue = this.dashboardState.venues.find((item) => item.id === venueId);
      if (!venue) throw new ApplicationError("validation", "Assigned venue was not found", { status: 400 });
      return venue;
    });
    const id = this.newMerchantId();
    const password = normalized.password || `FakePass${this.nextPassword++}9`;
    const merchant: MerchantAccount = {
      id,
      displayName: normalized.displayName,
      username: normalized.username,
      email: normalized.email,
      status: "active",
      createdAt: this.now(),
      lastLoginAt: null,
      memberships: normalized.venueIds.map((venueId, index) => {
        const venue = assignedVenues[index]!;
        return {
          id: `${id}:${venueId}`,
          userId: id,
          venueId,
          role: normalized.membershipRole,
          venue: cloneValue(venue),
        };
      }),
    };
    this.merchantState.push(merchant);
    return {
      merchantId: merchant.id,
      credentials: { login: merchant.username, password },
    };
  }

  private updateMerchant(command: UpdateMerchantCommand) {
    const normalized = normalizeUpdateMerchant(command);
    const merchant = this.merchantState.find((item) => item.id === normalized.userId);
    if (!merchant) throw new ApplicationError("not-found", "Merchant account was not found", { status: 404 });
    const nextMemberships = normalized.assignments?.venueIds.map((venueId) => {
      const venue = this.dashboardState.venues.find((item) => item.id === venueId);
      if (!venue) throw new ApplicationError("validation", "Assigned venue was not found", { status: 400 });
      return {
        id: `${merchant.id}:${venueId}`,
        userId: merchant.id,
        venueId,
        role: normalized.assignments?.membershipRole ?? "owner",
        venue: cloneValue(venue),
      };
    });
    if (normalized.displayName !== undefined) merchant.displayName = normalized.displayName;
    if (normalized.assignments) {
      merchant.memberships = nextMemberships ?? [];
    }
  }

  private setMerchantStatus(userId: string, status: "active" | "suspended") {
    const id = requireUuid(userId, "Merchant id");
    const merchant = this.merchantState.find((item) => item.id === id);
    if (!merchant) throw new ApplicationError("not-found", "Merchant account was not found", { status: 404 });
    merchant.status = normalizeMerchantStatus(status);
  }

  private resetMerchantPassword(userId: string, password?: string) {
    const id = requireUuid(userId, "Merchant id");
    if (!this.merchantState.some((item) => item.id === id)) {
      throw new ApplicationError("not-found", "Merchant account was not found", { status: 404 });
    }
    const normalizedPassword = normalizeResetPassword(password);
    const credentials = { password: normalizedPassword ?? `ResetPass${this.nextPassword++}9` };
    return credentials;
  }
}
