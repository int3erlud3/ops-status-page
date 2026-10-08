#!/usr/bin/env node
// ops-status-page CLI: validate healthcheck / certificate JSON, or serve the dashboard locally.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { parseCerts, parseHealthcheck, summarize, ValidationError, worst } from '../public/js/validate.js';
import { maybePrintBanner } from '../src/banner.js';
import { createStaticServer } from '../src/server.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(await readFile(path.join(HERE, '..', 'package.json'), 'utf8'));
const VERSION = PKG.version;
const EXIT = { OK: 0, WARNING: 1, CRITICAL: 2, UNKNOWN: 3 };

const USAGE = `Usage: ops-status-page <command> [options]

Commands:
  validate FILE...     validate server-healthcheck / cert-expiry-checker JSON files
                       (type detected automatically) and print a summary
  serve                serve the dashboard (default http://127.0.0.1:8080)

Options:
  --json               validate: machine-readable output (never shows the banner)
  --port N             serve: port (default 8080)
  --host ADDR          serve: bind address (default 127.0.0.1)
  --dir DIR            serve: web root (default: the bundled public/ directory)
  --no-banner          do not print the banner (or set NO_BANNER=1)
  -h, --help           show this help
  -V, --version        show version

Exit codes (validate): 0 all OK, 1 WARNING, 2 CRITICAL, 3 UNKNOWN/invalid input`;

export function parseArgs(argv) {
  const opts = { command: null, files: [], json: false, port: 8080, host: '127.0.0.1', dir: null, noBanner: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} requires a value`);
      i += 1;
      return argv[i];
    };
    if (a === '--json') opts.json = true;
    else if (a === '--no-banner') opts.noBanner = true;
    else if (a === '--port') opts.port = Number(value());
    else if (a === '--host') opts.host = value();
    else if (a === '--dir') opts.dir = value();
    else if (a === '-h' || a === '--help') opts.command = 'help';
    else if (a === '-V' || a === '--version') opts.command = 'version';
    else if (a.startsWith('-')) throw new Error(`unknown option: ${a}`);
    else if (!opts.command) opts.command = a;
    else opts.files.push(a);
  }
  if (!Number.isInteger(opts.port) || opts.port < 1 || opts.port > 65535) throw new Error('invalid --port');
  return opts;
}

function detect(data) {
  if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.results)) {
    return ['certs', parseCerts(data)];
  }
  return ['healthcheck', parseHealthcheck(data)];
}

// eslint-disable-next-line no-control-regex -- intentionally matching control characters to neutralise them
const clean = (s) => String(s).replace(/[\u0000-\u001f\u007f-\u009f]/g, '?');

async function validate(opts) {
  if (!opts.files.length) throw new Error('validate needs at least one FILE');
  const results = [];
  for (const file of opts.files) {
    try {
      const [type, items] = detect(JSON.parse(await readFile(file, 'utf8')));
      const counts = summarize(items);
      const status = items.length ? worst(Object.keys(counts).filter((k) => counts[k])) : 'UNKNOWN';
      results.push({ file, type, valid: true, items: items.length, status, counts });
    } catch (err) {
      const reason = err instanceof ValidationError || err instanceof SyntaxError ? err.message : err.code ?? 'error';
      results.push({ file, valid: false, status: 'UNKNOWN', error: reason });
    }
  }
  const overall = worst(results.map((r) => r.status));
  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ tool: 'ops-status-page', version: VERSION, status: overall, files: results }, null, 2)}\n`);
  } else {
    for (const r of results) {
      if (r.valid) {
        const c = r.counts;
        process.stdout.write(
          `${r.status.padEnd(8)} ${clean(r.file)}: ${r.type}, ${r.items} item(s) - OK ${c.OK}, WARNING ${c.WARNING}, CRITICAL ${c.CRITICAL}, UNKNOWN ${c.UNKNOWN}\n`,
        );
      } else {
        process.stdout.write(`INVALID  ${clean(r.file)}: ${clean(r.error)}\n`);
      }
    }
  }
  return EXIT[overall];
}

function serve(opts) {
  const root = opts.dir ? path.resolve(opts.dir) : path.join(HERE, '..', 'public');
  const server = createStaticServer(root);
  server.listen(opts.port, opts.host, () => {
    process.stderr.write(`serving ${root} on http://${opts.host}:${opts.port}/ (Ctrl+C to stop)\n`);
    if (opts.host !== '127.0.0.1' && opts.host !== '::1' && opts.host !== 'localhost') {
      process.stderr.write('warning: listening on a non-loopback address - the dashboard is reachable from the network\n');
    }
  });
  return new Promise((resolve) => {
    const stop = () => server.close(() => resolve(0));
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
}

export async function main(argv) {
  const noBannerFlag = argv.includes('--no-banner');
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`ops-status-page: error: ${err.message}\n${USAGE}\n`);
    return 3;
  }
  if (!opts.json) maybePrintBanner(VERSION, { noBanner: noBannerFlag });
  switch (opts.command) {
    case 'help':
      process.stdout.write(`${USAGE}\n`);
      return 0;
    case 'version':
      process.stdout.write(`ops-status-page ${VERSION}\n`);
      return 0;
    case 'validate':
      try {
        return await validate(opts);
      } catch (err) {
        process.stderr.write(`ops-status-page: error: ${err.message}\n`);
        return 3;
      }
    case 'serve':
      return serve(opts);
    default:
      process.stderr.write(`${USAGE}\n`);
      return 3;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
