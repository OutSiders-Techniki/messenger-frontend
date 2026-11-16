// Настройки интерфейса этого браузера: свёрнутая боковая панель, оформление.
// Хранятся в localStorage — это не секретные данные, а удобство. Если
// хранилище недоступно (приватный режим), работают значения по умолчанию.

const KEY = 'ui-preferences';
const DEFAULTS = { sidebarCollapsed: false, look: 'default' };
export const LOOKS = ['default', 'glass'];

function read() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)) };
  } catch {
    return { ...DEFAULTS };
  }
}

let prefs = read();

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Настройка проживёт до перезагрузки страницы.
  }
}

export const preferences = {
  get sidebarCollapsed() {
    return prefs.sidebarCollapsed;
  },

  set sidebarCollapsed(value) {
    prefs = { ...prefs, sidebarCollapsed: Boolean(value) };
    write();
  },

  get look() {
    return LOOKS.includes(prefs.look) ? prefs.look : 'default';
  },

  set look(value) {
    prefs = { ...prefs, look: LOOKS.includes(value) ? value : 'default' };
    write();
    applyLook();
  },
};

// Оформление задаётся атрибутом на <html>, стили — в styles/glass.css.
export function applyLook() {
  if (preferences.look === 'default') delete document.documentElement.dataset.look;
  else document.documentElement.dataset.look = preferences.look;
}
