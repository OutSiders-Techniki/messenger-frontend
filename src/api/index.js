// Точка входа в API для экранов. Пока бэкенда нет — используется заглушка.
// Когда появится сервер, здесь подключится настоящий HTTP-клиент (MSG-41),
// а экраны менять не придётся.

import { mockApi } from './mock.js';

export { ApiError, NetworkError } from './errors.js';

export const api = mockApi;
