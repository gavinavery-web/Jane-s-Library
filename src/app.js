import { createIndexedDbDriver, createLibraryStore, normalizeBook } from './libraryStore.js';
import { filterBooks, deriveFilterOptions } from './filters.js';
import { lookupBookByIsbn, searchBooksByText } from './isbn.js';
import { exportLibraryJson, parseLibraryBackup, booksToCsv } from './backup.js';
import { GOOGLE_DRIVE_CLIENT_ID } from './config/googleDriveConfig.js';
import {
  GOOGLE_DRIVE_SCOPE,
  createDriveBackupJson,
  createGoogleDriveBackupClient,
  getGoogleDriveConfigStatus,
  isDriveBackupNewerThanLocal,
  latestBookTimestamp
} from './googleDriveBackup.js';
import { extractCandidateQueries } from './ocrCandidates.js';

const app = document.getElementById('app');
const store = createLibraryStore(createIndexedDbDriver());
const DRIVE_SESSION_KEY = 'janes-library-google-drive-session';
const DRIVE_LAST_BACKUP_KEY = 'janes-library-last-google-drive-backup';

const state = {
  view: 'browse',
  books: [],
  selectedId: '',
  editingId: '',
  addMode: 'manual',
  filters: { query: '', category: '', author: '', shelf: '', status: '', rating: '' },
  message: null,
  lookupBook: null,
  candidateBook: null,
  ocr: { text: '', progress: 0, candidates: [], imageUrl: '' },
  scannerControls: null,
  scannerStream: null,
  scannerLoop: 0,
  drive: {
    accessToken: '',
    tokenExpiresAt: 0,
    lastBackupAt: readLocalValue(DRIVE_LAST_BACKUP_KEY),
    restorePreview: null,
    newerBackup: null
  }
};

boot();

async function boot() {
  bindEvents();
  loadDriveSession();
  await refreshBooks();
  await checkDriveBackupOnStartup();
  registerServiceWorker();
}

function bindEvents() {
  document.addEventListener('click', handleClick);
  document.addEventListener('submit', handleSubmit);
  document.addEventListener('input', handleInput);
}

async function refreshBooks() {
  try {
    state.books = await store.listBooks();
    render();
  } catch (error) {
    setMessage(error.message || 'The library could not be opened in this browser.', 'bad');
    render();
  }
}

function render() {
  const total = state.books.length;
  const borrowed = state.books.filter((book) => book.status === 'Borrowed').length;
  app.innerHTML = `
    <section class="hero">
      <div>
        <span class="eyebrow">Private cottage catalogue</span>
        <h1>Jane's Library</h1>
        <p>A calm, no-cost library app for the shelves, armchairs, timber bookcases and family lending notes.</p>
      </div>
      <div class="summary-pill" aria-label="${total} books saved">
        <strong>${total}</strong>
        <span>${total === 1 ? 'book' : 'books'}</span>
        <small>${borrowed} borrowed</small>
      </div>
    </section>
    <nav class="nav" aria-label="Main sections">
      ${navButton('browse', 'Browse Library', 'Search, filter and open books')}
      ${navButton('add', 'Add Book', 'Manual entry, ISBN or barcode')}
      ${navButton('shelf', 'Shelf Scan', 'Photo OCR with review')}
      ${navButton('backup', 'Backup / Settings', 'Export, import and safety')}
    </nav>
    ${messageHtml()}
    ${driveStartupPromptHtml()}
    <section class="panel">
      ${screenHtml()}
    </section>
  `;
}

function screenHtml() {
  if (state.view === 'browse') return browseHtml();
  if (state.view === 'detail') return detailHtml();
  if (state.view === 'add') return addHtml();
  if (state.view === 'edit') return editHtml();
  if (state.view === 'lookupReview') return reviewLookupHtml();
  if (state.view === 'candidateReview') return reviewCandidateHtml();
  if (state.view === 'shelf') return shelfScanHtml();
  if (state.view === 'backup') return backupHtml();
  return browseHtml();
}

function navButton(view, label, help) {
  return `
    <button type="button" data-view="${view}" aria-current="${state.view === view ? 'page' : 'false'}">
      ${escapeHtml(label)}
      <span>${escapeHtml(help)}</span>
    </button>
  `;
}

function messageHtml() {
  if (!state.message) return '';
  return `<div class="message ${state.message.type || ''}" role="status">${escapeHtml(state.message.text)}</div>`;
}

function driveStartupPromptHtml() {
  if (!state.drive.newerBackup) return '';
  const backup = state.drive.newerBackup.data;
  return `
    <div class="message good drive-prompt" role="status">
      <span>A newer Google Drive backup is available from ${escapeHtml(formatDateTime(backup.exportedAt))}. Restore it?</span>
      <button type="button" data-action="drive-review-newer">Review Restore</button>
      <button class="light" type="button" data-action="drive-dismiss-newer">Not Now</button>
    </div>
  `;
}

function browseHtml() {
  const options = deriveFilterOptions(state.books);
  const results = filterBooks(state.books, state.filters);
  return `
    <div class="panel-header">
      <div>
        <h2>Browse Library</h2>
        <p>Find books by title, author, shelf, category, notes or ISBN.</p>
      </div>
      <button class="light" type="button" data-view="add">Add Book</button>
    </div>
    <form class="filters" data-form="filters">
      ${field('query', 'Search words', state.filters.query, 'text', 'Title, author, ISBN or notes')}
      ${selectField('category', 'Category', state.filters.category, ['', ...options.categories])}
      ${selectField('author', 'Author', state.filters.author, ['', ...options.authors])}
      ${selectField('shelf', 'Shelf', state.filters.shelf, ['', ...options.shelves])}
      ${selectField('status', 'Status', state.filters.status, ['', ...options.statuses])}
      ${selectField('rating', 'Rating', state.filters.rating, [
        ['', 'All ratings'],
        ['5', '5 stars'],
        ['4up', '4 stars and up'],
        ['3up', '3 stars and up'],
        ['unrated', 'Unrated']
      ])}
      <div class="toolbar wide">
        <button type="submit">Apply Filters</button>
        <button class="light" type="button" data-action="clear-filters">Reset Filters</button>
      </div>
    </form>
    ${bookListHtml(results, state.books.length ? 'No books match those filters. Try clearing the filters.' : "Jane's library is empty. Add the first book by hand, ISBN or barcode.")}
  `;
}

function bookListHtml(books, emptyText) {
  if (!books.length) return `<div class="empty">${escapeHtml(emptyText)}</div>`;
  return `<div class="book-grid">${books.map(bookCardHtml).join('')}</div>`;
}

function bookCardHtml(book) {
  return `
    <button class="book-card" type="button" data-action="open-book" data-id="${escapeAttr(book.id)}">
      ${coverHtml(book)}
      <span>
        <h3>${escapeHtml(book.title || 'Untitled book')}</h3>
        <p>${escapeHtml(authorLine(book) || 'Author unknown')}</p>
        <p>${escapeHtml(book.category || 'No category yet')}</p>
        <p>${escapeHtml(book.shelfLocation || 'No shelf yet')}</p>
        ${ratingDisplayHtml(book.rating)}
        <p>${escapeHtml(shortText(book.summary || book.notes, 82))}</p>
        <span class="badge ${book.status === 'Borrowed' ? 'borrowed' : ''}">${escapeHtml(book.status || 'Available')}</span>
      </span>
    </button>
  `;
}

function coverHtml(book) {
  const src = book.coverImageData || book.coverImageUrl;
  if (src) return `<img class="cover" src="${escapeAttr(src)}" alt="Cover for ${escapeAttr(book.title)}">`;
  return `<span class="cover">Jane's<br>Library</span>`;
}

function detailHtml() {
  const book = state.books.find((item) => item.id === state.selectedId);
  if (!book) return `<div class="empty">That book is no longer in the library.</div>`;
  return `
    <div class="panel-header">
      <div>
        <h2>${escapeHtml(book.title)}</h2>
        <p>${escapeHtml(authorLine(book) || 'Author unknown')}</p>
      </div>
      <div class="toolbar">
        <button type="button" data-action="edit-book" data-id="${escapeAttr(book.id)}">Edit</button>
        <button class="danger" type="button" data-action="delete-book" data-id="${escapeAttr(book.id)}">Delete</button>
        <button class="light" type="button" data-view="browse">Back</button>
      </div>
    </div>
    <div class="detail-layout">
      ${coverHtml(book)}
      <dl class="detail-list">
        ${detail('Subtitle', book.subtitle)}
        ${detail('Category', [book.category, book.subcategory].filter(Boolean).join(' / '))}
        ${detail('Shelf', book.shelfLocation)}
        ${detail('Status', book.status)}
        <dt>Jane's rating</dt><dd>${ratingDisplayHtml(book.rating)}</dd>
        ${detail('Borrowed by', book.borrowedBy)}
        ${detail('Borrowed date', book.borrowedDate)}
        ${detail('Returned date', book.returnedDate)}
        ${detail('ISBN', [book.isbn13, book.isbn10].filter(Boolean).join(' / '))}
        ${detail('Publisher', book.publisher)}
        ${detail('Published', book.publishedDate)}
        ${detail('Source', book.source)}
        ${detail('Summary', book.summary)}
        ${detail('Notes', book.notes)}
      </dl>
    </div>
  `;
}

function addHtml() {
  return `
    <div class="panel-header">
      <div>
        <h2>Add Book</h2>
        <p>Add a book by hand, look it up by ISBN, or scan a barcode.</p>
      </div>
      <button class="light" type="button" data-view="browse">Back to Browse</button>
    </div>
    <div class="tabs" role="tablist" aria-label="Add book choices">
      ${tabButton('manual', 'Manual Entry')}
      ${tabButton('isbn', 'Find by ISBN')}
      ${tabButton('barcode', 'Scan Barcode')}
    </div>
    ${addModeHtml()}
  `;
}

function tabButton(mode, label) {
  return `<button type="button" class="${state.addMode === mode ? '' : 'light'}" data-action="add-mode" data-mode="${mode}">${escapeHtml(label)}</button>`;
}

function addModeHtml() {
  if (state.addMode === 'isbn') return isbnLookupHtml();
  if (state.addMode === 'barcode') return barcodeHtml();
  return bookFormHtml(normalizeBook({}), 'create');
}

function editHtml() {
  const book = state.books.find((item) => item.id === state.editingId);
  if (!book) return `<div class="empty">That book could not be opened for editing.</div>`;
  return `
    <div class="panel-header">
      <div>
        <h2>Edit Book</h2>
        <p>All saved details can be changed here.</p>
      </div>
      <button class="light" type="button" data-action="open-book" data-id="${escapeAttr(book.id)}">Cancel</button>
    </div>
    ${bookFormHtml(book, 'edit')}
  `;
}

function isbnLookupHtml() {
  return `
    <form data-form="isbn" class="form-grid">
      ${field('isbn', 'ISBN or barcode number', '', 'text', 'Example: 9781761069819', true)}
      <div class="actions wide">
        <button type="submit">Find Book</button>
        <button class="light" type="button" data-action="add-mode" data-mode="manual">Add by Hand Instead</button>
      </div>
    </form>
    <p class="message">Jane will always review and edit found details before saving.</p>
  `;
}

function barcodeHtml() {
  return `
    <div class="scanner-wrap">
      <p>Use this on a phone or tablet over HTTPS. If the camera is blocked, Jane can type the ISBN instead.</p>
      <video id="barcode-video" playsinline muted aria-label="Barcode camera preview"></video>
      <p class="message scanner-status">Camera is closed. Open it when Jane is ready to scan.</p>
      <div class="actions">
        <button type="button" data-action="start-scanner">Open Camera</button>
        <button class="light" type="button" data-action="stop-scanner">Stop Camera</button>
        <button class="linkish" type="button" data-action="add-mode" data-mode="isbn">Type ISBN Instead</button>
      </div>
    </div>
  `;
}

function reviewLookupHtml() {
  return `
    <div class="panel-header">
      <div>
        <h2>Check Book Details</h2>
        <p>Review the lookup result before saving it to Jane's Library.</p>
      </div>
      <button class="light" type="button" data-view="add">Back</button>
    </div>
    ${bookFormHtml(normalizeBook(state.lookupBook || {}), 'lookup')}
  `;
}

function reviewCandidateHtml() {
  return `
    <div class="panel-header">
      <div>
        <h2>Review Shelf Match</h2>
        <p>Only save this if it looks right. Jane can edit every field first.</p>
      </div>
      <button class="light" type="button" data-view="shelf">Back to Shelf Scan</button>
    </div>
    ${bookFormHtml(normalizeBook(state.candidateBook || {}), 'candidate')}
  `;
}

function shelfScanHtml() {
  return `
    <div class="panel-header">
      <div>
        <h2>Shelf Scan</h2>
        <p>Take or upload a shelf photo. Text recognition runs in the browser and nothing is saved until Jane confirms it.</p>
      </div>
      <button class="light" type="button" data-view="browse">Back to Browse</button>
    </div>
    <form data-form="ocr" class="form-grid">
      <label class="wide">Shelf photo
        <input type="file" name="photo" accept="image/*" capture="environment" required>
      </label>
      <label class="wide">Extracted text
        <textarea name="ocrText" placeholder="Text from the photo will appear here. Jane can edit it before searching.">${escapeHtml(state.ocr.text)}</textarea>
      </label>
      <progress class="wide" value="${state.ocr.progress}" max="100" aria-label="OCR progress"></progress>
      <div class="actions wide">
        <button type="submit">Read Shelf Photo</button>
        <button class="light" type="button" data-action="find-ocr-candidates">Find Possible Books</button>
        <button class="linkish" type="button" data-view="add">Add by Hand Instead</button>
      </div>
    </form>
    ${state.ocr.imageUrl ? `<img class="photo-preview" src="${escapeAttr(state.ocr.imageUrl)}" alt="Selected shelf photo preview">` : ''}
    ${candidateListHtml()}
  `;
}

function candidateListHtml() {
  if (!state.ocr.candidates.length) return '<div class="empty">No shelf candidates yet. Add a photo, read it, then find possible books.</div>';
  return `
    <h3>Possible books to review</h3>
    <div class="candidate-list">
      ${state.ocr.candidates.map((book, index) => `
        <article class="candidate">
          <h3>${escapeHtml(book.title || 'Possible book')}</h3>
          <p>${escapeHtml(authorLine(book) || book.source || 'From shelf text')}</p>
          <p>${escapeHtml(shortText(book.summary || book.category || '', 120))}</p>
          <button type="button" data-action="review-candidate" data-index="${index}">Review & Save</button>
        </article>
      `).join('')}
    </div>
  `;
}

function backupHtml() {
  const config = getGoogleDriveConfigStatus(GOOGLE_DRIVE_CLIENT_ID);
  const connected = hasValidDriveToken();
  const localChange = latestBookTimestamp(state.books);
  return `
    <div class="panel-header">
      <div>
        <h2>Backup / Settings</h2>
        <p>Your library saves on this device automatically. Google Drive backup keeps a safer copy.</p>
      </div>
      <button class="light" type="button" data-view="browse">Back to Browse</button>
    </div>
    <div class="backup-grid">
      <section class="backup-card wide drive-card">
        <h3>Google Drive backup</h3>
        <p>Optional browser-only backup. IndexedDB remains Jane's working library, and JSON files still work as the emergency fallback.</p>
        <dl class="status-list">
          <dt>Google Drive status</dt>
          <dd>${connected ? 'Connected' : 'Not connected'}</dd>
          <dt>Last local change</dt>
          <dd>${escapeHtml(formatDateTime(localChange) || 'No local books yet')}</dd>
          <dt>Last Google Drive backup</dt>
          <dd>${escapeHtml(formatDateTime(state.drive.lastBackupAt) || 'No Drive backup saved from this browser yet')}</dd>
        </dl>
        ${config.configured ? '' : `<p class="message">${escapeHtml(config.message)}</p>`}
        <div class="actions">
          <button type="button" data-action="drive-connect">Connect Google Drive</button>
          <button type="button" data-action="drive-save">Save Backup to Google Drive</button>
          <button type="button" data-action="drive-restore">Restore Backup from Google Drive</button>
          <button class="light" type="button" data-action="drive-disconnect">Disconnect Google Drive</button>
        </div>
        ${driveRestorePreviewHtml()}
      </section>
      <section class="backup-card">
        <h3>Export JSON backup</h3>
        <p>Download a full JSON backup that can restore the library later.</p>
        <button type="button" data-action="export-json">Export JSON Backup</button>
      </section>
      <section class="backup-card">
        <h3>Export list</h3>
        <p>Download a spreadsheet-friendly CSV list of books.</p>
        <button type="button" data-action="export-csv">Export CSV</button>
      </section>
      <section class="backup-card">
        <h3>Import JSON backup</h3>
        <form data-form="import">
          <label>Backup file
            <input type="file" name="backup" accept="application/json,.json" required>
          </label>
          <label>Restore choice
            <select name="mode">
              <option value="merge">Merge with current library</option>
              <option value="replace">Replace current library</option>
            </select>
          </label>
          <button type="submit">Import JSON Backup</button>
        </form>
      </section>
      <section class="backup-card">
        <h3>Testing reset</h3>
        <p>Clears this browser's local library only. Export a backup first.</p>
        <button class="danger" type="button" data-action="clear-library">Clear Local Library</button>
      </section>
    </div>
  `;
}

function driveRestorePreviewHtml() {
  const preview = state.drive.restorePreview;
  if (!preview) return '';
  const backup = preview.data;
  return `
    <div class="restore-preview">
      <h3>Review Google Drive restore</h3>
      <p>Choose how Jane wants to apply this backup. Nothing is overwritten until a choice is made.</p>
      <dl class="status-list">
        <dt>Books in this browser</dt>
        <dd>${state.books.length}</dd>
        <dt>Books in Drive backup</dt>
        <dd>${backup.books.length}</dd>
        <dt>Drive backup date</dt>
        <dd>${escapeHtml(formatDateTime(backup.exportedAt) || 'Unknown')}</dd>
      </dl>
      <div class="actions">
        <button type="button" data-action="drive-restore-merge">Merge with current library</button>
        <button class="secondary" type="button" data-action="drive-restore-replace">Replace current library</button>
        <button class="light" type="button" data-action="drive-restore-cancel">Cancel</button>
      </div>
    </div>
  `;
}

function bookFormHtml(book, mode) {
  return `
    <form data-form="book" data-mode="${escapeAttr(mode)}" data-id="${escapeAttr(book.id || '')}">
      <div class="form-grid">
        ${field('title', 'Title', book.title, 'text', '', true)}
        ${field('subtitle', 'Subtitle', book.subtitle)}
        ${field('authors', 'Author(s)', authorLine(book))}
        ${field('isbn13', 'ISBN-13', book.isbn13)}
        ${field('isbn10', 'ISBN-10', book.isbn10)}
        ${field('publisher', 'Publisher', book.publisher)}
        ${field('publishedDate', 'Published date', book.publishedDate)}
        ${field('category', 'Category', book.category)}
        ${field('subcategory', 'Subcategory', book.subcategory)}
        ${field('shelfLocation', 'Shelf location', book.shelfLocation, 'text', 'Example: Main shelves / Bay 2')}
        ${ratingField(book.rating)}
        ${selectField('status', 'Status', book.status || 'Available', ['Available', 'Borrowed', 'Returned', 'Needs Review'])}
        ${field('borrowedBy', 'Borrowed by', book.borrowedBy)}
        ${field('borrowedDate', 'Borrowed date', book.borrowedDate, 'date')}
        ${field('returnedDate', 'Returned date', book.returnedDate, 'date')}
        ${field('coverImageUrl', 'Cover image URL', book.coverImageUrl)}
        <label>Local cover photo
          <input type="file" name="coverUpload" accept="image/*">
        </label>
        ${field('source', 'Source', book.source || (mode === 'create' ? 'Manual' : ''))}
        ${textareaField('summary', 'Summary', book.summary)}
        ${textareaField('notes', 'Notes', book.notes)}
      </div>
      <div class="actions wide" style="margin-top:1rem">
        <button type="submit">${mode === 'edit' ? 'Save Changes' : "Save to Jane's Library"}</button>
        <button class="light" type="button" data-view="${mode === 'edit' ? 'detail' : 'browse'}">Cancel</button>
      </div>
    </form>
  `;
}

async function handleSubmit(event) {
  const form = event.target.closest('form');
  if (!form) return;
  event.preventDefault();
  const kind = form.dataset.form;
  if (kind === 'filters') return applyFilters(form);
  if (kind === 'book') return saveBookForm(form);
  if (kind === 'isbn') return runIsbnLookup(form);
  if (kind === 'ocr') return runOcr(form);
  if (kind === 'import') return importBackup(form);
}

function handleInput(event) {
  if (event.target.name === 'ocrText') state.ocr.text = event.target.value;
}

async function handleClick(event) {
  const button = event.target.closest('button');
  if (!button) return;
  const action = button.dataset.action;
  if (button.dataset.view) return setView(button.dataset.view);
  if (action === 'open-book') return openBook(button.dataset.id);
  if (action === 'edit-book') return editBook(button.dataset.id);
  if (action === 'delete-book') return deleteBook(button.dataset.id);
  if (action === 'clear-filters') return clearFilters();
  if (action === 'add-mode') return setAddMode(button.dataset.mode);
  if (action === 'start-scanner') return startScanner();
  if (action === 'stop-scanner') return stopScanner(true);
  if (action === 'find-ocr-candidates') return findOcrCandidates();
  if (action === 'review-candidate') return reviewCandidate(Number(button.dataset.index));
  if (action === 'drive-connect') return connectGoogleDrive();
  if (action === 'drive-save') return saveBackupToGoogleDrive();
  if (action === 'drive-restore') return prepareRestoreFromGoogleDrive();
  if (action === 'drive-disconnect') return disconnectGoogleDrive();
  if (action === 'drive-restore-merge') return applyGoogleDriveRestore('merge');
  if (action === 'drive-restore-replace') return applyGoogleDriveRestore('replace');
  if (action === 'drive-restore-cancel') return cancelGoogleDriveRestore();
  if (action === 'drive-review-newer') return reviewNewerGoogleDriveBackup();
  if (action === 'drive-dismiss-newer') return dismissNewerGoogleDriveBackup();
  if (action === 'export-json') return downloadText('janes-library-backup.json', exportLibraryJson(state.books), 'application/json');
  if (action === 'export-csv') return downloadText('janes-library-books.csv', booksToCsv(state.books), 'text/csv');
  if (action === 'clear-library') return clearLibrary();
}

function setView(view) {
  if (view !== 'add' || state.addMode !== 'barcode') stopScanner(false);
  state.view = view;
  clearMessage();
  render();
}

function setAddMode(mode) {
  if (state.addMode === 'barcode' && mode !== 'barcode') stopScanner(false);
  state.addMode = mode || 'manual';
  state.view = 'add';
  clearMessage();
  render();
}

function openBook(id) {
  state.selectedId = id;
  state.view = 'detail';
  clearMessage();
  render();
}

function editBook(id) {
  state.editingId = id;
  state.view = 'edit';
  clearMessage();
  render();
}

async function deleteBook(id) {
  const book = state.books.find((item) => item.id === id);
  if (!book || !confirm(`Delete "${book.title}" from this browser?`)) return;
  await store.deleteBook(id);
  setMessage('Book deleted from this browser.', 'good');
  state.view = 'browse';
  await refreshBooks();
}

function applyFilters(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  state.filters = {
    query: data.query || '',
    category: data.category || '',
    author: data.author || '',
    shelf: data.shelf || '',
    status: data.status || '',
    rating: data.rating || ''
  };
  render();
}

function clearFilters() {
  state.filters = { query: '', category: '', author: '', shelf: '', status: '', rating: '' };
  render();
}

async function saveBookForm(form) {
  try {
    const mode = form.dataset.mode;
    const payload = await formToBook(form);
    if (mode === 'edit') {
      const saved = await store.updateBook(form.dataset.id, payload);
      setMessage('Book details saved.', 'good');
      state.selectedId = saved.id;
      state.view = 'detail';
    } else {
      const saved = await store.createBook(payload);
      setMessage("Book saved to Jane's Library.", 'good');
      state.selectedId = saved.id;
      state.view = 'detail';
    }
    state.lookupBook = null;
    state.candidateBook = null;
    await refreshBooks();
  } catch (error) {
    setMessage(error.message, 'bad');
    render();
  }
}

async function formToBook(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const file = form.elements.coverUpload?.files?.[0];
  const coverImageData = file ? await fileToDataUrl(file) : '';
  return normalizeBook({
    ...data,
    authors: data.authors,
    coverImageData: coverImageData || data.coverImageData || ''
  });
}

async function runIsbnLookup(form) {
  try {
    const isbn = new FormData(form).get('isbn');
    await lookupAndReview(isbn);
  } catch (error) {
    setMessage(`${error.message} You can add the book by hand instead.`, 'bad');
    state.addMode = 'isbn';
    state.view = 'add';
    render();
  }
}

async function lookupAndReview(isbn) {
  setMessage('Looking for that ISBN...', 'good');
  render();
  state.lookupBook = await lookupBookByIsbn(isbn);
  state.view = 'lookupReview';
  clearMessage();
  render();
}

async function startScanner() {
  try {
    clearMessage();
    const video = document.getElementById('barcode-video');
    if (!video) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot open the camera here.');
    if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      throw new Error('Camera scanning needs HTTPS or localhost.');
    }
    try {
      const zxing = await import('https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm');
      const reader = new zxing.BrowserMultiFormatReader();
      state.scannerControls = await reader.decodeFromVideoDevice(undefined, video, (result, error, controls) => {
        if (!result) return;
        controls.stop();
        state.scannerControls = null;
        handleDetectedIsbn(result.getText ? result.getText() : String(result.text || result.rawValue || ''));
      });
      setScannerStatus('Camera is open. Hold the barcode inside the picture.', 'good');
    } catch {
      await startNativeBarcodeFallback(video);
    }
  } catch (error) {
    setMessage(`${error.message} Please type the ISBN instead.`, 'bad');
    state.addMode = 'isbn';
    state.view = 'add';
    render();
  }
}

async function startNativeBarcodeFallback(video) {
  if (!('BarcodeDetector' in window)) throw new Error('The scanner library could not load and this browser has no built-in barcode reader.');
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  state.scannerStream = stream;
  video.srcObject = stream;
  await video.play();
  const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
  const loopId = Date.now();
  state.scannerLoop = loopId;
  const tick = async () => {
    if (state.scannerLoop !== loopId) return;
    const codes = await detector.detect(video).catch(() => []);
    if (codes.length) {
      stopScanner(false);
      handleDetectedIsbn(codes[0].rawValue);
      return;
    }
    setTimeout(tick, 350);
  };
  tick();
  setScannerStatus('Camera is open. Hold the barcode inside the picture.', 'good');
}

function stopScanner(showStoppedMessage) {
  state.scannerLoop = 0;
  if (state.scannerControls) {
    state.scannerControls.stop();
    state.scannerControls = null;
  }
  if (state.scannerStream) {
    state.scannerStream.getTracks().forEach((track) => track.stop());
    state.scannerStream = null;
  }
  if (showStoppedMessage) {
    setMessage('Camera stopped.', 'good');
    render();
  }
}

async function handleDetectedIsbn(isbn) {
  stopScanner(false);
  state.addMode = 'isbn';
  state.view = 'add';
  await lookupAndReview(isbn);
}

async function runOcr(form) {
  try {
    const file = form.elements.photo.files[0];
    if (!file) throw new Error('Please choose a shelf photo first.');
    state.ocr.imageUrl = URL.createObjectURL(file);
    state.ocr.progress = 1;
    state.ocr.text = '';
    setMessage('Reading the shelf photo in this browser...', 'good');
    render();
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js', 'The free browser text reader could not load.');
    if (!window.Tesseract) throw new Error('The text reader could not load.');
    const result = await window.Tesseract.recognize(file, 'eng', {
      logger: (progress) => {
        if (progress.status === 'recognizing text') {
          state.ocr.progress = Math.round((progress.progress || 0) * 100);
          const bar = document.querySelector('progress');
          if (bar) bar.value = state.ocr.progress;
        }
      }
    });
    state.ocr.text = result.data.text || '';
    state.ocr.progress = 100;
    setMessage('Shelf text found. Check it, edit it if needed, then find possible books.', 'good');
    render();
  } catch (error) {
    setMessage(`${error.message} You can still type visible titles by hand.`, 'bad');
    render();
  }
}

async function findOcrCandidates() {
  try {
    const textarea = document.querySelector('[name="ocrText"]');
    state.ocr.text = textarea ? textarea.value : state.ocr.text;
    const queries = extractCandidateQueries(state.ocr.text);
    if (!queries.length) throw new Error('There is not enough readable text yet.');
    state.ocr.candidates = queries.map((query) => ({
      title: query,
      authors: [],
      source: 'Shelf photo text',
      notes: 'OCR text candidate. Please review before saving.'
    }));
    setMessage('Shelf text candidates are ready. Looking for better matches from free book catalogues...', 'good');
    render();
    const found = [];
    for (const query of queries.slice(0, 4)) {
      const matches = await searchBooksByText(query).catch(() => []);
      if (matches.length) found.push(...matches.map((book) => ({ ...book, source: `${book.source || 'Book lookup'} from shelf text` })));
    }
    state.ocr.candidates = uniqueCandidates([...found, ...state.ocr.candidates]);
    setMessage('Possible matches are ready for review. Only save the ones that look right.', 'good');
    render();
  } catch (error) {
    setMessage(`${error.message} You can add the book manually instead.`, 'bad');
    render();
  }
}

function reviewCandidate(index) {
  state.candidateBook = state.ocr.candidates[index];
  state.view = 'candidateReview';
  clearMessage();
  render();
}

async function connectGoogleDrive() {
  try {
    await requestGoogleDriveToken('consent');
    setMessage('Google Drive connected. Jane can now save or restore a Drive backup from this browser session.', 'good');
    await checkDriveBackupOnStartup();
    render();
  } catch (error) {
    setMessage(error.message || 'Google Drive could not connect. JSON backup still works.', 'bad');
    render();
  }
}

async function saveBackupToGoogleDrive() {
  try {
    const token = await ensureGoogleDriveAccess();
    const backupTime = new Date();
    const backupJson = createDriveBackupJson(state.books, { now: () => backupTime });
    const client = createGoogleDriveBackupClient({ accessToken: token });
    await client.saveBackupJson(backupJson);
    state.drive.lastBackupAt = backupTime.toISOString();
    writeLocalValue(DRIVE_LAST_BACKUP_KEY, state.drive.lastBackupAt);
    state.drive.newerBackup = null;
    setMessage(`Google Drive backup saved at ${formatDateTime(state.drive.lastBackupAt)}.`, 'good');
    render();
  } catch (error) {
    setMessage(error.message || 'Google Drive backup could not be saved. Local data is safe; JSON export still works.', 'bad');
    render();
  }
}

async function prepareRestoreFromGoogleDrive() {
  try {
    const token = await ensureGoogleDriveAccess();
    const client = createGoogleDriveBackupClient({ accessToken: token });
    state.drive.restorePreview = await client.loadBackup();
    state.drive.newerBackup = null;
    state.view = 'backup';
    setMessage('Review the Google Drive backup before restoring it.', 'good');
    render();
  } catch (error) {
    setMessage(error.message || 'Google Drive backup could not be restored. JSON import still works.', 'bad');
    render();
  }
}

async function applyGoogleDriveRestore(mode) {
  try {
    const preview = state.drive.restorePreview;
    if (!preview) throw new Error('No Google Drive backup is ready to restore.');
    if (mode === 'replace') {
      await store.replaceBooks(preview.data.books);
    } else {
      await store.mergeBooks(preview.data.books);
    }
    const count = preview.data.books.length;
    state.drive.restorePreview = null;
    state.drive.newerBackup = null;
    state.view = 'browse';
    setMessage(`${count} book(s) restored from Google Drive by ${mode === 'replace' ? 'replacing this browser library' : 'merging with this browser library'}.`, 'good');
    await refreshBooks();
  } catch (error) {
    setMessage(error.message || 'Google Drive restore failed. Local data is safe.', 'bad');
    render();
  }
}

function cancelGoogleDriveRestore() {
  state.drive.restorePreview = null;
  setMessage('Google Drive restore cancelled. Local data was not changed.', 'good');
  render();
}

function reviewNewerGoogleDriveBackup() {
  state.drive.restorePreview = state.drive.newerBackup;
  state.drive.newerBackup = null;
  state.view = 'backup';
  setMessage('Review the newer Google Drive backup before restoring it.', 'good');
  render();
}

function dismissNewerGoogleDriveBackup() {
  state.drive.newerBackup = null;
  setMessage('Google Drive restore skipped. Local library was not changed.', 'good');
  render();
}

function disconnectGoogleDrive() {
  const token = state.drive.accessToken;
  clearDriveSession();
  if (token && window.google?.accounts?.oauth2?.revoke) {
    window.google.accounts.oauth2.revoke(token, () => {});
  }
  state.drive.restorePreview = null;
  state.drive.newerBackup = null;
  setMessage('Google Drive disconnected in this browser. Local library data and JSON backup still work.', 'good');
  render();
}

async function checkDriveBackupOnStartup() {
  if (!getGoogleDriveConfigStatus(GOOGLE_DRIVE_CLIENT_ID).configured || !hasValidDriveToken()) return;
  try {
    const client = createGoogleDriveBackupClient({ accessToken: state.drive.accessToken });
    const backup = await client.loadBackup();
    if (backup.data.exportedAt) {
      state.drive.lastBackupAt = backup.data.exportedAt;
      writeLocalValue(DRIVE_LAST_BACKUP_KEY, backup.data.exportedAt);
    }
    if (isDriveBackupNewerThanLocal(backup.data.exportedAt, state.books)) {
      state.drive.newerBackup = backup;
      render();
    }
  } catch (error) {
    if (/expired|permission/i.test(error.message || '')) clearDriveSession();
  }
}

async function ensureGoogleDriveAccess() {
  const config = getGoogleDriveConfigStatus(GOOGLE_DRIVE_CLIENT_ID);
  if (!config.configured) throw new Error(config.message);
  if (hasValidDriveToken()) return state.drive.accessToken;
  return requestGoogleDriveToken('');
}

async function requestGoogleDriveToken(prompt) {
  const config = getGoogleDriveConfigStatus(GOOGLE_DRIVE_CLIENT_ID);
  if (!config.configured) throw new Error(config.message);
  if (navigator.onLine === false) throw new Error('This browser appears to be offline. Google Drive backup needs internet access; JSON backup still works.');
  await loadScriptOnce('https://accounts.google.com/gsi/client', 'Google Drive sign-in could not load. JSON backup still works.');
  if (!window.google?.accounts?.oauth2?.initTokenClient) {
    throw new Error('Google Drive sign-in is unavailable in this browser. JSON backup still works.');
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Google Drive sign-in did not finish. The popup may have been blocked or closed. JSON backup still works.'));
    }, 60000);
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_DRIVE_CLIENT_ID,
      scope: GOOGLE_DRIVE_SCOPE,
      callback: (response) => {
        if (response?.error) {
          finish(() => reject(new Error('Google Drive permission was not approved. JSON backup still works.')));
          return;
        }
        if (!response?.access_token) {
          finish(() => reject(new Error('Google Drive did not return an access token. JSON backup still works.')));
          return;
        }
        saveDriveSession(response);
        finish(() => resolve(response.access_token));
      }
    });
    try {
      client.requestAccessToken({ prompt });
    } catch {
      finish(() => reject(new Error('Google Drive sign-in popup could not open. Check popup blocking; JSON backup still works.')));
    }
  });
}

async function importBackup(form) {
  try {
    const file = form.elements.backup.files[0];
    if (!file) throw new Error('Please choose a backup file first.');
    const backup = parseLibraryBackup(await file.text());
    const mode = new FormData(form).get('mode');
    if (mode === 'replace') {
      if (!confirm("Replace this browser's current library with the backup?")) return;
      await store.replaceBooks(backup.books);
    } else {
      await store.mergeBooks(backup.books);
    }
    setMessage(`${backup.books.length} book(s) imported.`, 'good');
    state.view = 'browse';
    await refreshBooks();
  } catch (error) {
    setMessage(error.message, 'bad');
    render();
  }
}

async function clearLibrary() {
  if (!confirm('Clear all books stored in this browser? Export a backup first if you need one.')) return;
  await store.clear();
  state.books = [];
  setMessage('Local library cleared.', 'good');
  state.view = 'browse';
  render();
}

function downloadText(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function uniqueCandidates(books) {
  const seen = new Set();
  return books.filter((book) => {
    const key = [book.isbn13, book.isbn10, book.title, authorLine(book)].join('|').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 10);
}

function field(name, label, value = '', type = 'text', placeholder = '', required = false) {
  return `
    <label>${escapeHtml(label)}
      <input name="${escapeAttr(name)}" type="${escapeAttr(type)}" value="${escapeAttr(value || '')}" placeholder="${escapeAttr(placeholder)}" ${required ? 'required' : ''}>
    </label>
  `;
}

function textareaField(name, label, value = '') {
  return `
    <label class="wide">${escapeHtml(label)}
      <textarea name="${escapeAttr(name)}">${escapeHtml(value || '')}</textarea>
    </label>
  `;
}

function selectField(name, label, value, options) {
  const normalizedValue = String(value || '');
  return `
    <label>${escapeHtml(label)}
      <select name="${escapeAttr(name)}">
        ${options.map((option) => {
          const optionValue = Array.isArray(option) ? option[0] : option;
          const optionLabel = Array.isArray(option) ? option[1] : (option || 'Any');
          return `<option value="${escapeAttr(optionValue)}" ${String(optionValue) === normalizedValue ? 'selected' : ''}>${escapeHtml(optionLabel)}</option>`;
        }).join('')}
      </select>
    </label>
  `;
}

function ratingField(value = 0) {
  const rating = ratingValue(value);
  return `
    <fieldset class="rating-field wide">
      <legend>Jane's rating</legend>
      <div class="rating-options" role="radiogroup" aria-label="Jane's personal star rating">
        ${[0, 1, 2, 3, 4, 5].map((option) => `
          <label class="rating-option">
            <input type="radio" name="rating" value="${option}" ${option === rating ? 'checked' : ''}>
            <span>${option === 0 ? 'Not rated' : `${option} ${starEntities(option)}`}</span>
          </label>
        `).join('')}
      </div>
    </fieldset>
  `;
}

function ratingDisplayHtml(value = 0) {
  const rating = ratingValue(value);
  const label = rating ? `${rating} star${rating === 1 ? '' : 's'}` : 'Not rated';
  return `
    <span class="rating-display" aria-label="Jane's rating: ${escapeAttr(label)}">
      <span class="rating-stars" aria-hidden="true">${starEntities(rating)}${emptyStarEntities(5 - rating)}</span>
      <span class="rating-text">${escapeHtml(label)}</span>
    </span>
  `;
}

function ratingValue(value) {
  const rating = Number(value || 0);
  return Number.isInteger(rating) && rating >= 0 && rating <= 5 ? rating : 0;
}

function starEntities(count) {
  return '&#9733;'.repeat(Math.max(0, Math.min(5, count)));
}

function emptyStarEntities(count) {
  return '&#9734;'.repeat(Math.max(0, Math.min(5, count)));
}

function detail(label, value) {
  return value ? `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>` : '';
}

function authorLine(book) {
  return Array.isArray(book.authors) ? book.authors.join(', ') : String(book.authors || '');
}

function shortText(text, max) {
  const clean = String(text || '').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}...` : clean;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function hasValidDriveToken() {
  return Boolean(state.drive.accessToken && state.drive.tokenExpiresAt > Date.now() + 30000);
}

function loadDriveSession() {
  try {
    const raw = sessionStorage.getItem(DRIVE_SESSION_KEY);
    const session = raw ? JSON.parse(raw) : null;
    if (!session?.accessToken || !session?.tokenExpiresAt || session.tokenExpiresAt <= Date.now() + 30000) {
      clearDriveSession();
      return;
    }
    state.drive.accessToken = session.accessToken;
    state.drive.tokenExpiresAt = session.tokenExpiresAt;
  } catch {
    clearDriveSession();
  }
}

function saveDriveSession(response) {
  const expiresIn = Number(response.expires_in || 3600);
  state.drive.accessToken = response.access_token;
  state.drive.tokenExpiresAt = Date.now() + Math.max(60, expiresIn - 60) * 1000;
  try {
    sessionStorage.setItem(DRIVE_SESSION_KEY, JSON.stringify({
      accessToken: state.drive.accessToken,
      tokenExpiresAt: state.drive.tokenExpiresAt
    }));
  } catch {}
}

function clearDriveSession() {
  state.drive.accessToken = '';
  state.drive.tokenExpiresAt = 0;
  try {
    sessionStorage.removeItem(DRIVE_SESSION_KEY);
  } catch {}
}

function readLocalValue(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeLocalValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function formatDateTime(value) {
  const time = Date.parse(value || '');
  if (!Number.isFinite(time)) return '';
  return new Date(time).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function loadScriptOnce(src, errorMessage = 'The required browser script could not load.') {
  if (document.querySelector(`script[src="${src}"]`)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(errorMessage));
    document.head.appendChild(script);
  });
}

function setMessage(text, type = '') {
  state.message = { text, type };
}

function clearMessage() {
  state.message = null;
}

function setScannerStatus(text, type) {
  const node = document.querySelector('.scanner-status');
  if (!node) return;
  node.textContent = text;
  node.className = `message scanner-status ${type || ''}`;
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
