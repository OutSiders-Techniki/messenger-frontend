import { api, ApiError, apiMode, errorMessage, initApi, onUnauthorized } from './api/index.js';
import { refresh, startRouter } from './router.js';
import { routes } from './routes.js';
import { session } from './state/session.js';
import { button } from './ui/components.js';
import { h } from './ui/dom.js';
import { guestLayout, loadingView } from './ui/layout.js';

const outlet = document.getElementById('app');
let started = false;

// Защищённый запрос вернул 401 — сессия закончилась: локально выходим,
// роутер сам уведёт на экран входа.
onUnauthorized(() => session.clear());

// До ответа о сессии ничего из переписки не показываем.
async function bootstrap() {
  outlet.replaceChildren(loadingView('Проверяем сессию…'));

  try {
    session.set(await api.auth.me());
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 401)) {
      showRetry(err);
      return;
    }
  }

  if (started) {
    refresh();
    return;
  }
  started = true;
  startRouter(outlet, { routes, isAuthenticated: () => session.isAuthenticated });
  // Вход/выход меняют доступность экранов — перепроверяем текущий маршрут.
  session.subscribe(() => refresh());
}

function showRetry(err) {
  outlet.replaceChildren(
    guestLayout(
      h('h1', null, 'Не удалось подключиться'),
      h('p', { class: 'muted' }, errorMessage(err)),
      button({ block: true, onClick: bootstrap }, 'Повторить'),
    ),
  );
}

await initApi();
if (apiMode === 'mock') document.documentElement.dataset.apiMode = 'mock';
bootstrap();
