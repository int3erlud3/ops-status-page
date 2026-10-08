// Bastion Ops Toolkit banner (cosmetic): stderr only, interactive terminals only,
// never with --json. Disable with --no-banner or NO_BANNER=1.

export const SUITE = 'Bastion Ops Toolkit';

const ART = [
  "                      _        _",
  "   ___ _ __ ______ __| |_ __ _| |_ _  _ ______ _ __  __ _ __ _ ___",
  "  / _ \\ '_ (_-<___(_-<  _/ _` |  _| || (_-<___| '_ \\/ _` / _` / -_)",
  "  \\___/ .__/__/   /__/\\__\\__,_|\\__|\\_,_/__/   | .__/\\__,_\\__, \\___|",
  "      |_|                                     |_|        |___/",
  "",
  "+====================================================================+",
  "|  OPS STATUS PAGE  ::  Health & Certificate Dashboard               |",
  "+--------------------------------------------------------------------+",
  "|  Static, CSP-locked view of healthcheck and cert-expiry JSON       |",
];

export function render(version) {
  const info = `v${version}  -  ${SUITE}  -  by int3erlud3`;
  return [...ART, `|  ${info.padEnd(64)}  |`, `+${'='.repeat(68)}+`].join('\n');
}

export function bannerEnabled({ noBanner = false, env = process.env, stream = process.stderr } = {}) {
  if (noBanner) return false;
  const v = env.NO_BANNER;
  if (v !== undefined && v !== '' && v !== '0') return false;
  return Boolean(stream && stream.isTTY);
}

export function maybePrintBanner(version, opts = {}) {
  const stream = opts.stream ?? process.stderr;
  if (!bannerEnabled({ ...opts, stream })) return false;
  try {
    stream.write(`${render(version)}\n\n`);
    return true;
  } catch {
    return false;
  }
}
