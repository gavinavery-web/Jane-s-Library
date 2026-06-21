# Feature Status

## Working

- Static browser PWA foundation.
- Static build output in `dist/`.
- PWA manifest and service worker.
- IndexedDB local storage: Working.
- Manual add, edit and delete.
- Home dashboard with large action cards, recently added books and mobile bottom navigation.
- Visual book card grid with fallback covers.
- Book detail view.
- Personal star rating field, display and 5/4+/3+/unrated filters.
- Text search across title, subtitle, authors, ISBN, publisher, summary and notes.
- Category, author, shelf and status filters.
- Reset filters action.
- Local cover image upload using data URLs.
- Cover image URL field.
- JSON export/import: Working.
- Google Drive backup: Implemented and configured with the browser OAuth Client ID; mocked smoke test passes.
- Google Drive restore: Implemented and configured with the browser OAuth Client ID; mocked smoke test passes.
- CSV export.
- ISBN cleaning and validation.
- Google Books lookup with review before save.
- Open Library fallback when Google Books fails, rate-limits or finds nothing.
- Plain-English no-result and network-failure ISBN messages with manual-entry fallback.
- Shelf photo/text review workflow.
- OCR extracted text review/edit area.
- OCR candidate generation from corrected text.
- Review-before-save flow for OCR/book candidates.

## Working With Limitations

- OCR uses free browser-side Tesseract.js from jsDelivr. It has no ongoing cost, but it requires network access to load the library unless self-hosted later, and weak shelf photos may produce poor text. The app never auto-saves OCR guesses.
- Public book APIs can be incomplete, slow or rate-limited. The app uses Open Library as fallback and keeps manual entry available.
- Google Drive backup/restore is implemented as a browser-only optional layer using the configured OAuth Client ID. Headless smoke tests mock the Google Identity and Drive API flow, but Gavin still needs one live OAuth sign-in/save/restore test from the deployed GitHub Pages URL.
- Data is local to the browser. Jane should export JSON backups before changing devices or clearing browser data.

## Needs Real-Device Test

- Barcode camera scanning. The scanner UI, fallback path and stream cleanup code are implemented and smoke-tested in headless Chrome, but a real phone/tablet camera cannot be physically tested from this environment. It must be tested on Jane's actual device over HTTPS or localhost.
- Real shelf photo OCR quality. The upload/progress/review workflow is smoke-tested with a controlled browser OCR result, but real bookshelf photos still need practical testing for lighting, distance and focus.
- Live Google Drive OAuth from `https://gavinavery-web.github.io/Jane-s-Library/`. The Client ID is wired, but the real account permission popup and Drive file creation must be confirmed in a live browser session.

## Not Included

- Backend sync across devices.
- User accounts or login.
- Paid cloud storage.
- Paid OCR or AI vision.
- Automatic shelf recognition without Jane reviewing matches.
- Any feature that silently saves guessed books.
