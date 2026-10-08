import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

test('index.html declares a strict Content-Security-Policy', () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp, 'CSP meta tag missing');
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*/);
});

test('no inline scripts, inline styles or event handler attributes', () => {
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
  assert.doesNotMatch(html, /\son[a-z]+=/i);
  assert.doesNotMatch(html, /\sstyle=/i);
  assert.doesNotMatch(html, /<style/i);
});

test('no external resources are referenced', () => {
  assert.doesNotMatch(html, /(src|href)="(https?:)?\/\//);
});

test('front-end code never uses HTML sinks', async () => {
  const dir = new URL('../public/js/', import.meta.url);
  for (const file of await readdir(dir)) {
    const code = await readFile(new URL(file, dir), 'utf8');
    assert.doesNotMatch(code, /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write|eval\(|new Function/, file);
  }
});
