import { BOOK_FIELDS, normalizeBook } from './libraryStore.js';

export function exportLibraryJson(books, options = {}) {
  const now = options.now || (() => new Date());
  return JSON.stringify({
    app: "Jane's Library",
    version: 1,
    schemaVersion: 1,
    exportedAt: now().toISOString(),
    books: books.map(normalizeBook)
  }, null, 2);
}

export function parseLibraryBackup(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('That backup file could not be read.');
  }
  if (!parsed || !Array.isArray(parsed.books)) throw new Error("That file does not look like a Jane's Library backup.");
  const books = parsed.books.map(normalizeBook);
  if (books.some((book) => !book.title)) {
    throw new Error('That backup has at least one book missing a title. Local data was not changed.');
  }
  return {
    app: parsed.app || "Jane's Library",
    version: parsed.version || 1,
    schemaVersion: parsed.schemaVersion || parsed.version || 1,
    exportedAt: parsed.exportedAt || '',
    books
  };
}

export function booksToCsv(books) {
  const headers = [
    ['title', 'Title'],
    ['authors', 'Authors'],
    ['rating', 'Rating'],
    ['subtitle', 'Subtitle'],
    ['isbn10', 'ISBN-10'],
    ['isbn13', 'ISBN-13'],
    ['publisher', 'Publisher'],
    ['publishedDate', 'Published Date'],
    ['category', 'Category'],
    ['subcategory', 'Subcategory'],
    ['shelfLocation', 'Shelf Location'],
    ['status', 'Status'],
    ['borrowedBy', 'Borrowed By'],
    ['notes', 'Notes']
  ];
  const rows = [headers.map(([, label]) => label).join(',')];
  for (const book of books.map(normalizeBook)) {
    rows.push(headers.map(([key]) => csvCell(Array.isArray(book[key]) ? book[key].join('; ') : book[key])).join(','));
  }
  return rows.join('\n');
}

export function validateBookShape(book) {
  return BOOK_FIELDS.every((field) => Object.prototype.hasOwnProperty.call(normalizeBook(book), field));
}

function csvCell(value) {
  const text = String(value || '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
