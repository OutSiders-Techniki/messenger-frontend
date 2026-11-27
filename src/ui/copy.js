import { button } from './components.js';
import { h } from './dom.js';
import { icon } from './icons.js';

export function copyControl(value, { label, target, compact = false }) {
  const status = h('span', { class: 'visually-hidden', role: 'status' });
  const control = button(
    {
      variant: compact ? 'ghost' : 'secondary',
      size: 'sm',
      icon: compact,
      'aria-label': label,
      title: label,
      onClick: copy,
    },
    icon('copy', { size: 16 }),
    compact ? null : label,
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      status.textContent = 'Скопировано в буфер обмена';
      control.title = 'Скопировано';
      control.replaceChildren(icon('check', { size: 16 }), ...(compact ? [] : ['Скопировано']));
    } catch {
      if (!target.isConnected) return;
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(target);
      selection.removeAllRanges();
      selection.addRange(range);
      control.title = 'Текст выделен для ручного копирования';
      status.textContent = control.title;
      if (!compact) control.replaceChildren(icon('copy', { size: 16 }), 'Скопируйте выделенный текст');
    }
  }

  return h('span', null, control, status);
}
