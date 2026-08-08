import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router";

import { createHttpFavorites } from "../../../adapters/favorites-http";
import { createBrowserHttpClient } from "../../../adapters/http";
import { createHttpSession } from "../../../adapters/session-http";
import type { User } from "../../../lib/domain";
import type { SaveFavoriteCommand } from "../../../modules/favorites";
import type { OAuthProvider } from "../../../modules/session";

export type PublicAccountStatus =
  | "restoring"
  | "anonymous"
  | "authenticated"
  | "unavailable";

interface PublicAccountValue {
  status: PublicAccountStatus;
  user: User | null;
  favoriteKeys: ReadonlySet<string>;
  pendingFavoriteKeys: ReadonlySet<string>;
  oauthStartUrl(provider: OAuthProvider, returnTo?: string): string;
  refresh(): Promise<void>;
  signOut(): Promise<void>;
  completeOAuth(accessToken: string): Promise<User>;
  toggleFavorite(command: SaveFavoriteCommand): Promise<"saved" | "removed">;
}

const PublicAccountContext = createContext<PublicAccountValue | null>(null);

function accountClients() {
  const http = createBrowserHttpClient();
  return {
    favorites: createHttpFavorites(http),
    session: createHttpSession(http),
  };
}

export function PublicAccountProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const refreshGeneration = useRef(0);
  const pendingFavoriteKeysRef = useRef(new Set<string>());
  const [restoredPath, setRestoredPath] = useState<string | null>(null);
  const [status, setStatus] = useState<PublicAccountStatus>("restoring");
  const [user, setUser] = useState<User | null>(null);
  const [favoriteKeys, setFavoriteKeys] = useState<ReadonlySet<string>>(new Set());
  const [pendingFavoriteKeys, setPendingFavoriteKeys] = useState<ReadonlySet<string>>(new Set());

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    setRestoredPath(pathname);
    setStatus("restoring");
    try {
      const current = await accountClients().session.current();
      if (generation !== refreshGeneration.current) return;
      setRestoredPath(pathname);
      if (current.status === "anonymous") {
        setUser(null);
        setFavoriteKeys(new Set());
        setStatus("anonymous");
        return;
      }
      setUser(current.user);
      setFavoriteKeys(new Set(current.favoriteKeys));
      setStatus("authenticated");
    } catch {
      if (generation !== refreshGeneration.current) return;
      setRestoredPath(pathname);
      setStatus("unavailable");
    }
  }, [pathname]);

  useEffect(() => {
    const generation = ++refreshGeneration.current;
    void accountClients().session.current().then((current) => {
      if (generation !== refreshGeneration.current) return;
      setRestoredPath(pathname);
      if (current.status === "anonymous") {
        setUser(null);
        setFavoriteKeys(new Set());
        setStatus("anonymous");
        return;
      }
      setUser(current.user);
      setFavoriteKeys(new Set(current.favoriteKeys));
      setStatus("authenticated");
    }, () => {
      if (generation !== refreshGeneration.current) return;
      setRestoredPath(pathname);
      setStatus("unavailable");
    });
  }, [pathname]);

  const effectiveStatus: PublicAccountStatus = restoredPath === pathname
    ? status
    : "restoring";

  const signOut = useCallback(async () => {
    await accountClients().session.signOut();
    setUser(null);
    setFavoriteKeys(new Set());
    setStatus("anonymous");
  }, []);

  const completeOAuth = useCallback(async (accessToken: string) => {
    const authenticatedUser = await accountClients().session.completeOAuth(accessToken);
    await refresh();
    return authenticatedUser;
  }, [refresh]);

  const toggleFavorite = useCallback(async (command: SaveFavoriteCommand) => {
    if (effectiveStatus !== "authenticated") {
      throw new Error("Authentication required");
    }
    if (pendingFavoriteKeysRef.current.has(command.venueKey)) {
      throw new Error("Favorite mutation is already pending");
    }
    pendingFavoriteKeysRef.current.add(command.venueKey);
    setPendingFavoriteKeys(new Set(pendingFavoriteKeysRef.current));
    const wasSaved = favoriteKeys.has(command.venueKey);
    setFavoriteKeys((current) => {
      const next = new Set(current);
      if (wasSaved) next.delete(command.venueKey);
      else next.add(command.venueKey);
      return next;
    });
    try {
      if (wasSaved) await accountClients().favorites.remove(command.venueKey);
      else await accountClients().favorites.save(command);
      return wasSaved ? "removed" : "saved";
    } catch (error) {
      setFavoriteKeys((current) => {
        const next = new Set(current);
        if (wasSaved) next.add(command.venueKey);
        else next.delete(command.venueKey);
        return next;
      });
      throw error;
    } finally {
      pendingFavoriteKeysRef.current.delete(command.venueKey);
      setPendingFavoriteKeys(new Set(pendingFavoriteKeysRef.current));
    }
  }, [effectiveStatus, favoriteKeys]);

  const oauthStartUrl = useCallback((provider: OAuthProvider, returnTo?: string) => (
    accountClients().session.oauthStartUrl(provider, returnTo)
  ), []);

  const value = useMemo<PublicAccountValue>(() => ({
    completeOAuth,
    favoriteKeys,
    oauthStartUrl,
    pendingFavoriteKeys,
    refresh,
    signOut,
    status: effectiveStatus,
    toggleFavorite,
    user,
  }), [completeOAuth, effectiveStatus, favoriteKeys, oauthStartUrl, pendingFavoriteKeys, refresh, signOut, toggleFavorite, user]);

  return (
    <PublicAccountContext.Provider value={value}>
      {children}
    </PublicAccountContext.Provider>
  );
}

export function usePublicAccount() {
  const account = useContext(PublicAccountContext);
  if (!account) throw new Error("usePublicAccount must be used within PublicAccountProvider");
  return account;
}

export function useOptionalPublicAccount() {
  return useContext(PublicAccountContext);
}
