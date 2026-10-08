import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { bannerEnabled, maybePrintBanner, render, SUITE } from '../src/banner.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'bin', 'ops-status-page.js');
const SAMPLES = ['public/data/healthcheck.sample.json', 'public/data/certs.sample.json'].map((p) => path.join(ROOT, p));
const env = { ...process.env, NO_BANNER: '' };

const run = (args, extraEnv = {}) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...env, ...extraEnv } });

// script(1) gives the child a pseudo-terminal so that stderr is a TTY.
function onTty(args, extraEnv = {}) {
  const which = spawnSync('sh', ['-c', 'command -v script'], { encoding: 'utf8' });
  if (which.status !== 0) return null;
  const quoted = [process.execPath, CLI, ...args].map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ');
  return spawnSync('script', ['-qefc', quoted, '/dev/null'], { encoding: 'utf8', env: { ...env, ...extraEnv }, input: '' });
}

test('validate: text summary and exit code of the worst status', () => {
  const r = run(['validate', ...SAMPLES]);
  assert.equal(r.status, 2);
  assert.match(r.stdout, /CRITICAL .*certs\.sample\.json: certs, 4 item\(s\)/);
  assert.match(r.stdout, /healthcheck, 3 item\(s\)/);
});

test('validate --json is pure JSON', () => {
  const r = run(['validate', '--json', ...SAMPLES]);
  const data = JSON.parse(r.stdout);
  assert.equal(data.status, 'CRITICAL');
  assert.equal(data.files.length, 2);
});

test('validate: invalid and missing files are UNKNOWN (3)', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'osp-cli-'));
  const bad = path.join(dir, 'bad.json');
  await writeFile(bad, '{"checks": "nope"}');
  const r = run(['validate', bad, path.join(dir, 'missing.json')]);
  assert.equal(r.status, 3);
  assert.match(r.stdout, /INVALID .*bad\.json: not server-healthcheck JSON/);
  assert.match(r.stdout, /INVALID .*missing\.json: ENOENT/);
});

test('usage errors exit 3', () => {
  assert.equal(run([]).status, 3);
  assert.equal(run(['validate']).status, 3);
  assert.equal(run(['serve', '--port', '99999']).status, 3);
  assert.equal(run(['--bogus']).status, 3);
});

test('--version and --help', () => {
  const v = run(['--version']);
  assert.equal(v.status, 0);
  assert.equal(v.stdout.trim(), 'ops-status-page 1.0.0');
  assert.match(run(['--help']).stdout, /validate FILE/);
});

test('banner: rendering rules', () => {
  const text = render('1.0.0');
  for (const line of text.split('\n')) assert.ok(line.length <= 70, line);
  assert.ok(text.includes(SUITE) && text.includes('by int3erlud3') && text.includes('v1.0.0'));
  assert.ok(/^[\x20-\x7e\n]*$/.test(text), 'banner must be plain ASCII');
  const tty = { isTTY: true, out: '', write(s) { this.out += s; } };
  assert.equal(bannerEnabled({ stream: tty, env: {} }), true);
  assert.equal(bannerEnabled({ stream: { isTTY: false }, env: {} }), false);
  assert.equal(bannerEnabled({ stream: tty, env: { NO_BANNER: '1' } }), false);
  assert.equal(bannerEnabled({ stream: tty, env: { NO_BANNER: '0' } }), true);
  assert.equal(bannerEnabled({ stream: tty, env: {}, noBanner: true }), false);
  assert.equal(maybePrintBanner('1.0.0', { stream: tty, env: {} }), true);
  assert.ok(tty.out.includes(SUITE));
});

test('README shows the current banner', async () => {
  const readme = await readFile(path.join(ROOT, 'README.md'), 'utf8');
  assert.ok(readme.includes(render('1.0.0')));
});

test('banner is not printed without a TTY', () => {
  const r = run(['validate', ...SAMPLES]);
  assert.ok(!r.stderr.includes(SUITE) && !r.stdout.includes(SUITE));
});

test('banner on a TTY; suppressed by --no-banner, NO_BANNER=1 and --json', (t) => {
  const shown = onTty(['--version']);
  if (!shown) return t.skip('script(1) not available');
  assert.ok(shown.stdout.includes(SUITE));
  assert.ok(!onTty(['--version', '--no-banner']).stdout.includes(SUITE));
  assert.ok(!onTty(['--version'], { NO_BANNER: '1' }).stdout.includes(SUITE));
  const json = onTty(['validate', '--json', ...SAMPLES]);
  assert.ok(!json.stdout.includes(SUITE));
});
