// Низкоуровневые запросы к бэкенду: JSON, cookie-сессия, тайм-аут,
// разбор ProblemDetails. Экраны используют не его, а api из index.js.

import { ApiError, NetworkError } from './errors.js';

const TIMEOUT_MS = 15_000;

let unauthorizedHandler = null;

// Вызывается, когда защищённый запрос вернул 401: сессия закончилась
// или её отозвали. main.js подписывает сюда локальный выход.
export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
}

// Сообщить о 401 из другого источника (заглушка API).
export function reportUnauthorized(error) {
  unauthorizedHandler?.(error);
}

// options.allowUnauthorized — 401 ожидаем (вход, проверка сессии) и не
// считаем признаком истёкшей сессии.
export async function request(method, path, { body, signal, allowUnauthorized = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), TIMEOUT_MS);
  signal?.addEventListener('abort', () => controller.abort(signal.reason), { once: true });

  let response;
  try {
    response = await fetch(path, {
      method,
      // Только тот же origin: CORS на бэкенде не настроен и не нужен.
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new NetworkError(err, { timeout: controller.signal.reason === 'timeout' });
  } finally {
    clearTimeout(timer);
  }

  if (response.ok) {
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  const error = await toApiError(response);
  if (error.status === 401 && !allowUnauthorized) unauthorizedHandler?.(error);
  throw error;
}

async function toApiError(response) {
  let problem = {};
  try {
    const text = await response.text();
    if (text) problem = JSON.parse(text);
  } catch {
    // Тело не JSON (например, страница прокси) — оставляем только статус.
  }

  const retryAfter = Number.parseInt(response.headers.get('Retry-After') ?? '', 10);

  return new ApiError(response.status, {
    title: typeof problem.title === 'string' ? problem.title : '',
    detail: typeof problem.detail === 'string' ? problem.detail : '',
    errors: problem.errors ?? null,
    retryAfter: Number.isFinite(retryAfter) ? retryAfter : null,
  });
}
