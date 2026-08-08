import { z } from "zod";

import type { HttpClient } from "./http";
import { favoriteWireSchema, userWireSchema } from "./wire-schemas";
import { isApplicationError } from "../lib/application-error";
import {
  normalizeChangePasswordCommand,
  normalizeOAuthAccessToken,
  normalizeRegisterCommand,
  normalizeSignInCommand,
  normalizeOAuthStart,
} from "../lib/auth-normalization";
import type {
  AuthProviders,
  ChangePasswordCommand,
  RegisterCommand,
  Session,
  SignInCommand,
  OAuthProvider,
} from "../modules/session";

const currentResponseSchema = z.discriminatedUnion("authenticated", [
  z.object({
    authenticated: z.literal(true),
    user: userWireSchema,
    favorites: z.array(favoriteWireSchema),
  }).loose(),
  z.object({
    authenticated: z.literal(false),
    code: z.string().optional(),
  }).loose(),
]);

const authenticatedResponseSchema = z.object({
  authenticated: z.literal(true),
  user: userWireSchema,
}).loose();

const userResponseSchema = z.object({ user: userWireSchema }).loose();
const okResponseSchema = z.object({ ok: z.literal(true) }).loose();
const providersResponseSchema = z.object({
  email: z.boolean(),
  google: z.boolean(),
  yandex: z.boolean(),
  vk: z.boolean(),
}).loose();

class HttpSession implements Session {
  constructor(private readonly http: HttpClient) {}

  async current() {
    try {
      const response = await this.http.request({
        path: "/api/auth/session",
        schema: currentResponseSchema,
      });
      if (!response.authenticated) return { status: "anonymous" as const };
      return {
        status: "authenticated" as const,
        user: response.user,
        favoriteKeys: response.favorites.map((favorite) => favorite.venueKey),
      };
    } catch (error) {
      if (isApplicationError(error) && error.kind === "unauthorized") {
        return { status: "anonymous" as const };
      }
      throw error;
    }
  }

  providers(): Promise<AuthProviders> {
    return this.http.request({
      path: "/api/auth/providers",
      schema: providersResponseSchema,
    });
  }

  async signIn(command: SignInCommand) {
    const normalized = normalizeSignInCommand(command);
    const response = await this.http.request({
      method: "POST",
      path: "/api/auth/login",
      body: normalized,
      schema: authenticatedResponseSchema,
    });
    return response.user;
  }

  async register(command: RegisterCommand) {
    const normalized = normalizeRegisterCommand(command);
    const response = await this.http.request({
      method: "POST",
      path: "/api/auth/register",
      body: {
        name: normalized.name,
        username: normalized.username,
        email: normalized.email,
        password: normalized.password,
      },
      schema: authenticatedResponseSchema,
    });
    return response.user;
  }

  async signOut() {
    await this.http.request({
      method: "POST",
      path: "/api/auth/logout",
      schema: okResponseSchema,
    });
  }

  async changePassword(command: ChangePasswordCommand) {
    const normalized = normalizeChangePasswordCommand(command);
    const response = await this.http.request({
      method: "POST",
      path: "/api/auth/password",
      body: {
        password: normalized.password,
        ...(normalized.currentPassword === undefined
          ? {}
          : { currentPassword: normalized.currentPassword }),
      },
      schema: userResponseSchema,
    });
    return response.user;
  }

  oauthStartUrl(provider: OAuthProvider, returnTo?: string) {
    const normalized = normalizeOAuthStart(provider, returnTo);
    const query = new URLSearchParams(normalized).toString();
    return `/api/auth/oauth?${query}`;
  }

  async completeOAuth(accessToken: string) {
    const token = normalizeOAuthAccessToken(accessToken);
    const response = await this.http.request({
      method: "POST",
      path: "/api/auth/oauth-session",
      body: { accessToken: token },
      schema: authenticatedResponseSchema,
    });
    return response.user;
  }
}

export function createHttpSession(http: HttpClient): Session {
  return new HttpSession(http);
}
