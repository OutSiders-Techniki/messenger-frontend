import { api, ApiError } from '../api/index.js';
import { session } from '../state/session.js';

// Выход: сначала убираем локальное состояние (роутер сразу уведёт на вход),
// затем завершаем сессию на сервере.
// TODO(MSG-39): сообщение, если сервер не подтвердил выход; синхронизация вкладок.
export async function logout() {
  session.clear();
  try {
    await api.logout();
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 401)) console.error(err);
  }
}
