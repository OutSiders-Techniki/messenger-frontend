// Текущий пользователь в памяти вкладки.
// generation увеличивается при каждом входе и выходе: ответы на запросы,
// начатые в прошлом поколении, должны отбрасываться.

let currentUser = null;
let generation = 0;
const listeners = new Set();

function emit() {
  for (const listener of listeners) listener(currentUser);
}

export const session = {
  get user() {
    return currentUser;
  },

  get isAuthenticated() {
    return currentUser !== null;
  },

  get generation() {
    return generation;
  },

  set(user) {
    currentUser = { publicId: user.publicId };
    generation += 1;
    emit();
  },

  clear() {
    if (currentUser === null) return;
    currentUser = null;
    generation += 1;
    emit();
  },

  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
