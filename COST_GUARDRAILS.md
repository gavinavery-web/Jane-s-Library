# Cost Guardrails

Jane's Library is designed to have no ongoing operating cost.

## Platform

- Static HTML/CSS/JavaScript.
- Compatible with GitHub Pages or any static file host.
- No backend server.
- No paid database.
- No billing account.

## Storage

- Browser IndexedDB.
- Data is stored locally in Jane's browser.
- Backup and restore use downloaded JSON files.

## External Services

- Google Identity Services: optional browser OAuth for Google Drive backup. No client secret, backend or billing account is used by this app.
- Google Drive API: optional browser backup/restore using the narrow `drive.file` scope. It creates/updates `janes-library-backup.json` in Jane's Drive and requires Gavin to supply an OAuth Client ID.
- Google Books public API: used for ISBN and text lookup. No API key required.
- Open Library public API: used as a free fallback/secondary source. No API key required.
- Open Library cover images: used when returned by the public API.
- jsDelivr CDN for optional browser libraries:
  - `@zxing/browser` for barcode scanning.
  - `tesseract.js` for browser-side OCR.

## Important Notes

- The optional CDN libraries are free open-source browser dependencies, not hosted app services.
- If the CDN or network is unavailable, the app shows a fallback path instead of pretending the feature worked.
- Google Drive backup is optional; JSON export/import remains available if OAuth is not configured, blocked or unavailable.
- If Google Cloud asks for billing for this personal backup setup, stop and report before continuing.
- `package.json` has no runtime npm dependencies.
- No Firebase, Supabase, paid OCR, paid AI vision, cloud functions, paid storage, paid database or paid API dependency is included.
- No backend, billing account or required API key is included.
