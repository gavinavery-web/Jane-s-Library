# Project Notes

## Stage Objectives

0. Audit and reset: replace the Apps Script prototype with a static PWA and document why.
1. Cost-safe foundation: no backend, no paid services, PWA shell, static build output.
2. Data model: IndexedDB-backed records with tested create/read/update/delete.
3. Redesign: warm sage, timber, brass, parchment and reading-room interface inspired by Jane's real library photos.
4. Manual management: add, edit, delete and detail views with persistent storage.
5. Search and filters: find books with combined text and structured filters.
6. ISBN lookup: Google Books plus Open Library, review before save.
7. Barcode camera: ZXing browser scanner, graceful typed ISBN fallback.
8. Shelf OCR: Tesseract.js browser OCR, editable extracted text, reviewed candidate saves only.
9. Backup: JSON export/import and CSV export.
10. Reliability: tests, build check, browser smoke test and honest feature notes.

## Platform Decision

The user asked for a browser PWA with no backend and no ongoing operating cost. Because the existing project was an Apps Script prototype, the rebuild uses clean HTML/CSS/JavaScript modules rather than React/Vite. This avoids install-time dependency risk and keeps the static app simple to host on GitHub Pages.
