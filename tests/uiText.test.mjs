import fs from 'node:fs';
import { test, assert } from './testHarness.mjs';

test('Jane-facing add and lookup wording uses barcode instead of ISBN jargon', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  [
    'Scan, ISBN or manual',
    'enter an ISBN',
    'Search by title, author, shelf, notes or ISBN',
    'Title, author, ISBN or notes',
    'ISBN or barcode number',
    'Looking for that ISBN',
    'Please type the ISBN instead',
    'Type ISBN Instead',
    'Enter ISBN',
    'ISBN-13',
    'ISBN-10'
  ].forEach((text) => {
    assert.equal(source.includes(text), false, `Unexpected Jane-facing ISBN wording: ${text}`);
  });
});

test('barcode scanner screen uses one clear camera action and fallback wording', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.equal(source.includes('Scan Barcode'), true);
  assert.equal(source.includes('Enter Barcode Manually'), true);
  assert.equal(source.includes('Camera is open — hold barcode still'), true);
  assert.equal(source.includes('Cancel Scan'), true);
  assert.equal(source.includes('Try Camera Again'), true);
  assert.equal(source.includes('Stop Camera'), false);
});

test('backup screen makes Google Drive connection state obvious', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.equal(source.includes('Connected to Google Drive'), true);
  assert.equal(source.includes('Back Up Now'), true);
  assert.equal(source.includes('Restore from Drive'), true);
});

test('browse screen links to the real check in and check out workflow', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.equal(source.includes('Check In / Check Out'), true);
  assert.equal(source.includes('Check Out Book'), true);
  assert.equal(source.includes('Currently borrowed'), true);
  assert.equal(source.includes('Check In'), true);
});

test('app has an in-app back button instead of relying on browser back', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.equal(source.includes('data-action="app-back"'), true);
  assert.equal(source.includes('Back'), true);
});

test('cover images have a browser-side fallback if an external cover URL breaks', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.equal(source.includes('data-cover-fallback'), true);
  assert.equal(source.includes('handleCoverError'), true);
});

test('redesigned UI wires Jane library assets and direct category settings access', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const styles = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

  [
    'assets/ui/home-library.jpg',
    'assets/ui/shelves-library-optimized.jpg',
    'assets/ui/book-spines-optimized.jpg',
    'assets/ui/settings-library.jpg',
    'assets/ui/reading-lady.svg'
  ].forEach((asset) => {
    assert.equal(source.includes(asset) || styles.includes(asset), true, `Missing UI asset reference: ${asset}`);
  });
  assert.equal(source.includes('data-action="open-category-manager"'), true);
  assert.equal(source.includes('Manage Categories'), true);
});

test('backup screen includes the Library Donkey backup helper without breaking Drive backup action', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

  assert.equal(source.includes('Donkey Backup'), true);
  assert.equal(source.includes('Tap the donkey to save Jane'), true);
  assert.equal(source.includes('data-action="drive-save"'), true);
  assert.equal(source.includes('Backup saved. The donkey has kicked the data into Google Drive.'), true);
  assert.equal(source.includes('Ask the Donkey'), true);
  assert.equal(source.includes('Library Donkey'), true);
});
