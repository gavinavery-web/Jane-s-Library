import { test, assert } from './testHarness.mjs';
import {
  GOOGLE_DRIVE_BACKUP_FILE_NAME,
  GOOGLE_DRIVE_BACKUP_FOLDER_NAME,
  GOOGLE_DRIVE_SCOPE,
  createDriveBackupJson,
  createGoogleDriveBackupClient,
  getGoogleDriveConfigStatus,
  isDriveBackupNewerThanLocal,
  latestBookTimestamp,
  parseDriveBackupJson
} from '../src/googleDriveBackup.js';

test('Drive backup config reports missing client ID gracefully', () => {
  const status = getGoogleDriveConfigStatus('');
  assert.equal(status.configured, false);
  assert.match(status.message, /not set up yet/);
  assert.equal(GOOGLE_DRIVE_SCOPE, 'https://www.googleapis.com/auth/drive.file');
});

test('Drive backup JSON preserves book fields, ratings and timestamp metadata', () => {
  const json = createDriveBackupJson([{
    id: 'b1',
    title: 'Safari',
    authors: ['Jane Avery'],
    category: 'Travel',
    shelfLocation: 'Window Wall / Table',
    notes: 'Coffee table',
    borrowedBy: 'Gavin',
    rating: 5,
    lastUpdated: '2026-06-21T01:00:00.000Z'
  }], { now: () => new Date('2026-06-21T02:00:00.000Z') });

  const raw = JSON.parse(json);
  assert.equal(raw.app, "Jane's Library");
  assert.equal(raw.schemaVersion, 1);
  assert.equal(raw.exportedAt, '2026-06-21T02:00:00.000Z');

  const parsed = parseDriveBackupJson(json);
  assert.equal(parsed.exportedAt, '2026-06-21T02:00:00.000Z');
  assert.equal(parsed.books[0].title, 'Safari');
  assert.equal(parsed.books[0].rating, 5);
  assert.equal(parsed.books[0].shelfLocation, 'Window Wall / Table');
  assert.equal(parsed.books[0].borrowedBy, 'Gavin');
});

test('Drive backup timestamp helpers compare Drive and local changes safely', () => {
  const localBooks = [
    { title: 'Older', lastUpdated: '2026-06-20T00:00:00.000Z' },
    { title: 'Newer', lastUpdated: '2026-06-21T03:00:00.000Z' }
  ];
  assert.equal(latestBookTimestamp(localBooks), '2026-06-21T03:00:00.000Z');
  assert.equal(isDriveBackupNewerThanLocal('2026-06-21T04:00:00.000Z', localBooks), true);
  assert.equal(isDriveBackupNewerThanLocal('2026-06-21T02:00:00.000Z', localBooks), false);
  assert.equal(isDriveBackupNewerThanLocal('', localBooks), false);
});

test('Drive client creates backup folder and file using drive.file REST requests', async () => {
  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/drive/v3/files?') && options.method !== 'POST') return jsonResponse({ files: [] });
    if (String(url).includes('/upload/drive/v3/files?uploadType=multipart')) return jsonResponse({ id: 'backup-1', name: GOOGLE_DRIVE_BACKUP_FILE_NAME });
    if (String(url).includes('/drive/v3/files') && options.method === 'POST') return jsonResponse({ id: 'folder-1', name: GOOGLE_DRIVE_BACKUP_FOLDER_NAME });
    throw new Error(`Unexpected request: ${options.method || 'GET'} ${url}`);
  };
  const client = createGoogleDriveBackupClient({ accessToken: 'token-1', fetcher });

  const saved = await client.saveBackupJson('{"books":[]}');

  assert.equal(saved.id, 'backup-1');
  assert.equal(calls.some((call) => call.options.headers?.Authorization === 'Bearer token-1'), true);
  assert.equal(calls.some((call) => call.options.body && String(call.options.body).includes(GOOGLE_DRIVE_BACKUP_FOLDER_NAME)), true);
  assert.equal(calls.some((call) => call.options.body && String(call.options.body).includes(GOOGLE_DRIVE_BACKUP_FILE_NAME)), true);
});

test('Drive client updates an existing backup file when one already exists', async () => {
  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/drive/v3/files?') && String(url).includes('application%2Fvnd.google-apps.folder')) {
      return jsonResponse({ files: [{ id: 'folder-1', name: GOOGLE_DRIVE_BACKUP_FOLDER_NAME }] });
    }
    if (String(url).includes('/drive/v3/files?')) return jsonResponse({ files: [{ id: 'backup-1', name: GOOGLE_DRIVE_BACKUP_FILE_NAME }] });
    if (String(url).includes('/upload/drive/v3/files/backup-1?uploadType=multipart')) return jsonResponse({ id: 'backup-1', name: GOOGLE_DRIVE_BACKUP_FILE_NAME });
    throw new Error(`Unexpected request: ${options.method || 'GET'} ${url}`);
  };
  const client = createGoogleDriveBackupClient({ accessToken: 'token-1', fetcher });

  await client.saveBackupJson('{"books":[]}');

  assert.equal(calls.some((call) => call.options.method === 'PATCH' && call.url.includes('/upload/drive/v3/files/backup-1')), true);
});

test('Drive client loads and validates backup JSON from Drive', async () => {
  const backupJson = createDriveBackupJson([{ title: 'Safari', rating: 4 }], { now: () => new Date('2026-06-21T02:00:00.000Z') });
  const fetcher = async (url) => {
    if (String(url).includes('/drive/v3/files?') && String(url).includes('application%2Fvnd.google-apps.folder')) {
      return jsonResponse({ files: [{ id: 'folder-1', name: GOOGLE_DRIVE_BACKUP_FOLDER_NAME }] });
    }
    if (String(url).includes('/drive/v3/files?')) return jsonResponse({ files: [{ id: 'backup-1', name: GOOGLE_DRIVE_BACKUP_FILE_NAME, modifiedTime: '2026-06-21T02:00:00.000Z' }] });
    if (String(url).includes('/drive/v3/files/backup-1?alt=media')) return textResponse(backupJson);
    throw new Error(`Unexpected request: ${url}`);
  };
  const client = createGoogleDriveBackupClient({ accessToken: 'token-1', fetcher });

  const backup = await client.loadBackup();

  assert.equal(backup.file.id, 'backup-1');
  assert.equal(backup.data.books[0].title, 'Safari');
  assert.equal(backup.data.books[0].rating, 4);
});

test('Drive client reports no backup file with a friendly error', async () => {
  const fetcher = async () => jsonResponse({ files: [] });
  const client = createGoogleDriveBackupClient({ accessToken: 'token-1', fetcher });

  await assert.rejects(() => client.loadBackup(), /No Google Drive backup was found/);
});

function jsonResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    }
  };
}

function textResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    async json() {
      return JSON.parse(body);
    },
    async text() {
      return body;
    }
  };
}
