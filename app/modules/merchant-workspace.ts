import { ApplicationError } from "../lib/application-error";
import { ControllableFake, cloneValue } from "../lib/controllable-fake";
import type {
  MembershipRole,
  MenuItem,
  MerchantWorkspaceSnapshot,
  Promotion,
  Venue,
} from "../lib/domain";
import {
  normalizeMenuItemDraft,
  normalizePromotionDraft,
  normalizeVenuePatch,
} from "../lib/merchant-normalization";
import { requireUuid } from "../lib/identifiers";
import { requireEnumValue } from "../lib/input-normalization";

export interface VenuePatch {
  title?: string;
  category?: string;
  cuisine?: string;
  description?: string;
  address?: string;
  phone?: string;
  website?: string;
  hours?: string;
  averageCheck?: string;
  features?: readonly string[];
}

export interface MenuItemDraft {
  section?: string;
  title: string;
  description?: string;
  price?: number | null;
  photoUrl?: string;
  isAvailable?: boolean;
  sortOrder?: number;
}

export type SaveMenuItemCommand =
  | { kind: "create"; venueId: string; draft: MenuItemDraft }
  | { kind: "update"; id: string; draft: MenuItemDraft };

export interface PromotionDraft {
  title: string;
  description?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  status?: "draft" | "active" | "archived";
}

export type SavePromotionCommand =
  | { kind: "create"; venueId: string; draft: PromotionDraft }
  | { kind: "update"; id: string; draft: PromotionDraft };

export type MerchantCommand =
  | { type: "venue.update"; venueId: string; patch: VenuePatch }
  | { type: "menu.save"; command: SaveMenuItemCommand }
  | { type: "menu.delete"; id: string }
  | { type: "promotion.save"; command: SavePromotionCommand }
  | { type: "promotion.delete"; id: string };

export type MerchantCommandResult =
  | { type: "venue.updated"; venue: Venue }
  | { type: "menu.saved"; item: MenuItem }
  | { type: "promotion.saved"; promotion: Promotion }
  | { type: "completed" };

export interface MerchantWorkspace {
  load(): Promise<MerchantWorkspaceSnapshot>;
  execute(command: MerchantCommand): Promise<MerchantCommandResult>;
}

type Permission = "venue" | "menu" | "promotions" | "reviews" | "analytics";

const rolePermissions: Readonly<Record<MembershipRole, readonly Permission[]>> = {
  owner: ["venue", "menu", "promotions", "reviews", "analytics"],
  manager: ["venue", "menu", "promotions", "reviews", "analytics"],
  content_editor: ["venue", "menu", "promotions"],
  analyst: ["reviews", "analytics"],
};

function fakeUuid(namespace: string, value: number) {
  return `${namespace}-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

export class FakeMerchantWorkspace extends ControllableFake implements MerchantWorkspace {
  private readonly state: MerchantWorkspaceSnapshot;
  private nextMenuItem = 1;
  private nextPromotion = 1;

  constructor(seed: MerchantWorkspaceSnapshot) {
    super();
    this.state = cloneValue(seed);
  }

  private requireAccount() {
    if (this.state.user.status !== "active") {
      throw new ApplicationError("unauthorized", "Merchant session is inactive", { status: 401 });
    }
    if (this.state.user.role !== "merchant") {
      throw new ApplicationError("forbidden", "Merchant role is required", { status: 403 });
    }
  }

  private newMenuItemId() {
    let id: string;
    do {
      id = fakeUuid("50000000", this.nextMenuItem++);
    } while (this.state.menuItems.some((item) => item.id === id));
    return id;
  }

  private newPromotionId() {
    let id: string;
    do {
      id = fakeUuid("60000000", this.nextPromotion++);
    } while (this.state.promotions.some((item) => item.id === id));
    return id;
  }

  private requireVenue(venueId: string, permission: Permission) {
    this.requireAccount();
    const membership = this.state.memberships.find((item) => item.venueId === venueId);
    if (!membership) {
      throw new ApplicationError("forbidden", "Venue is not assigned to this account", { status: 403 });
    }
    const venue = this.state.venues.find((item) => item.id === venueId);
    if (!venue) throw new ApplicationError("not-found", "Assigned venue no longer exists", { status: 404 });
    const role = requireEnumValue(
      membership.role,
      ["owner", "manager", "content_editor", "analyst"],
      "Membership role",
    );
    if (!rolePermissions[role].includes(permission)) {
      throw new ApplicationError("forbidden", "Membership does not allow this action", { status: 403 });
    }
    return venue;
  }

  private snapshot() {
    const activePromotions = this.state.promotions.filter((item) => item.status === "active").length;
    return cloneValue({
      ...this.state,
      stats: {
        venues: this.state.venues.length,
        menuItems: this.state.menuItems.length,
        activePromotions,
        reviews: this.state.reviews.length,
      },
    });
  }

  async load() {
    await this.throwPlannedFailure();
    this.requireAccount();
    return this.snapshot();
  }

  async execute(command: MerchantCommand): Promise<MerchantCommandResult> {
    await this.throwPlannedFailure();
    if (this.state.user.mustChangePassword) {
      throw new ApplicationError("forbidden", "Password change is required", {
        status: 403,
        code: "PASSWORD_CHANGE_REQUIRED",
      });
    }
    switch (command.type) {
      case "venue.update":
        return { type: "venue.updated", venue: this.updateVenue(command.venueId, command.patch) };
      case "menu.save":
        return { type: "menu.saved", item: this.saveMenuItem(command.command) };
      case "menu.delete":
        this.deleteMenuItem(command.id);
        return { type: "completed" };
      case "promotion.save":
        return { type: "promotion.saved", promotion: this.savePromotion(command.command) };
      case "promotion.delete":
        this.deletePromotion(command.id);
        return { type: "completed" };
    }
  }

  private updateVenue(venueId: string, patch: VenuePatch) {
    const id = requireUuid(venueId, "Venue id");
    const venue = this.requireVenue(id, "venue");
    const normalized = normalizeVenuePatch(patch);
    const updated: Venue = {
      ...venue,
      ...cloneValue(normalized),
      features: normalized.features ? [...normalized.features] : venue.features,
      updatedAt: venue.updatedAt,
    };
    const index = this.state.venues.findIndex((item) => item.id === id);
    (this.state.venues as Venue[])[index] = updated;
    return cloneValue(updated);
  }

  private saveMenuItem(command: SaveMenuItemCommand) {
    const commandId = command.kind === "update"
      ? requireUuid(command.id, "Menu item id")
      : undefined;
    const existing = command.kind === "update"
      ? this.state.menuItems.find((item) => item.id === commandId)
      : undefined;
    if (command.kind === "update" && !existing) {
      throw new ApplicationError("not-found", "Menu item was not found", { status: 404 });
    }
    const venueId = command.kind === "create"
      ? requireUuid(command.venueId, "Venue id")
      : existing?.venueId ?? "";
    this.requireVenue(venueId, "menu");
    const draft = normalizeMenuItemDraft(command.draft);
    const item: MenuItem = {
      id: command.kind === "create"
        ? this.newMenuItemId()
        : commandId!,
      venueId,
      ...draft,
    };
    const items = this.state.menuItems as MenuItem[];
    const index = items.findIndex((candidate) => candidate.id === item.id);
    if (index === -1) items.push(item);
    else items[index] = item;
    return cloneValue(item);
  }

  private deleteMenuItem(id: string) {
    const menuItemId = requireUuid(id, "Menu item id");
    const items = this.state.menuItems as MenuItem[];
    const index = items.findIndex((item) => item.id === menuItemId);
    if (index === -1) throw new ApplicationError("not-found", "Menu item was not found", { status: 404 });
    this.requireVenue(items[index]?.venueId ?? "", "menu");
    items.splice(index, 1);
  }

  private savePromotion(command: SavePromotionCommand) {
    const commandId = command.kind === "update"
      ? requireUuid(command.id, "Promotion id")
      : undefined;
    const existing = command.kind === "update"
      ? this.state.promotions.find((item) => item.id === commandId)
      : undefined;
    if (command.kind === "update" && !existing) {
      throw new ApplicationError("not-found", "Promotion was not found", { status: 404 });
    }
    const venueId = command.kind === "create"
      ? requireUuid(command.venueId, "Venue id")
      : existing?.venueId ?? "";
    this.requireVenue(venueId, "promotions");
    const draft = normalizePromotionDraft(command.draft);
    const promotion: Promotion = {
      id: command.kind === "create"
        ? this.newPromotionId()
        : commandId!,
      venueId,
      ...draft,
    };
    const promotions = this.state.promotions as Promotion[];
    const index = promotions.findIndex((candidate) => candidate.id === promotion.id);
    if (index === -1) promotions.push(promotion);
    else promotions[index] = promotion;
    return cloneValue(promotion);
  }

  private deletePromotion(id: string) {
    const promotionId = requireUuid(id, "Promotion id");
    const promotions = this.state.promotions as Promotion[];
    const index = promotions.findIndex((item) => item.id === promotionId);
    if (index === -1) throw new ApplicationError("not-found", "Promotion was not found", { status: 404 });
    this.requireVenue(promotions[index]?.venueId ?? "", "promotions");
    promotions.splice(index, 1);
  }
}
