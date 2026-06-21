# Jane's Library

Jane's Library is a warm, no-backend personal library PWA for Jane's home library. It stores books in the browser, works as static files, and is designed for zero ongoing operating cost.

The active development entry is:

- `jane-library.html`

The production build entry is:

- `dist/index.html`

Live GitHub Pages URL:

- `https://gavinavery-web.github.io/Jane-s-Library/`

`Code.gs` and `Index.html` are obsolete Apps Script prototype files. `Index.html` redirects to the active PWA because OneDrive blocked deleting or renaming that old reparse-point file in this environment.

## Run Locally

```bash
npm test
npm run build
npm run serve
```

Open:

```text
http://localhost:4173
```

## Build

```bash
npm run build
```

The static site is written to `dist/`.

## GitHub Pages Deployment

1. Run `npm run build`.
2. Commit the project.
3. Push to GitHub.
4. In the repository, open **Settings > Pages**.
5. Publish the `dist/` folder using GitHub Actions or your preferred static deployment flow.
6. If publishing from the repo root instead of `dist/`, copy `jane-library.html` to `index.html` first.

## Local Data and Backups

Books are saved automatically in this browser. Jane should use **Backup > Download emergency backup** regularly. To move devices or restore data, use **Restore from emergency backup** and choose merge or replace.

Google Drive backup is optional and keeps a safer copy called `janes-library-backup.json` in a Drive folder called `Jane's Library Backups`. Browser storage remains the main working database, and JSON export/import remains available as the emergency fallback.

## Google Drive Backup Setup

Google Drive backup uses Google Identity Services and the Google Drive API directly from the browser. It does not need a backend, billing account, API key or client secret.

On iPhone, connect Google Drive from Safari first. The Home Screen app icon can still open Jane's Library, but Google sign-in popups may be more reliable in Safari.

1. Create or use a Google Cloud project.
2. Enable the **Google Drive API**.
3. Configure the OAuth consent screen for Jane's Library.
4. Create an OAuth Client ID for a **Web application**.
5. Add `https://gavinavery-web.github.io` as an authorised JavaScript origin.
6. If Google asks for a redirect URI, use `https://gavinavery-web.github.io/Jane-s-Library/`.
7. Add the localhost origin for testing if needed, for example `http://localhost:4173`.
8. Copy the OAuth Client ID into [src/config/googleDriveConfig.js](</C:/Users/gavin/OneDrive/Documents/Janes Library/src/config/googleDriveConfig.js>).
9. Run `npm run build` and redeploy the static site.

Use the narrow Drive scope `https://www.googleapis.com/auth/drive.file`, so the app only accesses files it creates or files the user opens with it. If Google asks for billing, stop and report before continuing. No client secret belongs in this static browser app.

## Features

- Home dashboard with large action cards
- Browse Library
- Add Book manually
- Edit and delete books
- Personal 0-5 star ratings for each book
- Structured categories with searchable subcategories and Manage Categories settings
- Check In / Check Out borrowing workflow
- Barcode lookup using free public APIs
- Barcode scanner with typed barcode-number fallback
- Shelf photo OCR/review workflow
- Optional Google Drive backup and restore
- JSON backup/import
- Download book list CSV with total quantity and numbered rows
- iPhone-friendly PWA manifest and home-screen icons

## Testing

Run:

```bash
npm test
npm run build
npm run serve
npm run smoke
```

`npm run smoke` opens headless Chrome and checks manual add, personal ratings, persistence, edit, search/filter, backup export/import, mocked Google Drive connect/save/restore wiring, scanner fallback, OCR upload/review path, delete, barcode lookup and save.

## No-Cost Rule

This app uses no backend, no billing account and no paid service. See `COST_GUARDRAILS.md`.

## Entry File Note

The active app entry in this workspace is `jane-library.html`. The old Apps Script `Index.html` file is a redirect shim because OneDrive blocked deleting/renaming that reparse-point file in this sandbox. The build script writes `dist/index.html` correctly for static hosting.

## Known Limitations

- Barcode scanning still needs a real phone/tablet camera test over HTTPS.
- OCR quality still needs real shelf-photo testing.
- Google Drive backup/restore is wired with the browser OAuth Client ID, but still needs a live browser OAuth test from the deployed GitHub Pages URL.
- Browser data is local, so JSON backups matter.
- Public book APIs can be unavailable or rate-limited; manual entry remains the fallback.
