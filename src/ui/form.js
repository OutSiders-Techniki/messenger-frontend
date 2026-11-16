// Помощники для форм: проверка полей и блокировка отправки после 429.

// rules: [[field, () => 'текст ошибки' | null], …]
// Показывает ошибки у полей и ставит фокус на первое неверное.
// Возвращает true, если всё верно.
export function validateFields(rules) {
  let firstInvalid = null;
  for (const [field, check] of rules) {
    const message = check();
    field.setError(message);
    if (message && !firstInvalid) firstInvalid = field;
  }
  firstInvalid?.input.focus();
  return !firstInvalid;
}

// Блокирует кнопку на seconds секунд с обратным отсчётом на ней.
// Возвращает функцию досрочной отмены — её нужно вызвать при уходе с экрана.
export function cooldown(btn, seconds, label = (s) => `Повторить через ${s} с`) {
  const original = Array.from(btn.childNodes);
  let left = Math.max(1, Math.ceil(seconds));

  btn.disabled = true;
  btn.textContent = label(left);

  const timer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      stop();
    } else {
      btn.textContent = label(left);
    }
  }, 1000);

  function stop() {
    clearInterval(timer);
    btn.disabled = false;
    btn.replaceChildren(...original);
  }

  return stop;
}

// Сколько ждать после 429, если сервер не прислал Retry-After.
export const DEFAULT_RETRY_SECONDS = 30;
