// Minimal static file server for local viewing: binds to 127.0.0.1 by default, serves
// only files below the web root, GET/HEAD only, strict security headers.
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

export const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; " +
    "base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cache-Control': 'no-store',
});

function send(res, code, body, extra = {}) {
  res.writeHead(code, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', ...extra });
  res.end(body);
}

/** Resolve a URL path inside root; returns null for anything outside or hidden. */
export async function resolveSafe(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const rel = path.normalize(decoded).replace(/^([/\\])+/, '');
  if (rel.split(/[/\\]/).some((part) => part.startsWith('.') && part !== '')) return null; // dotfiles, ..
  const rootReal = await realpath(root);
  let target = path.join(rootReal, rel);
  try {
    if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html');
    const real = await realpath(target);
    if (real !== rootReal && !real.startsWith(rootReal + path.sep)) return null; // symlink escape
    if (!(await stat(real)).isFile()) return null;
    return real;
  } catch {
    return null;
  }
}

export function createStaticServer(root) {
  return createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 405, 'method not allowed\n', { Allow: 'GET, HEAD' });
      return;
    }
    const file = await resolveSafe(root, req.url ?? '/');
    if (!file) {
      send(res, 404, 'not found\n');
      return;
    }
    const type = TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': type });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
}
