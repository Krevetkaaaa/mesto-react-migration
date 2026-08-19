import { useState } from "react";
import { Form, useNavigation, useRevalidator } from "react-router";

import { MerchantIcon, MerchantSprite } from "./merchant-ui";

export interface MerchantLoginProps {
  action?: string;
  message?: string;
  unavailable?: boolean;
}

export function MerchantLogin({ action = "/merchant", message = "", unavailable = false }: MerchantLoginProps) {
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const loggingIn = navigation.state !== "idle"
    && navigation.formData?.get("intent") === "merchant.login";

  return (
    <>
      <main className="merchant-login" id="merchant-login">
        <div className="login-scene" aria-hidden="true">
          <span className="login-scene__glow" />
          <div className="login-scene__copy">
            <a className="brand brand--light" href="/" tabIndex={-1}><span>Место</span><i>✦</i></a>
            <p>Кабинет ресторатора</p>
            <h1>Ваше заведение —<br />всегда под рукой.</h1>
            <span>Актуализируйте карточку, меню и предложения в одном спокойном рабочем пространстве.</span>
          </div>
        </div>
        <section className="login-panel" aria-labelledby="login-title">
          <a className="brand login-panel__brand" href="/" aria-label="Место — вернуться на сайт"><span>Место</span><i>✦</i></a>
          <div className="login-panel__body">
            <p className="eyebrow">Для владельцев заведений</p>
            <h2 id="login-title">Войдите в кабинет</h2>
            <p className="login-lead">Используйте логин и временный пароль, выданные редакцией «Места».</p>
            <Form className="login-form" method="post" action={action} replace>
              <input name="intent" type="hidden" value="merchant.login" />
              <label className="field">
                <span>Логин или e-mail</span>
                <span className="input-shell">
                  <MerchantIcon name="user" />
                  <input name="login" type="text" autoComplete="username" placeholder="restaurant.owner" required autoFocus />
                </span>
              </label>
              <label className="field">
                <span>Пароль</span>
                <span className="input-shell">
                  <MerchantIcon name="lock" />
                  <input name="password" type={passwordVisible ? "text" : "password"} autoComplete="current-password" placeholder="Введите пароль" required />
                  <button
                    className="password-toggle"
                    type="button"
                    aria-label={passwordVisible ? "Скрыть пароль" : "Показать пароль"}
                    onClick={() => setPasswordVisible((visible) => !visible)}
                  >
                    <MerchantIcon name="eye" />
                  </button>
                </span>
              </label>
              <p className="form-message" id="login-message" role="alert" aria-live="polite">{message}</p>
              <button className="button button--primary button--wide" type="submit" disabled={loggingIn || unavailable}>
                {loggingIn ? "Проверяем доступ…" : <><span>Войти</span><MerchantIcon name="arrow" /></>}
              </button>
              {unavailable ? (
                <button
                  className="button button--ghost button--wide"
                  type="button"
                  disabled={revalidator.state !== "idle"}
                  onClick={() => { void revalidator.revalidate(); }}
                >
                  {revalidator.state === "idle" ? "Попробовать снова" : "Обновляем…"}
                </button>
              ) : null}
            </Form>
            <aside className="login-help">
              <MerchantIcon name="help" />
              <p><b>Нет доступа?</b><span>Обратитесь к администратору «Места»: он создаст аккаунт и привяжет заведение.</span></p>
            </aside>
          </div>
          <p className="login-panel__footer"><a href="/">← Вернуться к городскому гиду</a></p>
        </section>
      </main>
      <MerchantSprite />
    </>
  );
}
