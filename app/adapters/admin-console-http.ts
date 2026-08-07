import { z } from "zod";

import type { HttpClient } from "./http";
import {
  adminDashboardWireSchema,
  merchantAccountWireSchema,
  venueWireSchema,
} from "./wire-schemas";
import { ApplicationError, isApplicationError } from "../lib/application-error";
import {
  normalizeAdminVenueDraft,
  normalizeCreateMerchant,
  normalizeModerationCommand,
  normalizeMerchantStatus,
  normalizeResetPassword,
  normalizeUpdateMerchant,
} from "../lib/admin-normalization";
import { requireUuid } from "../lib/identifiers";
import type {
  AdminConsole,
  AdminCommand,
  AdminCommandResult,
  AdminSignInCommand,
  CreateMerchantCommand,
  ModerationCommand,
  SaveAdminVenueCommand,
  UpdateMerchantCommand,
} from "../modules/admin-console";

const adminUserSchema = z.object({
  login: z.string().min(1),
  role: z.literal("admin"),
}).loose();
const sessionResponseSchema = z.object({
  authenticated: z.literal(true),
  user: adminUserSchema,
}).loose();
const userResponseSchema = z.object({ user: adminUserSchema }).loose();
const okResponseSchema = z.object({ ok: z.literal(true) }).loose();
const moderationResponseSchema = z.object({ result: z.unknown() }).loose();
const venueResponseSchema = z.object({ venue: venueWireSchema.nullable() }).loose();
const merchantListResponseSchema = z.object({
  merchants: z.array(merchantAccountWireSchema),
}).loose();
const createdMerchantResponseSchema = z.object({
  merchant: merchantAccountWireSchema,
  credentials: z.object({
    login: z.string().min(1),
    password: z.string().min(1),
  }).loose(),
}).loose();
const resetPasswordResponseSchema = z.object({
  credentials: z.object({ password: z.string().min(1) }).loose(),
  warning: z.literal("PASSWORD_RESET_METADATA_PENDING").optional(),
}).loose();

function adminVenueBody(command: SaveAdminVenueCommand) {
  const draft = normalizeAdminVenueDraft(command.draft);
  return {
    ...(command.kind === "update" ? { id: requireUuid(command.id, "Venue id") } : {}),
    slug: draft.slug,
    title: draft.title,
    city: draft.city,
    category: draft.category,
    cuisine: draft.cuisine,
    description: draft.description,
    address: draft.address,
    phone: draft.phone,
    website: draft.website,
    hours: draft.hours,
    averageCheck: draft.averageCheck,
    features: [...draft.features],
    photos: [...draft.photos],
    source: draft.source,
    status: draft.status,
  };
}

class HttpAdminConsole implements AdminConsole {
  constructor(private readonly http: HttpClient) {}

  async currentSession() {
    try {
      const response = await this.http.request({
        path: "/api/admin/session",
        schema: sessionResponseSchema,
      });
      return { status: "authenticated" as const, user: response.user };
    } catch (error) {
      if (isApplicationError(error) && error.kind === "unauthorized") {
        return { status: "anonymous" as const };
      }
      throw error;
    }
  }

  async signIn(command: AdminSignInCommand) {
    const response = await this.http.request({
      method: "POST",
      path: "/api/admin/login",
      body: { login: command.login, password: command.password },
      schema: userResponseSchema,
    });
    return response.user;
  }

  async signOut() {
    await this.http.request({
      method: "POST",
      path: "/api/admin/logout",
      schema: okResponseSchema,
    });
  }

  async load() {
    const overview = await this.http.request({
      path: "/api/admin/dashboard",
      schema: adminDashboardWireSchema,
    });
    try {
      const response = await this.http.request({
        path: "/api/admin/merchants",
        schema: merchantListResponseSchema,
      });
      return {
        overview,
        merchants: { status: "ready" as const, items: response.merchants },
      };
    } catch (error) {
      if (isApplicationError(error)
        && !["unavailable", "unknown", "rate-limited"].includes(error.kind)) {
        throw error;
      }
      const applicationError = isApplicationError(error)
        ? error
        : new ApplicationError("unknown", "Merchant list failed", { cause: error });
      return {
        overview,
        merchants: { status: "unavailable" as const, error: applicationError },
      };
    }
  }

  async execute(command: AdminCommand): Promise<AdminCommandResult> {
    switch (command.type) {
      case "moderate":
        await this.moderate(command.command);
        return { type: "completed" };
      case "venue.save":
        return { type: "venue.saved", venue: await this.saveVenue(command.command) };
      case "venue.delete":
        await this.deleteVenue(command.id);
        return { type: "completed" };
      case "merchant.create":
        return { type: "merchant.created", value: await this.createMerchant(command.command) };
      case "merchant.update":
        await this.updateMerchant(command.command);
        return { type: "completed" };
      case "merchant.status":
        await this.setMerchantStatus(command.userId, command.status);
        return { type: "completed" };
      case "merchant.password.reset":
        return {
          type: "merchant.password.reset",
          ...await this.resetMerchantPassword(command.userId, command.password),
        };
    }
  }

  private async moderate(command: ModerationCommand) {
    const normalized = normalizeModerationCommand(command);
    await this.http.request({
      method: "PATCH",
      path: normalized.target === "submission"
        ? "/api/admin/submissions"
        : "/api/admin/reviews",
      body: {
        id: normalized.id,
        decision: normalized.decision,
        note: normalized.note ?? "",
      },
      schema: moderationResponseSchema,
    });
  }

  private async saveVenue(command: SaveAdminVenueCommand) {
    const response = await this.http.request({
      method: command.kind === "create" ? "POST" : "PATCH",
      path: "/api/admin/venues",
      body: adminVenueBody(command),
      schema: venueResponseSchema,
    });
    if (!response.venue) {
      if (command.kind === "update") {
        throw new ApplicationError("not-found", "Venue was not found", { status: 404 });
      }
      throw new ApplicationError("unknown", "Venue creation returned no venue");
    }
    return response.venue;
  }

  private async deleteVenue(id: string) {
    await this.http.request({
      method: "DELETE",
      path: "/api/admin/venues",
      body: { id: requireUuid(id, "Venue id") },
      schema: okResponseSchema,
    });
  }

  private async createMerchant(command: CreateMerchantCommand) {
    const normalized = normalizeCreateMerchant(command);
    const response = await this.http.request({
      method: "POST",
      path: "/api/admin/merchants",
      body: normalized,
      schema: createdMerchantResponseSchema,
    });
    return {
      merchantId: response.merchant.id,
      credentials: response.credentials,
    };
  }

  private async updateMerchant(command: UpdateMerchantCommand) {
    const normalized = normalizeUpdateMerchant(command);
    await this.http.request({
      method: "PATCH",
      path: "/api/admin/merchants",
      body: {
        userId: normalized.userId,
        ...(normalized.displayName === undefined ? {} : { displayName: normalized.displayName }),
        ...(normalized.assignments === undefined
          ? {}
          : {
              venueIds: normalized.assignments.venueIds,
              membershipRole: normalized.assignments.membershipRole,
            }),
      },
      schema: okResponseSchema,
    });
  }

  private async setMerchantStatus(userId: string, status: "active" | "suspended") {
    await this.http.request({
      method: "PATCH",
      path: "/api/admin/merchants",
      body: {
        userId: requireUuid(userId, "Merchant id"),
        status: normalizeMerchantStatus(status),
      },
      schema: okResponseSchema,
    });
  }

  private async resetMerchantPassword(userId: string, password?: string) {
    const normalizedPassword = normalizeResetPassword(password);
    const response = await this.http.request({
      method: "PATCH",
      path: "/api/admin/merchants",
      body: {
        userId: requireUuid(userId, "Merchant id"),
        action: "reset-password",
        ...(normalizedPassword === undefined ? {} : { password: normalizedPassword }),
      },
      schema: resetPasswordResponseSchema,
    });
    return {
      credentials: response.credentials,
      ...(response.warning ? { warning: response.warning } : {}),
    };
  }
}

export function createHttpAdminConsole(http: HttpClient): AdminConsole {
  return new HttpAdminConsole(http);
}
