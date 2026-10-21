import http from 'node:http';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { build, root } from './build.js';

await build();
const output = path.join(root, 'dist');
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end('Method not allowed');
    return;
  }
  try {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch (error) {
      if (!(error instanceof URIError || error instanceof TypeError)) throw error;
      response.writeHead(400);
      response.end('Invalid URL');
      return;
    }
    const target = path.resolve(output, `.${pathname.replaceAll('/', path.sep)}`);
    if (target !== output && !target.startsWith(output + path.sep)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    let file = target;
    try {
      if ((await stat(file)).isDirectory()) {
        if (!pathname.endsWith('/')) {
          response.writeHead(308, { Location: `${pathname}/${new URL(request.url, 'http://localhost').search}` });
          response.end();
          return;
        }
        file = path.join(file, 'index.html');
      }
      const body = await readFile(file);
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
      response.writeHead(404, { 'Content-Type': types['.html'] });
      const body = await readFile(path.join(output, '404.html'));
      response.end(request.method === 'HEAD' ? undefined : body);
    }
  } catch (error) {
    console.error('Request failed:', error);
    if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Unable to serve this page.');
  }
}).listen(port, '127.0.0.1', () => console.log(`Blog is ready at http://localhost:${port}`));
