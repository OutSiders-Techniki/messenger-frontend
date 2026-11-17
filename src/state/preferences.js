// Настройки интерфейса этого браузера: стиль, плотность, цвет акцента
// и свёрнутая боковая панель. Хранятся в localStorage — это удобство,
// а не секретные данные. Без хранилища работают значения по умолчанию.
//
// Оформление задаётся атрибутами на <html> (см. styles/tokens.css):
//   data-theme="lattice" | "glass", data-density, data-accent.

const KEY = 'ui-preferences';

export const THEMES = ['lattice', 'glass'];
export const DENSITIES = ['compact', 'normal', 'loose'];
export const ACCENTS = ['mint', 'steel', 'amber', 'lavender'];

const DEFAULTS = {
  sidebarCollapsed: false,
  theme: 'lattice',
  density: 'normal',
  // null — акцент следует за стилем: Мята в Lattice, Сталь в Glass.
  accent: null,
};

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY)) ?? {};
    // Настройка из прошлой версии оформления.
    if (!saved.theme && saved.look === 'glass') saved.theme = 'glass';
    return { ...DEFAULTS, ...saved };
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

function pick(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

export const preferences = {
  get sidebarCollapsed() {
    return prefs.sidebarCollapsed;
  },
  set sidebarCollapsed(value) {
    prefs = { ...prefs, sidebarCollapsed: Boolean(value) };
    write();
  },

  get theme() {
    return pick(prefs.theme, THEMES, DEFAULTS.theme);
  },
  set theme(value) {
    prefs = { ...prefs, theme: pick(value, THEMES, DEFAULTS.theme) };
    write();
    applyAppearance();
  },

  get density() {
    return pick(prefs.density, DENSITIES, DEFAULTS.density);
  },
  set density(value) {
    prefs = { ...prefs, density: pick(value, DENSITIES, DEFAULTS.density) };
    write();
    applyAppearance();
  },

  // Явно выбранный акцент или null.
  get accent() {
    return ACCENTS.includes(prefs.accent) ? prefs.accent : null;
  },
  set accent(value) {
    prefs = { ...prefs, accent: ACCENTS.includes(value) ? value : null };
    write();
    applyAppearance();
  },

  // Акцент, который сейчас на экране (с учётом стиля).
  get effectiveAccent() {
    return this.accent ?? (this.theme === 'glass' ? 'steel' : 'mint');
  },
};

export function applyAppearance() {
  const root = document.documentElement;
  root.dataset.theme = preferences.theme;
  root.dataset.density = preferences.density;
  if (preferences.accent) root.dataset.accent = preferences.accent;
  else delete root.dataset.accent;
}
