import { Form, useNavigation, useRevalidator } from "react-router";

export interface AdminLoginProps {
  message?: string;
  unavailable?: boolean;
}

export function AdminLogin({ message = "", unavailable = false }: AdminLoginProps) {
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const loggingIn = navigation.state !== "idle"
    && navigation.formData?.get("intent") === "admin.login";

  return (
    <main className="admin-login" id="admin-login" data-react-route="admin" data-admin-state="login">
      <section className="login-card" aria-labelledby="admin-login-title">
        <a className="admin-brand" href="/" aria-label="Место — на главную"><span>Место</span><i>✦</i></a>
        <p className="admin-eyebrow">Закрытая зона редакции</p>
        <h1 id="admin-login-title">Управление каталогом</h1>
        <p>Заявки пользователей, отзывы, карточки заведений и актуальная выдача по городам.</p>
        <Form method="post" action="/admin" replace aria-busy={loggingIn}>
          <input name="intent" type="hidden" value="admin.login" />
          <label>Логин<input name="login" type="text" autoComplete="username" required autoFocus /></label>
          <label>Пароль<input name="password" type="password" autoComplete="current-password" required /></label>
          <button type="submit" disabled={loggingIn || unavailable}>
            {loggingIn ? "Проверяем доступ…" : <><span>Войти в панель</span><span>→</span></>}
          </button>
        </Form>
        <div className="login-error" id="login-error" role="alert" aria-live="polite">{message}</div>
        {unavailable ? (
          <button
            type="button"
            disabled={revalidator.state !== "idle"}
            onClick={() => { void revalidator.revalidate(); }}
          >
            {revalidator.state === "idle" ? "Попробовать снова" : "Обновляем…"}
          </button>
        ) : null}
      </section>
    </main>
  );
}
