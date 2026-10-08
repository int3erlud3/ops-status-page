// DOM rendering with createElement/textContent only. No innerHTML, no HTML strings:
// untrusted values (host names, messages, certificate subjects) can never become markup.
import { STATUSES, sortCerts, summarize, worst } from './validate.js';

function el(doc, tag, { text, cls, attrs } = {}) {
  const node = doc.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (cls) node.className = cls;
  for (const [k, v] of Object.entries(attrs ?? {})) node.setAttribute(k, v);
  return node;
}

/** Status badge; the CSS class comes from the fixed whitelist, never from input. */
export function badge(doc, status) {
  const safe = STATUSES.includes(status) ? status : 'UNKNOWN';
  return el(doc, 'span', { text: safe, cls: `badge badge-${safe.toLowerCase()}` });
}

function table(doc, headers, rows, caption) {
  const t = el(doc, 'table');
  if (caption) t.append(el(doc, 'caption', { text: caption }));
  const thead = el(doc, 'thead');
  const hr = el(doc, 'tr');
  for (const h of headers) hr.append(el(doc, 'th', { text: h, attrs: { scope: 'col' } }));
  thead.append(hr);
  const tbody = el(doc, 'tbody');
  for (const cells of rows) {
    const tr = el(doc, 'tr');
    for (const cell of cells) {
      const td = el(doc, 'td');
      if (cell !== null && typeof cell === 'object' && 'nodeType' in cell) td.append(cell);
      else td.textContent = cell === null || cell === undefined ? '' : String(cell);
      tr.append(td);
    }
    tbody.append(tr);
  }
  t.append(thead, tbody);
  return t;
}

export function renderSummary(doc, hosts, certs) {
  const wrap = el(doc, 'div', { cls: 'cards' });
  const sections = [
    ['Hosts', summarize(hosts), hosts.length],
    ['Certificates', summarize(certs), certs.length],
  ];
  for (const [title, counts, total] of sections) {
    const card = el(doc, 'section', { cls: 'card' });
    const overall = total ? worst(Object.keys(counts).filter((k) => counts[k] > 0)) : 'UNKNOWN';
    const h = el(doc, 'h2', { text: `${title} (${total}) ` });
    h.append(badge(doc, overall));
    card.append(h);
    const list = el(doc, 'ul', { cls: 'counts' });
    for (const status of STATUSES) {
      const li = el(doc, 'li');
      li.append(badge(doc, status), doc.createTextNode(` ${counts[status]}`));
      list.append(li);
    }
    card.append(list);
    wrap.append(card);
  }
  return wrap;
}

export function renderHosts(doc, hosts) {
  const wrap = el(doc, 'div', { cls: 'hosts' });
  if (!hosts.length) {
    wrap.append(el(doc, 'p', { text: 'No healthcheck data loaded.', cls: 'empty' }));
    return wrap;
  }
  for (const h of hosts) {
    const section = el(doc, 'section', { cls: 'host' });
    const title = el(doc, 'h3');
    title.append(badge(doc, h.status), doc.createTextNode(` ${h.host}`));
    section.append(title);
    if (h.timestamp) section.append(el(doc, 'p', { text: `Last check: ${h.timestamp}`, cls: 'meta' }));
    section.append(
      table(
        doc,
        ['Check', 'Status', 'Value', 'Message'],
        h.checks.map((c) => [c.name, badge(doc, c.status), c.value, c.message]),
      ),
    );
    wrap.append(section);
  }
  return wrap;
}

export function renderCerts(doc, certs) {
  if (!certs.length) return el(doc, 'p', { text: 'No certificate data loaded.', cls: 'empty' });
  return table(
    doc,
    ['Status', 'Endpoint', 'Days left', 'Expires', 'Subject', 'Issuer / error'],
    sortCerts(certs).map((c) => [
      badge(doc, c.status),
      `${c.host}:${c.port}`,
      c.daysLeft,
      c.notAfter,
      c.subject,
      c.error ?? c.issuer,
    ]),
    'Certificates, most urgent first',
  );
}

/** Replace the children of a container (no innerHTML). */
export function mount(container, ...nodes) {
  container.replaceChildren(...nodes);
}
