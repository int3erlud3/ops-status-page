import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import { createStaticServer, resolveSafe } from '../src/server.js';

let root;
let outside;
let server;
let base;

before(async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'osp-'));
  root = path.join(tmp, 'public');
  outside = path.join(tmp, 'secret.txt');
  await mkdir(path.join(root, 'data'), { recursive: true });
  await writeFile(path.join(root, 'index.html'), '<!DOCTYPE html><title>t</title>');
  await writeFile(path.join(root, 'data', 'x.json'), '{}');
  await writeFile(path.join(root, '.env'), 'NOT_SERVED=1');
  await writeFile(outside, 'outside');
  await symlink(outside, path.join(root, 'link.txt'));
  server = createStaticServer(root);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test('serves index.html with security headers', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  const json = await fetch(`${base}/data/x.json`);
  assert.match(json.headers.get('content-type'), /application\/json/);
});

for (const p of ['/../secret.txt', '/%2e%2e/secret.txt', '/data/%2e%2e/%2e%2e/secret.txt', '/.env', '/link.txt', '/%00', '/nope']) {
  test(`refuses ${p}`, async () => {
    const res = await fetch(`${base}${p}`);
    assert.equal(res.status, 404);
  });
}

test('only GET and HEAD are allowed', async () => {
  const res = await fetch(`${base}/`, { method: 'POST', body: 'x' });
  assert.equal(res.status, 405);
  const head = await fetch(`${base}/`, { method: 'HEAD' });
  assert.equal(head.status, 200);
});

test('resolveSafe handles malformed encodings', async () => {
  assert.equal(await resolveSafe(root, '/%E0%A4%A'), null);
});
