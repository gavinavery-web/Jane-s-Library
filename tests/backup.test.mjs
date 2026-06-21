import { test, assert } from './testHarness.mjs';
import { exportLibraryJson, parseLibraryBackup, booksToCsv } from '../src/backup.js';

test('backup export and import round-trip valid book data', () => {
  const json = exportLibraryJson([{ id: 'b1', title: 'Safari', authors: ['Jane Avery'], rating: 5 }]);
  const parsed = parseLibraryBackup(json);
  assert.equal(parsed.books.length, 1);
  assert.equal(parsed.books[0].title, 'Safari');
  assert.equal(parsed.books[0].rating, 5);
});

test('invalid backup data is rejected with a friendly error', () => {
  assert.throws(() => parseLibraryBackup('{"notBooks":true}'), /does not look like a Jane/);
  assert.throws(() => parseLibraryBackup('not json'), /could not be read/);
  assert.throws(() => parseLibraryBackup('{"books":[{"authors":["No Title"]}]}'), /missing a title/);
});

test('CSV export includes readable headers and escaped values', () => {
  const csv = booksToCsv([{ title: "Nobody's Girl", authors: ['Virginia Roberts'], notes: 'Shelf, table', rating: 4 }]);
  assert.match(csv, /Title,Authors,Rating/);
  assert.match(csv, /Nobody's Girl,Virginia Roberts,4/);
  assert.match(csv, /"Shelf, table"/);
});
