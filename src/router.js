// Hash-роутер: #/path. Не требует настройки сервера под SPA-fallback.
//
// Маршрут: { path: '/dialogs/:dialogId', screen, access, title }
//   access: 'auth'  — только для вошедших, иначе редирект на вход;
//           'guest' — только для не вошедших, иначе редирект к диалогам;
//           'any'   — всем.
// Экран: функция (ctx) => Node. ctx = { params, navigate, onDispose }.
// Через onDispose экран регистрирует очистку (таймеры, подписки, object URL),
// она вызывается при уходе с экрана.

const GUEST_HOME = '/login';
const AUTH_HOME = '/dialogs';

let routes = [];
let outlet = null;
let isAuthenticated = () => false;
let disposers = [];
let renderToken = 0;

function compile(path) {
  const keys = [];
  const pattern = path
    .split('/')
    .map((part) => {
      if (part.startsWith(':')) {
        keys.push(part.slice(1));
        return '([^/]+)';
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp(`^${pattern}/?$`), keys };
}

function currentPath() {
  const raw = location.hash.replace(/^#/, '');
  return raw.startsWith('/') ? raw : '/';
}

function match(path) {
  for (const route of routes) {
    const found = route.matcher.regex.exec(path);
    if (!found) continue;
    const params = {};
    route.matcher.keys.forEach((key, i) => {
      params[key] = decodeURIComponent(found[i + 1]);
    });
    return { route, params };
  }
  return null;
}

function dispose() {
  const pending = disposers;
  disposers = [];
  for (const fn of pending) {
    try {
      fn();
    } catch (err) {
      console.error(err);
    }
  }
}

function render() {
  const path = currentPath();

  if (path === '/') {
    navigate(isAuthenticated() ? AUTH_HOME : GUEST_HOME, { replace: true });
    return;
  }

  const found = match(path) ?? match('*');
  if (!found) return;
  const { route, params } = found;

  if (route.access === 'auth' && !isAuthenticated()) {
    navigate(GUEST_HOME, { replace: true });
    return;
  }
  if (route.access === 'guest' && isAuthenticated()) {
    navigate(AUTH_HOME, { replace: true });
    return;
  }

  dispose();
  const token = ++renderToken;

  const ctx = {
    params,
    navigate,
    onDispose(fn) {
      if (token === renderToken) disposers.push(fn);
      else fn();
    },
  };

  const view = route.screen(ctx);
  outlet.replaceChildren(view);
  document.title = route.title ? `${route.title} · Мессенджер` : 'Мессенджер';

  // Переносим фокус на заголовок нового экрана — для клавиатуры и скринридеров.
  const heading = outlet.querySelector('h1');
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
  window.scrollTo(0, 0);
}

export function navigate(path, { replace = false } = {}) {
  const hash = `#${path}`;
  if (location.hash === hash) {
    render();
  } else if (replace) {
    location.replace(hash);
  } else {
    location.hash = hash;
  }
}

// Перерисовать текущий маршрут, например после выхода из аккаунта.
export function refresh() {
  render();
}

export function startRouter(target, options) {
  outlet = target;
  isAuthenticated = options.isAuthenticated;
  routes = options.routes.map((route) => ({ ...route, matcher: compile(route.path) }));
  window.addEventListener('hashchange', render);
  render();
}
