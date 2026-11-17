// Форматирование дат для интерфейса (русская локаль, время устройства).

const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const full = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// Короткая метка для списка: «14:05», «вчера», «16 нояб.», «3 мар. 2025 г.».
export function formatListTime(value, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return time.format(date);
  if (days === 1) return 'вчера';
  if (date.getFullYear() === now.getFullYear()) return dayMonth.format(date);
  return full.format(date);
}
