import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  const runtimeNodeModules = process.env.PLAYWRIGHT_NODE_MODULES
    || 'C:/Users/gavin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright';
  const runtimeRequire = createRequire(`${runtimeNodeModules}/index.js`);
  ({ chromium } = runtimeRequire('playwright'));
}

const baseUrl = process.env.JANES_LIBRARY_URL || 'http://localhost:4173';
let browser;

try {
  const hardTimeout = setTimeout(() => {
    console.error('Smoke test timed out after 75 seconds.');
    process.exit(1);
  }, 75000);
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width: 412, height: 900 },
    serviceWorkers: 'block'
  });
  await context.route('https://www.googleapis.com/books/v1/volumes**', async (route) => {
    await route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'Rate limited during smoke test' } })
    });
  });
  await context.route('https://openlibrary.org/search.json**', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('isbn') === '9781761069819') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          numFound: 1,
          docs: [{
            title: 'Flawed Hero',
            author_name: ['Chris Masters'],
            isbn: ['9781761069819'],
            publisher: ['Allen & Unwin'],
            first_publish_year: 2023,
            subject: ['Biography']
          }]
        })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ numFound: 0, docs: [] })
    });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      errors.push(`console: ${message.text()}`);
    }
  });

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    indexedDB.deleteDatabase('janes-library-pwa');
    await new Promise((resolve) => setTimeout(resolve, 200));
    location.reload();
  });
  await page.waitForLoadState('networkidle');

  const resetFilters = async () => {
    await page.getByRole('button', { name: /Reset Filters/ }).click();
    await page.waitForTimeout(150);
  };
  const chooseRating = async (rating) => {
    await page.locator(`input[name="rating"][value="${rating}"]`).check({ force: true });
  };

  await page.getByRole('button', { name: /^Add Book Manual entry/ }).click();
  await page.fill('input[name="title"]', 'Safari');
  await page.fill('input[name="authors"]', 'Jane Avery');
  await page.fill('input[name="category"]', 'Travel');
  await page.fill('input[name="shelfLocation"]', 'Window Wall / Table');
  await page.fill('textarea[name="summary"]', 'A coffee table book from the sitting room.');
  await chooseRating(5);
  await page.getByRole('button', { name: /Save to Jane/ }).click();
  await page.waitForTimeout(500);
  const detailAfterAdd = await page.locator('.panel').innerText();

  await page.reload({ waitUntil: 'networkidle' });
  const afterReload = await page.locator('.panel').innerText();

  await page.locator('select[name="rating"]').selectOption('5');
  await page.getByRole('button', { name: /Apply Filters/ }).click();
  const fiveStarFiltered = await page.locator('.panel').innerText();
  await resetFilters();

  await page.getByRole('button', { name: /Safari/ }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.fill('textarea[name="notes"]', 'Edited note survives refresh.');
  await chooseRating(3);
  await page.getByRole('button', { name: /Save Changes/ }).click();
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Safari/ }).click();
  const editedDetail = await page.locator('.panel').innerText();

  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.fill('input[name="query"]', 'edited note');
  await page.getByRole('button', { name: /Apply Filters/ }).click();
  const filtered = await page.locator('.panel').innerText();
  await resetFilters();

  await page.fill('input[name="query"]', 'edited note');
  await page.locator('select[name="category"]').selectOption('Travel');
  await page.locator('select[name="shelf"]').selectOption('Window Wall / Table');
  await page.locator('select[name="status"]').selectOption('Available');
  await page.locator('select[name="rating"]').selectOption('3up');
  await page.getByRole('button', { name: /Apply Filters/ }).click();
  const combinedRatingFiltered = await page.locator('.panel').innerText();
  await resetFilters();

  await page.getByRole('button', { name: /^Add Book Manual entry/ }).click();
  await page.getByRole('button', { name: /Scan Barcode/ }).click();
  await page.getByRole('button', { name: /Open Camera/ }).click();
  await page.waitForTimeout(1000);
  const scannerText = await page.locator('body').innerText();

  if (!(await page.locator('input[name="isbn"]').count())) {
    await page.getByRole('button', { name: /^Add Book Manual entry/ }).click();
    await page.getByRole('button', { name: /Find by ISBN/ }).click();
  }
  await page.fill('input[name="isbn"]', '9781761069819');
  await page.getByRole('button', { name: 'Find Book' }).click();
  await page.waitForSelector('input[name="title"]', { timeout: 14000 });
  const isbnTitle = await page.locator('input[name="title"]').inputValue();
  await chooseRating(4);
  await page.getByRole('button', { name: /Save to Jane/ }).click();
  await page.waitForFunction(() => {
    const text = document.querySelector('.panel')?.innerText || '';
    return text.includes('Flawed Hero') && text.includes('4 stars');
  });
  const isbnDetailAfterSave = await page.locator('.panel').innerText();
  await page.reload({ waitUntil: 'networkidle' });
  const afterIsbnReload = await page.locator('.panel').innerText();

  await page.getByRole('button', { name: /Shelf Scan/ }).click();
  await page.evaluate(() => {
    window.Tesseract = {
      recognize: async (file, language, options) => {
        options?.logger?.({ status: 'recognizing text', progress: 0.5 });
        options?.logger?.({ status: 'recognizing text', progress: 1 });
        return { data: { text: "SAFARI\nNobody's Girl\nVirginia Roberts" } };
      }
    };
    if (!document.querySelector('script[src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"]')) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.type = 'application/json';
      document.head.appendChild(script);
    }
  });
  const ocrFixturePath = path.join(os.tmpdir(), 'janes-library-ocr-fixture.svg');
  fs.writeFileSync(ocrFixturePath, '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="200"><rect width="100%" height="100%" fill="white"/><text x="30" y="70" font-size="42">SAFARI</text><text x="30" y="130" font-size="34">Nobody&apos;s Girl</text></svg>');
  await page.setInputFiles('input[name="photo"]', ocrFixturePath);
  await page.getByRole('button', { name: /Read Shelf Photo/ }).click();
  await page.waitForTimeout(500);
  const ocrExtracted = await page.locator('textarea[name="ocrText"]').inputValue();
  await page.fill('textarea[name="ocrText"]', "SAFARI\nNobody's Girl\nVirginia Roberts");
  await page.getByRole('button', { name: /Find Possible Books/ }).click();
  await page.waitForTimeout(1500);
  const ocrText = await page.locator('.panel').innerText();
  await page.getByRole('button', { name: /Review & Save/ }).first().click();
  await page.fill('input[name="title"]', 'OCR Unrated Candidate');
  await page.fill('input[name="category"]', 'Shelf OCR');
  await page.fill('input[name="shelfLocation"]', 'OCR Shelf');
  await page.fill('textarea[name="notes"]', 'Saved from shelf OCR review after manual correction.');
  await chooseRating(0);
  await page.getByRole('button', { name: /Save to Jane/ }).click();
  await page.waitForTimeout(500);
  const ocrSavedDetail = await page.locator('.panel').innerText();

  await page.getByRole('button', { name: /Browse Library/ }).click();
  await page.locator('select[name="rating"]').selectOption('4up');
  await page.getByRole('button', { name: /Apply Filters/ }).click();
  const fourUpFiltered = await page.locator('.panel').innerText();
  await resetFilters();

  await page.locator('select[name="rating"]').selectOption('3up');
  await page.getByRole('button', { name: /Apply Filters/ }).click();
  const threeUpFiltered = await page.locator('.panel').innerText();
  await resetFilters();

  await page.locator('select[name="rating"]').selectOption('unrated');
  await page.getByRole('button', { name: /Apply Filters/ }).click();
  const unratedFiltered = await page.locator('.panel').innerText();
  await resetFilters();

  const backupPath = path.join(os.tmpdir(), `janes-library-smoke-${Date.now()}.json`);
  await page.getByRole('button', { name: /Backup \/ Settings/ }).click();
  const backupScreenWithDrive = await page.locator('.panel').innerText();
  await page.getByRole('button', { name: /Connect Google Drive/ }).click();
  await page.waitForTimeout(200);
  const missingDriveConfigText = await page.locator('body').innerText();
  const download = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    page.getByRole('button', { name: /Export JSON Backup/ }).click()
  ]).then(([item]) => item);
  await download.saveAs(backupPath);
  const exportedBackup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const exportHasRatings = exportedBackup.books?.some((book) => book.title === 'Safari' && book.rating === 3)
    && exportedBackup.books?.some((book) => book.title === 'Flawed Hero' && book.rating === 4)
    && exportedBackup.books?.some((book) => book.title === 'OCR Unrated Candidate' && book.rating === 0);

  await page.getByRole('button', { name: /Browse Library/ }).click();
  await page.getByRole('button', { name: /Safari/ }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: 'networkidle' });
  const afterDelete = await page.locator('.panel').innerText();

  await page.getByRole('button', { name: /Backup \/ Settings/ }).click();
  await page.setInputFiles('input[name="backup"]', backupPath);
  await page.locator('select[name="mode"]').selectOption('replace');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /Import JSON Backup/ }).click();
  await page.waitForTimeout(600);
  await page.reload({ waitUntil: 'networkidle' });
  const afterImport = await page.locator('.panel').innerText();

  const result = {
    errors,
    addOpenedDetail: detailAfterAdd.includes('Safari') && detailAfterAdd.includes('5 stars'),
    persistedAfterReload: afterReload.includes('Safari') && afterReload.includes('5 stars'),
    editPersisted: editedDetail.includes('Edited note survives refresh.') && editedDetail.includes('3 stars'),
    searchWorked: filtered.includes('Safari'),
    cardShowsRating: afterReload.includes('5 stars') && afterIsbnReload.includes('4 stars'),
    detailShowsRating: detailAfterAdd.includes('5 stars') && editedDetail.includes('3 stars') && isbnDetailAfterSave.includes('4 stars'),
    filter5Works: fiveStarFiltered.includes('Safari') && fiveStarFiltered.includes('5 stars'),
    filter4UpWorks: fourUpFiltered.includes('Flawed Hero') && fourUpFiltered.includes('4 stars') && !fourUpFiltered.includes('OCR Unrated Candidate'),
    filter3UpWorks: threeUpFiltered.includes('Safari') && threeUpFiltered.includes('Flawed Hero'),
    filterUnratedWorks: unratedFiltered.includes('OCR Unrated Candidate') && unratedFiltered.includes('Not rated'),
    combinedRatingFilterWorks: combinedRatingFiltered.includes('Safari') && combinedRatingFiltered.includes('3 stars'),
    driveDisconnectedUiVisible: backupScreenWithDrive.includes('Google Drive status') && backupScreenWithDrive.includes('Not connected'),
    driveMissingClientIdGraceful: missingDriveConfigText.includes('Google Drive backup is not set up yet') && missingDriveConfigText.includes('JSON backup still works'),
    backupExported: exportHasRatings,
    backupImported: afterImport.includes('Safari') && afterImport.includes('3 stars') && afterImport.includes('Flawed Hero') && afterImport.includes('4 stars'),
    scannerFallbackVisible: /type the ISBN|camera|Camera|scanner/i.test(scannerText),
    ocrUploadExtractedText: /SAFARI|Nobody/i.test(ocrExtracted),
    ocrCandidateVisible: /Possible books|Review & Save|SAFARI|Nobody/i.test(ocrText),
    ocrCandidateSavedUnrated: ocrSavedDetail.includes('OCR Unrated Candidate') && ocrSavedDetail.includes('Not rated'),
    deletePersisted: !afterDelete.includes('Safari'),
    isbnLookupSaved: /Flawed Hero/i.test(isbnTitle) && /Flawed Hero/i.test(afterIsbnReload) && afterIsbnReload.includes('4 stars')
  };

  await browser.close();
  const failed = Object.entries(result).filter(([key, value]) => key !== 'errors' && value !== true);
  if (result.errors.length || failed.length) {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }
  clearTimeout(hardTimeout);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  if (browser) await browser.close().catch(() => {});
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
}
