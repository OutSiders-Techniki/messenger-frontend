import { api, ApiError } from './api/index.js';
import { refresh, startRouter } from './router.js';
import { routes } from './routes.js';
import { session } from './state/session.js';
import { button } from './ui/components.js';
import { h } from './ui/dom.js';
import { guestLayout, loadingView } from './ui/layout.js';

const outlet = document.getElementById('app');

// До ответа о сессии ничего из переписки не показываем.
async function bootstrap() {
  outlet.replaceChildren(loadingView('Проверяем сессию…'));

  try {
    session.set(await api.me());
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 401)) {
      showRetry();
      return;
    }
  }

  startRouter(outlet, { routes, isAuthenticated: () => session.isAuthenticated });
  // Вход/выход меняют доступность экранов — перепроверяем текущий маршрут.
  session.subscribe(() => refresh());
}

function showRetry() {
  outlet.replaceChildren(
    guestLayout(
      h('h1', null, 'Нет связи с сервером'),
      h('p', { class: 'muted' }, 'Не удалось проверить сессию.'),
      button({ block: true, onClick: bootstrap }, 'Повторить'),
    ),
  );
}

bootstrap();
