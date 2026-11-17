// Ошибка ответа API. Формат тела ошибки (предложение для бэкенда):
// { code, message, fieldErrors? }

export class ApiError extends Error {
  constructor(status, { code = 'unknown', message = '', fieldErrors = null } = {}) {
    super(message || `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

// Запрос не дошёл до сервера или ответ не получен.
export class NetworkError extends Error {
  constructor(cause) {
    super('Network error', { cause });
    this.name = 'NetworkError';
  }
}
