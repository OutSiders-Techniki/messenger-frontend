// Витрина дизайн-системы: все компоненты и их состояния на одной странице.
// Нужна, чтобы согласовывать вид с командой и проверять тёмную тему.

import {
  alert,
  avatar,
  badge,
  button,
  checkbox,
  confirmDialog,
  emptyState,
  field,
  loading,
  spinner,
} from '../ui/components.js';
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { backLink } from '../ui/layout.js';

function section(title, ...content) {
  return h('section', { class: 'sg-section' }, h('h2', null, title), ...content);
}

function swatch(name, label) {
  return h(
    'div',
    { class: 'sg-swatch' },
    h('span', { class: `sg-swatch__color sg-color--${name}` }),
    h('span', { class: 'sg-swatch__name' }, label),
    h('code', { class: 'sg-swatch__token' }, `--color-${name}`),
  );
}

export function styleguideScreen() {
  const invalid = field({ label: 'ID собеседника', value: 'ABC', mono: true });
  invalid.setError('ID должен состоять из 8 символов');

  const result = h('p', { class: 'muted text-sm', role: 'status' });

  return h(
    'main',
    { class: 'page sg' },
    backLink('/', 'В приложение'),
    h(
      'div',
      { class: 'page-head' },
      h('h1', null, 'Дизайн-система'),
      badge({ tone: 'neutral' }, 'MSG-43'),
    ),

    section(
      'Цвета',
      h(
        'div',
        { class: 'sg-grid' },
        swatch('bg', 'Фон'),
        swatch('surface', 'Поверхность'),
        swatch('surface-2', 'Поверхность 2'),
        swatch('border', 'Граница'),
        swatch('text', 'Текст'),
        swatch('text-muted', 'Второстепенный текст'),
        swatch('accent', 'Акцент'),
        swatch('accent-soft', 'Акцент мягкий'),
        swatch('danger', 'Опасность'),
        swatch('warning', 'Предупреждение'),
        swatch('success', 'Успех'),
      ),
    ),

    section(
      'Типографика',
      h(
        'div',
        { class: 'stack' },
        h('h1', null, 'Заголовок 1 — 28px'),
        h('h2', null, 'Заголовок 2 — 22px'),
        h('h3', null, 'Заголовок 3 — 18px'),
        h('p', null, 'Основной текст — 16px. Сообщения шифруются на вашем устройстве.'),
        h('p', { class: 'muted text-sm' }, 'Второстепенный текст — 14px'),
        h('p', { class: 'mono' }, 'Моноширинный: K7PX-QM2D-… (ID и ключи)'),
      ),
    ),

    section(
      'Кнопки',
      h(
        'div',
        { class: 'stack' },
        h(
          'div',
          { class: 'cluster' },
          button({}, 'Основная'),
          button({ variant: 'secondary' }, 'Вторичная'),
          button({ variant: 'ghost' }, 'Прозрачная'),
          button({ variant: 'danger' }, icon('trash', { size: 18 }), 'Удалить'),
        ),
        h(
          'div',
          { class: 'cluster' },
          button({ size: 'sm' }, 'Маленькая'),
          button({ variant: 'secondary', size: 'sm' }, icon('copy', { size: 16 }), 'Скопировать'),
          button({ variant: 'ghost', icon: true, 'aria-label': 'Отправить' }, icon('send')),
          button({ disabled: true }, 'Недоступна'),
          button({ disabled: true, 'aria-busy': 'true' }, spinner(), 'Отправляем…'),
        ),
        button({ block: true }, 'Кнопка на всю ширину'),
      ),
    ),

    section(
      'Поля ввода',
      h(
        'div',
        { class: 'stack sg-narrow' },
        field({ label: 'Обычное поле', placeholder: 'Подсказка внутри поля' }).root,
        field({ label: 'С пояснением', hint: 'Пояснение под полем помогает заполнить правильно' }).root,
        field({ label: 'Пароль', type: 'password', value: 'secret-pass', revealable: true }).root,
        invalid.root,
        field({ label: 'Недоступное', value: 'Нельзя изменить', disabled: true }).root,
        field({ label: 'Ключ диалога', mono: true, placeholder: 'XXXX-XXXX-…', multiline: true }).root,
        checkbox({
          label: 'Не запоминать на этом устройстве',
          hint: 'Ключ будет жить только до закрытия вкладки',
        }).root,
      ),
    ),

    section(
      'Уведомления',
      h(
        'div',
        { class: 'stack' },
        alert({ tone: 'info', title: 'Информация' }, 'Ключ на сервер не передаётся.'),
        alert({ tone: 'success' }, 'Ключ принят. Диалог готов к переписке.'),
        alert({ tone: 'warning', title: 'Сохраните ключ' }, 'Он показывается один раз.'),
        alert({ tone: 'danger', title: 'Неверный ключ' }, 'Неверный ключ или ошибка ввода. Проверьте контрольную сумму.'),
      ),
    ),

    section(
      'Значки, аватары, загрузка',
      h(
        'div',
        { class: 'cluster' },
        badge({ tone: 'neutral' }, 'Без ключа'),
        badge({ tone: 'accent' }, '3'),
        badge({ tone: 'danger' }, 'Ошибка'),
        avatar('K7PXQM2D'),
        avatar('B3HN8R5T'),
        loading('Загружаем…'),
      ),
    ),

    section(
      'Список',
      h(
        'ul',
        { class: 'list' },
        h(
          'li',
          null,
          h(
            'a',
            { href: '#/ui', class: 'list-item' },
            avatar('K7PXQM2D'),
            h(
              'span',
              { class: 'list-item__main' },
              h('span', { class: 'list-item__title mono' }, 'K7PXQM2D'),
              h('span', { class: 'list-item__meta' }, 'Последнее сообщение: сегодня, 14:05'),
            ),
            badge({ tone: 'accent' }, '2'),
          ),
        ),
        h(
          'li',
          null,
          h(
            'a',
            { href: '#/ui', class: 'list-item' },
            avatar('B3HN8R5T'),
            h(
              'span',
              { class: 'list-item__main' },
              h('span', { class: 'list-item__title mono' }, 'B3HN8R5T'),
              h('span', { class: 'list-item__meta' }, 'Ключ ещё не введён'),
            ),
            badge({ tone: 'neutral' }, 'Без ключа'),
          ),
        ),
      ),
    ),

    section(
      'Пустое состояние',
      h(
        'div',
        { class: 'card' },
        emptyState({
          title: 'Диалогов пока нет',
          text: 'Найдите собеседника по его ID и договоритесь о встрече, чтобы передать ключ.',
          action: button({}, icon('plus', { size: 18 }), 'Новый диалог'),
        }),
      ),
    ),

    section(
      'Модальное окно',
      h(
        'div',
        { class: 'stack' },
        h(
          'div',
          { class: 'cluster' },
          button(
            {
              variant: 'secondary',
              async onClick() {
                const ok = await confirmDialog({
                  title: 'Создать диалог?',
                  text: 'Будет создан ключ, который нужно передать собеседнику лично.',
                  confirmLabel: 'Создать',
                });
                result.textContent = ok ? 'Подтверждено' : 'Отменено';
              },
            },
            'Обычное подтверждение',
          ),
          button(
            {
              variant: 'danger',
              async onClick() {
                const ok = await confirmDialog({
                  title: 'Удалить у обоих?',
                  text: 'Переписка будет удалена с сервера у вас и у собеседника. Отменить это нельзя.',
                  confirmLabel: 'Удалить у обоих',
                  tone: 'danger',
                });
                result.textContent = ok ? 'Удалено' : 'Отменено';
              },
            },
            'Разрушительное действие',
          ),
        ),
        result,
      ),
    ),
  );
}
