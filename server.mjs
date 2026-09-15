import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('./', import.meta.url);
const files = new Set(['/index.html', '/style.css', '/app.js']);
const types = { html: 'text/html', css: 'text/css', js: 'text/javascript' };
const port = Number(process.env.PORT || 5173);
http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const file = path === '/' ? '/index.html' : path;
  if (!files.has(file)) {
    res.writeHead(404).end('Not found');
    return;
  }
  try {
    const content = await readFile(fileURLToPath(new URL(file.slice(1), root)));
    res.writeHead(200, { 'Content-Type': `${types[file.split('.').pop()]}; charset=utf-8`, 'Cache-Control': 'no-cache' });
    res.end(content);
  } catch {
    res.writeHead(500).end('Unable to load file');
  }
}).listen(port, '127.0.0.1', () => console.log(`CRT workstation: http://localhost:${port}`));
