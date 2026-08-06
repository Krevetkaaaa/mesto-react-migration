const { json, methodNotAllowed, queryValue, text } = require('../../lib/http');
const { startExternalOAuth } = require('../../lib/oauth-flow');
const { configuration } = require('../../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const provider = text(queryValue(req.query?.provider), 30).toLowerCase();
  if (provider === 'vk' || provider === 'yandex') return startExternalOAuth(req, res, provider);
  if (provider !== 'google') return json(res, 503, { message: 'Этот способ входа ещё не подключён.' });
  const config = configuration();
  if (!config.configured) return json(res, 503, { message: 'Авторизация временно недоступна.' });
  let origin;
  try {
    origin = new URL(process.env.MESTO_PUBLIC_ORIGIN || (process.env.VERCEL ? 'https://mesto-city-guide.vercel.app' : `http://${req.headers.host}`)).origin;
  } catch {
    return json(res, 503, { message: 'Публичный адрес сервиса настроен некорректно.' });
  }
  const target = `${config.url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(`${origin}/login`)}`;
  res.statusCode = 302;
  res.setHeader('Location', target);
  return res.end();
};
