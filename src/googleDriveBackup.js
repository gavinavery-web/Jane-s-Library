import { exportLibraryJson, parseLibraryBackup } from './backup.js';

export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GOOGLE_DRIVE_BACKUP_FILE_NAME = 'janes-library-backup.json';
export const GOOGLE_DRIVE_BACKUP_FOLDER_NAME = "Jane's Library Backups";

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

export function getGoogleDriveConfigStatus(clientId) {
  if (!String(clientId || '').trim()) {
    return {
      configured: false,
      message: 'Google Drive backup is not set up yet. JSON backup still works.'
    };
  }
  return {
    configured: true,
    message: 'Google Drive backup is ready to connect.'
  };
}

export function createDriveBackupJson(books, options = {}) {
  return exportLibraryJson(books, options);
}

export function parseDriveBackupJson(raw) {
  return parseLibraryBackup(raw);
}

export function latestBookTimestamp(books = []) {
  const latest = books
    .flatMap((book) => [book?.lastUpdated, book?.dateAdded])
    .map((value) => Date.parse(value || ''))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  return Number.isFinite(latest) ? new Date(latest).toISOString() : '';
}

export function isDriveBackupNewerThanLocal(driveExportedAt, localBooks = []) {
  const driveTime = Date.parse(driveExportedAt || '');
  if (!Number.isFinite(driveTime)) return false;
  const localTime = Date.parse(latestBookTimestamp(localBooks) || '');
  if (!Number.isFinite(localTime)) return true;
  return driveTime > localTime;
}

export function createGoogleDriveBackupClient({ accessToken, fetcher = fetch } = {}) {
  if (!accessToken) throw new Error('Google Drive is not connected. JSON backup still works.');

  async function request(url, options = {}) {
    const headers = {
      ...(options.headers || {}),
      Authorization: `Bearer ${accessToken}`
    };
    let response;
    try {
      response = await fetcher(url, { ...options, headers });
    } catch {
      throw new Error('Google Drive could not be reached. Check the internet connection; JSON backup still works.');
    }
    if (!response.ok) throw await driveError(response);
    return response;
  }

  async function listFiles(q, fields = 'files(id,name,modifiedTime)') {
    const params = new URLSearchParams({
      q,
      fields,
      spaces: 'drive',
      pageSize: '10'
    });
    const response = await request(`${DRIVE_API}?${params.toString()}`);
    const data = await response.json();
    return Array.isArray(data.files) ? data.files : [];
  }

  async function findFolder() {
    const folders = await listFiles(`name = '${driveQueryValue(GOOGLE_DRIVE_BACKUP_FOLDER_NAME)}' and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`);
    return folders[0] || null;
  }

  async function createFolder() {
    const response = await request(`${DRIVE_API}?fields=id,name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({
        name: GOOGLE_DRIVE_BACKUP_FOLDER_NAME,
        mimeType: FOLDER_MIME_TYPE
      })
    });
    return response.json();
  }

  async function findOrCreateFolder() {
    return await findFolder() || await createFolder();
  }

  async function findBackupFile(folderId) {
    const files = await listFiles(`name = '${GOOGLE_DRIVE_BACKUP_FILE_NAME}' and '${driveQueryValue(folderId)}' in parents and trashed = false`);
    return files[0] || null;
  }

  async function getBackupMetadata() {
    const folder = await findFolder();
    if (!folder) return null;
    return findBackupFile(folder.id);
  }

  async function saveBackupJson(json) {
    const folder = await findOrCreateFolder();
    const existing = await findBackupFile(folder.id);
    const metadata = {
      name: GOOGLE_DRIVE_BACKUP_FILE_NAME,
      mimeType: 'application/json'
    };
    if (!existing) metadata.parents = [folder.id];
    const body = multipartBody(metadata, json);
    const target = existing
      ? `${DRIVE_UPLOAD_API}/${encodeURIComponent(existing.id)}?uploadType=multipart&fields=id,name,modifiedTime`
      : `${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,name,modifiedTime`;
    const response = await request(target, {
      method: existing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${body.boundary}` },
      body: body.content
    });
    return response.json();
  }

  async function loadBackup() {
    const file = await getBackupMetadata();
    if (!file) throw new Error('No Google Drive backup was found. JSON import still works if Jane has a downloaded backup file.');
    const response = await request(`${DRIVE_API}/${encodeURIComponent(file.id)}?alt=media`);
    const raw = await response.text();
    return {
      file,
      data: parseDriveBackupJson(raw)
    };
  }

  return {
    getBackupMetadata,
    loadBackup,
    saveBackupJson
  };
}

function multipartBody(metadata, media) {
  const boundary = `janes_library_${Math.random().toString(16).slice(2)}`;
  const content = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    media,
    `--${boundary}--`,
    ''
  ].join('\r\n');
  return { boundary, content };
}

function driveQueryValue(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function driveError(response) {
  let detail = '';
  try {
    const text = await response.text();
    detail = text ? ` (${text.slice(0, 160)})` : '';
  } catch {
    detail = '';
  }
  if (response.status === 401) return new Error('Google Drive connection expired. Connect Google Drive again; local data is safe.');
  if (response.status === 403) return new Error('Google Drive permission was denied. Connect again and approve Drive backup access, or use JSON backup.');
  if (response.status === 404) return new Error('The Google Drive backup file could not be found. JSON import still works.');
  return new Error(`Google Drive backup failed. Try again, or use JSON backup.${detail}`);
}
