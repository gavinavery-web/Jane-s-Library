import { BOOK_FIELDS, normalizeBook } from './libraryStore.js';
import { normalizeCategorySettings } from './categories.js';

export function exportLibraryJson(books, options = {}) {
  const now = options.now || (() => new Date());
  return JSON.stringify({
    app: "Jane's Library",
    version: 1,
    schemaVersion: 1,
    exportedAt: now().toISOString(),
    categorySettings: normalizeCategorySettings(options.categorySettings),
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
    categorySettings: normalizeCategorySettings(parsed.categorySettings),
    books
  };
}

export function booksToCsv(books) {
  const libraryBooks = books.map(normalizeBook);
  const headers = [
    'Number',
    'Title',
    'Author',
    'Main Category',
    'Subcategory',
    'Shelf/location',
    'Status',
    'Borrowed by / borrowed status',
    'Borrowed date',
    'Due/return date',
    'Rating',
    'Notes'
  ];
  const rows = [
    `Total Books,${libraryBooks.length}`,
    '',
    headers.map(csvCell).join(',')
  ];
  libraryBooks.forEach((book, index) => {
    rows.push([
      index + 1,
      book.title,
      book.authors.join('; '),
      book.category || 'Uncategorised',
      book.subcategory,
      book.shelfLocation,
      book.status,
      borrowingSummary(book),
      book.borrowedDate,
      book.returnedDate,
      book.rating,
      book.notes
    ].map(csvCell).join(','));
  });
  return rows.join('\n');
}

export function validateBookShape(book) {
  return BOOK_FIELDS.every((field) => Object.prototype.hasOwnProperty.call(normalizeBook(book), field));
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function borrowingSummary(book) {
  if (book.borrowedBy) return book.borrowedBy;
  return String(book.status || '').toLowerCase() === 'borrowed' ? 'Borrowed' : 'Available';
}
