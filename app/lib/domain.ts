export type UserRole = "customer" | "merchant" | "admin";
export type AccountStatus = "invited" | "active" | "suspended";
export type MembershipRole = "owner" | "manager" | "content_editor" | "analyst";
export type VenueStatus = "draft" | "published" | "archived";
export type PromotionStatus = "draft" | "active" | "archived";
export type ModerationStatus = "pending" | "approved" | "rejected";

export interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  hasEmail: boolean;
  phone: string;
  role: UserRole;
  status: AccountStatus;
  mustChangePassword: boolean;
}

export interface FavoriteSnapshot {
  title: string;
  type: string;
  rating: string;
  image: string;
  text: string;
}

export interface Favorite {
  venueKey: string;
  venueId: string | null;
  externalVenueId: string | null;
  snapshot: FavoriteSnapshot;
  createdAt: string | null;
}

export interface CatalogVenue {
  key: string;
  databaseId: string | null;
  name: string;
  city: string;
  address: string;
  description: string;
  categories: readonly string[];
  category: string;
  cuisine: string;
  hours: string;
  averageCheck: string;
  phones: readonly string[];
  website: string;
  features: readonly string[];
  coordinates: readonly [] | readonly [longitude: number, latitude: number];
  photos: readonly string[];
  mapsUrl: string;
  source: string;
  rating: number | null;
  reviewCount: number | null;
}

export interface Venue {
  id: string;
  slug: string;
  title: string;
  city: string;
  category: string;
  cuisine: string;
  description: string;
  address: string;
  phone: string;
  website: string;
  hours: string;
  averageCheck: string;
  features: readonly string[];
  photos: readonly string[];
  source: string;
  status: VenueStatus;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface MenuItem {
  id: string;
  venueId: string;
  section: string;
  title: string;
  description: string;
  price: number | null;
  photoUrl: string;
  isAvailable: boolean;
  sortOrder: number;
}

export interface Promotion {
  id: string;
  venueId: string;
  title: string;
  description: string;
  startsAt: string | null;
  endsAt: string | null;
  status: PromotionStatus;
}

export interface Review {
  id: string;
  venueId: string | null;
  venueTitle: string;
  authorName: string;
  rating: number;
  body: string;
  status: ModerationStatus;
  createdAt: string | null;
  moderationNote: string;
}

export interface VenueSubmission {
  id: string;
  title: string;
  city: string;
  category: string;
  cuisine: string;
  description: string;
  address: string;
  phone: string;
  website: string;
  hours: string;
  averageCheck: string;
  features: readonly string[];
  photos: readonly string[];
  contactName: string;
  contactEmail: string;
  status: ModerationStatus;
  createdAt: string | null;
  moderationNote: string;
}

export interface Membership {
  id: string;
  userId: string;
  venueId: string;
  role: MembershipRole;
}

export interface MerchantStats {
  venues: number;
  menuItems: number;
  activePromotions: number;
  reviews: number;
}

export interface MerchantWorkspaceSnapshot {
  user: User;
  venues: readonly Venue[];
  memberships: readonly Membership[];
  menuItems: readonly MenuItem[];
  promotions: readonly Promotion[];
  reviews: readonly Review[];
  stats: MerchantStats;
}

export interface AdminUser {
  login: string;
  role: "admin";
}

export interface AdminStats {
  venues: number;
  pendingVenues: number;
  pendingReviews: number;
  merchants: number;
  cities: number;
}

export interface AdminDashboard {
  stats: AdminStats;
  venues: readonly Venue[];
  submissions: readonly VenueSubmission[];
  reviews: readonly Review[];
  databaseConfigured: boolean;
}

export interface MerchantMembership extends Membership {
  venue: Venue | null;
}

export interface MerchantAccount {
  id: string;
  displayName: string;
  username: string;
  email: string;
  status: AccountStatus;
  createdAt: string | null;
  lastLoginAt: string | null;
  memberships: readonly MerchantMembership[];
}

export interface OneTimeCredentials {
  login?: string;
  password: string;
}
