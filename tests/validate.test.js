import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
  normStatus,
  parseCerts,
  parseHealthcheck,
  sortCerts,
  summarize,
  ValidationError,
  worst,
} from '../public/js/validate.js';

const sample = async (name) => JSON.parse(await readFile(new URL(`../public/data/${name}`, import.meta.url), 'utf8'));

test('parses the bundled healthcheck sample', async () => {
  const hosts = parseHealthcheck(await sample('healthcheck.sample.json'));
  assert.equal(hosts.length, 3);
  assert.deepEqual(summarize(hosts), { OK: 1, WARNING: 1, CRITICAL: 1, UNKNOWN: 0 });
  assert.equal(hosts[1].checks[2].name, 'disk:/u02');
});

test('accepts a single server-healthcheck report and {hosts: [...]}', () => {
  const one = { host: 'web01', status: 'OK', checks: [{ name: 'cpu', status: 'OK', value: 3, message: 'x' }] };
  assert.equal(parseHealthcheck(one).length, 1);
  assert.equal(parseHealthcheck({ hosts: [one, one] }).length, 2);
});

test('derives the host status from its checks when missing', () => {
  const [h] = parseHealthcheck({ host: 'a', checks: [{ name: 'disk', status: 'CRITICAL' }, { name: 'cpu', status: 'OK' }] });
  assert.equal(h.status, 'CRITICAL');
});

test('parses and sorts the certificate sample by urgency', async () => {
  const certs = sortCerts(parseCerts(await sample('certs.sample.json')));
  assert.deepEqual(
    certs.map((c) => c.host),
    ['vpn.example.com', 'legacy.example.com', 'mail.example.com', 'www.example.com'],
  );
  assert.equal(certs[1].daysLeft, null);
});

test('maps unknown statuses onto the whitelist', () => {
  assert.equal(normStatus('ok'), 'OK');
  assert.equal(normStatus('WARN'), 'WARNING');
  assert.equal(normStatus('<img src=x>'), 'UNKNOWN');
  assert.equal(normStatus(42), 'UNKNOWN');
  assert.equal(worst(['OK', 'UNKNOWN', 'WARNING']), 'UNKNOWN');
  assert.equal(worst([]), 'OK');
});

test('drops unknown fields and limits string length', () => {
  const [h] = parseHealthcheck({
    host: 'x'.repeat(10_000),
    __proto__evil: 1,
    checks: [{ name: 'n', status: 'OK', extra: 'dropped' }],
  });
  assert.equal(h.host.length, 500);
  assert.deepEqual(Object.keys(h.checks[0]).sort(), ['message', 'name', 'status', 'value']);
});

for (const [label, data] of [
  ['null', null],
  ['string', 'hello'],
  ['no checks', { host: 'a' }],
  ['check not object', { host: 'a', checks: ['x'] }],
  ['host missing', { checks: [] }],
  ['host is object', { host: { a: 1 }, checks: [] }],
]) {
  test(`rejects invalid healthcheck data: ${label}`, () => {
    assert.throws(() => parseHealthcheck(data), ValidationError);
  });
}

for (const [label, data] of [
  ['no results', { status: 'OK' }],
  ['port string', { results: [{ host: 'a', port: '443', status: 'OK' }] }],
  ['port range', { results: [{ host: 'a', port: 70000, status: 'OK' }] }],
  ['days not number', { results: [{ host: 'a', port: 443, status: 'OK', days_left: 'soon' }] }],
]) {
  test(`rejects invalid certificate data: ${label}`, () => {
    assert.throws(() => parseCerts(data), ValidationError);
  });
}

test('rejects oversized lists', () => {
  const results = Array.from({ length: 2001 }, () => ({ host: 'a', port: 443, status: 'OK' }));
  assert.throws(() => parseCerts({ results }), /too many/);
});
