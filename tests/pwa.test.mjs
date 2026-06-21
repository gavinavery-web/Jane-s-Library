import fs from 'node:fs';
import { assert, test } from './testHarness.mjs';

test('PWA manifest and iPhone metadata point at installable library icons', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  const html = fs.readFileSync(new URL('../jane-library.html', import.meta.url), 'utf8');

  assert.equal(manifest.name, "Jane's Library");
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.icons.some((icon) => icon.src === 'assets/icon-192.png' && icon.sizes === '192x192'), true);
  assert.equal(manifest.icons.some((icon) => icon.src === 'assets/icon-512.png' && icon.sizes === '512x512'), true);
  assert.equal(html.includes('apple-touch-icon'), true);
  assert.equal(html.includes('apple-mobile-web-app-capable'), true);
});

test('service worker precaches active app modules used by the static PWA', () => {
  const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

  assert.equal(sw.includes('./src/app.js'), true);
  assert.equal(sw.includes('./src/categories.js'), true);
  assert.equal(sw.includes('./src/googleDriveBackup.js'), true);
  assert.equal(sw.includes('./assets/icon-192.png'), true);
});

test('build keeps optimized UI assets and skips raw extracted scratch photos', () => {
  const buildScript = fs.readFileSync(new URL('../scripts/build-check.mjs', import.meta.url), 'utf8');

  assert.equal(fs.existsSync(new URL('../assets/ui/home-library.jpg', import.meta.url)), true);
  assert.equal(fs.existsSync(new URL('../assets/ui/shelves-library-optimized.jpg', import.meta.url)), true);
  assert.equal(fs.existsSync(new URL('../assets/ui/book-spines-optimized.jpg', import.meta.url)), true);
  assert.equal(buildScript.includes('shouldSkipCopy'), true);
  assert.equal(buildScript.includes('assets/ui/shelves-library.jpg'), true);
  assert.equal(buildScript.includes('assets/ui/book-spines.jpg'), true);
});
