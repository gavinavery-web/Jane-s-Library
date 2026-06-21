import { test, assert } from './testHarness.mjs';
import { exportLibraryJson, parseLibraryBackup, booksToCsv } from '../src/backup.js';

test('backup export and import round-trip valid book data', () => {
  const json = exportLibraryJson(
    [{ id: 'b1', title: 'Safari', authors: ['Jane Avery'], rating: 5 }],
    { categorySettings: { customSubcategories: { Fiction: ['Family Saga'] } } }
  );
  const parsed = parseLibraryBackup(json);
  assert.equal(parsed.books.length, 1);
  assert.equal(parsed.books[0].title, 'Safari');
  assert.equal(parsed.books[0].rating, 5);
  assert.equal(parsed.categorySettings.customSubcategories.Fiction.includes('Family Saga'), true);
});

test('invalid backup data is rejected with a friendly error', () => {
  assert.throws(() => parseLibraryBackup('{"notBooks":true}'), /does not look like a Jane/);
  assert.throws(() => parseLibraryBackup('not json'), /could not be read/);
  assert.throws(() => parseLibraryBackup('{"books":[{"authors":["No Title"]}]}'), /missing a title/);
});

test('CSV export includes total quantity, numbered rows and readable library columns', () => {
  const csv = booksToCsv([
    {
      title: "Nobody's Girl",
      authors: ['Virginia Roberts'],
      category: 'Non-Fiction',
      subcategory: 'Memoir',
      shelfLocation: 'Window shelf',
      status: 'Borrowed',
      borrowedBy: 'Mary',
      borrowedDate: '2026-06-01',
      returnedDate: '2026-07-01',
      notes: 'Shelf, table',
      rating: 4
    }
  ]);

  assert.match(csv, /Total Books,1/);
  assert.match(csv, /Number,Title,Author,Main Category,Subcategory,Shelf\/location,Status,Borrowed by \/ borrowed status/);
  assert.match(csv, /1,Nobody's Girl,Virginia Roberts,Non-Fiction,Memoir,Window shelf,Borrowed,Mary/);
  assert.match(csv, /"Shelf, table"/);
});
