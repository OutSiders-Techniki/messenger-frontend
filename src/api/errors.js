// Ошибки API. Бэкенд отвечает в формате ProblemDetails (RFC 9457):
// { title, status, detail, errors?: { Поле: ["текст", …] } }

export class ApiError extends Error {
  constructor(status, { title = '', detail = '', errors = null, retryAfter = null } = {}) {
    super(detail || title || `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.title = title;
    this.detail = detail;
    // Ошибки по полям: ключи в нижнем регистре, значения — массивы строк.
    this.fieldErrors = normalizeFieldErrors(errors);
    // Секунды из заголовка Retry-After (для 429), если сервер его прислал.
    this.retryAfter = retryAfter;
  }

  // Первая ошибка конкретного поля, например fieldError('password').
  fieldError(name) {
    return this.fieldErrors?.[name.toLowerCase()]?.[0] ?? null;
  }
}

// Запрос не дошёл до сервера или ответ не получен вовремя.
export class NetworkError extends Error {
  constructor(cause, { timeout = false } = {}) {
    super(timeout ? 'Request timeout' : 'Network error', { cause });
    this.name = 'NetworkError';
    this.timeout = timeout;
  }
}

function normalizeFieldErrors(errors) {
  if (!errors || typeof errors !== 'object') return null;
  const result = {};
  for (const [key, value] of Object.entries(errors)) {
    result[key.toLowerCase()] = Array.isArray(value) ? value.map(String) : [String(value)];
  }
  return result;
}

// Текст ошибки для пользователя. Тексты сервера уже на русском, но
// для статусов, где важна однозначность (401, 403, 429, 5xx, сеть),
// используем свои формулировки. overrides — свои тексты для статусов
// конкретного экрана, например { 401: 'Неверный ID или пароль' }.
export function errorMessage(err, overrides = {}) {
  if (err instanceof NetworkError) {
    return overrides.network ?? (err.timeout
      ? 'Сервер долго не отвечает. Проверьте подключение и попробуйте ещё раз'
      : 'Нет связи с сервером. Проверьте подключение и попробуйте ещё раз');
  }

  if (!(err instanceof ApiError)) {
    return overrides.default ?? 'Что-то пошло не так. Попробуйте ещё раз';
  }

  if (overrides[err.status]) return overrides[err.status];

  switch (err.status) {
    case 400:
      return firstFieldError(err) ?? err.detail ?? 'Проверьте введённые данные';
    case 401:
      return 'Сессия закончилась. Войдите заново';
    case 403:
      return 'Нет доступа к этому разделу';
    case 404:
      return err.detail || 'Не найдено';
    case 409:
      return err.detail || 'Конфликт данных. Обновите страницу';
    case 429:
      return err.retryAfter
        ? `Слишком много попыток. Повторите через ${formatSeconds(err.retryAfter)}`
        : 'Слишком много попыток. Подождите немного и повторите';
    default:
      return err.status >= 500
        ? 'Сервер временно недоступен. Попробуйте позже'
        : err.detail || 'Что-то пошло не так. Попробуйте ещё раз';
  }
}

function firstFieldError(err) {
  if (!err.fieldErrors) return null;
  return Object.values(err.fieldErrors)[0]?.[0] ?? null;
}

function formatSeconds(total) {
  if (total < 60) return `${total} с`;
  return `${Math.ceil(total / 60)} мин`;
}
