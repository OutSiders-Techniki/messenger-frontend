// Одноразовые данные для следующего экрана (например, ID после регистрации).
// Хранятся только в памяти, чтобы не попадать в URL и историю браузера.

const store = new Map();

export function putFlash(key, value) {
  store.set(key, value);
}

export function takeFlash(key) {
  const value = store.get(key);
  store.delete(key);
  return value;
}
