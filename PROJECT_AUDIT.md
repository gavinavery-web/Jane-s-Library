# Jane's Library Project Audit

Date: 2026-06-21

## What Existed

The workspace contained an Apps Script prototype:

- `Code.gs`
- `Index.html`

That prototype targeted Google Apps Script and a Google Sheet backend. The new request is different: a no-backend, no-ongoing-cost, static PWA that can run on GitHub Pages and store data locally in the browser.

## Reset Decision

The Apps Script approach is treated as the failed prototype and is not the active platform for the rebuild. The active app is now the static PWA entry:

- `jane-library.html`
- `src/app.js`
- `styles.css`
- `manifest.webmanifest`
- `sw.js`

`Index.html` is left only as a redirect shim because the OneDrive reparse-point file could not be deleted or renamed in this sandbox. It redirects immediately to `jane-library.html` so the failed UI is not presented.

## Broken Prototype Areas

- Required a backend platform and Google authorisation prompts.
- Could not be deployed or edited directly from this environment.
- Used a Google Sheet database instead of local no-cost browser storage.
- Included features that depended on Apps Script deployment.
- Did not meet the new PWA/no-backend target.

## Useful Ideas Kept

- Warm cottage-library visual direction.
- Book fields and catalogue concepts.
- Browse, add, search, backup and review workflows.

## Fake Feature Policy

The rebuilt app avoids decorative fake buttons. Features that depend on browser capability or external free libraries show a plain-English fallback:

- Barcode scanner falls back to typed ISBN.
- OCR falls back to manual shelf text/manual add.
- Book lookup falls back to manual entry.

## Current Active Entry Point

- Development: `jane-library.html`
- Built static site: `dist/index.html`
