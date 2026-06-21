# Jane's Library Final Debug Report

Date: 2026-06-21

## 1. Test Commands Run

- `npm test`
- `npm run build`
- `npm run serve`
- `npm run smoke`

Documented commands are valid. No alternate command was required for the final verification pass.

## 2. Automated Test Results

`npm test` passed.

Result:

- 23 test(s) passed
- 0 failed

Covered areas include:

- IndexedDB-compatible store create/read/update/delete behavior
- Book normalization and rating defaults
- ISBN cleanup, Google Books mapping and Open Library fallback
- Search and filters including rating filters
- JSON backup export/import validation
- CSV export
- Google Drive backup module behavior with mocked Drive API calls
- OCR candidate extraction

## 3. Smoke Test Results

`npm run smoke` passed in headless Chrome against `http://localhost:4173`.

Result:

- 0 page errors
- Manual add opened detail view
- Book persisted after refresh
- Edit persisted after refresh
- Search worked
- Browse cards showed rating
- Detail view showed rating
- 5-star filter worked
- 4-stars-and-up filter worked
- 3-stars-and-up filter worked
- Unrated filter worked
- Combined text/category/shelf/status/rating filter worked
- Google Drive disconnected UI appeared
- Missing Google OAuth Client ID failed gracefully
- JSON backup exported
- JSON backup imported
- Barcode scanner fallback appeared
- OCR upload/extracted text flow worked with controlled browser OCR result
- OCR candidate review appeared
- OCR candidate saved as unrated
- Delete persisted after refresh
- ISBN lookup saved imported book

## 4. Feature-by-Feature Status

| Feature | Status | Notes |
|---|---|---|
| Active app entry | Working | `jane-library.html`; production build is `dist/index.html`. |
| Obsolete Apps Script files | Working | `Code.gs` and `Index.html` are marked obsolete; `Index.html` redirects to the active app. |
| No-cost/static platform | Working | No backend, runtime npm dependencies, paid service or billing dependency found. |
| IndexedDB local storage | Working | Store tests and smoke add/edit/delete persistence passed. |
| Existing books without rating | Working | Normalization defaults missing rating to numeric `0`. |
| Browse Library | Working | Loads as default screen; smoke verified cards, detail, search and rating filters. |
| Empty state | Working | Code path present and smoke begins from cleared IndexedDB. |
| Cover fallback | Working | Code path present; smoke exercises cards without uploaded covers. |
| Manual add/edit/delete | Working | Smoke verified add, edit, refresh persistence, delete and delete persistence. |
| Manual form validation | Working | Title is required at UI/store level; tests cover store validation. |
| Star rating | Working | Add, edit, card, detail, filters, export/import and OCR candidate paths tested. |
| Search/filter | Working | Unit and smoke tests cover text, category, shelf, status and rating combinations. |
| ISBN lookup | Working | Unit tests cover Google Books mapping, 429 fallback and no-result message; smoke tests deterministic Open Library fallback and save. |
| Google Books live lookup | Working with limitation | Code path exists, but final smoke intentionally mocked Google Books to 429 to verify fallback. Live Google Books availability still depends on public API/network. |
| Open Library fallback | Working | Unit and smoke tests passed. |
| Barcode scanner UI/fallback | Working with limitation | Scanner UI, ZXing import path, native fallback and cleanup code exist; headless smoke verified fallback. |
| Physical barcode scan | Needs live device test | Requires phone/tablet camera over HTTPS or localhost. Not physically tested here. |
| Shelf photo OCR UI | Working with limitation | Upload/capture UI, progress, extracted text edit and candidate review flow exist. Smoke used a controlled browser OCR result. |
| Real shelf photo OCR quality | Needs live device test | Requires real shelf photos to judge lighting/focus/text quality. |
| JSON export/import | Working | Smoke verified export/import. Parser now rejects backup books missing titles. |
| CSV export | Working | Unit tests verify headers, rating and escaping. |
| Google Drive backup UI | Working with limitation | Backup screen shows Drive status and graceful missing-client-ID state. |
| Google Drive backup API module | Working with limitation | Mocked tests verify folder/file create, update, load and no-backup error behavior. |
| Live Google Drive backup | Needs live Google OAuth test | Requires OAuth Client ID and real browser sign-in. |
| Live Google Drive restore | Needs live Google OAuth test | Requires OAuth Client ID, real Drive file, merge/replace/cancel live flow. |
| PWA manifest | Working | Manifest exists with name, start URL, standalone display and icon. |
| Service worker | Working | Cache updated to include Google Drive modules and cache name bumped to `janes-library-v2`. |
| Static build output | Working | `dist/index.html`, `dist/src/*`, manifest, service worker, styles and icon exist after build. |
| Mobile layout basics | Working with limitation | Smoke runs at 412x900 viewport; real phone tactile testing still recommended. |
| Error messages | Working | Main failure paths use plain-English messages and keep local data safe. |

## 5. Bugs Found

1. Service worker app shell did not include the new Google Drive modules.
2. `Index.html` redirected away from the old prototype but was not clearly marked obsolete inside the file.
3. Backup parser accepted a book object missing a title, which could import an invalid untitled record.

## 6. Bugs Fixed

1. Added `./src/googleDriveBackup.js` and `./src/config/googleDriveConfig.js` to `sw.js` app shell.
2. Bumped service worker cache from `janes-library-v1` to `janes-library-v2`.
3. Added an explicit obsolete prototype comment to `Index.html`.
4. Added a regression test for invalid backup books missing titles.
5. Updated `parseLibraryBackup` so JSON import and Google Drive restore reject backup books missing titles before changing local data.

## 7. Bugs Remaining

No confirmed code bugs remain from this sweep.

Remaining limitations are environmental/live-test items:

- Real phone/tablet camera barcode scanning.
- Real shelf photo OCR quality.
- Live Google OAuth sign-in and Drive backup/restore.
- Public APIs can be unavailable, rate-limited or incomplete.

## 8. What Could Not Be Tested Here

- Physical phone/tablet camera barcode scan.
- Physical camera permission UX on Jane's actual device.
- Real shelf photo OCR quality using Jane's shelves.
- Live Google OAuth popup, consent screen and token return.
- Actual Google Drive file create/update/load/restore.
- GitHub Pages production origin authorization until the final URL is known.

## 9. Exact Phone Test Steps for Gavin

1. Build and deploy the static site.
2. Open the deployed HTTPS URL on Jane's phone.
3. Add a manual test book with a 5-star rating.
4. Refresh the page and confirm the book and rating remain.
5. Edit the book to 3 stars and refresh again.
6. Open **Add Book > Scan Barcode**.
7. Tap **Open Camera**.
8. Approve camera permission.
9. Scan a real ISBN barcode.
10. Confirm the ISBN review screen appears before saving.
11. Set a star rating on the review screen.
12. Save and confirm the imported book appears in Browse Library.
13. Go to **Shelf Scan**.
14. Take or upload a real shelf photo.
15. Confirm OCR progress appears.
16. Review/edit extracted text.
17. Find possible books.
18. Review one candidate, set a rating, save it.
19. Confirm only reviewed/confirmed candidates are saved.
20. Export a JSON backup from **Backup / Settings**.

## 10. Exact Google Drive OAuth Checks Still Required

1. In Google Cloud, enable Google Drive API.
2. Configure OAuth consent screen for Jane's Library.
3. Create a Web application OAuth Client ID.
4. Add the local testing origin, e.g. `http://localhost:4173`.
5. Add the deployed GitHub Pages origin.
6. Copy the Client ID into `src/config/googleDriveConfig.js`.
7. Rebuild and redeploy.
8. Open **Backup / Settings**.
9. Click **Connect Google Drive**.
10. Confirm the Google popup opens and asks only for Drive file access.
11. Approve consent.
12. Click **Save Backup to Google Drive**.
13. Confirm success message and last backup time update.
14. Confirm `janes-library-backup.json` exists in `Jane's Library Backups` in Drive.
15. Click **Restore Backup from Google Drive**.
16. Confirm restore preview shows local count, Drive count and backup date.
17. Test **Cancel** and confirm no local changes.
18. Test **Merge with current library**.
19. Test **Replace current library** only after exporting a JSON backup first.
20. Disconnect and confirm the app remains usable without Drive.

## 11. No Ongoing Cost Dependency Confirmation

Confirmed:

- No backend server.
- No paid database.
- No Firebase.
- No Supabase.
- No cloud functions.
- No paid OCR.
- No paid AI vision.
- No paid hosting dependency.
- No billing account dependency.
- No runtime npm dependencies.
- No required API key.
- Google Drive OAuth Client ID is optional and not a secret.
- JSON export/import remains available without Google Drive.

## 12. Fake Button / Placeholder Confirmation

No visible active PWA button was found without a handler in the source audit.

Features that cannot be fully tested in this environment are not claimed as physically tested:

- Barcode physical camera scan: needs live device test.
- Real shelf photo OCR quality: needs live device test.
- Google Drive OAuth save/restore: needs live OAuth/browser test.

The old Apps Script UI remains only in obsolete files and is not the active application path.
