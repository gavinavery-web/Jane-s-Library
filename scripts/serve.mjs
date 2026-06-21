import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = fs.existsSync(path.join(process.cwd(), 'dist')) ? path.join(process.cwd(), 'dist') : process.cwd();
const port = Number(process.env.PORT || 4173);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

http.createServer((request, response) => {
  const url = new URL(request.url, `http://localhost:${port}`);
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (url.pathname === '/' || !path.extname(file)) file = path.join(root, 'index.html');
  if (!file.startsWith(root)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    response.end(data);
  });
}).listen(port, () => {
  console.log(`Jane's Library is running at http://localhost:${port}`);
});
