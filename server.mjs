import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.ttf': 'font/ttf' };
const server = createServer(async (request, response) => {
  const requested = request.url === '/' ? '/index.html' : request.url.split('?')[0];
  const filePath = path.resolve(root, `.${requested}`);
  if (!filePath.startsWith(root) || requested.includes('..')) { response.writeHead(403); response.end('Forbidden'); return; }
  try {
    const body = await readFile(filePath);
    const contentType = types[path.extname(filePath)] ?? 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': requested === '/data/published.json' ? 'no-store' : 'public, max-age=300' });
    response.end(body);
  } catch { response.writeHead(404); response.end('Not found'); }
});

const port = Number(process.env.PORT ?? 8080);
server.listen(port, '0.0.0.0', () => console.log(`AI Foundry listening on http://localhost:${port}`));
