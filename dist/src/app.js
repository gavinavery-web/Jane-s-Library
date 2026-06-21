import { createIndexedDbDriver, createLibraryStore, normalizeBook } from './libraryStore.js';
import { filterBooks, deriveFilterOptions } from './filters.js';
import { lookupBookByIsbn, searchBooksByText } from './isbn.js';
import { exportLibraryJson, parseLibraryBackup, booksToCsv } from './backup.js';
import {
  MAIN_CATEGORIES,
  addCustomSubcategory,
  getSubcategoryOptions,
  hideSubcategory,
  mergeCategorySettings,
  normalizeCategorySettings,
  recordRecentSubcategory,
  renameSubcategory,
  resetCategorySettings,
  restoreDefaultCategories,
  safeCategoryDisplay,
  structuredCategorySuggestion
} from './categories.js';
import { GOOGLE_DRIVE_CLIENT_ID } from './config/googleDriveConfig.js';
import {
  GOOGLE_DRIVE_SCOPE,
  createDriveBackupJson,
  createGoogleDriveBackupClient,
  getGoogleDriveConfigStatus,
  isDriveBackupNewerThanLocal,
  latestBookTimestamp
} from './googleDriveBackup.js';
import { analyseOcrText, filterShelfMatchesByOcr } from './ocrCandidates.js';

const app = document.getElementById('app');
const store = createLibraryStore(createIndexedDbDriver());
const DRIVE_SESSION_KEY = 'janes-library-google-drive-session';
const DRIVE_LAST_BACKUP_KEY = 'janes-library-last-google-drive-backup';
const DRIVE_LAST_RESTORE_KEY = 'janes-library-last-google-drive-restore';
const CATEGORY_SETTINGS_KEY = 'janes-library-category-settings';
const UI_ASSETS = {
  home: 'assets/ui/home-library.jpg',
  shelves: 'assets/ui/shelves-library-optimized.jpg',
  spines: 'assets/ui/book-spines-optimized.jpg',
  settings: 'assets/ui/settings-library.jpg',
  bookOpen: 'assets/ui/book-open.svg',
  readingLady: 'assets/ui/reading-lady.svg',
  donkey: 'assets/ui/library-donkey.svg'
};
const DONKEY_BACKUP_MESSAGES = [
  'Backup saved. The donkey has kicked the data into Google Drive.',
  'Backup complete. No books died. No shelves collapsed. Strong result.',
  "Jane's Library is backed up. The donkey is smug and frankly unbearable.",
  'Saved to Google Drive. Future Jane owes present Jane a coffee.',
  'Backup done. Technology behaved for once, which is deeply suspicious.',
  'All safe. The donkey checked the fence and the file.',
  'Backup saved. Your books are now slightly less doomed.',
  'Google Drive has the backup. The donkey has the glory.',
  'Backup complete. Tiny hooves, massive responsibility.',
  "Jane's Library is safe. The donkey has completed its sacred nonsense."
];
const DONKEY_HELPER_MESSAGES = [
  'I checked the shelves. The books are breeding. Someone should intervene.',
  'This library is dangerously close to becoming a structural engineering issue.',
  'Another book? Lovely. The shelves have stopped screaming and entered acceptance.',
  'I came for carrots and found a full-blown book hoarding incident.',
  'The books are safe. The coffee, however, is one elbow away from tragedy.',
  'I would help organise this, but I have hooves and standards.',
  'Some people collect memories. Jane collects books and calls it furniture.',
  "This is not a library anymore. It's a paper-based hostage situation.",
  'I found the missing book. It was under twelve other missing books. Naturally.',
  'The shelves are holding together through hope, dust, and denial.',
  "One book at a time. That's how libraries are built and nervous breakdowns are avoided.",
  "You don't have to organise the whole library today. Even I know that, and I eat grass.",
  "A quiet coffee, pyjamas, a fire, and a good book. That's not a plan, that's survival.",
  'Progress still counts when it is small. Annoying, but true.',
  'The shelves do not need perfection. They just need slightly less chaos than yesterday.',
  "You're making something lovely here, even if the books are pretending otherwise.",
  'Some days, keeping things simple is the win. The donkey reluctantly approves.',
  'Every book saved is one less thing future Jane has to swear about.',
  'A good library is built slowly, usually by someone who said they were just browsing.',
  "Today's achievement: the books are a little less feral.",
  'Jane has entered the library. The books are acting innocent. I know what they did.',
  'The donkey has reviewed the situation and recommends coffee before anyone makes more decisions.',
  "The books are slightly more organised. Don't get cocky.",
  'Jane said she only had a few books. That was adorable. Completely false, but adorable.',
  'This library has categories now. Society may yet recover.',
  'The shelves asked for help. I told them to be brave.',
  "Jane's filing system appears to be: I will remember where I put that. Historic mistake.",
  'Another book saved. Another tiny victory over domestic chaos.',
  'The donkey believes in you. The shelves have requested a second opinion.',
  'This is going well, which is suspicious and probably temporary.'
];

const state = {
  view: 'home',
  books: [],
  selectedId: '',
  editingId: '',
  borrowSelectedId: '',
  borrowMotion: '',
  history: [],
  addMode: 'choices',
  filters: { query: '', category: '', subcategory: '', author: '', shelf: '', status: '', rating: '', recent: '' },
  message: null,
  lookupBook: null,
  candidateBook: null,
  titleSearch: { query: '', results: [] },
  categorySettings: loadCategorySettings(),
  categoryManagerOpen: false,
  donkeyMessage: '',
  ocr: { text: '', progress: 0, candidates: [], imageUrl: '' },
  scannerControls: null,
  scannerStream: null,
  scannerLoop: 0,
  scannerActive: false,
  scannerError: '',
  drive: {
    accessToken: '',
    tokenExpiresAt: 0,
    lastBackupAt: readLocalValue(DRIVE_LAST_BACKUP_KEY),
    lastRestoreAt: readLocalValue(DRIVE_LAST_RESTORE_KEY),
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
  document.addEventListener('error', handleCoverError, true);
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
    <header class="app-header">
      <div class="brand-block">
        <span class="eyebrow">Private home library</span>
        <h1>Jane's Library</h1>
        <p>A calm place to save, find and back up every book on Jane's shelves.</p>
      </div>
      <div class="summary-card" aria-label="${total} books saved">
        <strong>${total}</strong>
        <span>${total === 1 ? 'book saved' : 'books saved'}</span>
        <small>${borrowed} borrowed</small>
      </div>
    </header>
    <nav class="nav desktop-nav" aria-label="Main sections">
      ${navButton('home', 'Home', 'Start here')}
      ${navButton('browse', 'Browse Library', 'Find books')}
      ${navButton('add', 'Add a Book', 'Scan, barcode or manual')}
      ${navButton('shelf', 'Scan Shelves', 'Photo text reader')}
      ${navButton('backup', 'Backup', 'Keep a safer copy')}
    </nav>
    ${messageHtml()}
    ${driveStartupPromptHtml()}
    ${appBackButtonHtml()}
    <main class="panel panel-${escapeAttr(state.view)}">
      ${screenHtml()}
    </main>
    <nav class="bottom-nav" aria-label="Mobile sections">
      ${bottomNavButton('home', 'Home', 'H')}
      ${bottomNavButton('browse', 'Browse', 'B')}
      ${bottomNavButton('add', 'Add', '+')}
      ${bottomNavButton('shelf', 'Scan', 'S')}
      ${bottomNavButton('backup', 'Settings', '*')}
    </nav>
  `;
}

function screenHtml() {
  if (state.view === 'home') return homeHtml();
  if (state.view === 'browse') return browseHtml();
  if (state.view === 'detail') return detailHtml();
  if (state.view === 'add') return addHtml();
  if (state.view === 'borrow') return borrowHtml();
  if (state.view === 'edit') return editHtml();
  if (state.view === 'lookupReview') return reviewLookupHtml();
  if (state.view === 'candidateReview') return reviewCandidateHtml();
  if (state.view === 'shelf') return shelfScanHtml();
  if (state.view === 'backup') return backupHtml();
  return browseHtml();
}

function navButton(view, label, help) {
  const current = navCurrent(view);
  return `
    <button type="button" data-view="${view}" aria-current="${current ? 'page' : 'false'}">
      ${escapeHtml(label)}
      <span>${escapeHtml(help)}</span>
    </button>
  `;
}

function bottomNavButton(view, label, icon) {
  const current = navCurrent(view);
  return `
    <button type="button" data-view="${view}" aria-current="${current ? 'page' : 'false'}">
      <span aria-hidden="true">${escapeHtml(icon)}</span>
      ${escapeHtml(label)}
    </button>
  `;
}

function navCurrent(view) {
  if (state.view === view) return true;
  if (view === 'browse' && state.view === 'detail') return true;
  if (view === 'browse' && state.view === 'borrow') return true;
  if (view === 'add' && ['edit', 'lookupReview', 'candidateReview'].includes(state.view)) return true;
  return false;
}

function homeHtml() {
  const total = state.books.length;
  const borrowed = state.books.filter((book) => book.status === 'Borrowed').length;
  const recent = [...state.books]
    .sort((a, b) => new Date(b.dateAdded || b.lastUpdated || 0) - new Date(a.dateAdded || a.lastUpdated || 0))
    .slice(0, 6);
  return `
    <section class="home-hero photo-hero" style="--hero-image: url('${UI_ASSETS.home}')">
      <div class="hero-copy">
        <span class="eyebrow">Private home library</span>
        <h2>Jane's Library</h2>
        <p>A simple catalogue for Jane's books.</p>
        <div class="hero-actions">
          <button type="button" data-view="shelf">Scan Shelves</button>
          <button class="light" type="button" data-action="add-mode" data-mode="barcode">Scan Barcode</button>
        </div>
      </div>
      <div class="home-stat">
        <strong>${total}</strong>
        <span>${total === 1 ? 'book saved' : 'books saved'}</span>
        <small>${borrowed} checked out</small>
      </div>
    </section>
    <section class="action-grid" aria-label="Main actions">
      ${homeAction('shelf', 'Scan Shelves', 'Photograph a shelf and review possible matches.', 'Start', 'book-open')}
      ${homeAction('add', 'Scan Barcode', 'Use the camera or type the barcode number.', 'Scan', 'barcode', 'add-mode', 'barcode')}
      ${homeAction('add', 'Add Book', 'Search by title, barcode or type details by hand.', 'Add', 'book-open')}
      ${homeAction('browse', 'Browse Library', 'Search, filter and open saved books.', 'Browse', 'book-open')}
    </section>
    <section class="secondary-actions" aria-label="Secondary actions">
      <button class="light" type="button" data-view="backup">Backup / Settings</button>
      <button class="light" type="button" data-action="open-category-manager">Manage Categories</button>
    </section>
    <section class="recent-section">
      <div class="section-title">
        <div>
          <h2>Recently Added</h2>
          <p>${total ? 'A quick glance at the newest books in Jane\'s Library.' : 'New books will appear here after Jane adds them.'}</p>
        </div>
        ${total ? '<button class="light" type="button" data-view="browse">See All Books</button>' : ''}
      </div>
      ${recent.length ? recentBooksHtml(recent) : `
        <div class="empty illustrated-empty">
          <img src="${UI_ASSETS.readingLady}" alt="" aria-hidden="true">
          <p>No books yet. Start with Add Book, Scan Barcode or Scan Shelves.</p>
        </div>
      `}
    </section>
    ${donkeyHelperHtml('home-donkey')}
    <p class="home-quote">A home library should feel easy to return to.</p>
  `;
}

function homeAction(view, title, text, cta, icon = 'book-open', action = '', mode = '') {
  return `
    <button class="action-card" type="button" ${action ? `data-action="${escapeAttr(action)}"` : `data-view="${escapeAttr(view)}"`} ${mode ? `data-mode="${escapeAttr(mode)}"` : ''}>
      <img src="${icon === 'barcode' ? UI_ASSETS.spines : UI_ASSETS.bookOpen}" alt="" aria-hidden="true">
      <span class="action-kicker">${escapeHtml(cta)}</span>
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(text)}</span>
    </button>
  `;
}

function donkeyHelperHtml(extraClass = '') {
  return `
    <section class="donkey-helper ${escapeAttr(extraClass)}">
      <img src="${UI_ASSETS.donkey}" alt="" aria-hidden="true">
      <div>
        <h3>Library Donkey</h3>
        <p>Tap for wisdom, nonsense, or mild judgement.</p>
        <button class="light" type="button" data-action="donkey-wisdom">Ask the Donkey</button>
        ${state.donkeyMessage ? `<p class="donkey-message">${escapeHtml(state.donkeyMessage)}</p>` : ''}
      </div>
    </section>
  `;
}

function recentBooksHtml(books) {
  return `
    <div class="recent-row">
      ${books.map((book) => `
        <button class="recent-book" type="button" data-action="open-book" data-id="${escapeAttr(book.id)}">
          ${coverHtml(book)}
          <span>${escapeHtml(book.title || 'Untitled book')}</span>
        </button>
      `).join('')}
    </div>
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

function appBackButtonHtml() {
  if (state.view === 'home' || !state.history.length) return '';
  return `<button class="app-back-button light" type="button" data-action="app-back">Back</button>`;
}

function browseHtml() {
  const options = deriveFilterOptions(state.books);
  const results = filteredBrowseBooks();
  const hasFilters = Object.values(state.filters).some(Boolean);
  const subcategoryOptions = state.filters.category
    ? getSubcategoryOptions(state.categorySettings, state.filters.category)
    : allVisibleSubcategories();
  return `
    <section class="screen-banner browse-banner" style="--banner-image: url('${UI_ASSETS.shelves}')">
      <div>
        <span class="eyebrow">Shelf browsing</span>
        <h2>Browse Library</h2>
        <p>Search title, author, category or shelf.</p>
      </div>
      <button type="button" data-view="borrow">Check In / Check Out</button>
    </section>
    <form class="search-form" data-form="filters">
      ${field('query', 'Search Jane\'s books', state.filters.query, 'search', 'Search title, author, category or shelf')}
      <input type="hidden" name="category" value="${escapeAttr(state.filters.category)}">
      <input type="hidden" name="subcategory" value="${escapeAttr(state.filters.subcategory)}">
      <input type="hidden" name="author" value="${escapeAttr(state.filters.author)}">
      <input type="hidden" name="shelf" value="${escapeAttr(state.filters.shelf)}">
      <input type="hidden" name="status" value="${escapeAttr(state.filters.status)}">
      <input type="hidden" name="rating" value="${escapeAttr(state.filters.rating)}">
      <input type="hidden" name="recent" value="${escapeAttr(state.filters.recent || '')}">
      <button type="submit">Search</button>
    </form>
    <div class="filter-chips" aria-label="Quick filters">
      ${quickFilterChip('Fiction', 'category', 'Fiction')}
      ${quickFilterChip('Non-Fiction', 'category', 'Non-Fiction')}
      ${quickFilterChip('To Review', 'category', 'Uncategorised')}
      ${quickFilterChip('Borrowed', 'status', 'Borrowed')}
      ${quickFilterChip('Recently Added', 'recent', '1')}
    </div>
    <details class="filter-drawer" ${hasFilters ? 'open' : ''}>
      <summary>Filters${hasFilters ? ' active' : ''}</summary>
      <form class="filters" data-form="filters">
        <input type="hidden" name="query" value="${escapeAttr(state.filters.query)}">
        <input type="hidden" name="recent" value="${escapeAttr(state.filters.recent || '')}">
        ${selectField('category', 'Main category', state.filters.category, ['', ...MAIN_CATEGORIES])}
        ${selectField('subcategory', 'Subcategory', state.filters.subcategory, ['', ...subcategoryOptions, ...options.subcategories])}
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
    </details>
    ${bookListHtml(results, state.books.length ? 'No books match those filters. Try clearing the filters.' : "Jane's library is empty. Add the first book by hand or barcode.")}
  `;
}

function quickFilterChip(label, filter, value) {
  const current = state.filters[filter] === value;
  return `<button class="filter-chip ${current ? 'active' : ''}" type="button" data-action="quick-filter" data-filter="${escapeAttr(filter)}" data-value="${escapeAttr(value)}">${escapeHtml(label)}</button>`;
}

function filteredBrowseBooks() {
  let results = filterBooks(state.books, state.filters);
  if (state.filters.recent) {
    results = [...results]
      .sort((a, b) => new Date(b.dateAdded || b.lastUpdated || 0) - new Date(a.dateAdded || a.lastUpdated || 0))
      .slice(0, 24);
  }
  return results;
}

function bookListHtml(books, emptyText) {
  if (!books.length) return `<div class="empty">${escapeHtml(emptyText)}</div>`;
  return `<div class="book-grid">${books.map(bookCardHtml).join('')}</div>`;
}

function bookCardHtml(book) {
  return `
    <button class="book-card" type="button" data-action="open-book" data-id="${escapeAttr(book.id)}">
      ${coverHtml(book)}
      <span class="book-card-body">
        <span class="badge">${escapeHtml(safeCategoryDisplay(book))}</span>
        <h3>${escapeHtml(book.title || 'Untitled book')}</h3>
        <p class="book-author">${escapeHtml(authorLine(book) || 'Author unknown')}</p>
        ${ratingDisplayHtml(book.rating)}
        <p class="book-meta">${escapeHtml(book.shelfLocation || 'No shelf yet')}</p>
        <span class="status-pill ${book.status === 'Borrowed' ? 'borrowed' : ''}">${escapeHtml(book.status || 'Available')}</span>
        ${book.summary || book.notes ? `<p class="book-summary">${escapeHtml(shortText(book.summary || book.notes, 88))}</p>` : ''}
      </span>
    </button>
  `;
}

function coverHtml(book) {
  const src = book.coverImageData || book.coverImageUrl;
  if (src) return `<img class="cover" data-cover-fallback="true" src="${escapeAttr(src)}" alt="Cover for ${escapeAttr(book.title)}">`;
  return fallbackCoverHtml();
}

function fallbackCoverHtml() {
  return `<span class="cover">Jane's<br>Library</span>`;
}

function handleCoverError(event) {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || image.dataset.coverFallback !== 'true') return;

  const fallback = document.createElement('span');
  fallback.className = 'cover';
  fallback.innerHTML = "Jane's<br>Library";
  image.replaceWith(fallback);
}

function detailHtml() {
  const book = state.books.find((item) => item.id === state.selectedId);
  if (!book) return `<div class="empty">That book is no longer in the library.</div>`;
  return `
    <button class="linkish back-button" type="button" data-view="browse">Back to Browse</button>
    <article class="book-detail detail-card" style="--detail-image: url('${UI_ASSETS.spines}')">
      <div class="detail-cover">${coverHtml(book)}</div>
      <div class="detail-main">
        <span class="badge">${escapeHtml(safeCategoryDisplay(book))}</span>
        <h2>${escapeHtml(book.title)}</h2>
        ${book.subtitle ? `<p class="subtitle">${escapeHtml(book.subtitle)}</p>` : ''}
        <p class="detail-author">${escapeHtml(authorLine(book) || 'Author unknown')}</p>
        ${ratingDisplayHtml(book.rating)}
        ${borrowingDetailCardHtml(book)}
        <dl class="info-card">
        ${detail('Shelf', book.shelfLocation || 'No shelf yet')}
        ${detail('Added', formatDate(book.dateAdded) || 'Not recorded')}
        ${detail('Status', book.status || 'Available')}
        ${detail('Book barcode', [book.isbn13, book.isbn10].filter(Boolean).join(' / ') || 'Not recorded')}
      </dl>
        ${(book.summary || book.notes) ? `
          <section class="notes-card">
            ${book.summary ? `<h3>Summary</h3><p>${escapeHtml(book.summary)}</p>` : ''}
            ${book.notes ? `<h3>Jane's notes</h3><p>${escapeHtml(book.notes)}</p>` : ''}
          </section>
        ` : ''}
        <details class="more-details">
          <summary>More details</summary>
          <dl class="detail-list">
            ${detail('Category', safeCategoryDisplay(book))}
            ${detail('Borrowed by', book.borrowedBy)}
            ${detail('Borrowed date', book.borrowedDate)}
            ${detail('Returned date', book.returnedDate)}
            ${detail('Publisher', book.publisher)}
            ${detail('Published', book.publishedDate)}
            ${detail('Source', book.source)}
          </dl>
        </details>
        <div class="detail-actions">
          <button type="button" data-action="edit-book" data-id="${escapeAttr(book.id)}">Edit Book</button>
          <button class="light" type="button" data-action="borrow-this-book" data-id="${escapeAttr(book.id)}">Check In / Check Out</button>
          <button class="danger light-danger" type="button" data-action="delete-book" data-id="${escapeAttr(book.id)}">Delete Book</button>
        </div>
      </div>
    </article>
  `;
}

function borrowingDetailCardHtml(book) {
  const borrowed = book.status === 'Borrowed';
  return `
    <section class="borrowing-card ${borrowed ? 'borrowed' : ''}">
      <span class="stamp-badge">${borrowed ? 'Checked Out' : 'Available'}</span>
      <p>${borrowed ? `${escapeHtml(book.borrowedBy || 'Someone')} has this book.` : 'This book is on Jane\'s shelves.'}</p>
      ${borrowed ? `<p>${escapeHtml([book.borrowedDate && `Borrowed ${book.borrowedDate}`, book.returnedDate && `Due ${book.returnedDate}`].filter(Boolean).join(' - ') || 'Dates not recorded')}</p>` : ''}
      <button class="light" type="button" data-action="borrow-this-book" data-id="${escapeAttr(book.id)}">Check In / Check Out</button>
    </section>
  `;
}

function borrowHtml() {
  const borrowedBooks = state.books.filter((book) => book.status === 'Borrowed');
  const selectedId = state.borrowSelectedId || state.books[0]?.id || '';
  return `
    <section class="screen-banner borrow-banner" style="--banner-image: url('${UI_ASSETS.settings}')">
      <div>
        <span class="eyebrow">Library card</span>
        <h2>Check In / Check Out</h2>
        <p>A simple old-library-card style place to track who has borrowed a book.</p>
      </div>
      <button class="light" type="button" data-view="browse">Back to Browse</button>
    </section>
    ${state.borrowMotion ? `<div class="borrow-animation ${escapeAttr(state.borrowMotion)}" aria-hidden="true">Book</div>` : ''}
    <section class="borrow-layout">
      <form data-form="borrow-checkout" class="library-card">
        <h3>Check out a book</h3>
        ${selectField('bookId', 'Choose book', selectedId, state.books.map((book) => [book.id, `${book.title || 'Untitled'} - ${authorLine(book) || 'Author unknown'}`]))}
        ${field('borrowedBy', 'Borrowed by', '', 'text', 'Name', true)}
        ${field('borrowedDate', 'Borrowed date', new Date().toISOString().slice(0, 10), 'date')}
        ${field('returnedDate', 'Due / return date', '', 'date')}
        ${textareaField('notes', 'Borrowing notes', '')}
        <button type="submit">Check Out Book</button>
      </form>
      <section class="library-card">
        <h3>Currently borrowed</h3>
        ${borrowedBooks.length ? borrowedBooks.map((book) => `
          <article class="borrowed-row">
            <div>
              <strong>${escapeHtml(book.title || 'Untitled')}</strong>
              <p>${escapeHtml(book.borrowedBy || 'Borrower not recorded')}</p>
              <p>${escapeHtml([book.borrowedDate && `Borrowed ${book.borrowedDate}`, book.returnedDate && `Due ${book.returnedDate}`].filter(Boolean).join(' - ') || 'Dates not recorded')}</p>
            </div>
            <button type="button" data-action="check-in-book" data-id="${escapeAttr(book.id)}">Check In</button>
          </article>
        `).join('') : '<div class="empty">No books are currently checked out.</div>'}
      </section>
    </section>
  `;
}

function addHtml() {
  return `
    <section class="screen-banner add-banner" style="--banner-image: url('${UI_ASSETS.spines}')">
      <div>
        <span class="eyebrow">New book</span>
        <h2>Add a Book</h2>
        <p>Choose the easiest way to add the next book.</p>
      </div>
      <button class="light" type="button" data-view="home">Back Home</button>
    </section>
    ${addModeHtml()}
  `;
}

function addModeHtml() {
  if (state.addMode === 'choices') return addChoicesHtml();
  if (state.addMode === 'isbn') return isbnLookupHtml();
  if (state.addMode === 'barcode') return barcodeHtml();
  if (state.addMode === 'title') return titleSearchHtml();
  return bookFormHtml(normalizeBook({}), 'create');
}

function addChoicesHtml() {
  return `
    <div class="choice-grid" aria-label="Add book choices">
      <button class="choice-card" type="button" data-action="add-mode" data-mode="barcode">
        <span>Scan</span>
        <strong>Scan Barcode</strong>
        <small>Use the phone camera to read the book barcode, then review before saving.</small>
      </button>
      <button class="choice-card" type="button" data-action="add-mode" data-mode="isbn">
        <span>Barcode</span>
        <strong>Add by Barcode Number</strong>
        <small>Type the number and look up details from free book catalogues.</small>
      </button>
      <button class="choice-card" type="button" data-action="add-mode" data-mode="title">
        <span>Search</span>
        <strong>Search by Title / Author</strong>
        <small>Search free catalogues, then review the result before saving.</small>
      </button>
      <button class="choice-card" type="button" data-action="add-mode" data-mode="manual">
        <span>Manual</span>
        <strong>Add Manually</strong>
        <small>Type the important details yourself.</small>
      </button>
    </div>
  `;
}

function titleSearchHtml() {
  return `
    <div class="mode-header">
      <button class="linkish" type="button" data-action="add-mode" data-mode="choices">Back to add choices</button>
      <h3>Search by Title / Author</h3>
      <p>Search free book catalogues. Jane reviews the book before saving it.</p>
    </div>
    <form data-form="title-search" class="isbn-panel">
      ${field('query', 'Book title or author', state.titleSearch.query, 'search', 'Example: Nobody\'s Girl Virginia Roberts', true)}
      <div class="actions">
        <button type="submit">Search Free Catalogues</button>
        <button class="light" type="button" data-action="add-mode" data-mode="manual">Add Manually Instead</button>
      </div>
    </form>
    ${titleSearchResultsHtml()}
  `;
}

function titleSearchResultsHtml() {
  if (!state.titleSearch.results.length) return '';
  return `
    <section class="candidate-list title-search-results">
      ${state.titleSearch.results.map((book, index) => `
        <article class="candidate">
          ${coverHtml(book)}
          <div>
            <span class="badge">${escapeHtml(book.source || 'Book catalogue')}</span>
            <h3>${escapeHtml(book.title || 'Possible book')}</h3>
            <p>${escapeHtml(authorLine(book) || 'Author unknown')}</p>
            <p>${escapeHtml(shortText(book.summary || book.category || '', 120))}</p>
            <button type="button" data-action="review-title-result" data-index="${index}">Review & Save</button>
          </div>
        </article>
      `).join('')}
    </section>
  `;
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
    <div class="mode-header">
      <button class="linkish" type="button" data-action="add-mode" data-mode="choices">Back to add choices</button>
      <h3>Add by Barcode Number</h3>
      <p>Jane can review the result before anything is saved.</p>
    </div>
    <form data-form="isbn" class="isbn-panel">
      ${field('isbn', 'Book barcode number', '', 'text', 'Example: 9781761069819', true)}
      <div class="actions">
        <button type="submit">Find Book</button>
        <button class="light" type="button" data-action="add-mode" data-mode="manual">Add by Hand Instead</button>
      </div>
    </form>
  `;
}

function barcodeHtml() {
  const active = state.scannerActive;
  const failed = Boolean(state.scannerError);
  return `
    <div class="mode-header">
      <button class="linkish" type="button" data-action="add-mode" data-mode="choices">Back to add choices</button>
      <h3>Scan Barcode</h3>
      <p>Hold the book barcode in front of the camera. It will scan automatically.</p>
    </div>
    <div class="scanner-wrap">
      <video id="barcode-video" playsinline muted aria-label="Barcode camera preview"></video>
      <p class="message scanner-status ${failed ? 'bad' : ''}">
        ${escapeHtml(active ? 'Camera is open — hold barcode still' : (failed ? `${state.scannerError} Try the camera again or add by barcode number.` : 'Camera is closed. Open it when Jane is ready to scan.'))}
      </p>
      <div class="actions">
        ${active
          ? '<button class="light" type="button" data-action="stop-scanner">Cancel Scan</button>'
          : `<button type="button" data-action="start-scanner">${failed ? 'Try Camera Again' : 'Scan Barcode'}</button>
             <button class="light" type="button" data-action="add-mode" data-mode="isbn">Enter Barcode Manually</button>`}
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
    ${importPreviewHtml(normalizeBook(state.lookupBook || {}))}
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
    ${importPreviewHtml(normalizeBook(state.candidateBook || {}))}
    ${bookFormHtml(normalizeBook(state.candidateBook || {}), 'candidate')}
  `;
}

function importPreviewHtml(book) {
  return `
    <article class="import-preview">
      ${coverHtml(book)}
      <div>
        <span class="badge">${escapeHtml(book.category || book.source || 'Review')}</span>
        <h3>${escapeHtml(book.title || 'Possible book')}</h3>
        <p>${escapeHtml(authorLine(book) || 'Author unknown')}</p>
        ${book.summary ? `<p>${escapeHtml(shortText(book.summary, 220))}</p>` : '<p>No summary was found. Jane can add notes before saving.</p>'}
      </div>
    </article>
  `;
}

function shelfScanHtml() {
  return `
    <section class="screen-banner shelf-banner" style="--banner-image: url('${UI_ASSETS.shelves}')">
      <div>
        <span class="eyebrow">Shelf photo reader</span>
        <h2>Scan Shelves</h2>
        <p>Take a photo of a bookshelf. Jane's Library will try to read the book spines and suggest possible matches for you to review.</p>
      </div>
      <button class="light" type="button" data-view="home">Back Home</button>
    </section>
    <ol class="shelf-steps">
      <li>Take or upload shelf photo</li>
      <li>Read book spines</li>
      <li>Review possible matches</li>
      <li>Save selected books</li>
    </ol>
    <form data-form="ocr" class="shelf-scan-card">
      <label class="photo-picker wide">
        <span>Take Shelf Photo</span>
        <small>Open camera or choose a shelf photo</small>
        <input type="file" name="photo" accept="image/*" capture="environment" required aria-label="Take shelf photo">
      </label>
      ${state.ocr.imageUrl ? `<img class="photo-preview" src="${escapeAttr(state.ocr.imageUrl)}" alt="Selected shelf photo preview">` : ''}
      <details class="ocr-text-review wide">
        <summary>Review detected text</summary>
        <label>Detected shelf text
          <textarea name="ocrText" placeholder="Text from the photo will appear here. Jane can edit it before searching.">${escapeHtml(state.ocr.text)}</textarea>
        </label>
      </details>
      <progress class="wide" value="${state.ocr.progress}" max="100" aria-label="OCR progress"></progress>
      <div class="actions wide">
        <button type="submit">Read Shelf Photo</button>
        <button class="light" type="button" data-action="find-ocr-candidates">Find Possible Books</button>
        <button class="linkish" type="button" data-view="add">Add by Hand Instead</button>
      </div>
    </form>
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
          ${coverHtml(book)}
          <div>
            <span class="badge">${escapeHtml(book.matchConfidence || 'Needs review')}</span>
            <h3>${escapeHtml(book.title || 'Possible book')}</h3>
            <p>${escapeHtml(authorLine(book) || book.source || 'From shelf text')}</p>
            <p>${escapeHtml(book.matchReason || shortText(book.summary || book.category || '', 120))}</p>
            <div class="actions">
              <button type="button" data-action="review-candidate" data-index="${index}">Review & Save</button>
              <button class="light" type="button" data-action="skip-ocr-candidate" data-index="${index}">Skip</button>
            </div>
          </div>
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
    <section class="screen-banner backup-banner" style="--banner-image: url('${UI_ASSETS.settings}')">
      <div>
        <span class="eyebrow">Safe copy</span>
        <h2>Backup / Settings</h2>
        <p>Your library saves on this device automatically. Google Drive backup keeps a safer copy.</p>
      </div>
      <button class="light" type="button" data-view="home">Back Home</button>
    </section>
    <div class="backup-grid">
      <section class="backup-card wide donkey-backup-card">
        <button class="donkey-button" type="button" data-action="drive-save" aria-label="Back Up Now">
          <img src="${UI_ASSETS.donkey}" alt="Library Donkey">
        </button>
        <div>
          <span class="eyebrow">Library Donkey</span>
          <h3>Donkey Backup</h3>
          <p>Tap the donkey to save Jane's Library to Google Drive.</p>
          <div class="actions">
            <button type="button" data-action="drive-save">Back Up Now</button>
            <button class="light" type="button" data-action="donkey-wisdom">Ask the Donkey</button>
          </div>
          ${state.donkeyMessage ? `<p class="donkey-message">${escapeHtml(state.donkeyMessage)}</p>` : '<p class="small-note">Tap for wisdom, nonsense, or mild judgement.</p>'}
        </div>
      </section>
      <section class="backup-card wide drive-card">
        <h3>Google Drive backup</h3>
        <p>Optional backup to Jane's Google Drive. The library still works on this device without it.</p>
        <p class="small-note">On iPhone, connect Google Drive in Safari first. If sign-in does not open from the Home Screen icon, open Jane's Library in Safari and try again.</p>
        <dl class="status-list">
          <dt>Google Drive status</dt>
          <dd>${connected ? '<span class="drive-connected-pill">Connected to Google Drive</span>' : 'Not connected'}</dd>
          <dt>Last local change</dt>
          <dd>${escapeHtml(formatDateTime(localChange) || 'No local books yet')}</dd>
          <dt>Last Google Drive backup</dt>
          <dd>${escapeHtml(formatDateTime(state.drive.lastBackupAt) || 'No Drive backup saved from this browser yet')}</dd>
          <dt>Last restore</dt>
          <dd>${escapeHtml(formatDateTime(state.drive.lastRestoreAt) || 'No Drive restore from this browser yet')}</dd>
          <dt>Backup folder</dt>
          <dd>Jane's Library Backups</dd>
          <dt>Backup file</dt>
          <dd>janes-library-backup.json</dd>
        </dl>
        ${config.configured ? '' : `<p class="message">${escapeHtml(config.message)}</p>`}
        <div class="actions">
          ${connected
            ? '<button class="connected-button" type="button" disabled>Connected to Google Drive</button>'
            : '<button type="button" data-action="drive-connect">Connect Google Drive</button>'}
          <button type="button" data-action="drive-save">Back Up Now</button>
          <button type="button" data-action="drive-restore">Restore from Drive</button>
          <button class="light" type="button" data-action="drive-disconnect">Disconnect Google Drive</button>
        </div>
        ${driveRestorePreviewHtml()}
      </section>
      <section class="backup-card">
        <h3>Emergency backup</h3>
        <p>Download a full backup file. Keep it somewhere safe in case Jane needs it later.</p>
        <button type="button" data-action="export-json">Download Backup File</button>
      </section>
      <section class="backup-card">
        <h3>Book list</h3>
        <p>Download a simple spreadsheet-friendly list of the books.</p>
        <button type="button" data-action="export-csv">Download book list</button>
      </section>
      <section class="backup-card">
        <h3>Restore emergency backup</h3>
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
          <button type="submit">Restore from emergency backup</button>
        </form>
      </section>
      <details class="backup-card danger-zone">
        <summary>Advanced / Danger</summary>
        <p>Clears this browser's local library only. Download a backup first.</p>
        <button class="danger" type="button" data-action="clear-library">Clear local library</button>
      </details>
      ${manageCategoriesHtml()}
    </div>
  `;
}

function manageCategoriesHtml() {
  const fictionOptions = getSubcategoryOptions(state.categorySettings, 'Fiction');
  const nonFictionOptions = getSubcategoryOptions(state.categorySettings, 'Non-Fiction');
  const allOptions = [...fictionOptions, ...nonFictionOptions];
  return `
    <details class="backup-card wide category-manager" ${state.categoryManagerOpen ? 'open' : ''}>
      <summary>Manage Categories</summary>
      <p>Jane can add, rename or hide subcategories. Fiction, Non-Fiction and Uncategorised always stay available.</p>
      <form data-form="category-add" class="category-manager-form">
        ${selectField('category', 'Add under', 'Fiction', ['Fiction', 'Non-Fiction'])}
        ${field('subcategory', 'New subcategory', '', 'text', 'Example: Family Saga', true)}
        <button type="submit">Add subcategory</button>
      </form>
      <form data-form="category-rename" class="category-manager-form">
        ${selectField('category', 'Rename under', 'Fiction', ['Fiction', 'Non-Fiction'])}
        ${fieldWithList('oldSubcategory', 'Existing subcategory', '', 'category-manager-rename-options', allOptions, 'Start typing an existing subcategory', true)}
        ${field('newSubcategory', 'New name', '', 'text', 'Example: Family Stories', true)}
        <button type="submit">Rename subcategory</button>
      </form>
      <form data-form="category-hide" class="category-manager-form">
        ${selectField('category', 'Hide from', 'Fiction', ['Fiction', 'Non-Fiction'])}
        ${fieldWithList('subcategory', 'Subcategory to hide', '', 'category-manager-hide-options', allOptions, 'Start typing a subcategory', true)}
        <button type="submit">Hide subcategory</button>
      </form>
      <div class="actions">
        <button class="light" type="button" data-action="restore-default-categories">Restore default categories</button>
        <button class="danger light-danger" type="button" data-action="reset-category-settings">Reset all categories to approved list</button>
      </div>
    </details>
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
  if (mode === 'lookup' || mode === 'candidate') book = { ...book, ...structuredCategorySuggestion(book) };
  return `
    <form data-form="book" data-mode="${escapeAttr(mode)}" data-id="${escapeAttr(book.id || '')}">
      <input type="hidden" name="coverImageData" value="${escapeAttr(book.coverImageData || '')}">
      <div class="form-card">
        ${mode === 'create' ? `
          <div class="mode-header">
            <button class="linkish" type="button" data-action="add-mode" data-mode="choices">Back to add choices</button>
            <h3>Add Manually</h3>
            <p>Start with the details Jane is most likely to use. More fields are available below.</p>
          </div>
        ` : ''}
        <div class="form-grid essential-fields">
        ${field('title', 'Title', book.title, 'text', '', true)}
        ${field('authors', 'Author(s)', authorLine(book))}
        ${field('shelfLocation', 'Shelf location', book.shelfLocation, 'text', 'Example: Main shelves / Bay 2')}
        ${ratingField(book.rating)}
        ${selectField('status', 'Status', book.status || 'Available', ['Available', 'Borrowed', 'Returned', 'Needs Review'])}
        <label>Local cover photo
          <input type="file" name="coverUpload" accept="image/*">
        </label>
        ${textareaField('notes', 'Notes', book.notes)}
        </div>
        <details class="advanced-fields" ${mode === 'lookup' || mode === 'candidate' || mode === 'edit' ? 'open' : ''}>
          <summary>More details</summary>
          <div class="form-grid">
            ${field('subtitle', 'Subtitle', book.subtitle)}
            ${field('publisher', 'Publisher', book.publisher)}
            ${field('publishedDate', 'Published date', book.publishedDate)}
            ${field('isbn13', '13-digit barcode', book.isbn13)}
            ${field('isbn10', '10-digit book code', book.isbn10)}
            ${categoryFieldsHtml(book, mode)}
            ${field('coverImageUrl', 'Cover image URL', book.coverImageUrl)}
            ${field('source', 'Source', book.source || (mode === 'create' ? 'Manual' : ''))}
            ${field('borrowedBy', 'Borrowed by', book.borrowedBy)}
            ${field('borrowedDate', 'Borrowed date', book.borrowedDate, 'date')}
            ${field('returnedDate', 'Returned date', book.returnedDate, 'date')}
            ${textareaField('summary', 'Summary / description', book.summary)}
          </div>
        </details>
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
  if (kind === 'title-search') return runTitleSearch(form);
  if (kind === 'ocr') return runOcr(form);
  if (kind === 'import') return importBackup(form);
  if (kind === 'category-add') return addCategoryFromForm(form);
  if (kind === 'category-rename') return renameCategoryFromForm(form);
  if (kind === 'category-hide') return hideCategoryFromForm(form);
  if (kind === 'borrow-checkout') return checkOutBook(form);
}

function handleInput(event) {
  if (event.target.name === 'ocrText') state.ocr.text = event.target.value;
  if (event.target.name === 'category') updateSubcategoryDatalist(event.target);
}

async function handleClick(event) {
  const button = event.target.closest('button');
  if (!button) return;
  const action = button.dataset.action;
  if (button.dataset.view) return setView(button.dataset.view);
  if (action === 'app-back') return goBack();
  if (action === 'open-book') return openBook(button.dataset.id);
  if (action === 'edit-book') return editBook(button.dataset.id);
  if (action === 'borrow-this-book') return openBorrowing(button.dataset.id);
  if (action === 'check-in-book') return checkInBook(button.dataset.id);
  if (action === 'delete-book') return deleteBook(button.dataset.id);
  if (action === 'clear-filters') return clearFilters();
  if (action === 'quick-filter') return applyQuickFilter(button.dataset.filter, button.dataset.value);
  if (action === 'open-category-manager') return openCategoryManager();
  if (action === 'add-mode') return setAddMode(button.dataset.mode);
  if (action === 'start-scanner') return startScanner();
  if (action === 'stop-scanner') return stopScanner(true);
  if (action === 'find-ocr-candidates') return findOcrCandidates();
  if (action === 'review-candidate') return reviewCandidate(Number(button.dataset.index));
  if (action === 'review-title-result') return reviewTitleResult(Number(button.dataset.index));
  if (action === 'skip-ocr-candidate') return skipOcrCandidate(Number(button.dataset.index));
  if (action === 'donkey-wisdom') return showDonkeyWisdom();
  if (action === 'use-recent-subcategory') return useRecentSubcategory(button.dataset.category, button.dataset.subcategory);
  if (action === 'drive-connect') return connectGoogleDrive();
  if (action === 'drive-save') return saveBackupToGoogleDrive();
  if (action === 'drive-restore') return prepareRestoreFromGoogleDrive();
  if (action === 'drive-disconnect') return disconnectGoogleDrive();
  if (action === 'drive-restore-merge') return applyGoogleDriveRestore('merge');
  if (action === 'drive-restore-replace') return applyGoogleDriveRestore('replace');
  if (action === 'drive-restore-cancel') return cancelGoogleDriveRestore();
  if (action === 'drive-review-newer') return reviewNewerGoogleDriveBackup();
  if (action === 'drive-dismiss-newer') return dismissNewerGoogleDriveBackup();
  if (action === 'export-json') return downloadText('janes-library-backup.json', exportLibraryJson(state.books, { categorySettings: state.categorySettings }), 'application/json');
  if (action === 'export-csv') return downloadText('janes-library-books.csv', booksToCsv(state.books), 'text/csv');
  if (action === 'clear-library') return clearLibrary();
  if (action === 'restore-default-categories') return restoreDefaultCategorySettings();
  if (action === 'reset-category-settings') return resetAllCategorySettings();
}

function openCategoryManager() {
  pushHistory();
  state.categoryManagerOpen = true;
  state.view = 'backup';
  clearMessage();
  render();
}

function setView(view) {
  if (view !== 'add' || state.addMode !== 'barcode') stopScanner(false);
  pushHistory();
  if (view === 'add') state.addMode = 'choices';
  if (view !== 'backup') state.categoryManagerOpen = false;
  state.view = view;
  clearMessage();
  render();
}

function setAddMode(mode) {
  if (state.addMode === 'barcode' && mode !== 'barcode') stopScanner(false);
  state.addMode = mode || 'manual';
  if (state.addMode === 'barcode') state.scannerError = '';
  if (state.addMode !== 'title') state.titleSearch = { query: '', results: [] };
  state.view = 'add';
  clearMessage();
  render();
}

function openBook(id) {
  pushHistory();
  state.selectedId = id;
  state.view = 'detail';
  clearMessage();
  render();
}

function editBook(id) {
  pushHistory();
  state.editingId = id;
  state.view = 'edit';
  clearMessage();
  render();
}

function openBorrowing(id = '') {
  pushHistory();
  state.borrowSelectedId = id;
  state.borrowMotion = '';
  state.view = 'borrow';
  clearMessage();
  render();
}

function pushHistory() {
  const snapshot = {
    view: state.view,
    selectedId: state.selectedId,
    editingId: state.editingId,
    borrowSelectedId: state.borrowSelectedId,
    addMode: state.addMode
  };
  const last = state.history[state.history.length - 1];
  if (snapshot.view === last?.view) return;
  state.history.push(snapshot);
  state.history = state.history.slice(-12);
}

function goBack() {
  const previous = state.history.pop();
  if (!previous) {
    state.view = 'home';
  } else {
    state.view = previous.view;
    state.selectedId = previous.selectedId;
    state.editingId = previous.editingId;
    state.borrowSelectedId = previous.borrowSelectedId;
    state.addMode = previous.addMode;
  }
  clearMessage();
  render();
}

async function checkOutBook(form) {
  try {
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.bookId) throw new Error('Choose a book to check out.');
    const existing = await store.getBook(data.bookId);
    const notes = data.notes ? [existing?.notes, `Borrowing note: ${data.notes}`].filter(Boolean).join('\n') : existing?.notes;
    const saved = await store.updateBook(data.bookId, {
      status: 'Borrowed',
      borrowedBy: data.borrowedBy,
      borrowedDate: data.borrowedDate,
      returnedDate: data.returnedDate,
      notes
    });
    state.borrowSelectedId = saved.id;
    state.borrowMotion = 'out';
    setMessage(`${saved.title} checked out to ${saved.borrowedBy}.`, 'good');
    await refreshBooks();
    state.view = 'borrow';
  } catch (error) {
    setMessage(error.message || 'That book could not be checked out.', 'bad');
    render();
  }
}

async function checkInBook(id) {
  try {
    const saved = await store.updateBook(id, {
      status: 'Available',
      borrowedBy: '',
      borrowedDate: '',
      returnedDate: new Date().toISOString().slice(0, 10)
    });
    state.borrowSelectedId = saved.id;
    state.borrowMotion = 'in';
    setMessage(`${saved.title} checked back in.`, 'good');
    await refreshBooks();
    state.view = 'borrow';
  } catch (error) {
    setMessage(error.message || 'That book could not be checked in.', 'bad');
    render();
  }
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
    subcategory: data.subcategory || '',
    author: data.author || '',
    shelf: data.shelf || '',
    status: data.status || '',
    rating: data.rating || '',
    recent: data.recent || ''
  };
  render();
}

function clearFilters() {
  state.filters = { query: '', category: '', subcategory: '', author: '', shelf: '', status: '', rating: '', recent: '' };
  render();
}

function applyQuickFilter(filter, value) {
  const wasActive = state.filters[filter] === value;
  state.filters = { ...state.filters, recent: filter === 'recent' ? state.filters.recent : '' };
  if (filter === 'category') {
    state.filters.category = wasActive ? '' : value;
    state.filters.subcategory = '';
  } else if (filter === 'status') {
    state.filters.status = wasActive ? '' : value;
  } else if (filter === 'recent') {
    state.filters.recent = wasActive ? '' : value;
  }
  render();
}

async function saveBookForm(form) {
  try {
    const mode = form.dataset.mode;
    const payload = await formToBook(form);
    if (mode === 'edit') {
      const saved = await store.updateBook(form.dataset.id, payload);
      rememberBookCategory(saved);
      setMessage('Book details saved.', 'good');
      state.selectedId = saved.id;
      state.view = 'detail';
    } else {
      const saved = await store.createBook(payload);
      rememberBookCategory(saved);
      setMessage("Book saved to Jane's Library.", 'good');
      state.selectedId = saved.id;
      state.view = 'detail';
    }
    state.lookupBook = null;
    state.candidateBook = null;
    state.titleSearch = { query: '', results: [] };
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
  setMessage('Looking for that barcode...', 'good loading');
  render();
  state.lookupBook = await lookupBookByIsbn(isbn);
  state.view = 'lookupReview';
  clearMessage();
  render();
}

async function runTitleSearch(form) {
  try {
    const query = String(new FormData(form).get('query') || '').trim();
    if (!query) throw new Error('Type a title or author first.');
    state.titleSearch = { query, results: [] };
    setMessage('Searching free book catalogues...', 'good loading');
    render();
    const results = await searchBooksByText(query);
    state.titleSearch = { query, results: results.slice(0, 8) };
    setMessage(
      results.length ? 'Possible books found. Review the right one before saving.' : 'No matching books were found. Jane can add the book manually instead.',
      results.length ? 'good' : 'bad'
    );
    render();
  } catch (error) {
    setMessage(`${error.message} Jane can add the book manually instead.`, 'bad');
    state.addMode = 'title';
    state.view = 'add';
    render();
  }
}

function reviewTitleResult(index) {
  state.candidateBook = state.titleSearch.results[index];
  if (!state.candidateBook) {
    setMessage('That search result is no longer available. Try the search again.', 'bad');
    render();
    return;
  }
  state.view = 'candidateReview';
  clearMessage();
  render();
}

async function startScanner() {
  try {
    clearMessage();
    state.scannerError = '';
    state.scannerActive = true;
    render();
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
      setScannerStatus('Camera is open — hold barcode still', 'good');
    } catch {
      await startNativeBarcodeFallback(video);
    }
  } catch (error) {
    stopScanner(false);
    state.scannerError = error.message || 'The camera could not open.';
    setMessage(`${state.scannerError} Try the camera again or add by barcode number.`, 'bad');
    state.addMode = 'barcode';
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
  setScannerStatus('Camera is open — hold barcode still', 'good');
}

function stopScanner(showStoppedMessage) {
  state.scannerLoop = 0;
  state.scannerActive = false;
  if (state.scannerControls) {
    state.scannerControls.stop();
    state.scannerControls = null;
  }
  if (state.scannerStream) {
    state.scannerStream.getTracks().forEach((track) => track.stop());
    state.scannerStream = null;
  }
  if (showStoppedMessage) {
    setMessage('Scan cancelled.', 'good');
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
    setMessage('Reading the shelf photo in this browser...', 'good loading');
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
    const analysis = analyseOcrText(result.data.text || '');
    state.ocr.text = analysis.cleanText || result.data.text || '';
    state.ocr.progress = 100;
    state.ocr.candidates = [];
    if (!analysis.hasUsefulText) {
      setMessage("I couldn't read enough from this shelf photo. Try a closer, brighter photo or add the books manually.", 'bad');
    } else {
      setMessage('Shelf text found. Jane can find possible books now, or review the detected text first.', 'good');
    }
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
    const analysis = analyseOcrText(state.ocr.text);
    state.ocr.text = analysis.cleanText;
    if (!analysis.hasUsefulText) throw new Error("I couldn't read enough from this shelf photo. Try a closer, brighter photo or add the books manually.");
    const detectedCandidates = analysis.queries.map((query) => ({
      title: query,
      authors: [],
      source: 'Detected from shelf photo',
      notes: 'Detected from shelf photo text. Please review before saving.',
      matchScore: 1,
      matchConfidence: 'Needs review',
      matchReason: `Detected from the shelf photo: "${query}".`
    }));
    state.ocr.candidates = detectedCandidates;
    setMessage('Shelf text candidates are ready. Looking for better matches from free book catalogues...', 'good loading');
    render();
    const found = [];
    for (const query of analysis.queries.slice(0, 6)) {
      const matches = await searchBooksByText(query).catch(() => []);
      if (matches.length) found.push(...matches.map((book) => ({ ...book, source: `${book.source || 'Book lookup'} from shelf text` })));
    }
    const filtered = filterShelfMatchesByOcr(analysis.cleanText, found);
    state.ocr.candidates = uniqueCandidates([...filtered, ...detectedCandidates]);
    setMessage(
      filtered.length
        ? 'Possible shelf matches are ready for review. Only save the ones that look right.'
        : 'No confident catalogue matches were found. Jane can review the detected shelf text or add the books manually.',
      filtered.length ? 'good' : 'bad'
    );
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

function skipOcrCandidate(index) {
  state.ocr.candidates.splice(index, 1);
  setMessage('Shelf suggestion skipped. Nothing was saved.', 'good');
  render();
}

function useRecentSubcategory(category, subcategory) {
  const form = document.querySelector('form[data-form="book"]');
  if (!form) return;
  const categoryInput = form.elements.category;
  const subcategoryInput = form.elements.subcategory;
  if (categoryInput) {
    categoryInput.value = category;
    updateSubcategoryDatalist(categoryInput);
  }
  if (subcategoryInput) subcategoryInput.value = subcategory;
}

function updateSubcategoryDatalist(categoryInput) {
  const listId = categoryInput.dataset.subcategoryList;
  if (!listId) return;
  const datalist = document.getElementById(listId);
  const subcategoryInput = categoryInput.form?.elements?.subcategory;
  if (!datalist) return;
  const options = getSubcategoryOptions(state.categorySettings, categoryInput.value);
  datalist.innerHTML = options.map((item) => `<option value="${escapeAttr(item)}"></option>`).join('');
  if (categoryInput.value === 'Uncategorised' && subcategoryInput) subcategoryInput.value = 'To Review';
}

function rememberBookCategory(book) {
  state.categorySettings = recordRecentSubcategory(state.categorySettings, book.category, book.subcategory);
  saveCategorySettings();
}

function addCategoryFromForm(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  state.categorySettings = addCustomSubcategory(state.categorySettings, data.category, data.subcategory);
  saveCategorySettings();
  setMessage('Subcategory added.', 'good');
  render();
}

function renameCategoryFromForm(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  state.categorySettings = renameSubcategory(state.categorySettings, data.category, data.oldSubcategory, data.newSubcategory);
  saveCategorySettings();
  setMessage('Subcategory renamed. Existing books keep their saved text until Jane edits them.', 'good');
  render();
}

function hideCategoryFromForm(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  state.categorySettings = hideSubcategory(state.categorySettings, data.category, data.subcategory);
  saveCategorySettings();
  setMessage('Subcategory hidden from selectors. Existing books still display safely.', 'good');
  render();
}

function restoreDefaultCategorySettings() {
  state.categorySettings = restoreDefaultCategories(state.categorySettings);
  saveCategorySettings();
  setMessage('Default subcategories restored.', 'good');
  render();
}

function resetAllCategorySettings() {
  if (!confirm("Reset category settings to Jane's approved default list? Existing books will not be deleted.")) return;
  state.categorySettings = resetCategorySettings();
  saveCategorySettings();
  setMessage('Categories reset to the approved default list.', 'good');
  render();
}

function applyImportedCategorySettings(categorySettings, mode) {
  state.categorySettings = mode === 'replace'
    ? normalizeCategorySettings(categorySettings)
    : mergeCategorySettings(state.categorySettings, categorySettings);
  saveCategorySettings();
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
    const backupJson = createDriveBackupJson(state.books, { now: () => backupTime, categorySettings: state.categorySettings });
    const client = createGoogleDriveBackupClient({ accessToken: token });
    setMessage('Saving the Google Drive backup...', 'good loading');
    render();
    await client.saveBackupJson(backupJson);
    state.drive.lastBackupAt = backupTime.toISOString();
    writeLocalValue(DRIVE_LAST_BACKUP_KEY, state.drive.lastBackupAt);
    state.drive.newerBackup = null;
    state.donkeyMessage = randomFrom(DONKEY_BACKUP_MESSAGES);
    setMessage(`Backup saved. ${state.donkeyMessage}`, 'good');
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
    setMessage('Opening the Google Drive backup...', 'good loading');
    render();
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
    applyImportedCategorySettings(preview.data.categorySettings, mode);
    const count = preview.data.books.length;
    state.drive.restorePreview = null;
    state.drive.newerBackup = null;
    state.drive.lastRestoreAt = new Date().toISOString();
    writeLocalValue(DRIVE_LAST_RESTORE_KEY, state.drive.lastRestoreAt);
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

function showDonkeyWisdom() {
  state.donkeyMessage = randomFrom(DONKEY_HELPER_MESSAGES);
  setMessage(state.donkeyMessage, 'good');
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
    applyImportedCategorySettings(backup.categorySettings, mode);
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

function fieldWithList(name, label, value, listId, options, placeholder = '', required = false) {
  return `
    <label>${escapeHtml(label)}
      <input name="${escapeAttr(name)}" list="${escapeAttr(listId)}" value="${escapeAttr(value || '')}" placeholder="${escapeAttr(placeholder)}" ${required ? 'required' : ''}>
      <datalist id="${escapeAttr(listId)}">
        ${options.map((option) => `<option value="${escapeAttr(option)}"></option>`).join('')}
      </datalist>
    </label>
  `;
}

function categoryFieldsHtml(book, mode) {
  const main = MAIN_CATEGORIES.includes(book.category) ? book.category : 'Uncategorised';
  const subcategory = book.subcategory || (main === 'Uncategorised' ? 'To Review' : '');
  const listId = `subcategory-options-${escapeAttr(mode)}`;
  const options = getSubcategoryOptions(state.categorySettings, main);
  const legacyNote = book.category && !MAIN_CATEGORIES.includes(book.category)
    ? `<p class="legacy-category-note wide">${escapeHtml(safeCategoryDisplay(book))} is an older saved category. Choose Fiction, Non-Fiction or Uncategorised when Jane is ready to tidy it.</p>`
    : '';
  return `
    <div class="category-fields wide">
      <label>Main category
        <select name="category" data-subcategory-list="${listId}">
          ${MAIN_CATEGORIES.map((item) => `<option value="${escapeAttr(item)}" ${item === main ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('')}
        </select>
      </label>
      <label>Subcategory
        <input name="subcategory" list="${listId}" value="${escapeAttr(subcategory)}" placeholder="${main === 'Uncategorised' ? 'To Review' : 'Start typing a subcategory'}">
        <datalist id="${listId}">
          ${options.map((item) => `<option value="${escapeAttr(item)}"></option>`).join('')}
        </datalist>
      </label>
      ${recentSubcategoryChipsHtml()}
      ${legacyNote}
    </div>
  `;
}

function recentSubcategoryChipsHtml() {
  if (!state.categorySettings.recentSubcategories.length) return '';
  return `
    <div class="recent-category-chips wide" aria-label="Recently used categories">
      <span>Recently used</span>
      ${state.categorySettings.recentSubcategories.map((item) => `
        <button class="light" type="button" data-action="use-recent-subcategory" data-category="${escapeAttr(item.category)}" data-subcategory="${escapeAttr(item.subcategory)}">
          ${escapeHtml(item.category)} / ${escapeHtml(item.subcategory)}
        </button>
      `).join('')}
    </div>
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

function loadCategorySettings() {
  try {
    return normalizeCategorySettings(JSON.parse(localStorage.getItem(CATEGORY_SETTINGS_KEY) || '{}'));
  } catch {
    return normalizeCategorySettings();
  }
}

function saveCategorySettings() {
  try {
    localStorage.setItem(CATEGORY_SETTINGS_KEY, JSON.stringify(normalizeCategorySettings(state.categorySettings)));
  } catch {}
}

function allVisibleSubcategories() {
  return [
    ...getSubcategoryOptions(state.categorySettings, 'Fiction'),
    ...getSubcategoryOptions(state.categorySettings, 'Non-Fiction')
  ];
}

function formatDate(value) {
  const time = Date.parse(value || '');
  if (!Number.isFinite(time)) return '';
  return new Date(time).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
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

function randomFrom(items) {
  return items[Math.floor(Math.random() * items.length)];
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
