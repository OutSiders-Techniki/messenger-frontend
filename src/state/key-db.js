const NAME = 'graphen-dialog-keys';
const STORE = 'keys';
let connection;

function openDatabase() {
  if (!connection) {
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open(NAME, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: ['accountId', 'dialogId'] });
        store.createIndex('account', 'accountId');
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Хранилище ключей занято другой вкладкой'));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          connection = null;
        };
        resolve(db);
      };
    }).catch(error => {
      connection = null;
      throw error;
    });
  }
  return connection;
}

async function access(mode, signal, operation) {
  const database = await openDatabase();
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, mode);
    const request = operation(transaction.objectStore(STORE));
    function abort() {
      try {
        transaction.abort();
      } catch (error) {
        if (error.name !== 'InvalidStateError') throw error;
      }
    }

    signal.addEventListener('abort', abort, { once: true });
    transaction.oncomplete = () => {
      signal.removeEventListener('abort', abort);
      resolve(request.result);
    };
    transaction.onabort = () => {
      signal.removeEventListener('abort', abort);
      reject(transaction.error ?? signal.reason ?? new Error('Операция с хранилищем прервана'));
    };
  });
}

export const keyDatabase = {
  read(accountId, signal) {
    return access('readonly', signal, store => store.index('account').getAll(accountId));
  },
  write(record, signal) {
    return access('readwrite', signal, store => store.put(record));
  },
  delete(accountId, dialogId, signal) {
    return access('readwrite', signal, store => store.delete([accountId, dialogId]));
  },
};
