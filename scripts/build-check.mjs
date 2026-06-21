import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'jane-library.html',
  'styles.css',
  'manifest.webmanifest',
  'sw.js',
  'src/app.js',
  'src/libraryStore.js',
  'src/isbn.js',
  'src/filters.js',
  'src/backup.js',
  'src/googleDriveBackup.js',
  'src/config/googleDriveConfig.js',
  'src/ocrCandidates.js',
  'assets/icon.svg',
  'PROJECT_AUDIT.md',
  'COST_GUARDRAILS.md',
  'FEATURE_STATUS.md',
  'README.md'
];

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing required file: ${file}`);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (Object.keys(packageJson.dependencies || {}).length) {
  throw new Error('Runtime npm dependencies are not allowed for the no-cost static build.');
}

const appSource = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
const banned = ['firebase', 'supabase', 'stripe', 'cloudfunctions'];
for (const word of banned) {
  if (appSource.toLowerCase().includes(word)) throw new Error(`Banned paid/backend dependency found: ${word}`);
}

const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });

copy('jane-library.html', 'index.html');
for (const item of ['styles.css', 'manifest.webmanifest', 'sw.js', 'src', 'assets']) copy(item, item);

console.log('Static build ready in dist/.');

function copy(from, to) {
  const source = path.join(root, from);
  const target = path.join(dist, to);
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const child of fs.readdirSync(source)) copy(path.join(from, child), path.join(to, child));
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}
