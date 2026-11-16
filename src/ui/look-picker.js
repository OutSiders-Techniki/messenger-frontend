// Выбор оформления: стандартное или Liquid Glass.
// Радиокнопки, оформленные карточками с мини-превью.

import { LOOKS, preferences } from '../state/preferences.js';
import { h } from './dom.js';

const LABELS = {
  default: ['Стандартное', 'Плотные панели, спокойный фон'],
  glass: ['Liquid Glass', 'Полупрозрачное стекло над живым фоном'],
};

export function lookPicker() {
  return h(
    'fieldset',
    { class: 'look-picker' },
    h('legend', { class: 'look-picker__legend' }, 'Оформление'),
    LOOKS.map((look) => {
      const [title, text] = LABELS[look];
      return h(
        'label',
        { class: `look-option look-option--${look}` },
        h('input', {
          type: 'radio',
          name: 'look',
          value: look,
          class: 'look-option__input',
          checked: preferences.look === look,
          onChange: () => {
            preferences.look = look;
          },
        }),
        h(
          'span',
          { class: 'look-option__preview', 'aria-hidden': 'true' },
          h('span', { class: 'look-option__panel' }),
          h('span', { class: 'look-option__panel look-option__panel--wide' }),
        ),
        h('span', { class: 'look-option__title' }, title),
        h('span', { class: 'look-option__text' }, text),
      );
    }),
  );
}
