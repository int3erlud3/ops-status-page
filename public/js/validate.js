// Validation and normalisation of the JSON produced by server-healthcheck and
// cert-expiry-checker. Everything coming from a file is untrusted: unknown fields are
// dropped, strings are length-limited, statuses are mapped onto a fixed whitelist.

export const STATUSES = Object.freeze(['OK', 'WARNING', 'CRITICAL', 'UNKNOWN']);
const RANK = { OK: 0, WARNING: 1, UNKNOWN: 2, CRITICAL: 3 };
const MAX_STRING = 500;
const MAX_ITEMS = 2000;

export class ValidationError extends Error {}

function str(value, field, { optional = false } = {}) {
  if (value === undefined || value === null) {
    if (optional) return null;
    throw new ValidationError(`missing field "${field}"`);
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new ValidationError(`field "${field}" must be a string`);
  }
  return String(value).slice(0, MAX_STRING);
}

function num(value, field, { optional = false } = {}) {
  if (value === undefined || value === null) {
    if (optional) return null;
    throw new ValidationError(`missing field "${field}"`);
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`field "${field}" must be a number`);
  }
  return value;
}

export function normStatus(value) {
  const s = typeof value === 'string' ? value.toUpperCase() : '';
  if (s === 'WARN') return 'WARNING';
  if (s === 'CRIT') return 'CRITICAL';
  return STATUSES.includes(s) ? s : 'UNKNOWN';
}

export function worst(statuses) {
  return statuses.reduce((acc, s) => (RANK[s] > RANK[acc] ? s : acc), 'OK');
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** One server-healthcheck report -> normalised host object. */
export function parseHost(raw) {
  if (!isObject(raw)) throw new ValidationError('host report must be an object');
  if (!Array.isArray(raw.checks)) throw new ValidationError('field "checks" must be an array');
  const checks = raw.checks.slice(0, MAX_ITEMS).map((c, i) => {
    if (!isObject(c)) throw new ValidationError(`checks[${i}] must be an object`);
    return {
      name: str(c.name, `checks[${i}].name`),
      status: normStatus(c.status),
      value: c.value === undefined || c.value === null ? null : str(c.value, `checks[${i}].value`),
      message: str(c.message, `checks[${i}].message`, { optional: true }) ?? '',
    };
  });
  return {
    host: str(raw.host, 'host'),
    timestamp: str(raw.timestamp, 'timestamp', { optional: true }),
    status: raw.status === undefined ? worst(checks.map((c) => c.status)) : normStatus(raw.status),
    checks,
  };
}

/** Accepts a single report, an array of reports or {"hosts": [...]}. */
export function parseHealthcheck(data) {
  let list;
  if (Array.isArray(data)) list = data;
  else if (isObject(data) && Array.isArray(data.hosts)) list = data.hosts;
  else if (isObject(data) && Array.isArray(data.checks)) list = [data];
  else throw new ValidationError('not server-healthcheck JSON (expected "checks" or a list of reports)');
  if (list.length > MAX_ITEMS) throw new ValidationError('too many host reports');
  return list.map(parseHost);
}

/** cert-expiry-checker JSON -> normalised certificate list. */
export function parseCerts(data) {
  if (!isObject(data) || !Array.isArray(data.results)) {
    throw new ValidationError('not cert-expiry-checker JSON (expected "results")');
  }
  if (data.results.length > MAX_ITEMS) throw new ValidationError('too many certificate results');
  return data.results.map((r, i) => {
    if (!isObject(r)) throw new ValidationError(`results[${i}] must be an object`);
    const port = num(r.port, `results[${i}].port`);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new ValidationError(`results[${i}].port out of range`);
    }
    return {
      host: str(r.host, `results[${i}].host`),
      port,
      status: normStatus(r.status),
      daysLeft: num(r.days_left, `results[${i}].days_left`, { optional: true }),
      notAfter: str(r.not_after, `results[${i}].not_after`, { optional: true }),
      subject: str(r.subject, `results[${i}].subject`, { optional: true }),
      issuer: str(r.issuer, `results[${i}].issuer`, { optional: true }),
      error: str(r.error, `results[${i}].error`, { optional: true }),
    };
  });
}

/** Sort certificates by urgency: status rank desc, then days left asc. */
export function sortCerts(certs) {
  return [...certs].sort(
    (a, b) =>
      RANK[b.status] - RANK[a.status] ||
      (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity) ||
      a.host.localeCompare(b.host),
  );
}

export function summarize(items) {
  const counts = { OK: 0, WARNING: 0, CRITICAL: 0, UNKNOWN: 0 };
  for (const item of items) counts[item.status] += 1;
  return counts;
}
