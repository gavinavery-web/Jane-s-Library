export const BOOK_FIELDS = [
  'id',
  'title',
  'subtitle',
  'authors',
  'isbn10',
  'isbn13',
  'publisher',
  'publishedDate',
  'category',
  'subcategory',
  'shelfLocation',
  'summary',
  'coverImageUrl',
  'coverImageData',
  'notes',
  'rating',
  'status',
  'borrowedBy',
  'borrowedDate',
  'returnedDate',
  'source',
  'dateAdded',
  'lastUpdated'
];

const DB_NAME = 'janes-library-pwa';
const DB_VERSION = 1;
const STORE_NAME = 'books';

export function normalizeBook(input = {}) {
  const now = new Date().toISOString();
  const authors = Array.isArray(input.authors)
    ? input.authors.map(String).map((name) => name.trim()).filter(Boolean)
    : String(input.authors || '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);

  return {
    id: text(input.id) || makeId(),
    title: text(input.title),
    subtitle: text(input.subtitle),
    authors,
    isbn10: text(input.isbn10),
    isbn13: text(input.isbn13),
    publisher: text(input.publisher),
    publishedDate: text(input.publishedDate),
    category: text(input.category),
    subcategory: text(input.subcategory),
    shelfLocation: text(input.shelfLocation),
    summary: text(input.summary),
    coverImageUrl: text(input.coverImageUrl),
    coverImageData: text(input.coverImageData),
    notes: text(input.notes),
    rating: normalizeRating(input.rating),
    status: text(input.status) || 'Available',
    borrowedBy: text(input.borrowedBy),
    borrowedDate: text(input.borrowedDate),
    returnedDate: text(input.returnedDate),
    source: text(input.source) || 'Manual',
    dateAdded: text(input.dateAdded) || now,
    lastUpdated: text(input.lastUpdated) || now
  };
}

export function createLibraryStore(driver) {
  return {
    async listBooks() {
      const books = await driver.getAll();
      return books.map(normalizeBook).sort((a, b) => a.title.localeCompare(b.title));
    },
    async getBook(id) {
      const book = await driver.get(id);
      return book ? normalizeBook(book) : null;
    },
    async createBook(input) {
      const book = normalizeBook(input);
      if (!book.title) throw new Error('Please add a title before saving.');
      await driver.put(book);
      return book;
    },
    async updateBook(id, changes) {
      const existing = await driver.get(id);
      if (!existing) throw new Error('That book could not be found.');
      const updated = normalizeBook({
        ...existing,
        ...changes,
        id,
        dateAdded: existing.dateAdded,
        lastUpdated: new Date().toISOString()
      });
      if (!updated.title) throw new Error('Please add a title before saving.');
      await driver.put(updated);
      return updated;
    },
    async deleteBook(id) {
      await driver.delete(id);
    },
    async replaceBooks(books) {
      await driver.clear();
      const normalized = books.map(normalizeBook);
      for (const book of normalized) await driver.put(book);
      return normalized;
    },
    async mergeBooks(books) {
      const existing = await driver.getAll();
      const existingIds = new Set(existing.map((book) => book.id));
      const normalized = books.map((book) => {
        const candidate = normalizeBook(book);
        if (existingIds.has(candidate.id)) candidate.id = makeId();
        return candidate;
      });
      for (const book of normalized) await driver.put(book);
      return normalized;
    },
    async clear() {
      await driver.clear();
    }
  };
}

export function createMemoryDriver(initialBooks = []) {
  const rows = new Map(initialBooks.map((book) => [book.id, normalizeBook(book)]));
  return {
    async getAll() {
      return Array.from(rows.values());
    },
    async get(id) {
      return rows.get(id) || null;
    },
    async put(book) {
      rows.set(book.id, normalizeBook(book));
    },
    async delete(id) {
      rows.delete(id);
    },
    async clear() {
      rows.clear();
    }
  };
}

export function createIndexedDbDriver() {
  return {
    async getAll() {
      const db = await openDb();
      return requestToPromise(db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll());
    },
    async get(id) {
      const db = await openDb();
      return requestToPromise(db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id));
    },
    async put(book) {
      const db = await openDb();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(normalizeBook(book));
      await txDone(tx);
    },
    async delete(id) {
      const db = await openDb();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      await txDone(tx);
    },
    async clear() {
      const db = await openDb();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      await txDone(tx);
    }
  };
}

function openDb() {
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('This browser cannot save the library locally.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function makeId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `book-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

function normalizeRating(value) {
  if (value === '' || value == null) return 0;
  const rating = Number(value);
  return Number.isInteger(rating) && rating >= 0 && rating <= 5 ? rating : 0;
}
