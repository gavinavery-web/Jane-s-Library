import { test, assert } from './testHarness.mjs';
import {
  cleanIsbn,
  isLikelyIsbn,
  googleVolumeToBook,
  openLibraryDocToBook,
  mergeBookMetadata,
  lookupBookByIsbn
} from '../src/isbn.js';

test('ISBN cleanup and validation accepts likely ISBN-10 and ISBN-13 values', () => {
  assert.equal(cleanIsbn('978-1-76106-981-9'), '9781761069819');
  assert.equal(cleanIsbn('0 306 40615 2'), '0306406152');
  assert.equal(isLikelyIsbn('9781761069819'), true);
  assert.equal(isLikelyIsbn('0306406152'), true);
  assert.equal(isLikelyIsbn('123'), false);
});

test('Google Books volume data maps into Jane book fields', () => {
  const book = googleVolumeToBook({
    volumeInfo: {
      title: 'Flawed Hero',
      subtitle: 'Truth, Lies and War Crimes',
      authors: ['Chris Masters'],
      publisher: 'Allen & Unwin',
      publishedDate: '2023-11-01',
      description: 'A biography.',
      categories: ['Biography & Autobiography'],
      imageLinks: { thumbnail: 'http://covers.example/flawed.jpg' },
      industryIdentifiers: [
        { type: 'ISBN_10', identifier: '1761069817' },
        { type: 'ISBN_13', identifier: '9781761069819' }
      ]
    }
  });
  assert.equal(book.title, 'Flawed Hero');
  assert.equal(book.isbn13, '9781761069819');
  assert.equal(book.category, 'Biography & Autobiography');
  assert.equal(book.source, 'Google Books');
});

test('Open Library data can fill gaps in Google metadata', () => {
  const google = { title: 'Flawed Hero', authors: ['Chris Masters'], source: 'Google Books' };
  const openLibrary = openLibraryDocToBook({
    title: 'Flawed Hero',
    author_name: ['Chris Masters'],
    publisher: ['Allen & Unwin'],
    first_publish_year: 2023,
    isbn: ['9781761069819'],
    cover_i: 12345,
    subject: ['War crimes']
  });
  const merged = mergeBookMetadata(google, openLibrary);
  assert.equal(merged.publisher, 'Allen & Unwin');
  assert.equal(merged.publishedDate, '2023');
  assert.equal(merged.isbn13, '9781761069819');
  assert.match(merged.source, /Google Books/);
  assert.match(merged.source, /Open Library/);
});

test('lookup automatically falls back to Open Library when Google Books rate-limits', async () => {
  const calls = [];
  const book = await lookupBookByIsbn('9781761069819', async (url) => {
    calls.push(url);
    if (url.includes('googleapis')) {
      return { ok: false, status: 429, json: async () => ({}) };
    }
    return {
      ok: true,
      json: async () => ({
        docs: [{
          title: 'Flawed Hero',
          author_name: ['Chris Masters'],
          isbn: ['9781761069819'],
          publisher: ['Allen & Unwin'],
          first_publish_year: 2023
        }]
      })
    };
  });
  assert.equal(book.title, 'Flawed Hero');
  assert.equal(book.source, 'Open Library');
  assert.equal(calls.some((url) => url.includes('googleapis')), true);
  assert.equal(calls.some((url) => url.includes('openlibrary')), true);
});

test('lookup gives a friendly no-result error', async () => {
  await assert.rejects(
    () => lookupBookByIsbn('9780000000002', async () => ({ ok: true, json: async () => ({ items: [], docs: [] }) })),
    /No matching book/
  );
});
