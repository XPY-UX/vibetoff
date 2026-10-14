/* =====================================================================
   Vibet Offsets — app.js
   Manifest loader + offset parser (imtheo RbxDumperV2 format + generic)
   ===================================================================== */

'use strict';

// ── Utils ─────────────────────────────────────────────────────────────
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const nice = s => s.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

function fmtBytes(n) {
  if (!Number.isFinite(n)) return 'File';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function fmtDate(iso) {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return '—'; }
}

function fileExt(name) {
  return '.' + name.split('.').pop().toLowerCase();
}

function fileLang(name) {
  const map = {
    '.hpp': 'C++', '.h': 'C/C++', '.cpp': 'C++',
    '.cs': 'C#', '.json': 'JSON', '.txt': 'TXT',
    '.md': 'DOC', '.yaml': 'YAML', '.yml': 'YAML',
    '.lua': 'LUA', '.py': 'PY', '.ts': 'TS', '.js': 'JS'
  };
  return map[fileExt(name)] || fileExt(name).slice(1).toUpperCase() || 'FILE';
}

// ── Group kind inference ──────────────────────────────────────────────
function groupKind(groupName) {
  const g = groupName.toLowerCase();
  if (g.includes('external') || g.startsWith('ext')) return 'external';
  if (g.includes('internal') || g.startsWith('int')) return 'internal';
  if (g.includes('fflag') || g.includes('flag')) return 'fflag';
  return 'other';
}

// =====================================================================
// OFFSET PARSERS
// =====================================================================

/* ── imtheo RbxDumperV2 format ──────────────────────────────────────
   Structure:
   namespace FFlagOffsets {
     inline std::string ClientVersion = "version-xxxxxxxx";
     namespace FFlagList {
       inline constexpr uintptr_t Pointer = 0x...;
       inline constexpr uintptr_t ToFlag  = 0x...;
       inline constexpr uintptr_t ToValue = 0x...;
     }
     namespace FFlags {
       inline constexpr uintptr_t SomeFlagName = 0x...;
       ...
     }
   }
*/
function parseImtheoHpp(text) {
  const entries = [];

  // Extract ClientVersion
  let clientVersion = null;
  const cvMatch = text.match(/ClientVersion\s*=\s*"([^"]+)"/);
  if (cvMatch) clientVersion = cvMatch[1];

  // Track current namespace for labeling
  // We handle: FFlagList.*  →  struct pointer
  //            FFlags.*     →  actual flag offset
  //            Misc / root  →  generic offset
  const nsStack = [];
  const lines = text.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // namespace open
    const nsOpen = line.match(/^namespace\s+(\w+)\s*\{/);
    if (nsOpen) { nsStack.push(nsOpen[1]); continue; }

    // closing brace — pop namespace
    if (line === '}' || line === '};') { nsStack.pop(); continue; }

    // parse offset line:
    // inline constexpr uintptr_t NAME = 0xVALUE;
    const offsetMatch = line.match(/(?:inline\s+)?(?:static\s+)?constexpr\s+(?:uintptr_t|uint64_t|uint32_t|std::uintptr_t)\s+(\w+)\s*=\s*(0x[0-9A-Fa-f]+)/);
    if (offsetMatch) {
      const name  = offsetMatch[1];
      const value = offsetMatch[2];
      const ns    = nsStack[nsStack.length - 1] || 'root';
      entries.push({ name, value, ns, clientVersion });
      continue;
    }

    // std::string (e.g. ClientVersion itself — already captured above)
    // skip it to avoid duplicating
  }

  return dedup(entries);
}

/* ── imtheo JSON format ─────────────────────────────────────────────
   Flat or nested: { "SomeName": "0x..." } or { "SomeName": 123 }
*/
function parseImtheoJson(text) {
  const entries = [];
  try {
    const obj = JSON.parse(text);
    function walk(o, prefix) {
      if (!o || typeof o !== 'object') return;
      for (const [k, v] of Object.entries(o)) {
        const name = prefix ? `${prefix}.${k}` : k;
        if (typeof v === 'number') {
          entries.push({ name, value: '0x' + v.toString(16).toUpperCase() });
        } else if (typeof v === 'string' && /^0x[0-9A-Fa-f]+$/.test(v.trim())) {
          entries.push({ name, value: v });
        } else if (typeof v === 'string' && /^\d+$/.test(v.trim())) {
          entries.push({ name, value: '0x' + parseInt(v, 10).toString(16).toUpperCase() });
        } else if (typeof v === 'object' && v !== null && 'value' in v) {
          const raw = v.value;
          const val = typeof raw === 'number' ? '0x' + raw.toString(16).toUpperCase() : String(raw);
          entries.push({ name, value: val });
        } else if (typeof v === 'object') {
          walk(v, name);
        }
        // booleans (FFlag booleans like true/false) — store as "true"/"false"
        else if (typeof v === 'boolean') {
          entries.push({ name, value: String(v) });
        }
      }
    }
    walk(obj, '');
  } catch { /* not valid json */ }
  return entries;
}

/* ── imtheo C# format ───────────────────────────────────────────────
   public const ulong NAME = 0xVALUE;
   public static readonly ulong NAME = 0xVALUE;
*/
function parseCsharp(text) {
  const entries = [];
  const re = /(?:public|private|internal|protected)?\s*(?:static\s+)?(?:readonly\s+)?(?:const\s+)?(?:ulong|long|uint|int|IntPtr|UIntPtr|nint|nuint)\s+(\w+)\s*=\s*(0x[0-9A-Fa-f]+|\d+)/g;
  const re2 = /(\w+)\s*=\s*(0x[0-9A-Fa-f]+)(?:\s*[;,])?/g;
  for (const re_ of [re, re2]) {
    let m; re_.lastIndex = 0;
    while ((m = re_.exec(text)) !== null) {
      entries.push({ name: m[1], value: m[2] });
    }
  }
  return dedup(entries);
}

/* ── Generic hpp/h/cpp (non-imtheo) ────────────────────────────────── */
function parseHpp(text) {
  const entries = [];
  const patterns = [
    /(?:constexpr|const|inline|static\s+constexpr|static\s+const)\s+(?:auto|uintptr_t|std::uintptr_t|uint64_t|uint32_t|DWORD|QWORD)\s+(\w+)\s*=\s*(0x[0-9A-Fa-f]+|\d+)/g,
    /#define\s+(\w+)\s+(0x[0-9A-Fa-f]+|\d+)/g,
    /(\w+)\s*=\s*(0x[0-9A-Fa-f]+)(?:\s*,)?/g,
  ];
  for (const re of patterns) {
    let m; re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      entries.push({ name: m[1], value: m[2] });
    }
  }
  return dedup(entries);
}

/* ── .txt ────────────────────────────────────────────────────────── */
function parseTxt(text) {
  const entries = [];
  const re = /^([A-Za-z_][\w.]*)\s*[=:]\s*(0x[0-9A-Fa-f]+|\d+)/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    entries.push({ name: m[1], value: m[2] });
  }
  return entries;
}

/* ── Dedup + dispatcher ──────────────────────────────────────────── */
function dedup(entries) {
  const seen = new Set();
  return entries.filter(e => {
    const key = `${e.name}::${e.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isImtheoFormat(text) {
  return text.includes('namespace FFlagOffsets') || text.includes('namespace FFlags') ||
         text.includes('offsets.imtheo.lol') || text.includes('RbxDumperV2');
}

function parseOffsets(text, filename) {
  const ext = fileExt(filename);
  if (ext === '.json') return parseImtheoJson(text);
  if (ext === '.cs')   return parseCsharp(text);
  if (ext === '.txt')  return parseTxt(text);
  if (ext === '.hpp' || ext === '.h' || ext === '.cpp') {
    return isImtheoFormat(text) ? parseImtheoHpp(text) : parseHpp(text);
  }
  // fallback
  return dedup([...parseImtheoHpp(text), ...parseCsharp(text), ...parseTxt(text)]);
}

// ── Toast ─────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

// ── Clipboard ─────────────────────────────────────────────────────────
function copyText(text, label = 'Copied') {
  navigator.clipboard?.writeText(text).then(() => showToast(label)).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta); showToast(label);
  });
}

// ── State ─────────────────────────────────────────────────────────────
let allOffsets = [];   // [{type, name, value, ns, file, group, clientVersion?}]
let rawFiles   = {};   // {url: {text, name}}
let activeTab  = 'all';
let searchQ    = '';

// ── Status dot ────────────────────────────────────────────────────────
function setStatus(state) {
  const dot = $('#statusDot');
  const txt = $('#statusText');
  dot.className = 'dot ' + state;
  txt.textContent = state === 'live' ? 'live' : state === 'error' ? 'offline' : 'checking';
}

// ── Render offset table ───────────────────────────────────────────────
function renderOffsets() {
  const body  = $('#offsetBody');
  const empty = $('#offsetEmpty');
  const q     = searchQ.toLowerCase().trim();
  const info  = $('#offsetInfo');

  const filtered = allOffsets.filter(o => {
    if (activeTab === 'fflags' && o.type !== 'fflag') return false;
    if (activeTab === 'external' && o.type !== 'external') return false;
    if (activeTab === 'internal' && o.type !== 'internal') return false;
    if (activeTab === 'other' && !['other'].includes(o.type)) return false;
    if (q && !o.name.toLowerCase().includes(q) && !o.value.toLowerCase().includes(q) && !o.file.toLowerCase().includes(q)) return false;
    return true;
  });

  if (info) info.textContent = `${filtered.length.toLocaleString()} offset${filtered.length === 1 ? '' : 's'}`;

  if (!filtered.length) {
    body.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  body.innerHTML = filtered.map(o => {
    // for imtheo format, show the namespace as a sub-label if it's not root
    const nsLabel = o.ns && o.ns !== 'root' ? `<span class="offset-ns">${escHtml(o.ns)}</span>` : '';
    return `
    <tr class="offset-row" data-type="${o.type}">
      <td class="col-type"><span class="type-chip type-${o.type}">${typeLabel(o.type)}</span></td>
      <td class="col-name">
        <span class="offset-name">${escHtml(o.name)}</span>
        <span class="offset-file">${escHtml(o.file)}${nsLabel}</span>
      </td>
      <td class="col-value"><code class="offset-val">${escHtml(o.value)}</code></td>
      <td class="col-action">
        <button class="copy-btn" data-copy="${escAttr(o.value)}" title="Copy value">⎘</button>
        <button class="copy-btn copy-name" data-copy="${escAttr(o.name)}" title="Copy name">◻</button>
      </td>
    </tr>`;
  }).join('');
}

function typeLabel(type) {
  const map = { external: 'EXT', internal: 'INT', fflag: 'FFLAG', other: 'MISC' };
  return map[type] || 'MISC';
}

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s) { return String(s).replace(/"/g,'&quot;'); }

// ── File cards ────────────────────────────────────────────────────────
function renderGroups(data) {
  const root   = $('#groups');
  const groups = data.groups || {};
  let total    = 0;

  root.innerHTML = '';

  for (const [key, items] of Object.entries(groups)) {
    if (!Array.isArray(items) || !items.length) continue;
    total += items.length;
    const kind = groupKind(key);

    const section = document.createElement('section');
    section.className = `group group-kind-${kind}`;

    const top = document.createElement('div');
    top.className = 'group-top';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'group-title-wrap';

    const chip = document.createElement('span');
    chip.className = `type-chip type-${kind}`;
    chip.textContent = typeLabel(kind);

    const h3 = document.createElement('h3');
    h3.textContent = nice(key);

    titleWrap.append(chip, h3);
    const meta = document.createElement('span');
    meta.className = 'group-count';
    meta.textContent = `${items.length} FILE${items.length === 1 ? '' : 'S'}`;
    top.append(titleWrap, meta);
    section.append(top);

    const grid = document.createElement('div');
    grid.className = 'files';

    for (const item of items) {
      const lang    = fileLang(item.name);
      const isOffset = ['.hpp','.h','.cs','.txt','.json','.lua'].includes(fileExt(item.name));

      const card = document.createElement('div');
      card.className = 'file-card';

      const topRow = document.createElement('div');
      topRow.className = 'file-top';

      const icon = document.createElement('span');
      icon.className = 'file-icon';
      icon.textContent = lang;

      const info = document.createElement('div');
      info.className = 'file-info';
      const fname = document.createElement('div');
      fname.className = 'file-name';
      fname.textContent = item.name;
      const fsize = document.createElement('div');
      fsize.className = 'file-meta';
      fsize.textContent = fmtBytes(item.size);
      if (item.sha256) fsize.title = `SHA-256: ${item.sha256}`;
      info.append(fname, fsize);
      topRow.append(icon, info);
      card.append(topRow);

      const actions = document.createElement('div');
      actions.className = 'file-actions';

      if (isOffset) {
        const viewBtn = document.createElement('button');
        viewBtn.className = 'btn-action btn-view';
        viewBtn.textContent = 'Browse';
        viewBtn.dataset.url   = item.url;
        viewBtn.dataset.name  = item.name;
        viewBtn.dataset.group = key;
        viewBtn.addEventListener('click', loadOffsetFile);
        actions.append(viewBtn);
      }

      const dlBtn = document.createElement('a');
      dlBtn.className = 'btn-action btn-dl';
      dlBtn.href = item.url; dlBtn.download = item.name;
      dlBtn.textContent = 'Download';
      actions.append(dlBtn);

      const hashBtn = document.createElement('button');
      hashBtn.className = 'btn-ghost btn-hash';
      hashBtn.title = item.sha256 ? `SHA-256: ${item.sha256}` : 'No hash';
      hashBtn.textContent = 'SHA';
      if (item.sha256) hashBtn.addEventListener('click', () => copyText(item.sha256, 'Hash copied'));
      else hashBtn.disabled = true;
      actions.append(hashBtn);

      card.append(actions);
      grid.append(card);
    }

    section.append(grid);
    root.append(section);
  }

  $('#fileCount').textContent = `${total} FILE${total === 1 ? '' : 'S'}`;

  if (!total) {
    root.innerHTML = `<div class="empty-state"><span class="empty-icon">⌁</span><strong>No files published yet</strong><p>Run <code>python scripts/fetch_imtheo.py && python scripts/publish.py</code> to pull imtheo's latest offsets and publish.</p></div>`;
    $('#releaseBadge').textContent = 'EMPTY';
    $('#releaseBadge').className = 'meta-badge badge-empty';
  }
}

// ── Load offset file ──────────────────────────────────────────────────
async function loadOffsetFile(e) {
  const btn   = e.currentTarget;
  const url   = btn.dataset.url;
  const name  = btn.dataset.name;
  const group = btn.dataset.group;
  const kind  = groupKind(group);

  btn.textContent = 'Loading…';
  btn.disabled    = true;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text    = await res.text();
    const parsed  = parseOffsets(text, name);
    const tagged  = parsed.map(o => ({ ...o, type: o.type || kind, file: name, group }));

    // replace entries from same file
    allOffsets = allOffsets.filter(o => o.file !== name);
    allOffsets.push(...tagged);

    rawFiles[url] = { text, name };

    const rawPanel   = $('#rawPanel');
    $('#rawContent').textContent = text;
    rawPanel.style.display = '';
    rawPanel.dataset.url  = url;
    rawPanel.dataset.name = name;

    $('#offsetsSection').style.display = '';
    renderOffsets();
    showToast(`Loaded ${tagged.length.toLocaleString()} offsets from ${name}`);
    $('#offsetsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    showToast(`Failed to load ${name}: ${err.message}`);
  } finally {
    btn.textContent = 'Browse';
    btn.disabled    = false;
  }
}

// ── Manifest fetch ────────────────────────────────────────────────────
async function loadManifest() {
  setStatus('checking');
  try {
    const res  = await fetch('/manifest.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('Manifest not found');
    const data = await res.json();

    const version = data.version || 'Unversioned';
    $('#versionText').textContent = version;
    $('#updatedAt').textContent   = data.updatedAt ? fmtDate(data.updatedAt) : '—';
    $('#totalFiles').textContent  = data.fileCount ?? '—';
    $('#footerVersion').textContent = `${version} · Vibet Offsets`;

    const badge = $('#releaseBadge');
    badge.textContent = 'CURRENT';
    badge.className   = 'meta-badge badge-live';

    // Show imtheo source link
    const srcEl = $('#imtheoSource');
    if (srcEl) {
      srcEl.style.display = '';
    }

    setStatus('live');
    renderGroups(data);
  } catch {
    setStatus('error');
    $('#versionText').textContent = 'Manifest unavailable';
    $('#updatedAt').textContent   = '—';
    $('#totalFiles').textContent  = '—';
    $('#releaseBadge').textContent = 'OFFLINE';
    $('#releaseBadge').className   = 'meta-badge badge-error';
    $('#groups').innerHTML = `<div class="empty-state"><span class="empty-icon">⊘</span><strong>Could not load the manifest</strong><p>Run <code>python scripts/fetch_imtheo.py && python scripts/publish.py</code> to generate it.</p></div>`;
  }
}

// ── Event wiring ──────────────────────────────────────────────────────
document.addEventListener('click', e => {
  const copyBtn = e.target.closest('.copy-btn');
  if (copyBtn) { copyText(copyBtn.dataset.copy, 'Copied'); return; }

  const tab = e.target.closest('.tab');
  if (tab && tab.closest('#offsetTabs')) {
    $$('.tab', tab.closest('#offsetTabs')).forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeTab = tab.dataset.tab;
    renderOffsets();
    return;
  }
});

const searchInput = $('#offsetSearch');
const searchClear = $('#searchClear');

searchInput.addEventListener('input', () => {
  searchQ = searchInput.value;
  searchClear.style.display = searchQ ? '' : 'none';
  renderOffsets();
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchQ = '';
  searchClear.style.display = 'none';
  renderOffsets();
  searchInput.focus();
});

$('#rawCopyAll').addEventListener('click', () => {
  const p = $('#rawPanel');
  if (rawFiles[p.dataset.url]) copyText(rawFiles[p.dataset.url].text, 'All content copied');
});

$('#rawDownload').addEventListener('click', () => {
  const p = $('#rawPanel');
  if (!rawFiles[p.dataset.url]) return;
  const { text, name } = rawFiles[p.dataset.url];
  const blob = new Blob([text], { type: 'text/plain' });
  const a    = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
});

// ── Boot ──────────────────────────────────────────────────────────────
loadManifest();
