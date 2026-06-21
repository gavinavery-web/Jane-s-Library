import { test, assert } from './testHarness.mjs';
import { filterBooks, deriveFilterOptions } from '../src/filters.js';

const books = [
  { title: 'Safari', subtitle: '', authors: ['Jane Avery'], isbn13: '1111111111111', publisher: 'Cottage Press', category: 'Africa', shelfLocation: 'Window Wall / Table', status: 'Available', summary: 'Travel stories', notes: '', rating: 5 },
  { title: 'Flawed Hero', subtitle: '', authors: ['Chris Masters'], isbn13: '9781761069819', publisher: 'Allen & Unwin', category: 'War', shelfLocation: 'Main Shelves / Bay 2', status: 'Borrowed', summary: 'War crimes investigation', notes: 'Lent to Gavin', rating: 3 },
  { title: 'Unrated Book', subtitle: '', authors: ['Jane Avery'], isbn13: '', publisher: '', category: 'Africa', shelfLocation: 'Main Shelves / Bay 1', status: 'Available', summary: '', notes: '', rating: 0 }
];

test('search checks title, authors, ISBN, summary, notes and publisher', () => {
  assert.equal(filterBooks(books, { query: 'flawed' }).length, 1);
  assert.equal(filterBooks(books, { query: 'gavin' }).length, 1);
  assert.equal(filterBooks(books, { query: 'cottage press' }).length, 1);
  assert.equal(filterBooks(books, { query: '9781761069819' }).length, 1);
});

test('filters combine category, author, shelf and status', () => {
  const found = filterBooks(books, {
    category: 'War',
    author: 'Chris Masters',
    shelf: 'Bay 2',
    status: 'Borrowed'
  });
  assert.equal(found.length, 1);
  assert.equal(found[0].title, 'Flawed Hero');
});

test('rating filters work alone and with other filters', () => {
  assert.deepEqual(filterBooks(books, { rating: '5' }).map((book) => book.title), ['Safari']);
  assert.deepEqual(filterBooks(books, { rating: '4up' }).map((book) => book.title), ['Safari']);
  assert.deepEqual(filterBooks(books, { rating: '3up' }).map((book) => book.title), ['Safari', 'Flawed Hero']);
  assert.deepEqual(filterBooks(books, { rating: 'unrated' }).map((book) => book.title), ['Unrated Book']);
  assert.deepEqual(filterBooks(books, { query: 'travel', category: 'Africa', shelf: 'Window', status: 'Available', rating: '5' }).map((book) => book.title), ['Safari']);
});

test('filter options are derived from saved books', () => {
  const options = deriveFilterOptions(books);
  assert.deepEqual(options.categories, ['Africa', 'War']);
  assert.deepEqual(options.statuses, ['Available', 'Borrowed']);
  assert.ok(options.authors.includes('Chris Masters'));
});
