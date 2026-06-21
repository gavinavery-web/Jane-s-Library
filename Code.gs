/*
  OBSOLETE PROTOTYPE FILE

  Jane's Library has been rebuilt as a no-backend static PWA.
  Use jane-library.html during local development, or dist/index.html after
  running npm run build. This Apps Script backend is intentionally not part
  of the active application.
*/

var SPREADSHEET_ID = '1hJ706tVlNpimeUZeujs4mGZY16L4OZKANu4olTz841s';

var HEADERS = {
  Books: [
    'BookID', 'Title', 'Author', 'Category', 'Subcategory', 'Description',
    'ISBN', 'Publisher', 'PublishingYear', 'CoverImageURL', 'ShelfWall',
    'ShelfBay', 'ShelfNumber', 'Status', 'Notes', 'Source', 'DateAdded',
    'LastUpdated'
  ],
  Categories: ['CategoryID', 'CategoryName', 'ParentCategory', 'Active', 'SortOrder'],
  Shelves: ['ShelfID', 'Wall', 'Bay', 'ShelfNumber', 'Label', 'Notes'],
  Borrowers: ['BorrowerID', 'Name', 'PhoneOptional', 'Notes'],
  Loans: ['LoanID', 'BookID', 'BorrowerID', 'BorrowerName', 'BorrowDate', 'DueDate', 'ReturnDate', 'Status', 'Notes'],
  'Review Queue': ['ReviewID', 'DetectedText', 'PossibleTitle', 'PossibleAuthor', 'ImageURL', 'ShelfLocation', 'Status', 'Notes'],
  Settings: ['Setting', 'Value', 'Notes']
};

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle("Jane's Library")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getAppData() {
  return friendlyResponse_(function () {
    ensureAllSheets_();
    var books = getRecords_('Books');
    var categories = getRecords_('Categories');
    var shelves = getRecords_('Shelves');
    var borrowers = getRecords_('Borrowers');
    var loans = getRecords_('Loans');
    var reviewQueue = getRecords_('Review Queue');
    return {
      books: books,
      categories: categories,
      shelves: shelves,
      borrowers: borrowers,
      loans: loans,
      reviewQueue: reviewQueue,
      summary: buildSummary_(books, loans)
    };
  });
}

function createBook(book) {
  return friendlyResponse_(function () {
    ensureSheet_('Books');
    var now = nowStamp_();
    var clean = cleanBook_(book || {});
    if (!clean.Title) throw new Error('Please add a title before saving.');
    clean.BookID = makeId_('B');
    clean.Status = clean.Status || 'Available';
    clean.Source = clean.Source || 'Manual';
    clean.DateAdded = now;
    clean.LastUpdated = now;
    appendRecord_('Books', clean);
    return { book: clean, message: 'Saved to Jane\'s Library.' };
  });
}

function updateBook(bookId, book) {
  return friendlyResponse_(function () {
    ensureSheet_('Books');
    if (!bookId) throw new Error('Please choose a book first.');
    var clean = cleanBook_(book || {});
    if (!clean.Title) throw new Error('Please add a title before saving.');
    clean.BookID = bookId;
    clean.LastUpdated = nowStamp_();
    updateRecordById_('Books', 'BookID', bookId, clean, ['BookID', 'DateAdded', 'Source']);
    return { book: clean, message: 'Book details updated.' };
  });
}

function addCategory(category) {
  return friendlyResponse_(function () {
    ensureSheet_('Categories');
    var clean = {
      CategoryID: makeId_('CAT'),
      CategoryName: text_(category && category.CategoryName),
      ParentCategory: text_(category && category.ParentCategory),
      Active: text_(category && category.Active) || 'TRUE',
      SortOrder: text_(category && category.SortOrder)
    };
    if (!clean.CategoryName) throw new Error('Please add a category name.');
    appendRecord_('Categories', clean);
    return { category: clean, message: 'Category saved.' };
  });
}

function updateCategory(categoryId, category) {
  return friendlyResponse_(function () {
    ensureSheet_('Categories');
    if (!categoryId) throw new Error('Please choose a category first.');
    var clean = {
      CategoryID: categoryId,
      CategoryName: text_(category && category.CategoryName),
      ParentCategory: text_(category && category.ParentCategory),
      Active: text_(category && category.Active) || 'TRUE',
      SortOrder: text_(category && category.SortOrder)
    };
    if (!clean.CategoryName) throw new Error('Please add a category name.');
    updateRecordById_('Categories', 'CategoryID', categoryId, clean, ['CategoryID']);
    return { category: clean, message: 'Category updated.' };
  });
}

function addShelf(shelf) {
  return friendlyResponse_(function () {
    ensureSheet_('Shelves');
    var clean = {
      ShelfID: makeId_('SH'),
      Wall: text_(shelf && shelf.Wall),
      Bay: text_(shelf && shelf.Bay),
      ShelfNumber: text_(shelf && shelf.ShelfNumber),
      Label: text_(shelf && shelf.Label),
      Notes: text_(shelf && shelf.Notes)
    };
    if (!clean.Wall && !clean.Bay && !clean.ShelfNumber && !clean.Label) {
      throw new Error('Please add at least one shelf detail.');
    }
    appendRecord_('Shelves', clean);
    return { shelf: clean, message: 'Shelf saved.' };
  });
}

function updateShelf(shelfId, shelf) {
  return friendlyResponse_(function () {
    ensureSheet_('Shelves');
    if (!shelfId) throw new Error('Please choose a shelf first.');
    var clean = {
      ShelfID: shelfId,
      Wall: text_(shelf && shelf.Wall),
      Bay: text_(shelf && shelf.Bay),
      ShelfNumber: text_(shelf && shelf.ShelfNumber),
      Label: text_(shelf && shelf.Label),
      Notes: text_(shelf && shelf.Notes)
    };
    updateRecordById_('Shelves', 'ShelfID', shelfId, clean, ['ShelfID']);
    return { shelf: clean, message: 'Shelf updated.' };
  });
}

function lookupIsbn(isbn) {
  return friendlyResponse_(function () {
    var cleanIsbn = String(isbn || '').replace(/[^0-9Xx]/g, '');
    if (!cleanIsbn) throw new Error('Please type an ISBN first.');
    var url = 'https://www.googleapis.com/books/v1/volumes?q=isbn:' + encodeURIComponent(cleanIsbn);
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (response.getResponseCode() >= 400) {
      throw new Error('The book search is taking a rest. Please try manual entry.');
    }
    var data = JSON.parse(response.getContentText() || '{}');
    if (!data.items || !data.items.length) {
      return { found: false, message: 'No matching book was found. You can still add it by hand.' };
    }
    var info = data.items[0].volumeInfo || {};
    var identifiers = info.industryIdentifiers || [];
    var bestIsbn = cleanIsbn;
    identifiers.forEach(function (item) {
      if (item && item.identifier && item.type === 'ISBN_13') bestIsbn = item.identifier;
    });
    var year = '';
    if (info.publishedDate) year = String(info.publishedDate).substring(0, 4);
    return {
      found: true,
      book: {
        Title: text_(info.title),
        Author: (info.authors || []).join(', '),
        Category: '',
        Subcategory: (info.categories || []).join(', '),
        Description: text_(info.description),
        ISBN: bestIsbn,
        Publisher: text_(info.publisher),
        PublishingYear: year,
        CoverImageURL: info.imageLinks ? text_(info.imageLinks.thumbnail || info.imageLinks.smallThumbnail) : '',
        Status: 'Available',
        Source: 'ISBN Lookup'
      },
      message: 'Book found. Please check the details before saving.'
    };
  });
}

function checkoutBook(payload) {
  return friendlyResponse_(function () {
    ensureSheet_('Loans');
    ensureSheet_('Borrowers');
    ensureSheet_('Books');
    payload = payload || {};
    var bookId = text_(payload.BookID);
    var borrowerName = text_(payload.BorrowerName);
    if (!bookId) throw new Error('Please choose a book to lend.');
    if (!borrowerName) throw new Error('Please add the borrower name.');
    var borrower = findOrCreateBorrower_(borrowerName, text_(payload.PhoneOptional));
    var loan = {
      LoanID: makeId_('LOAN'),
      BookID: bookId,
      BorrowerID: borrower.BorrowerID,
      BorrowerName: borrower.Name,
      BorrowDate: dateOnly_(new Date()),
      DueDate: text_(payload.DueDate),
      ReturnDate: '',
      Status: 'Borrowed',
      Notes: text_(payload.Notes)
    };
    appendRecord_('Loans', loan);
    updateRecordById_('Books', 'BookID', bookId, { Status: 'Borrowed', LastUpdated: nowStamp_() }, ['BookID']);
    return { loan: loan, message: 'Book checked out.' };
  });
}

function returnBook(loanId) {
  return friendlyResponse_(function () {
    ensureSheet_('Loans');
    ensureSheet_('Books');
    if (!loanId) throw new Error('Please choose a borrowed book first.');
    var loan = findRecordById_('Loans', 'LoanID', loanId);
    if (!loan) throw new Error('That loan could not be found.');
    updateRecordById_('Loans', 'LoanID', loanId, {
      ReturnDate: dateOnly_(new Date()),
      Status: 'Returned'
    }, ['LoanID', 'BookID', 'BorrowerID', 'BorrowerName', 'BorrowDate', 'DueDate', 'Notes']);
    updateRecordById_('Books', 'BookID', loan.BookID, { Status: 'Available', LastUpdated: nowStamp_() }, ['BookID']);
    return { message: 'Book returned to the shelves.' };
  });
}

function addReviewItem(item) {
  return friendlyResponse_(function () {
    ensureSheet_('Review Queue');
    item = item || {};
    var clean = {
      ReviewID: makeId_('REV'),
      DetectedText: text_(item.DetectedText),
      PossibleTitle: text_(item.PossibleTitle),
      PossibleAuthor: text_(item.PossibleAuthor),
      ImageURL: text_(item.ImageURL),
      ShelfLocation: text_(item.ShelfLocation),
      Status: text_(item.Status) || 'Needs Review',
      Notes: text_(item.Notes)
    };
    if (!clean.DetectedText && !clean.PossibleTitle && !clean.PossibleAuthor && !clean.ImageURL) {
      throw new Error('Please add a photo link or the words you can see.');
    }
    appendRecord_('Review Queue', clean);
    return { review: clean, message: 'Added to the review list.' };
  });
}

function updateReviewItemStatus(reviewId, status) {
  return friendlyResponse_(function () {
    ensureSheet_('Review Queue');
    if (!reviewId) throw new Error('Please choose a review item first.');
    updateRecordById_('Review Queue', 'ReviewID', reviewId, { Status: text_(status) || 'Needs Review' }, ['ReviewID']);
    return { message: 'Review item updated.' };
  });
}

function exportBooksCsv(kind) {
  return friendlyResponse_(function () {
    ensureAllSheets_();
    var books = getRecords_('Books');
    var loans = getRecords_('Loans');
    var rows = books;
    var filename = 'janes-library-books.csv';
    if (kind === 'borrowed') {
      var borrowedIds = {};
      loans.forEach(function (loan) {
        if (String(loan.Status).toLowerCase() === 'borrowed' && !loan.ReturnDate) borrowedIds[loan.BookID] = true;
      });
      rows = books.filter(function (book) {
        return String(book.Status).toLowerCase() === 'borrowed' || borrowedIds[book.BookID];
      });
      filename = 'janes-library-borrowed-books.csv';
    } else if (kind === 'backup') {
      filename = 'janes-library-backup.csv';
    }
    return {
      filename: filename,
      content: toCsv_(HEADERS.Books, rows),
      message: 'Export ready.'
    };
  });
}

function ensureAllSheets_() {
  Object.keys(HEADERS).forEach(function (name) {
    ensureSheet_(name);
  });
}

function ensureSheet_(name) {
  var sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error('The "' + name + '" sheet is missing.');
  var expected = HEADERS[name];
  var width = Math.max(expected.length, sheet.getLastColumn() || expected.length);
  var current = sheet.getRange(1, 1, 1, width).getValues()[0];
  var hasAnyHeader = current.some(function (value) { return text_(value); });
  if (!hasAnyHeader) {
    sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
    return sheet;
  }
  var missing = expected.filter(function (header) { return current.indexOf(header) === -1; });
  if (missing.length) {
    throw new Error('The "' + name + '" sheet needs these headings: ' + missing.join(', '));
  }
  return sheet;
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getRecords_(sheetName) {
  var sheet = ensureSheet_(sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var lastColumn = sheet.getLastColumn();
  var values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  var headers = values[0].map(function (header) { return text_(header); });
  var records = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var empty = row.every(function (cell) { return text_(cell) === ''; });
    if (empty) continue;
    var record = { _rowNumber: r + 1 };
    headers.forEach(function (header, index) {
      if (header) record[header] = displayValue_(row[index]);
    });
    records.push(record);
  }
  return records;
}

function appendRecord_(sheetName, record) {
  var sheet = ensureSheet_(sheetName);
  var headers = getHeaderRow_(sheet);
  var row = headers.map(function (header) {
    return record.hasOwnProperty(header) ? record[header] : '';
  });
  sheet.appendRow(row);
}

function updateRecordById_(sheetName, idHeader, idValue, updates, preserve) {
  var sheet = ensureSheet_(sheetName);
  var headers = getHeaderRow_(sheet);
  var idIndex = headers.indexOf(idHeader);
  if (idIndex === -1) throw new Error('The "' + idHeader + '" heading is missing.');
  var values = sheet.getDataRange().getValues();
  var preserveMap = {};
  (preserve || []).forEach(function (key) { preserveMap[key] = true; });
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][idIndex]) === String(idValue)) {
      var row = values[r].slice();
      headers.forEach(function (header, c) {
        if (!header || preserveMap[header]) return;
        if (updates.hasOwnProperty(header)) row[c] = updates[header];
      });
      sheet.getRange(r + 1, 1, 1, headers.length).setValues([row.slice(0, headers.length)]);
      return;
    }
  }
  throw new Error('That saved item could not be found.');
}

function findRecordById_(sheetName, idHeader, idValue) {
  var records = getRecords_(sheetName);
  for (var i = 0; i < records.length; i++) {
    if (String(records[i][idHeader]) === String(idValue)) return records[i];
  }
  return null;
}

function findOrCreateBorrower_(name, phone) {
  var borrowers = getRecords_('Borrowers');
  var lower = name.toLowerCase();
  for (var i = 0; i < borrowers.length; i++) {
    if (String(borrowers[i].Name || '').toLowerCase() === lower) return borrowers[i];
  }
  var borrower = {
    BorrowerID: makeId_('BOR'),
    Name: name,
    PhoneOptional: phone,
    Notes: ''
  };
  appendRecord_('Borrowers', borrower);
  return borrower;
}

function cleanBook_(book) {
  return {
    BookID: text_(book.BookID),
    Title: text_(book.Title),
    Author: text_(book.Author),
    Category: text_(book.Category),
    Subcategory: text_(book.Subcategory),
    Description: text_(book.Description),
    ISBN: text_(book.ISBN),
    Publisher: text_(book.Publisher),
    PublishingYear: text_(book.PublishingYear),
    CoverImageURL: text_(book.CoverImageURL),
    ShelfWall: text_(book.ShelfWall),
    ShelfBay: text_(book.ShelfBay),
    ShelfNumber: text_(book.ShelfNumber),
    Status: text_(book.Status) || 'Available',
    Notes: text_(book.Notes),
    Source: text_(book.Source) || 'Manual',
    DateAdded: text_(book.DateAdded),
    LastUpdated: text_(book.LastUpdated)
  };
}

function getHeaderRow_(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (header) {
    return text_(header);
  });
}

function buildSummary_(books, loans) {
  var borrowed = books.filter(function (book) {
    return String(book.Status || '').toLowerCase() === 'borrowed';
  }).length;
  var latest = '';
  books.forEach(function (book) {
    if (book.LastUpdated && String(book.LastUpdated) > latest) latest = String(book.LastUpdated);
  });
  return {
    libraryName: "Jane's Library",
    totalBooks: books.length,
    totalBorrowed: borrowed,
    totalLoans: loans.length,
    lastUpdated: latest
  };
}

function toCsv_(headers, rows) {
  var lines = [headers.map(csvCell_).join(',')];
  rows.forEach(function (row) {
    lines.push(headers.map(function (header) { return csvCell_(row[header]); }).join(','));
  });
  return lines.join('\n');
}

function csvCell_(value) {
  var text = displayValue_(value);
  return '"' + text.replace(/"/g, '""') + '"';
}

function friendlyResponse_(work) {
  try {
    var result = work();
    result = result || {};
    result.ok = true;
    return result;
  } catch (error) {
    return {
      ok: false,
      message: error && error.message ? error.message : 'Something went wrong. Please try again.'
    };
  }
}

function makeId_(prefix) {
  return prefix + '-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmss') + '-' + Math.floor(Math.random() * 10000);
}

function nowStamp_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
}

function dateOnly_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function text_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function displayValue_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') return dateOnly_(value);
  return text_(value);
}
