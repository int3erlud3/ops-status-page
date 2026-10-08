import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { parseHTML } from 'linkedom';

import { badge, mount, renderCerts, renderHosts, renderSummary } from '../public/js/render.js';
import { parseCerts, parseHealthcheck } from '../public/js/validate.js';

const XSS = '<img src=x onerror=alert(1)><script>alert(2)</script>';

function dom() {
  const { document } = parseHTML('<!DOCTYPE html><html><body><div id="root"></div></body></html>');
  return document;
}

test('untrusted values are rendered as text, never as markup', () => {
  const doc = dom();
  const hosts = parseHealthcheck([{ host: XSS, timestamp: XSS, checks: [{ name: XSS, status: XSS, value: XSS, message: XSS }] }]);
  const certs = parseCerts({ results: [{ host: XSS, port: 443, status: 'OK', subject: XSS, issuer: XSS, error: null }] });
  const root = doc.getElementById('root');
  mount(root, renderSummary(doc, hosts, certs), renderHosts(doc, hosts), renderCerts(doc, certs));
  assert.equal(root.querySelectorAll('img').length, 0);
  assert.equal(root.querySelectorAll('script').length, 0);
  assert.ok(root.textContent.includes(XSS));
  assert.ok(root.toString().includes('&lt;img')); // serialised markup contains only escaped text
});

test('badge classes come from the whitelist only', () => {
  const doc = dom();
  assert.equal(badge(doc, 'CRITICAL').className, 'badge badge-critical');
  const evil = badge(doc, 'x" onclick="alert(1)');
  assert.equal(evil.className, 'badge badge-unknown');
  assert.equal(evil.textContent, 'UNKNOWN');
});

test('renders the samples: summary cards, host tables, sorted certificates', async () => {
  const doc = dom();
  const read = async (n) => JSON.parse(await readFile(new URL(`../public/data/${n}`, import.meta.url), 'utf8'));
  const hosts = parseHealthcheck(await read('healthcheck.sample.json'));
  const certs = parseCerts(await read('certs.sample.json'));
  const summary = renderSummary(doc, hosts, certs);
  assert.equal(summary.querySelectorAll('.card').length, 2);
  assert.match(summary.textContent, /Hosts \(3\)/);
  const hostView = renderHosts(doc, hosts);
  assert.equal(hostView.querySelectorAll('section.host').length, 3);
  assert.equal(hostView.querySelectorAll('tbody tr').length, 12);
  const certView = renderCerts(doc, certs);
  const firstRow = certView.querySelector('tbody tr');
  assert.match(firstRow.textContent, /vpn\.example\.com:443/);
});

test('empty data shows a hint instead of a table', () => {
  const doc = dom();
  assert.match(renderHosts(doc, []).textContent, /No healthcheck data/);
  assert.match(renderCerts(doc, []).textContent, /No certificate data/);
  assert.match(renderSummary(doc, [], []).textContent, /UNKNOWN/);
});
