/**
 * IndexedDB service layer for TEPS Crew
 * UI must not access IndexedDB directly — use these helpers.
 */

const DB_NAME = 'tepscrew-db';
const DB_VERSION = 3;

const STORES = [
  'questionBank',
  'vocabulary',
  'learningRecords',
  'reviewQueue',
  'mockTests',
  'knowledgeMap',
  'profile',
  'foundationProgress',
  'aiCache',
  'customVocabulary',
  'contentPacks',
];

let dbPromise = null;

function ensureIndex(store, name, keyPath, options) {
  if (!store.indexNames.contains(name)) {
    store.createIndex(name, keyPath, options || { unique: false });
  }
}

function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('이 브라우저는 IndexedDB를 지원하지 않습니다.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error('IndexedDB를 열 수 없습니다.'));
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onblocked = () => {
      console.error('IndexedDB upgrade blocked by another tab');
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const tx = event.target.transaction;

      STORES.forEach((name) => {
        let store;
        if (!db.objectStoreNames.contains(name)) {
          store = db.createObjectStore(name, { keyPath: 'id' });
        } else {
          store = tx.objectStore(name);
        }

        if (name === 'questionBank') {
          ensureIndex(store, 'section', 'section');
          ensureIndex(store, 'type', 'type');
          ensureIndex(store, 'difficulty', 'difficulty');
          ensureIndex(store, 'targetScoreBand', 'targetScoreBand');
        }
        if (name === 'learningRecords') {
          ensureIndex(store, 'createdAt', 'createdAt');
          ensureIndex(store, 'type', 'type');
          ensureIndex(store, 'recordType', 'recordType');
          ensureIndex(store, 'sessionId', 'sessionId');
          ensureIndex(store, 'questionId', 'questionId');
        }
        if (name === 'reviewQueue') {
          ensureIndex(store, 'status', 'status');
          ensureIndex(store, 'type', 'type');
          ensureIndex(store, 'nextReview', 'nextReview');
        }
        if (name === 'vocabulary') {
          ensureIndex(store, 'status', 'status');
          ensureIndex(store, 'nextReview', 'nextReview');
        }
        if (name === 'mockTests') {
          ensureIndex(store, 'type', 'type');
          ensureIndex(store, 'createdAt', 'createdAt');
        }
        if (name === 'aiCache') {
          ensureIndex(store, 'expiresAt', 'expiresAt');
        }
        if (name === 'customVocabulary') {
          ensureIndex(store, 'word', 'word');
          ensureIndex(store, 'status', 'status');
        }
        if (name === 'contentPacks') {
          ensureIndex(store, 'source', 'source');
        }
      });
    };
  });

  return dbPromise;
}

export async function initDB() {
  const db = await openDB();
  return db;
}

function txStore(db, storeName, mode = 'readonly') {
  const tx = db.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

export async function addItem(storeName, item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = txStore(db, storeName, 'readwrite');
    const request = store.add(item);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putItem(storeName, item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = txStore(db, storeName, 'readwrite');
    const request = store.put(item);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getItem(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = txStore(db, storeName, 'readonly');
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllItems(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = txStore(db, storeName, 'readonly');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function updateItem(storeName, id, updates) {
  const existing = await getItem(storeName, id);
  if (!existing) {
    throw new Error(`항목을 찾을 수 없습니다: ${storeName}/${id}`);
  }
  const next = { ...existing, ...updates, id };
  await putItem(storeName, next);
  return next;
}

export async function deleteItem(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = txStore(db, storeName, 'readwrite');
    const request = store.delete(id);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

export async function clearStore(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = txStore(db, storeName, 'readwrite');
    const request = store.clear();
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

export async function countItems(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = txStore(db, storeName, 'readonly');
    const request = store.count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function clearAllStores() {
  for (const name of STORES) {
    await clearStore(name);
  }
}

export function getStoreNames() {
  return [...STORES];
}

export async function exportAllData() {
  const data = {};
  for (const name of STORES) {
    data[name] = await getAllItems(name);
  }
  return data;
}

export async function importStoreData(storeName, items, { clearFirst = false } = {}) {
  if (clearFirst) await clearStore(storeName);
  for (const item of items) {
    await putItem(storeName, item);
  }
  return items.length;
}
