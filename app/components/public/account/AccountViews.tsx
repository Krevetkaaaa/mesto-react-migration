import { useEffect, useRef, useState } from "react";
import { Form, Link, type NavigateFunction, useNavigate, useNavigation } from "react-router";

import {
  PASSWORD_ERROR_MESSAGE,
  PASSWORD_HINT,
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN,
} from "../../../../password-policy.mjs";
import type { Favorite, User } from "../../../lib/domain";
import { publicAssetUrl } from "../../../lib/public-asset";
import type { AuthProviders } from "../../../modules/session";
import { usePublicAccount } from "./PublicAccountProvider";

interface AuthDialogProps {
  actionData: { error?: string } | undefined;
  mode: "login" | "register";
  oauthCallbackError: string;
  providers: AuthProviders;
  returnTo: string;
}

function returnHomeAndRestoreFocus(navigate: NavigateFunction, target: "auth" | "favorites" | "register") {
  void navigate("/", {
    replace: true,
    state: { homeReturnFocus: target },
  });
}

function oauthLabel(provider: "google" | "yandex" | "vk") {
  if (provider === "google") return "Google";
  if (provider === "yandex") return "Яндекс";
  return "ВКонтакте";
}

export function AuthDialog({ actionData, mode, oauthCallbackError, providers, returnTo }: AuthDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const oauthHandled = useRef(false);
  const account = usePublicAccount();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const [oauthError, setOAuthError] = useState("");
  const pending = navigation.state !== "idle";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (dialog.open) dialog.removeAttribute("open");
    dialog.showModal();
    const close = () => returnHomeAndRestoreFocus(navigate, mode === "register" ? "register" : "auth");
    dialog.addEventListener("close", close);
    return () => dialog.removeEventListener("close", close);
  }, [mode, navigate]);

  useEffect(() => {
    if (mode !== "login" || oauthHandled.current || typeof window === "undefined") return;
    oauthHandled.current = true;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const error = hash.get("error_description") || hash.get("error");
    const accessToken = hash.get("access_token");
    if (!error && !accessToken) return;
    window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}`);
    if (error) {
      queueMicrotask(() => setOAuthError("Вход через Google отменён или не был завершён."));
      return;
    }
    void account.completeOAuth(accessToken ?? "").then(() => {
      window.location.assign(returnTo);
    }).catch(() => {
      setOAuthError("Не удалось завершить вход через Google. Попробуйте ещё раз.");
    });
  }, [account, mode, returnTo]);

  const startOAuth = (provider: "google" | "yandex" | "vk") => {
    window.location.assign(account.oauthStartUrl(provider, returnTo));
  };
  const title = mode === "login" ? "Войти в аккаунт" : "Создать профиль";
  const error = oauthError || oauthCallbackError || actionData?.error || "";

  return (
    <dialog ref={dialogRef} open className="form-dialog" aria-labelledby="account-auth-title">
      <button className="dialog-close" type="button" aria-label="Закрыть" onClick={() => dialogRef.current?.close()}>×</button>
      <div className="form-dialog-inner">
        <p className="eyebrow">{mode === "login" ? "Добро пожаловать в Место" : "Новый аккаунт"}</p>
        <h2 id="account-auth-title">{title}</h2>
        <p className="form-lead">{mode === "login"
          ? "Сохраняйте любимые места и оставляйте отзывы."
          : "Один профиль для избранного, отзывов и новых заведений."}</p>
        <Form method="post" replace>
          <input name="returnTo" type="hidden" value={returnTo} />
          {mode === "register" ? (
            <>
              <label>Имя<input name="name" type="text" autoComplete="name" placeholder="Как вас зовут?" required /></label>
              <label>Логин<input name="username" type="text" autoComplete="username" placeholder="Например, alex" pattern="[A-Za-z0-9._\-]{3,48}" title="От 3 до 48 латинских букв, цифр, точек, дефисов или подчёркиваний" required /></label>
              <label>Почта<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></label>
            </>
          ) : (
            <label>Почта или логин<input name="login" type="text" autoComplete="username" placeholder="you@example.com" required /></label>
          )}
          <label>Пароль<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "login" ? "Введите пароль" : PASSWORD_HINT} minLength={mode === "register" ? PASSWORD_MIN_LENGTH : undefined} pattern={mode === "register" ? PASSWORD_PATTERN : undefined} title={mode === "register" ? PASSWORD_ERROR_MESSAGE : undefined} required /></label>
          <p className="auth-error" role="alert" hidden={!error}>{error}</p>
          <button className="primary-action full" type="submit" disabled={pending}>{pending ? "Отправляем…" : mode === "login" ? "Войти" : "Создать аккаунт"} <svg><use href="#arrow" /></svg></button>
        </Form>
        <div className="form-divider"><span>или</span></div>
        <div className="social-grid">
          {(["google", "yandex", "vk"] as const).map((provider) => (
            <button key={provider} type="button" disabled={!providers[provider] || pending} onClick={() => startOAuth(provider)}>
              <b>{provider === "google" ? "G" : provider === "yandex" ? "Я" : "VK"}</b>{oauthLabel(provider)}
            </button>
          ))}
        </div>
        <p className="social-auth-note" aria-live="polite">{providers.google || providers.yandex || providers.vk ? "" : "Внешние способы входа временно недоступны."}</p>
        <Link className="form-link" to={mode === "login" ? `/register?${new URLSearchParams({ returnTo }).toString()}` : `/login?${new URLSearchParams({ returnTo }).toString()}`}>
          {mode === "login" ? "Регистрация" : "Уже есть аккаунт"}
        </Link>
      </div>
    </dialog>
  );
}

function FavoriteRows({ favorites, compact = false }: { favorites: readonly Favorite[]; compact?: boolean }) {
  if (!favorites.length) {
    return <p className="favorites-empty">Здесь пока ничего нет. Откройте каталог и сохраните место, к которому хочется вернуться.</p>;
  }
  return <>{favorites.map((favorite) => {
    const href = favorite.snapshot.slug ? `/venue/${favorite.snapshot.slug}` : "/catalog";
    return compact ? (
      <Link className="favorite-row" key={favorite.venueKey} to={href}>
        <img src={publicAssetUrl(favorite.snapshot.image)} alt="" width={52} height={52} />
        <span><b>{favorite.snapshot.title}</b><small>{favorite.snapshot.type}</small></span>
        <svg aria-hidden="true"><use href="#arrow" /></svg>
      </Link>
    ) : (
      <Link className="favorite-row" key={favorite.venueKey} to={href}>
        <img src={publicAssetUrl(favorite.snapshot.image)} alt="" width={52} height={52} />
        <span><b>{favorite.snapshot.title}</b><small>{favorite.snapshot.type}</small></span>
        <svg aria-hidden="true"><use href="#arrow" /></svg>
      </Link>
    );
  })}</>;
}

export function FavoritesDialog({ actionData, favorites }: {
  actionData: { error?: string; ok?: boolean } | undefined;
  favorites: readonly Favorite[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (dialog.open) dialog.removeAttribute("open");
    dialog.showModal();
    const close = () => returnHomeAndRestoreFocus(navigate, "favorites");
    dialog.addEventListener("close", close);
    return () => dialog.removeEventListener("close", close);
  }, [navigate]);

  return (
    <dialog ref={dialogRef} open className="favorites-dialog" aria-labelledby="account-favorites-title">
      <button className="dialog-close" type="button" aria-label="Закрыть" onClick={() => dialogRef.current?.close()}>×</button>
      <div className="favorites-inner">
        <p className="eyebrow">Личный список</p>
        <h2 id="account-favorites-title">Избранные места</h2>
        <p className="form-lead">Сохраняйте места — они останутся здесь для следующего выбора.</p>
        {actionData?.error ? <p className="auth-error" role="alert">{actionData.error}</p> : null}
        <div className="favorites-list"><FavoriteRows favorites={favorites} compact /></div>
        <Link className="black-action" to="/catalog">Найти ещё место <svg><use href="#arrow" /></svg></Link>
      </div>
    </dialog>
  );
}

export function ProfileView({ favorites, user }: { favorites: readonly Favorite[]; user: User }) {
  const avatar = [...(user.name || user.username || "М")][0]?.toLocaleUpperCase("ru-RU") || "М";
  return (
    <section className="profile-view" id="profile-view" aria-labelledby="profile-title">
      <div className="profile-inner">
        <Link className="back-link" to="/">← Вернуться на главную</Link>
        <div className="profile-heading">
          <span className="profile-large-avatar">{avatar}</span>
          <div><p className="eyebrow">Личный кабинет</p><h1 id="profile-title">{user.name || user.username}</h1><p>{user.email}<br />Избранные места, отзывы и заявки — в одном кабинете.</p></div>
          <div className="profile-actions">
            <a className="profile-action merchant-profile-link" href="/merchant" hidden={user.role !== "merchant"}>Кабинет ресторатора</a>
            <a className="profile-action" href="/?open=submission#guide"><svg><use href="#plus" /></svg>Добавить заведение</a>
            <Form method="post"><input name="intent" type="hidden" value="logout" /><button className="profile-action secondary" type="submit">Выйти</button></Form>
          </div>
        </div>
        <div className="profile-grid">
          <section className="profile-card"><div><p className="eyebrow">Избранное</p><h2>Места, к которым хочется вернуться</h2></div><div className="saved-list"><FavoriteRows favorites={favorites} /></div></section>
          <section className="profile-card profile-review"><p className="eyebrow">Ваш голос</p><h2>Отзывы помогают выбирать лучше</h2><p>Откройте карточку заведения и поделитесь впечатлением — отзыв появится после модерации.</p><Link className="black-action" to="/catalog">Найти место <svg><use href="#arrow" /></svg></Link></section>
        </div>
      </div>
    </section>
  );
}

export function AccountRouteFailure() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (dialog.open) dialog.removeAttribute("open");
    dialog.showModal();
  }, []);
  return (
    <dialog ref={dialogRef} open className="form-dialog" aria-labelledby="account-error-title">
      <div className="form-dialog-inner">
        <p className="eyebrow">Личный кабинет</p>
        <h2 id="account-error-title">Сервис временно недоступен</h2>
        <p className="form-lead">Не удалось загрузить данные аккаунта. Обновите страницу или вернитесь позже.</p>
        <a className="primary-action full" href="">Попробовать ещё раз <svg><use href="#arrow" /></svg></a>
        <Link className="form-link" to="/">Вернуться на главную</Link>
      </div>
    </dialog>
  );
}
