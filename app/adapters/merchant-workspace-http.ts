import { z } from "zod";

import type { HttpClient } from "./http";
import {
  membershipWireSchema,
  menuItemWireSchema,
  promotionWireSchema,
  publishedReviewWireSchema,
  userWireSchema,
  venueWireSchema,
} from "./wire-schemas";
import type {
  MerchantWorkspace,
  MerchantCommand,
  MerchantCommandResult,
  MenuItemDraft,
  PromotionDraft,
  SaveMenuItemCommand,
  SavePromotionCommand,
  VenuePatch,
} from "../modules/merchant-workspace";
import {
  normalizeMenuItemDraft,
  normalizePromotionDraft,
  normalizeVenuePatch,
} from "../lib/merchant-normalization";
import { requireUuid } from "../lib/identifiers";

const dashboardResponseSchema = z.object({
  user: userWireSchema,
  venues: z.array(venueWireSchema),
  memberships: z.array(membershipWireSchema),
  menu: z.array(menuItemWireSchema),
  promotions: z.array(promotionWireSchema),
  reviews: z.array(publishedReviewWireSchema),
  stats: z.object({
    venues: z.number().int().nonnegative(),
    menuItems: z.number().int().nonnegative(),
    activePromotions: z.number().int().nonnegative(),
    reviews: z.number().int().nonnegative(),
  }).loose(),
}).loose();

const venueResponseSchema = z.object({ venue: venueWireSchema }).loose();
const menuItemResponseSchema = z.object({ item: menuItemWireSchema }).loose();
const promotionResponseSchema = z.object({ promotion: promotionWireSchema }).loose();
const okResponseSchema = z.object({ ok: z.literal(true) }).loose();

function menuBody(draft: MenuItemDraft) {
  return normalizeMenuItemDraft(draft);
}

function promotionBody(draft: PromotionDraft) {
  return normalizePromotionDraft(draft);
}

class HttpMerchantWorkspace implements MerchantWorkspace {
  constructor(private readonly http: HttpClient) {}

  async load() {
    const response = await this.http.request({
      path: "/api/merchant/dashboard",
      schema: dashboardResponseSchema,
    });
    return {
      user: response.user,
      venues: response.venues,
      memberships: response.memberships,
      menuItems: response.menu,
      promotions: response.promotions,
      reviews: response.reviews,
      stats: response.stats,
    };
  }

  async execute(command: MerchantCommand): Promise<MerchantCommandResult> {
    switch (command.type) {
      case "venue.update":
        return { type: "venue.updated", venue: await this.updateVenue(command.venueId, command.patch) };
      case "menu.save":
        return { type: "menu.saved", item: await this.saveMenuItem(command.command) };
      case "menu.delete":
        await this.deleteMenuItem(command.id);
        return { type: "completed" };
      case "promotion.save":
        return { type: "promotion.saved", promotion: await this.savePromotion(command.command) };
      case "promotion.delete":
        await this.deletePromotion(command.id);
        return { type: "completed" };
    }
  }

  private async updateVenue(venueId: string, patch: VenuePatch) {
    const normalized = normalizeVenuePatch(patch);
    const response = await this.http.request({
      method: "PATCH",
      path: "/api/merchant/venue",
      body: {
        id: requireUuid(venueId, "Venue id"),
        ...normalized,
      },
      schema: venueResponseSchema,
    });
    return response.venue;
  }

  private async saveMenuItem(command: SaveMenuItemCommand) {
    const response = await this.http.request({
      method: command.kind === "create" ? "POST" : "PATCH",
      path: "/api/merchant/menu",
      body: {
        ...(command.kind === "create"
          ? { venueId: requireUuid(command.venueId, "Venue id") }
          : { id: requireUuid(command.id, "Menu item id") }),
        ...menuBody(command.draft),
      },
      schema: menuItemResponseSchema,
    });
    return response.item;
  }

  private async deleteMenuItem(id: string) {
    await this.http.request({
      method: "DELETE",
      path: "/api/merchant/menu",
      body: { id: requireUuid(id, "Menu item id") },
      schema: okResponseSchema,
    });
  }

  private async savePromotion(command: SavePromotionCommand) {
    const response = await this.http.request({
      method: command.kind === "create" ? "POST" : "PATCH",
      path: "/api/merchant/promotions",
      body: {
        ...(command.kind === "create"
          ? { venueId: requireUuid(command.venueId, "Venue id") }
          : { id: requireUuid(command.id, "Promotion id") }),
        ...promotionBody(command.draft),
      },
      schema: promotionResponseSchema,
    });
    return response.promotion;
  }

  private async deletePromotion(id: string) {
    await this.http.request({
      method: "DELETE",
      path: "/api/merchant/promotions",
      body: { id: requireUuid(id, "Promotion id") },
      schema: okResponseSchema,
    });
  }
}

export function createHttpMerchantWorkspace(http: HttpClient): MerchantWorkspace {
  return new HttpMerchantWorkspace(http);
}
