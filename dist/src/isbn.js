export function cleanIsbn(value) {
  return String(value || '').replace(/[^0-9Xx]/g, '').toUpperCase();
}

export function isLikelyIsbn(value) {
  const isbn = cleanIsbn(value);
  if (isbn.length === 10) return isValidIsbn10(isbn);
  if (isbn.length === 13) return isValidIsbn13(isbn);
  return false;
}

export async function lookupBookByIsbn(rawIsbn, fetcher = fetch) {
  const isbn = cleanIsbn(rawIsbn);
  if (!isLikelyIsbn(isbn)) throw new Error('That does not look like a full book barcode yet.');
  const [google, openLibrary] = await Promise.allSettled([
    fetchGoogleBooks(isbn, fetcher),
    fetchOpenLibraryByIsbn(isbn, fetcher)
  ]);
  const googleBook = google.status === 'fulfilled' ? google.value : null;
  const openBook = openLibrary.status === 'fulfilled' ? openLibrary.value : null;
  const merged = mergeBookMetadata(googleBook, openBook);
  if (!merged || !merged.title) throw new Error('No matching book was found. You can still add it by hand.');
  return merged;
}

export async function searchBooksByText(query, fetcher = fetch) {
  const clean = String(query || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const [google, openLibrary] = await Promise.allSettled([
    fetchGoogleBooksText(clean, fetcher),
    fetchOpenLibraryByText(clean, fetcher)
  ]);
  const rows = [];
  if (google.status === 'fulfilled') rows.push(...google.value);
  if (openLibrary.status === 'fulfilled') rows.push(...openLibrary.value);
  return uniqueBooks(rows).slice(0, 6);
}

export function googleVolumeToBook(item = {}) {
  const info = item.volumeInfo || {};
  const ids = info.industryIdentifiers || [];
  const isbn10 = ids.find((id) => id.type === 'ISBN_10')?.identifier || '';
  const isbn13 = ids.find((id) => id.type === 'ISBN_13')?.identifier || '';
  const categories = info.categories || [];
  return removeEmpty({
    title: info.title || '',
    subtitle: info.subtitle || '',
    authors: info.authors || [],
    isbn10,
    isbn13,
    publisher: info.publisher || '',
    publishedDate: info.publishedDate || '',
    category: categories[0] || '',
    subcategory: categories.slice(1).join(', '),
    summary: info.description || '',
    coverImageUrl: normalizeCoverUrl(info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || ''),
    source: 'Google Books'
  });
}

export function openLibraryDocToBook(doc = {}) {
  const isbns = doc.isbn || [];
  const isbn10 = isbns.find((value) => cleanIsbn(value).length === 10) || '';
  const isbn13 = isbns.find((value) => cleanIsbn(value).length === 13) || '';
  return removeEmpty({
    title: doc.title || '',
    subtitle: doc.subtitle || '',
    authors: doc.author_name || [],
    isbn10,
    isbn13,
    publisher: Array.isArray(doc.publisher) ? doc.publisher[0] : '',
    publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : '',
    category: Array.isArray(doc.subject) ? doc.subject[0] : '',
    subcategory: Array.isArray(doc.subject) ? doc.subject.slice(1, 4).join(', ') : '',
    coverImageUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : '',
    source: 'Open Library'
  });
}

export function mergeBookMetadata(primary, secondary) {
  if (!primary && !secondary) return null;
  const first = primary || {};
  const second = secondary || {};
  const merged = { ...second, ...removeEmpty(first) };
  for (const key of Object.keys(second)) {
    if (isBlank(merged[key]) && !isBlank(second[key])) merged[key] = second[key];
  }
  const sources = [first.source, second.source]
    .flatMap((value) => String(value || '').split('+'))
    .map((value) => value.trim())
    .filter(Boolean);
  merged.source = [...new Set(sources)].join(' + ') || 'Book lookup';
  return merged;
}

async function fetchGoogleBooks(isbn, fetcher) {
  const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}`, fetcher);
  if (!data.items || !data.items.length) return null;
  return googleVolumeToBook(data.items[0]);
}

async function fetchGoogleBooksText(query, fetcher) {
  const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5`, fetcher);
  return (data.items || []).map(googleVolumeToBook).filter((book) => book.title);
}

async function fetchOpenLibraryByIsbn(isbn, fetcher) {
  const data = await fetchJson(`https://openlibrary.org/search.json?isbn=${encodeURIComponent(isbn)}&limit=3`, fetcher);
  if (!data.docs || !data.docs.length) return null;
  return openLibraryDocToBook(data.docs[0]);
}

async function fetchOpenLibraryByText(query, fetcher) {
  const data = await fetchJson(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=5`, fetcher);
  return (data.docs || []).map(openLibraryDocToBook).filter((book) => book.title);
}

async function fetchJson(url, fetcher) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 6000) : null;
  try {
    const response = await fetcher(url, controller ? { signal: controller.signal } : undefined);
    if (!response.ok) throw new Error('Book lookup service was unavailable.');
    return response.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isValidIsbn10(isbn) {
  if (!/^[0-9]{9}[0-9X]$/.test(isbn)) return false;
  const total = isbn.split('').reduce((sum, char, index) => {
    const value = char === 'X' ? 10 : Number(char);
    return sum + value * (10 - index);
  }, 0);
  return total % 11 === 0;
}

function isValidIsbn13(isbn) {
  if (!/^[0-9]{13}$/.test(isbn)) return false;
  const total = isbn.split('').reduce((sum, char, index) => sum + Number(char) * (index % 2 === 0 ? 1 : 3), 0);
  return total % 10 === 0;
}

function normalizeCoverUrl(url) {
  return String(url || '').replace(/^http:/, 'https:');
}

function uniqueBooks(books) {
  const seen = new Set();
  return books.filter((book) => {
    const key = [book.isbn13, book.isbn10, book.title, (book.authors || []).join(',')].join('|').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function removeEmpty(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => !isBlank(value)));
}

function isBlank(value) {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0);
}
