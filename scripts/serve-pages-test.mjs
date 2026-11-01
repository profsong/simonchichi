// Strict static hosting for a GitHub Pages project-site build; no SPA/root-path fallback.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import console from 'node:console';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = '/simonchichi/';
const output = resolve(root, 'dist-pages-test');
const build = spawnSync(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'build', '--outDir', 'dist-pages-test'],
  {
    cwd: root,
    env: { ...process.env, VITE_BASE_PATH: base },
    stdio: 'inherit',
    windowsHide: true,
  },
);
assert.equal(build.status, 0, 'Pages test build failed.');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};
// A browser-context cookie isolates each outage from the parallel browser tests.
// Only this localhost fixture has control endpoints; they are never built into the app.
const hostingStates = new Map();
const missingPage =
  '<!doctype html><html lang="en"><title>Site not found · GitHub Pages</title><h1>404</h1><p>There is not a GitHub Pages site here.</p></html>';
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const token = request.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('pages-test-client='))
      ?.slice('pages-test-client='.length);
    const validToken = token && /^[a-f0-9-]{36}$/.test(token);
    if (pathname === '/__pages-test__/hosting') {
      if (!validToken || !['GET', 'POST'].includes(request.method)) {
        response.writeHead(400).end('A test-context cookie is required.');
        return;
      }
      if (request.method === 'POST') {
        const mode = request.headers['x-pages-test-state'];
        if (mode !== 'missing' && mode !== 'available') {
          response.writeHead(400).end('Unknown hosting state.');
          return;
        }
        hostingStates.set(token, { missing: mode === 'missing', requests: [] });
      }
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(hostingStates.get(token) ?? { missing: false, requests: [] }));
      return;
    }
    const hosting = validToken && hostingStates.get(token);
    if (hosting?.missing && (pathname === base.slice(0, -1) || pathname.startsWith(base))) {
      hosting.requests.push({ pathname, status: 404 });
      response.writeHead(404, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      response.end(missingPage);
      return;
    }
    if (pathname === base.slice(0, -1)) {
      response.writeHead(301, { Location: base }).end();
      return;
    }
    if (!pathname.startsWith(base)) {
      response.writeHead(404).end('Not found');
      return;
    }
    const path = resolve(output, pathname.slice(base.length) || 'index.html');
    const local = relative(output, path);
    if (local.startsWith('..') || isAbsolute(local) || !(await stat(path)).isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': types[extname(path)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    response.end(request.method === 'HEAD' ? undefined : await readFile(path));
  } catch {
    response.writeHead(404).end('Not found');
  }
});
server.listen(4176, '127.0.0.1', () =>
  console.log(`Pages test server: http://127.0.0.1:4176${base}`),
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
