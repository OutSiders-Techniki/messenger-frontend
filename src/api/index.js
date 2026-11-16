// Точка входа в API для экранов.
//
// Режим выбирается при старте (initApi):
//   - dev-сервер без бэкенда отвечает на /__dev/config { api: 'mock' } — заглушка;
//   - dev-сервер с --api=URL отвечает { api: 'real' } и проксирует запросы;
//   - на боевом сервере /__dev/config нет — всегда реальный API.

import { httpApi } from './client.js';
import { mockApi } from './mock.js';

export { ApiError, NetworkError, errorMessage } from './errors.js';
export { onUnauthorized } from './http.js';

export let api = httpApi;
export let apiMode = 'real';

export async function initApi() {
  try {
    const response = await fetch('/__dev/config', { cache: 'no-store' });
    if (response.ok) {
      const config = await response.json();
      if (config.api === 'mock') {
        api = mockApi;
        apiMode = 'mock';
      }
    }
  } catch {
    // Конфигурации нет — работаем с реальным API.
  }
}
