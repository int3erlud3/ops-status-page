// Browser entry point: loads JSON from data/ (same origin, CSP connect-src 'self') or from
// files chosen by the user. Files are parsed with JSON.parse only and never executed.
import { mount, renderCerts, renderHosts, renderSummary } from './render.js';
import { parseCerts, parseHealthcheck, ValidationError } from './validate.js';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const state = { hosts: [], certs: [] };

function message(text, isError = false) {
  const box = document.getElementById('message');
  box.textContent = text;
  box.className = isError ? 'message error' : 'message';
}

function render() {
  mount(document.getElementById('summary'), renderSummary(document, state.hosts, state.certs));
  mount(document.getElementById('hosts'), renderHosts(document, state.hosts));
  mount(document.getElementById('certs'), renderCerts(document, state.certs));
}

async function fetchFirst(urls) {
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
      if (res.ok) return { url, data: await res.json() };
    } catch {
      // try the next candidate (e.g. live file missing -> sample)
    }
  }
  return null;
}

async function loadDefaults() {
  const [hc, ce] = await Promise.all([
    fetchFirst(['data/healthcheck.json', 'data/healthcheck.sample.json']),
    fetchFirst(['data/certs.json', 'data/certs.sample.json']),
  ]);
  const notes = [];
  try {
    if (hc) {
      state.hosts = parseHealthcheck(hc.data);
      notes.push(hc.url);
    }
    if (ce) {
      state.certs = parseCerts(ce.data);
      notes.push(ce.url);
    }
    message(notes.length ? `Loaded ${notes.join(', ')}` : 'No data found in data/ - load JSON files below.');
  } catch (err) {
    message(`Invalid data: ${err instanceof ValidationError ? err.message : 'unexpected error'}`, true);
  }
  render();
}

function readFile(input, parse, key) {
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > MAX_FILE_BYTES) {
    message(`${file.name}: file larger than 5 MB`, true);
    return;
  }
  file
    .text()
    .then((text) => {
      state[key] = parse(JSON.parse(text));
      message(`Loaded ${file.name}`);
      render();
    })
    .catch((err) => {
      const reason = err instanceof SyntaxError || err instanceof ValidationError ? err.message : 'read error';
      message(`${file.name}: ${reason}`, true);
    });
}

document.getElementById('file-healthcheck').addEventListener('change', (e) => {
  readFile(e.target, parseHealthcheck, 'hosts');
});
document.getElementById('file-certs').addEventListener('change', (e) => {
  readFile(e.target, parseCerts, 'certs');
});
document.getElementById('reload').addEventListener('click', () => {
  loadDefaults();
});

loadDefaults();
