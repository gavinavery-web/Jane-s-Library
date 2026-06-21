export function filterBooks(books, filters = {}) {
  const query = normalize(filters.query);
  const category = normalize(filters.category);
  const subcategory = normalize(filters.subcategory);
  const author = normalize(filters.author);
  const shelf = normalize(filters.shelf);
  const status = normalize(filters.status);
  const rating = normalize(filters.rating);
  return books.filter((book) => {
    const bookRating = normalizeRating(book.rating);
    const searchable = normalize([
      book.title,
      book.subtitle,
      (book.authors || []).join(' '),
      book.isbn10,
      book.isbn13,
      book.category,
      book.subcategory,
      book.shelfLocation,
      book.status,
      book.summary,
      book.notes,
      book.publisher
    ].join(' '));
    return (!query || searchable.includes(query))
      && (!category || normalize(book.category) === category)
      && (!subcategory || normalize(book.subcategory) === subcategory)
      && (!author || normalize((book.authors || []).join(' ')).includes(author))
      && (!shelf || normalize(book.shelfLocation).includes(shelf))
      && (!status || normalize(book.status) === status)
      && ratingMatches(bookRating, rating);
  });
}

export function deriveFilterOptions(books) {
  return {
    categories: uniqueSorted(books.map((book) => book.category)),
    subcategories: uniqueSorted(books.map((book) => book.subcategory)),
    authors: uniqueSorted(books.flatMap((book) => book.authors || [])),
    shelves: uniqueSorted(books.map((book) => book.shelfLocation)),
    statuses: uniqueSorted(books.map((book) => book.status || 'Available'))
  };
}

function uniqueSorted(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeRating(value) {
  const rating = Number(value || 0);
  return Number.isInteger(rating) && rating >= 0 && rating <= 5 ? rating : 0;
}

function ratingMatches(bookRating, filter) {
  if (!filter) return true;
  if (filter === '5') return bookRating === 5;
  if (filter === '4up') return bookRating >= 4;
  if (filter === '3up') return bookRating >= 3;
  if (filter === 'unrated') return bookRating === 0;
  return true;
}
