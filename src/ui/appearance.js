// Настройки «Оформление»: стиль (Lattice / Glass), плотность и цвет акцента.
// Три независимых параметра, каждый — группа радиокнопок.

import { ACCENTS, DENSITIES, THEMES, preferences } from '../state/preferences.js';
import { h } from './dom.js';
import { icon } from './icons.js';

const THEME_LABELS = {
  lattice: ['Lattice', 'Графит и тонкие линии'],
  glass: ['Glass', 'Стеклянные панели над решёткой'],
};

const DENSITY_LABELS = { compact: 'Компактная', normal: 'Обычная', loose: 'Свободная' };

const ACCENT_LABELS = { mint: 'Мята', steel: 'Сталь', amber: 'Янтарь', lavender: 'Лаванда' };

function group(legend, className, ...options) {
  return h('fieldset', { class: `setting ${className}` }, h('legend', { class: 'setting__legend' }, legend), ...options);
}

export function appearanceSettings() {
  const root = h('div', { class: 'appearance' });

  function radio(name, value, checked, onChange) {
    return h('input', { type: 'radio', name, value, class: 'choice__input', checked, onChange });
  }

  function render() {
    const accent = preferences.effectiveAccent;

    root.replaceChildren(
      group(
        'Стиль',
        'setting--themes',
        THEMES.map((theme) => {
          const [title, text] = THEME_LABELS[theme];
          return h(
            'label',
            { class: `choice choice--theme choice--${theme}` },
            radio('theme', theme, preferences.theme === theme, () => {
              preferences.theme = theme;
              render();
            }),
            h(
              'span',
              { class: 'choice__preview', 'aria-hidden': 'true' },
              h('span', { class: 'choice__panel' }),
              h('span', { class: 'choice__panel choice__panel--wide' }, h('span', { class: 'choice__bubble' })),
            ),
            h('span', { class: 'choice__title' }, title),
            h('span', { class: 'choice__text' }, text),
          );
        }),
      ),
      group(
        'Плотность',
        'setting--density',
        h(
          'div',
          { class: 'segmented' },
          DENSITIES.map((density) =>
            h(
              'label',
              { class: 'segmented__option' },
              radio('density', density, preferences.density === density, () => {
                preferences.density = density;
              }),
              h('span', null, DENSITY_LABELS[density]),
            ),
          ),
        ),
      ),
      group(
        'Цвет акцента',
        'setting--accent',
        h(
          'div',
          { class: 'swatches' },
          ACCENTS.map((name) =>
            h(
              'label',
              { class: `swatch swatch--${name}` },
              radio('accent', name, accent === name, () => {
                preferences.accent = name;
                render();
              }),
              // Выбранный отмечен кольцом и галочкой, а не только цветом.
              h('span', { class: 'swatch__dot', 'aria-hidden': 'true' }, icon('check', { size: 14 })),
              h('span', { class: 'swatch__label' }, ACCENT_LABELS[name]),
            ),
          ),
        ),
        h(
          'p',
          { class: 'setting__hint' },
          preferences.accent
            ? 'Цвет выбран вами и сохранится при смене стиля.'
            : 'Пока цвет не выбран, он следует за стилем: Мята в Lattice, Сталь в Glass.',
        ),
      ),
    );
  }

  render();
  return root;
}
