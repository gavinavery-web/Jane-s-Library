import { test, assert } from './testHarness.mjs';
import { createLibraryStore, createMemoryDriver, normalizeBook } from '../src/libraryStore.js';

test('book records can be created, edited, listed and deleted', async () => {
  const store = createLibraryStore(createMemoryDriver());

  const created = await store.createBook({ title: 'Safari', authors: ['Jane Avery'], status: '', rating: '5' });
  assert.equal(created.title, 'Safari');
  assert.equal(created.status, 'Available');
  assert.equal(created.rating, 5);
  assert.ok(created.id);
  assert.ok(created.dateAdded);

  const listed = await store.listBooks();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].title, 'Safari');

  const updated = await store.updateBook(created.id, { notes: 'Coffee table', shelfLocation: 'Window Wall / Table', rating: 3 });
  assert.equal(updated.notes, 'Coffee table');
  assert.equal(updated.shelfLocation, 'Window Wall / Table');
  assert.equal(updated.rating, 3);

  await store.deleteBook(created.id);
  assert.deepEqual(await store.listBooks(), []);
});

test('normalizing a book keeps all required fields present', () => {
  const book = normalizeBook({ title: "Nobody's Girl", authors: 'Virginia Roberts' });
  assert.equal(book.title, "Nobody's Girl");
  assert.deepEqual(book.authors, ['Virginia Roberts']);
  assert.equal(book.status, 'Available');
  assert.equal(book.rating, 0);
  assert.equal(book.coverImageData, '');
  assert.equal(book.source, 'Manual');
});

test('rating is always a numeric value from 0 to 5', () => {
  assert.equal(normalizeBook({ title: 'Five', rating: '5' }).rating, 5);
  assert.equal(normalizeBook({ title: 'Zero', rating: 0 }).rating, 0);
  assert.equal(normalizeBook({ title: 'Too high', rating: 6 }).rating, 0);
  assert.equal(normalizeBook({ title: 'Decimal', rating: 4.5 }).rating, 0);
  assert.equal(normalizeBook({ title: 'Missing' }).rating, 0);
});
