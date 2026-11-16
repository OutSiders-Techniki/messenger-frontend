// Правила полей входа и регистрации. Совпадают с messenger-backend:
// PublicIdGenerator (12 символов, алфавит без 0/O, 1/I/L, U) и
// RegistrationService (пароль 8–128 символов).

export const PUBLIC_ID_LENGTH = 12;
export const PUBLIC_ID_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

const ID_CHARS = new RegExp(`^[${PUBLIC_ID_ALPHABET}]+$`);

// Пользователь может ввести ID группами, с пробелами и строчными буквами —
// серверу уходит только сам ID.
export function normalizePublicId(value) {
  return String(value ?? '').replace(/[\s-]/g, '').toUpperCase();
}

// Текст ошибки или null, если ID выглядит корректно.
// Существование ID проверяет сервер.
export function validatePublicId(value) {
  const id = normalizePublicId(value);
  if (!id) return 'Введите ID';
  if (/[^A-Z0-9]/.test(id)) return 'ID состоит только из латинских букв и цифр';
  // Частая ошибка — перепутать похожие символы.
  if (!ID_CHARS.test(id)) return 'В ID нет символов 0, 1, I, L, O и U — проверьте похожие буквы и цифры';
  if (id.length !== PUBLIC_ID_LENGTH) return `ID состоит из ${PUBLIC_ID_LENGTH} символов, сейчас ${id.length}`;
  return null;
}

// Пароль при входе: только «не пустой». Остальные правила не показываем,
// чтобы не подсказывать, почему вход не удался.
export function validateLoginPassword(value) {
  return value ? null : 'Введите пароль';
}

// Пароль при регистрации.
export function validateNewPassword(value) {
  if (!value) return 'Придумайте пароль';
  if (!value.trim()) return 'Пароль не может состоять из одних пробелов';
  if (value.length < PASSWORD_MIN) return `Пароль должен быть не короче ${PASSWORD_MIN} символов`;
  if (value.length > PASSWORD_MAX) return `Пароль должен быть не длиннее ${PASSWORD_MAX} символов`;
  return null;
}

export function validatePasswordConfirm(password, confirm) {
  if (!confirm) return 'Повторите пароль';
  if (password !== confirm) return 'Пароли не совпадают';
  return null;
}
