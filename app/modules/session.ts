import { ApplicationError } from "../lib/application-error";
import { ControllableFake, cloneValue } from "../lib/controllable-fake";
import type { User } from "../lib/domain";
import {
  normalizeChangePasswordCommand,
  normalizeOAuthAccessToken,
  normalizeRegisterCommand,
  normalizeSignInCommand,
  normalizeOAuthStart,
  type OAuthProvider,
} from "../lib/auth-normalization";

export interface AuthProviders {
  email: boolean;
  google: boolean;
  yandex: boolean;
  vk: boolean;
}

export type SessionState =
  | { status: "anonymous" }
  | { status: "authenticated"; user: User; favoriteKeys: readonly string[] };

export interface SignInCommand {
  login: string;
  password: string;
}

export interface RegisterCommand {
  name: string;
  username: string;
  email: string;
  password: string;
}

export interface ChangePasswordCommand {
  password: string;
  currentPassword?: string;
}

export interface Session {
  current(): Promise<SessionState>;
  providers(): Promise<AuthProviders>;
  signIn(command: SignInCommand): Promise<User>;
  register(command: RegisterCommand): Promise<User>;
  signOut(): Promise<void>;
  changePassword(command: ChangePasswordCommand): Promise<User>;
  oauthStartUrl(provider: OAuthProvider, returnTo?: string): string;
  completeOAuth(accessToken: string): Promise<User>;
}

export interface FakeSessionAccount {
  login: string;
  password: string;
  user: User;
}

export interface FakeSessionOptions {
  accounts?: readonly FakeSessionAccount[];
  currentLogin?: string;
  favoriteKeys?: readonly string[];
  favoriteKeysByUserId?: Readonly<Record<string, readonly string[]>>;
  providers?: Partial<AuthProviders>;
  oauthAccessTokens?: Readonly<Record<string, string>>;
}

export class FakeSession extends ControllableFake implements Session {
  private readonly accounts: FakeSessionAccount[] = [];
  private activeLogin: string | undefined;
  private readonly favoriteKeysByUserId = new Map<string, string[]>();
  private readonly providerState: AuthProviders;
  private nextUser = 1;
  private readonly oauthAccessTokens: ReadonlyMap<string, string>;

  constructor(options: FakeSessionOptions = {}) {
    super();
    for (const account of options.accounts ?? []) {
      this.accounts.push(cloneValue(account));
    }
    this.activeLogin = options.currentLogin?.toLowerCase();
    for (const [userId, favoriteKeys] of Object.entries(options.favoriteKeysByUserId ?? {})) {
      this.favoriteKeysByUserId.set(userId, [...favoriteKeys]);
    }
    const seededAccount = this.activeLogin ? this.findAccount(this.activeLogin) : this.accounts[0];
    if (seededAccount && options.favoriteKeys) {
      this.favoriteKeysByUserId.set(seededAccount.user.id, [...options.favoriteKeys]);
    }
    this.providerState = {
      email: options.providers?.email ?? true,
      google: options.providers?.google ?? false,
      yandex: options.providers?.yandex ?? false,
      vk: options.providers?.vk ?? false,
    };
    this.oauthAccessTokens = new Map(Object.entries(options.oauthAccessTokens ?? {}));
  }

  private findAccount(login: string) {
    const normalized = login.trim().toLowerCase();
    return this.accounts.find((account) => [
      account.login,
      account.user.username,
      account.user.email,
    ].some((alias) => alias.toLowerCase() === normalized));
  }

  private newUserId() {
    let id: string;
    do {
      id = `10000000-0000-4000-8000-${String(this.nextUser++).padStart(12, "0")}`;
    } while (this.accounts.some((account) => account.user.id === id));
    return id;
  }

  async current(): Promise<SessionState> {
    await this.throwPlannedFailure();
    const account = this.activeLogin ? this.findAccount(this.activeLogin) : undefined;
    if (!account || account.user.status !== "active") return { status: "anonymous" };
    return {
      status: "authenticated",
      user: cloneValue(account.user),
      favoriteKeys: [...(this.favoriteKeysByUserId.get(account.user.id) ?? [])],
    };
  }

  async providers() {
    await this.throwPlannedFailure();
    return cloneValue(this.providerState);
  }

  async signIn(command: SignInCommand) {
    await this.throwPlannedFailure();
    const normalized = normalizeSignInCommand(command);
    const login = normalized.login;
    const account = this.findAccount(login);
    if (!account || account.password !== normalized.password || account.user.status !== "active") {
      throw new ApplicationError("unauthorized", "Invalid login or password", { status: 401 });
    }
    this.activeLogin = account.login.toLowerCase();
    return cloneValue(account.user);
  }

  async register(command: RegisterCommand) {
    await this.throwPlannedFailure();
    const normalized = normalizeRegisterCommand(command);
    const login = normalized.username;
    const email = normalized.email;
    if (this.accounts.some((item) => item.user.email.toLowerCase() === email || item.user.username.toLowerCase() === login)) {
      throw new ApplicationError("conflict", "Account already exists", { status: 409 });
    }
    const user: User = {
      id: this.newUserId(),
      username: login,
      name: normalized.name,
      email,
      hasEmail: true,
      phone: "",
      role: "customer",
      status: "active",
      mustChangePassword: false,
    };
    this.accounts.push({ login, password: normalized.password, user });
    this.activeLogin = login;
    return cloneValue(user);
  }

  async signOut() {
    await this.throwPlannedFailure();
    this.activeLogin = undefined;
  }

  async changePassword(command: ChangePasswordCommand) {
    await this.throwPlannedFailure();
    const normalized = normalizeChangePasswordCommand(command);
    const account = this.activeLogin ? this.findAccount(this.activeLogin) : undefined;
    if (!account || account.user.status !== "active") {
      throw new ApplicationError("unauthorized", "Authentication required", { status: 401 });
    }
    if (!account.user.mustChangePassword && account.password !== normalized.currentPassword) {
      throw new ApplicationError("unauthorized", "Current password is invalid", { status: 401 });
    }
    account.password = normalized.password;
    account.user.mustChangePassword = false;
    return cloneValue(account.user);
  }

  oauthStartUrl(provider: OAuthProvider, returnTo?: string) {
    const normalized = normalizeOAuthStart(provider, returnTo);
    const query = new URLSearchParams(normalized).toString();
    return `/__fake/oauth?${query}`;
  }

  async completeOAuth(accessToken: string) {
    await this.throwPlannedFailure();
    const token = normalizeOAuthAccessToken(accessToken);
    const accountAlias = this.oauthAccessTokens.get(token);
    const account = accountAlias ? this.findAccount(accountAlias) : undefined;
    if (!account) {
      throw new ApplicationError("unauthorized", "OAuth token is invalid", { status: 401 });
    }
    if (account.user.status !== "active") {
      throw new ApplicationError("forbidden", "OAuth account is inactive", { status: 403 });
    }
    this.activeLogin = account.login.toLowerCase();
    return cloneValue(account.user);
  }
}

export type { OAuthProvider };
