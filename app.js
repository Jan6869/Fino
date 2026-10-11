'use strict';
/* Fino – lokale Finanz-App.
   Alles läuft im Browser. Die Daten liegen in der IndexedDB dieses Geräts und werden nie versendet. */

const VERSION = 4;                               // gleiche Zahl wie CACHE in sw.js (fino-v4)
const PREVIEW = !!window.FINO_PREVIEW;           // true in der Online-Vorschau (kein Offline-Modus, kein Datei-Export)
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NB = ' ';
const money = (n, dec) => {
  const r = dec ? Math.round(n * 100) / 100 : Math.round(n);
  return (r < 0 ? '−' : '') + Math.abs(r).toLocaleString('de-DE', dec ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 }) + NB + '€';
};
const eur = n => money(n, true), e0 = n => money(n, false);
const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

/* ---------- Datum ---------- */
const MN = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const ymk = d => d.getFullYear() + '-' + pad(d.getMonth() + 1);
const ymd = d => ymk(d) + '-' + pad(d.getDate());
const shift = (k, n) => { const [y, m] = k.split('-').map(Number); return ymk(new Date(y, m - 1 + n, 1)); };
const dim = k => { const [y, m] = k.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const dmy = d => d.slice(8) + '.' + d.slice(5, 7) + '.';
let NOW = {};
const tick = () => { const n = new Date(); NOW = { k: ymk(n), d: n.getDate(), date: n }; };
const daysAgo = n => new Date(NOW.date.getFullYear(), NOW.date.getMonth(), NOW.date.getDate() - n);

/* ---------- Kategorien: [Name, Symbol, Unterkategorien] ---------- */
const DEFAULT_CATS = {
  out: [
    ['Lebensmittel', '🛒', ['Supermarkt', 'Bäckerei', 'Markt', 'Getränke']],
    ['Essen auswärts', '🍽️', ['Restaurant', 'Café', 'Lieferdienst', 'Kantine']],
    ['Auto', '🚗', ['Tanken', 'Werkstatt', 'Parken', 'Wäsche']],
    ['Kleidung', '👕', ['Oberteile', 'Hosen', 'Schuhe', 'Accessoires']],
    ['Konsum', '🛍️', ['Elektronik', 'Hobby', 'Geschenke', 'Bücher']],
    ['Wohnen', '🛋️', ['Einrichtung', 'Reparatur', 'Garten']],
    ['Alltag', '🧴', ['Drogerie', 'Haushalt', 'Post']],
    ['Gesundheit', '💊', ['Apotheke', 'Arzt', 'Optiker']],
    ['Freizeit', '🎟️', ['Kino', 'Ausflug', 'Sport', 'Events']],
    ['Reisen', '✈️', ['Unterkunft', 'Transport', 'Aktivitäten']],
    ['Bildung', '📚', ['Kurse', 'Material']],
    ['Sonstiges', '✨', ['Sonstiges']]
  ],
  fix: [
    ['Miete & Wohnen', '🏠', ['Miete', 'Strom', 'Internet', 'Handy']],
    ['Versicherungen', '🛡️', ['Haftpflicht', 'Hausrat', 'Kfz', 'Kranken', 'Rechtsschutz']],
    ['Freizeit & Abos', '📺', ['Streaming', 'Fitness', 'Zeitschriften', 'Cloud']],
    ['Mobilität', '🚆', ['Deutschlandticket', 'Leasing']],
    ['Sparen & Vorsorge', '🐷', ['Sparplan', 'Altersvorsorge']]
  ],
  inc: [
    ['Gehalt', '💼', ['Gehalt']],
    ['Nebenjob', '🧑‍💻', ['Nebenjob']],
    ['Erstattungen', '↩️', ['Steuer', 'Krankenkasse', 'Sonstige']],
    ['Geschenke', '🎁', ['Geschenk']],
    ['Kapitalerträge', '📈', ['Zinsen', 'Dividenden']],
    ['Sonstiges', '✨', ['Sonstiges']]
  ]
};
const TYPES = { out: 'Ausgabe', fix: 'Fixkosten', inc: 'Einnahme' };
/* Kategorien liegen im Zustand (S.cats): [Name, Symbol, Unterkategorien, ausgeblendet(0/1), ausgeblendete Unterkategorien] */
const CTYPES = ['out', 'fix', 'inc'];
const CATS = t => (S && S.cats && S.cats[t]) || [];
const vis = t => CATS(t).filter(c => !c[3]);
const cat = (t, n) => CATS(t).find(x => x[0] === n);
const cloneCats = c => JSON.parse(JSON.stringify(c));
const cname = s => String(s).replace(/[|\u0000-\u001f]/g, '').trim().slice(0, 24);
const firstGlyph = s => {
  s = String(s || '').trim(); if (!s) return '';
  const g = (window.Intl && Intl.Segmenter) ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].map(x => x.segment) : Array.from(s);
  return (g[0] || '').slice(0, 16);
};
function cleanCats(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const t of CTYPES) {
    if (!Array.isArray(raw[t])) return null;
    const seen = new Set(), list = [];
    for (const c of raw[t]) {
      if (!Array.isArray(c) || typeof c[0] !== 'string') continue;
      const n = cname(c[0]); if (!n || seen.has(n.toLowerCase())) continue; seen.add(n.toLowerCase());
      const names = x => (Array.isArray(x) ? x : []).map(v => typeof v === 'string' ? cname(v) : '').filter((v, i, arr) => v && arr.indexOf(v) === i);
      const hs = names(c[4]), subs = names(c[2]).filter(v => !hs.includes(v));
      if (!subs.length) subs.push(n);
      list.push([n, firstGlyph(typeof c[1] === 'string' ? c[1] : '') || '🏷️', subs, c[3] ? 1 : 0, hs.filter(v => !subs.includes(v))]);
    }
    out[t] = list;
  }
  return out;
}
const usage = (t, c, s) => {
  let n = 0;
  for (const e of S.entries) if (e.t === t && e.c === c && (s == null || e.s === s)) n++;
  for (const f of S.fixed) if (f.t === t && f.c === c && (s == null || f.s === s)) n++;
  return n;
};

/* ---------- Zustand und Speicher ---------- */
let S;                                           // Daten (werden gespeichert)
const UI = { tab: 0, mo: '', f: 0, persist: undefined, lastFree: null, sub: null, ctype: 0 };
let Q = null;                                    // aktueller Dialog im unteren Blatt
const blank = () => ({ v: 1, settings: { theme: 0, limit: 600, auto: 1 }, entries: [], fixed: [], nextId: 1, demo: false, lastBackup: 0, cats: cloneCats(DEFAULT_CATS) });
const uid = () => S.nextId++;

const IDB = {
  db: null,
  open() { return new Promise((res, rej) => { const r = indexedDB.open('fino', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async get(k) { const db = this.db || (this.db = await this.open()); return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
  async set(k, v) { const db = this.db || (this.db = await this.open()); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); }
};
async function load() {
  try { const v = await IDB.get('state'); if (v) return v; } catch (e) {}
  try { const j = localStorage.getItem('fino-state'); if (j) return JSON.parse(j); } catch (e) {}
  return null;
}
let saveT;
const save = () => { clearTimeout(saveT); saveT = setTimeout(flush, 120); };
async function flush() {
  clearTimeout(saveT);
  try { await IDB.set('state', JSON.parse(JSON.stringify(S))); }
  catch (e) { try { localStorage.setItem('fino-state', JSON.stringify(S)); } catch (e2) {} }
}
function migrate(s) {
  const b = blank();
  s.settings = Object.assign(b.settings, s.settings || {});
  s.entries = Array.isArray(s.entries) ? s.entries : [];
  s.fixed = (Array.isArray(s.fixed) ? s.fixed : []).map(f => Object.assign({ skip: [] }, f));
  s.nextId = s.nextId || 1 + s.entries.concat(s.fixed).reduce((m, x) => Math.max(m, x.id || 0), 0);
  s.cats = cleanCats(s.cats) || cloneCats(DEFAULT_CATS);
  return Object.assign(b, s);
}

/* ---------- Beispieldaten ---------- */
function seedDemo() {
  const s = blank(); s.demo = true; let n = 1;
  let seed = 7; const R = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  const since = shift(NOW.k, -5);
  [['inc', 'Gehalt', 'Gehalt', 3150, 1], ['fix', 'Miete & Wohnen', 'Miete', 920, 1], ['fix', 'Miete & Wohnen', 'Strom', 65, 3],
   ['fix', 'Miete & Wohnen', 'Internet', 40, 5], ['fix', 'Miete & Wohnen', 'Handy', 20, 5], ['fix', 'Versicherungen', 'Haftpflicht', 9, 10],
   ['fix', 'Versicherungen', 'Kfz', 78, 12], ['fix', 'Versicherungen', 'Kranken', 160, 15], ['fix', 'Freizeit & Abos', 'Streaming', 18, 8],
   ['fix', 'Freizeit & Abos', 'Fitness', 30, 15], ['fix', 'Mobilität', 'Deutschlandticket', 58, 1], ['fix', 'Sparen & Vorsorge', 'Sparplan', 200, 28]
  ].forEach(r => s.fixed.push({ id: n++, t: r[0], c: r[1], s: r[2], a: r[3], d: r[4], since, skip: [] }));
  const P = [['Lebensmittel', 'Supermarkt', 12, 65], ['Lebensmittel', 'Supermarkt', 12, 65], ['Lebensmittel', 'Bäckerei', 3, 9], ['Auto', 'Tanken', 40, 70],
    ['Essen auswärts', 'Restaurant', 18, 45], ['Essen auswärts', 'Café', 3, 8], ['Alltag', 'Drogerie', 8, 30], ['Kleidung', 'Schuhe', 40, 90],
    ['Konsum', 'Hobby', 10, 60], ['Freizeit', 'Kino', 12, 30], ['Gesundheit', 'Apotheke', 6, 25]];
  for (let i = 5; i >= 0; i--) {
    const k = shift(NOW.k, -i), last = i ? dim(k) : NOW.d;
    if (i && R() > .5) s.entries.push({ id: n++, t: 'inc', c: 'Nebenjob', s: 'Nebenjob', a: Math.round(150 + R() * 200), d: k + '-20' });
    for (let d = 1; d <= last; d++) if (R() > .4) {
      const p = P[Math.floor(R() * P.length)];
      s.entries.push({ id: n++, t: 'out', c: p[0], s: p[1], a: Math.round((p[2] + R() * (p[3] - p[2])) * 100) / 100, d: k + '-' + pad(d) });
    }
  }
  s.nextId = n; return s;
}

/* ---------- Wiederkehrende Posten automatisch buchen ---------- */
function runFixed() {
  if (!S.settings.auto) return false;
  const have = new Set(S.entries.filter(e => e.fx).map(e => e.fx + '|' + e.d.slice(0, 7)));
  let changed = false;
  for (const f of S.fixed) {
    for (let k = f.since; k <= NOW.k; k = shift(k, 1)) {
      const day = Math.min(f.d, dim(k));
      if (k === NOW.k && day > NOW.d) continue;
      if (f.skip.includes(k) || have.has(f.id + '|' + k)) continue;
      S.entries.push({ id: uid(), t: f.t, c: f.c, s: f.s, a: f.a, d: k + '-' + pad(day), fx: f.id });
      changed = true;
    }
  }
  return changed;
}

/* ---------- Auswertung ---------- */
const monthEntries = k => S.entries.filter(e => e.d.startsWith(k));
const sum = (l, t) => { let a = 0; for (const e of l) if (!t || e.t === t) a += e.a; return a; };
const minMonth = () => S.entries.reduce((m, e) => e.d.slice(0, 7) < m ? e.d.slice(0, 7) : m, NOW.k);
function monthStats(k) {
  const l = monthEntries(k), booked = new Set(l.filter(e => e.fx).map(e => e.fx));
  const inc = sum(l, 'inc'), fixB = sum(l, 'fix'), vr = sum(l, 'out');
  let fixOpen = 0, incOpen = 0;
  if (k === NOW.k) for (const f of S.fixed) {
    if (f.since > k || booked.has(f.id) || f.skip.includes(k)) continue;
    if (f.t === 'fix') fixOpen += f.a; else incOpen += f.a;
  }
  const incTotal = inc + incOpen, fixTotal = fixB + fixOpen;
  return { k, l, inc, fixB, vr, fixOpen, incOpen, incTotal, fixTotal, free: incTotal - fixTotal - vr };
}

/* ---------- Ringe und Donuts ---------- */
function arcs(r, w, segs, o = {}) {
  const total = o.total || segs.reduce((a, s) => a + s.v, 0);
  if (total <= 0) return '';
  const round = o.round !== false, gap = o.gap == null ? 1.2 : o.gap;
  const cap = round ? (w / 2) / (2 * Math.PI * r) * 100 : 0;
  const live = segs.filter(s => s.v / total * 100 >= 0.4).length;
  let off = 0, out = '', i = 0;
  for (const s of segs) {
    const p = s.v / total * 100;
    if (p < 0.4) { off += p; continue; }
    let d, start;
    if (live === 1) { d = 100; start = 0; } else { d = Math.max(0, p - gap - 2 * cap); start = off + (p - d) / 2; }
    off += p;
    out += `<circle class="sg${round ? '' : ' bt'}" cx="100" cy="100" r="${r}" pathLength="100" style="stroke:${s.c};stroke-width:${w};stroke-dasharray:${d.toFixed(3)} 100;stroke-dashoffset:${(-start).toFixed(3)};animation-delay:${i++ * 80}ms"/>`;
  }
  return out;
}
function oneArc(r, w, p, c, delay) {
  if (p < 0.4) return '';
  const cap = (w / 2) / (2 * Math.PI * r) * 100;
  const full = p >= 99.6, d = full ? 100 : Math.max(0, p - 2 * cap), start = full ? 0 : cap;
  return `<circle class="sg" cx="100" cy="100" r="${r}" pathLength="100" style="stroke:${c};stroke-width:${w};stroke-dasharray:${d.toFixed(3)} 100;stroke-dashoffset:${(-start).toFixed(3)};animation-delay:${delay}ms"/>`;
}
const ringSvg = (r, w, segs, o, label) => `<svg viewBox="0 0 200 200" role="img" aria-label="${esc(label)}"><g transform="rotate(-90 100 100)"><circle class="tr" cx="100" cy="100" r="${r}" style="stroke-width:${w}"/>${arcs(r, w, segs, o)}</g></svg>`;

/* ---------- Bausteine ---------- */
const seg = (labels, i, a, data) => `<div class="seg" style="--n:${labels.length}"><i style="transform:translateX(${i * 100}%)"></i>${labels.map((t, j) => `<button data-act="${a}" data-i="${j}"${data ? ` data-t="${data[j]}"` : ''}>${t}</button>`).join('')}</div>`;
const moveSeg = el => { el.parentNode.firstChild.style.transform = `translateX(${el.dataset.i * 100}%)`; };
const row = e => {
  const c = cat(e.t, e.c) || ['', '•'];
  return `<button class="rw" data-act="entry" data-id="${e.id}"><div class="ib">${c[1]}</div><div><b>${esc(e.s)}</b><br><small>${esc(e.c)} · ${dmy(e.d)}${e.fx ? ' · wiederkehrend' : ''}</small></div><b class="num ${e.t === 'inc' ? 'pos' : ''}">${e.t === 'inc' ? '+' : '−'}${eur(e.a)}</b></button>`;
};
const OR = ['var(--o1)', 'var(--o2)', 'var(--o3)', 'var(--o4)', 'var(--o5)'];

/* ---------- Ansicht: Start ---------- */
function viewStart() {
  const m = monthStats(NOW.k), left = dim(NOW.k) - NOW.d + 1;
  const spent = m.fixTotal + m.vr, noInc = m.incTotal <= 0, total = Math.max(m.incTotal, spent);
  /* Außenring = Einnahmen (blau). Innenring = Ausgaben (orange) + Frei (grün), zusammen so groß wie die Einnahmen. */
  const inner = [
    { v: spent, c: 'var(--c2)' },
    { v: noInc ? 0 : Math.max(0, m.free), c: 'var(--c3)' }
  ];
  const outerP = total > 0 ? m.incTotal / total * 100 : 0, freeNow = Math.max(0, m.free);
  const nInc = m.l.filter(e => e.t === 'inc').length, nOut = m.l.filter(e => e.t !== 'inc').length;
  const cnt = (n, w) => `${n} ${n === 1 ? w : w + 'en'}`;
  let lab, val, sub = '', cls = '';
  if (noInc) { lab = spent > 0 ? 'Ausgegeben' : 'Dieser Monat'; val = spent; sub = spent > 0 ? 'Noch keine Einnahmen' : 'Noch keine Buchungen'; }
  else if (m.free < 0) { lab = 'Überzogen'; val = m.free; cls = 'neg'; sub = 'bei ' + e0(m.incTotal) + ' Einnahmen'; }
  else { lab = 'Noch verfügbar'; val = m.free; sub = 'von ' + e0(m.incTotal) + ' Einnahmen'; }
  const aria = `${lab} ${e0(val)}. Einnahmen ${e0(m.incTotal)}, Ausgaben ${e0(spent)}, davon Fixkosten ${e0(m.fixTotal)}, frei ${e0(freeNow)}.`;
  const ring = `<svg viewBox="0 0 200 200" role="img" aria-label="${esc(aria)}"><g transform="rotate(-90 100 100)"><circle class="tr" cx="100" cy="100" r="93" style="stroke-width:8"/>${oneArc(93, 8, outerP, 'var(--c1)', 0)}<circle class="tr" cx="100" cy="100" r="77" style="stroke-width:20"/>${arcs(77, 20, inner, { total })}</g></svg>`;
  const perDay = m.free > 0 ? e0(m.free / left) : e0(0);
  const lim = S.settings.limit, over = m.vr > lim;
  const recent = m.l.slice().sort((a, b) => b.d.localeCompare(a.d) || b.id - a.id).slice(0, 6);
  const needBackup = !S.demo && S.entries.length >= 20 && Date.now() - (S.lastBackup || 0) > 30 * 864e5;
  return `
  <div class="hd"><div><h1>Dein Monat</h1><div class="title">${MN[+NOW.k.slice(5) - 1]}</div></div><small>Tag ${NOW.d} von ${dim(NOW.k)}</small></div>
  ${S.demo ? '<button class="note" data-act="askClearDemo"><b>Beispieldaten.</b> Tippe hier, um mit einer leeren App zu starten.</button>' : ''}
  ${needBackup ? '<button class="note" data-act="tab" data-i="3"><b>Zeit für ein Backup.</b> Deine Daten liegen nur auf diesem Handy.</button>' : ''}
  <div class="card">
    <div class="ringw">${ring}
      <div class="ct"><small>${lab}</small><div class="big num ${cls}" id="cu" data-v="${val}">${e0(0)}</div><small>${sub}</small></div></div>
    <div class="lg">
      <div><small><span class="dot" style="background:var(--c1)"></span>Einnahmen</small><b>${e0(m.incTotal)}</b><small>${m.incOpen > 0 ? e0(m.incOpen) + ' offen' : cnt(nInc, 'Buchung')}</small></div>
      <div><small><span class="dot" style="background:var(--c2)"></span>Ausgaben</small><b>${e0(spent)}</b><small>${m.fixOpen > 0 ? e0(m.fixOpen) + ' offen' : cnt(nOut, 'Buchung')}</small></div>
      <div><small><span class="dot" style="background:var(--c3)"></span>Frei</small><b>${e0(freeNow)}</b><small>übrig</small></div>
    </div>
  </div>
  <div class="card">
    <div class="sum"><div><small>Pro Tag verfügbar</small><div class="big num" style="font-size:34px">${perDay}</div></div><small style="text-align:right">noch ${left} ${left === 1 ? 'Tag' : 'Tage'}<br>inkl. heute</small></div>
    <div style="margin-top:16px"><div class="sum"><small>Variable Ausgaben</small><small class="num ${over ? 'neg' : ''}"><b>${e0(m.vr)}</b> von ${e0(lim)}</small></div>
    <div class="bar"><i style="width:${Math.min(100, m.vr / lim * 100)}%;background:var(--c2)"></i></div></div>
  </div>
  <div class="card"><b>Zuletzt gebucht</b>${recent.length ? recent.map(row).join('') : '<p class="empty">Noch nichts gebucht. Tippe auf das Plus, um deine erste Ausgabe einzutragen.</p>'}</div>`;
}

/* ---------- Ansicht: Statistik ---------- */
const mh = () => `<div class="hd"><button class="rb" data-act="month" data-d="-1" aria-label="Vorheriger Monat" ${UI.mo <= minMonth() ? 'disabled' : ''}>‹</button><div style="text-align:center"><h1>${UI.mo.slice(0, 4)}</h1><b style="font-size:22px">${MN[+UI.mo.slice(5) - 1]}</b></div><button class="rb" data-act="month" data-d="1" aria-label="Nächster Monat" ${UI.mo >= NOW.k ? 'disabled' : ''}>›</button></div>`;
function viewStat() {
  const k = UI.mo, all = monthEntries(k);
  const ex = all.filter(e => e.t !== 'inc' && (UI.f === 0 || e.t === (UI.f === 1 ? 'fix' : 'out')));
  const tot = sum(ex), g = {};
  ex.forEach(e => { const key = e.t + '|' + e.c; g[key] = (g[key] || 0) + e.a; });
  const gs = Object.entries(g).sort((a, b) => b[1] - a[1]);
  const top = gs.slice(0, 5), rest = gs.slice(5).reduce((a, x) => a + x[1], 0);
  const dsegs = top.map(([, v], i) => ({ v, c: OR[i] })).concat(rest > 0 ? [{ v: rest, c: 'var(--mu)' }] : []);
  const months = [5, 4, 3, 2, 1, 0].map(i => shift(NOW.k, -i));
  const dt = months.map(m => { const l = monthEntries(m); return { m, inc: sum(l, 'inc'), ex: sum(l, 'fix') + sum(l, 'out') }; });
  const mx = Math.max(1, ...dt.map(x => Math.max(x.inc, x.ex)));
  const incAll = sum(all, 'inc'), exAll = sum(all, 'fix') + sum(all, 'out'), frAll = incAll - exAll;
  return mh() + `
  <div class="card">
    <div class="ringw" style="width:min(240px,100%)">${ringSvg(80, 26, dsegs, { round: false, gap: .8 }, 'Ausgaben ' + e0(tot))}<div class="ct" style="padding:0 50px"><small>Ausgaben</small><div class="big num" style="font-size:32px">${e0(tot)}</div></div></div>
    <div style="margin-top:16px">${seg(['Alle', 'Fix', 'Variabel'], UI.f, 'statf')}</div>
  </div>
  <div class="card"><b>Kategorien</b>${gs.length ? gs.map(([key, v], i) => {
    const [t, n] = key.split('|'), c = cat(t, n) || ['', '•'], p = v / (tot || 1) * 100;
    return `<button class="rw" data-act="catd" data-k="${esc(key)}"><div class="ib">${c[1]}</div><div><b>${esc(n)}</b><div class="bar"><i style="width:${v / gs[0][1] * 100}%;background:${i < 5 ? OR[i] : 'var(--mu)'}"></i></div></div><div style="text-align:right"><b class="num">${e0(v)}</b><br><small>${Math.round(p)} %</small></div></button>`;
  }).join('') : '<p class="empty">In diesem Monat gibt es keine Ausgaben.</p>'}</div>
  <div class="card">
    <div class="sum"><b>Einnahmen und Ausgaben</b><small>Sparquote ${incAll ? Math.round((incAll - exAll) / incAll * 100) : 0} %</small></div>
    <div class="bc">${dt.map(x => `<button class="bm ${x.m === k ? 'on' : ''}" data-act="setmonth" data-k="${x.m}" aria-label="${MN[+x.m.slice(5) - 1]}: Einnahmen ${e0(x.inc)}, Ausgaben ${e0(x.ex)}"><div class="bp">
      <div class="st" style="height:${x.inc / mx * 100}%">${x.inc ? '<i style="flex:1;background:var(--c1)"></i>' : ''}</div>
      <div class="st" style="height:${x.ex / mx * 100}%">${x.ex ? '<i style="flex:1;background:var(--c2)"></i>' : ''}</div></div><small>${MN[+x.m.slice(5) - 1].slice(0, 3)}</small></button>`).join('')}</div>
    <div class="rd">
      <div><small><span class="dot" style="background:var(--c1)"></span>Einnahmen</small><b>${e0(incAll)}</b></div>
      <div><small><span class="dot" style="background:var(--c2)"></span>Ausgaben</small><b>${e0(exAll)}</b></div>
      <div><small><span class="dot" style="background:var(--c3)"></span>Frei</small><b class="${frAll < 0 ? 'neg' : ''}">${e0(frAll)}</b></div>
    </div>
  </div>`;
}

/* ---------- Ansicht: Fixkosten ---------- */
function viewFix() {
  const fx = S.fixed.filter(f => f.t === 'fix'), tot = fx.reduce((a, f) => a + f.a, 0), inc = S.fixed.filter(f => f.t === 'inc').reduce((a, f) => a + f.a, 0);
  const booked = new Set(monthEntries(NOW.k).filter(e => e.fx).map(e => e.fx));
  const dayOf = f => Math.min(f.d, dim(NOW.k));
  const stOf = f => booked.has(f.id) ? 'done' : f.skip.includes(NOW.k) ? 'skip' : dayOf(f) > NOW.d ? 'next' : 'due';
  const line = f => {
    const c = cat(f.t, f.c) || ['', '•'], st = stOf(f), n = dayOf(f) - NOW.d;
    const when = st === 'done' ? `am ${dayOf(f)}. ✓` : st === 'skip' ? 'übersprungen' : st === 'due' ? 'fällig' : `in ${n} ${n === 1 ? 'Tag' : 'Tagen'}`;
    return `<button class="rw" data-act="tpl" data-id="${f.id}"><div class="ib">${c[1]}</div><div><b>${esc(f.s)}</b><br><small>${esc(f.c)}</small></div><div style="text-align:right"><b class="num ${f.t === 'inc' ? 'pos' : ''}">${f.t === 'inc' ? '+' : ''}${eur(f.a)}</b><br><small>${when}</small></div></button>`;
  };
  const upcoming = S.fixed.filter(f => ['next', 'due'].includes(stOf(f))).sort((a, b) => dayOf(a) - dayOf(b));
  const done = S.fixed.filter(f => ['done', 'skip'].includes(stOf(f))).sort((a, b) => dayOf(a) - dayOf(b));
  const head = `<div class="hd"><div class="title">Fixkosten</div><button class="rb fill" data-act="recNew" aria-label="Neuen wiederkehrenden Posten anlegen">+</button></div>`;
  if (!S.fixed.length) return head + `<div class="card"><b>Noch nichts angelegt</b><p class="empty">Lege Miete, Versicherungen, Abos und dein Gehalt einmal an. Fino bucht sie danach jeden Monat von selbst.</p><button class="pb" style="margin-top:12px" data-act="recNew">Ersten Posten anlegen</button></div>`;
  return head + `
  ${S.settings.auto ? '' : '<button class="note" data-act="tab" data-i="3"><b>Automatisch buchen ist aus.</b> Fällige Posten werden nicht gebucht.</button>'}
  <div class="card"><small>Fixkosten pro Monat</small><div class="big num">${e0(tot)}</div>
    ${inc > 0 ? `<div class="bar"><i style="width:${Math.min(100, tot / inc * 100)}%;background:var(--c2)"></i></div><small>${Math.round(tot / inc * 100)} % deiner regelmäßigen Einnahmen</small>` : `<small>${fx.length} Posten, werden automatisch gebucht</small>`}</div>
  <div class="card"><b>Als Nächstes fällig</b>${upcoming.length ? upcoming.map(line).join('') : '<p class="empty">Diesen Monat ist alles gebucht.</p>'}</div>
  ${done.length ? `<div class="card"><b>Diesen Monat gebucht</b>${done.map(line).join('')}</div>` : ''}`;
}

/* ---------- Ansicht: Mehr ---------- */
function viewMore() {
  const s = S.settings, days = S.lastBackup ? Math.floor((Date.now() - S.lastBackup) / 864e5) : null;
  const bk = days === null ? 'noch nie' : days === 0 ? 'heute' : `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}`;
  const sw = (n, key) => `<div class="rw" style="cursor:default"><b style="flex:1">${n}</b><button class="sw ${s[key] ? 'on' : ''}" data-act="sw" data-k="${key}" role="switch" aria-checked="${!!s[key]}" aria-label="${n}"></button></div>`;
  return `<div class="hd"><div class="title">Mehr</div></div>
  <div class="card"><b>Design</b><div style="margin-top:12px">${seg(['Auto', 'Hell', 'Dunkel'], s.theme, 'theme')}</div></div>
  <div class="card"><button class="rw" data-act="openCats" style="padding:2px 0"><div style="flex:1"><b>Kategorien bearbeiten</b><br><small>Gruppen und Untergruppen mit eigenem Symbol</small></div><span class="chev">›</span></button></div>
  <div class="card"><div class="sum"><b>Limit für variable Ausgaben</b><b class="num" id="lv">${e0(s.limit)}</b></div><small>pro Monat, erscheint als Balken auf dem Start</small>
    <input type="range" id="lim" min="100" max="1500" step="50" value="${s.limit}" style="--v:${(s.limit - 100) / 14}%;margin-top:14px" aria-label="Limit für variable Ausgaben"></div>
  <div class="card">${sw('Fixkosten automatisch buchen', 'auto')}</div>
  <div class="card"><b>Deine Daten</b>
    <button class="rw" data-act="exportJson"><div style="flex:1"><b>Backup speichern</b><br><small>Letztes Backup: ${bk}</small></div>›</button>
    <button class="rw" data-act="importJson"><b style="flex:1">Backup einspielen</b>›</button>
    <button class="rw" data-act="exportCsv"><div style="flex:1"><b>Tabelle exportieren</b><br><small>CSV für Excel und Co.</small></div>›</button>
    ${deferredInstall ? '<button class="rw" data-act="install"><b style="flex:1">App installieren</b>›</button>' : ''}
    <button class="rw" data-act="askDemo"><b style="flex:1">Beispieldaten laden</b>›</button>
    <button class="rw" data-act="askWipe"><b class="neg" style="flex:1">Alle Daten löschen</b></button></div>
  <div class="card" style="background:var(--pc)"><b>Komplett lokal.</b><p style="margin-top:6px;line-height:1.45">Kein Konto, keine Cloud, keine Verbindung ins Internet. Die Daten liegen auf diesem Gerät${UI.persist === true ? ' und sind vor automatischem Löschen geschützt' : UI.persist === false ? '. Der Browser könnte sie bei Speichermangel löschen, ein Backup schützt davor' : ''}.</p>${PREVIEW ? '<p style="margin-top:10px"><small style="color:inherit">Das ist die Online-Vorschau. Offline-Modus und Backup-Dateien gibt es in der installierten App.</small></p>' : ''}</div>
  <p style="text-align:center;padding:2px 0 8px"><small>Fino · Version ${VERSION}</small></p>`;
}

/* ---------- Anzeigen ---------- */
function go(full = true) {
  const m = $('#main'); m.classList.toggle('still', !full);
  m.innerHTML = [viewStart, viewStat, viewFix, () => UI.sub === 'cats' ? viewCats() : viewMore()][UI.tab]();
  $$('#nav button').forEach((b, i) => { b.classList.toggle('on', i === UI.tab); b.setAttribute('aria-current', i === UI.tab ? 'page' : 'false'); });
  const c = $('#cu');
  if (c) {
    const to = +c.dataset.v, from = (full || UI.lastFree == null) ? 0 : UI.lastFree, t0 = performance.now();
    UI.lastFree = to;
    const f = t => { const p = Math.min(1, (t - t0) / 800); c.textContent = e0(from + (to - from) * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }
}
function applyTheme() {
  const t = S.settings.theme, d = document.documentElement;
  if (t) d.dataset.theme = ['', 'light', 'dark'][t]; else d.removeAttribute('data-theme');
  $$('meta[name=theme-color]').forEach(m => {
    if (m.dataset.c === undefined) { m.dataset.c = m.content; m.dataset.m = m.media; }
    if (t) { m.removeAttribute('media'); m.content = t === 2 ? '#0a1213' : '#eef5f6'; } else { m.setAttribute('media', m.dataset.m); m.content = m.dataset.c; }
  });
}
let toastT;
function toast(msg, undo, label = 'Rückgängig', ms = 4600) {
  const t = $('#toast'); t.innerHTML = '<span></span>' + (undo ? '<button data-act="undo"></button>' : '');
  t.firstChild.textContent = msg; if (undo) t.lastChild.textContent = label; t._u = undo; t.classList.add('o');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('o'), ms);
}

/* ---------- Unteres Blatt ---------- */
let sheetOpen = false, subOpen = false;
const H = {   // Verlauf: Zurück-Geste schließt zuerst das Blatt, dann die Unterseite
  n: 0, skip: 0,
  push() { try { history.pushState({ f: 1 }, ''); this.n++; } catch (e) {} },
  pop() { if (this.n > 0) { this.n--; this.skip++; try { history.back(); } catch (e) { this.skip--; } } }
};
const showSheet = html => { $('#sh').innerHTML = '<div class="gr"></div>' + html; };
function openSheet() {
  if (!sheetOpen) { H.push(); sheetOpen = true; }
  $('#sc').classList.add('o'); $('#sh').scrollTop = 0;
}
function closeSheet(fromPop) {
  $('#sc').classList.remove('o'); Q = null;
  if (sheetOpen) { sheetOpen = false; if (!fromPop) H.pop(); }
}
function openSub(name) {
  UI.sub = name; if (!subOpen) { H.push(); subOpen = true; }
  $('#main').scrollTop = 0; go();
}
function closeSub(fromPop, noRender) {
  UI.sub = null;
  if (subOpen) { subOpen = false; if (!fromPop) H.pop(); }
  if (!noRender) { $('#main').scrollTop = 0; go(); }
}
window.addEventListener('popstate', () => {
  if (H.skip > 0) { H.skip--; return; }
  if (H.n > 0) H.n--;
  if (sheetOpen) closeSheet(true); else if (subOpen) closeSub(true);
});

function confirmSheet(title, text, okLabel, fn) {
  Q = { mode: 'confirm', fn };
  showSheet(`<div class="ctr"><b class="h2">${esc(title)}</b><p>${esc(text)}</p></div><button class="pb danger" data-act="confirmOk">${esc(okLabel)}</button><button class="pb ghost" data-act="close">Abbrechen</button>`);
  openSheet();
}

/* ---------- Erfassen ---------- */
const DATE_LABEL = ['Heute', 'Gestern', 'Vorgestern'];
function openAdd(o) {
  Q = Object.assign({ mode: 'new', t: 'out', a: '', st: 'amt', rec: false, back: 0, day: Math.min(NOW.d, 28) }, o);
  renderQ(); openSheet();
}
const amt = () => parseFloat((Q.a || '0').replace(',', '.')) || 0;
const needsDay = () => Q.t === 'fix' || Q.rec;
const qhdr = () => `<div class="hd" style="margin:4px 0 8px"><button class="rb" data-act="back" aria-label="Zurück">‹</button><b class="big" style="font-size:34px">${Q.a || '0'}${NB}€${needsDay() ? '<small> / Monat</small>' : ''}</b><span style="width:44px"></span></div>`;
function renderQ() {
  const q = Q;
  if (q.st === 'catedit') return renderCatEdit();
  if (q.st === 'amt') {
    const labels = q.rec ? ['Fixkosten', 'Einnahme'] : ['Ausgabe', 'Fix', 'Einnahme'], types = q.rec ? ['fix', 'inc'] : ['out', 'fix', 'inc'];
    const head = (q.mode === 'new')
      ? seg(labels, types.indexOf(q.t), 'qtype', types)
      : `<div class="ctr" style="margin-bottom:0"><div class="ib" style="width:64px;height:64px;font-size:30px">${(cat(q.t, q.c) || ['', '•'])[1]}</div><b>${esc(q.s)}</b></div>`;
    showSheet(`${head}<div class="amt" id="am">${q.a || '0'}${NB}€</div>
      <div class="cen">${q.mode === 'new' && !q.rec ? `<button class="chip" id="dt" data-act="date" ${q.t === 'fix' ? 'hidden' : ''}>${DATE_LABEL[q.back]}</button>` : ''}</div>
      <div class="kp">${[1, 2, 3, 4, 5, 6, 7, 8, 9, ',', 0, '⌫'].map(k => `<button class="k" data-act="key" data-k="${k}" aria-label="${k === '⌫' ? 'Löschen' : k}">${k}</button>`).join('')}</div>
      <button class="pb" data-act="next">${q.mode === 'entry' ? 'Speichern' : 'Weiter'}</button>`);
  } else if (q.st === 'cat') {
    const fq = {}, list = vis(q.t);
    if (!q.rec && q.t !== 'fix') S.entries.filter(e => e.t === q.t).forEach(e => { const k = e.c + '|' + e.s; fq[k] = (fq[k] || 0) + 1; });
    const quick = Object.entries(fq).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => {
      const [c, s] = k.split('|'), ci = list.findIndex(x => x[0] === c), si = ci < 0 ? -1 : list[ci][2].indexOf(s);
      return si < 0 ? '' : `<button class="pl" data-act="pick" data-q="${ci},${si}">${list[ci][1]} ${esc(s)}</button>`;
    }).join('');
    showSheet(`${qhdr()}${quick ? `<small>Schnellwahl, ein Tap</small><div style="margin:8px 0 18px">${quick}</div>` : ''}<small>Kategorie</small>
      ${list.length ? `<div class="cg" style="margin-top:10px">${list.map((c, i) => `<button class="cb" style="--i:${i}" data-act="pickCat" data-ci="${i}"><div class="ib">${c[1]}</div>${esc(c[0])}</button>`).join('')}</div>` : '<p class="empty">Hier gibt es noch keine Kategorien. Lege sie unter Mehr > Kategorien an.</p>'}`);
  } else if (q.st === 'sub') {
    const list = vis(q.t), ci = list.findIndex(x => x[0] === q.c), c = list[ci];
    showSheet(`${qhdr()}<div class="ctr"><div class="ib">${c[1]}</div><b class="h2">${esc(c[0])}</b></div>${c[2].map((s, si) => `<button class="pl" data-act="pick" data-q="${ci},${si}">${esc(s)}</button>`).join('')}`);
  } else if (q.st === 'day') {
    const c = cat(q.t, q.c) || ['', '•'];
    showSheet(`${qhdr()}<div class="ctr"><div class="ib">${c[1]}</div><b class="h2">${esc(q.s)}</b></div>
      <div class="dayv">${q.t === 'inc' ? 'Kommt' : 'Wird abgebucht'} jeden Monat am<b id="dv">${q.day}.</b></div>
      <input type="range" id="day" min="1" max="31" step="1" value="${q.day}" style="--v:${(q.day - 1) / 30 * 100}%" aria-label="Tag im Monat">
      <p class="empty" id="dh" style="text-align:center;min-height:48px">${q.day > 28 ? 'In kürzeren Monaten wird am letzten Tag des Monats gebucht.' : ''}</p>
      <button class="pb" data-act="saveTpl">${q.mode === 'tpl' ? 'Speichern' : 'Anlegen'}</button>
      ${q.mode === 'tpl' ? '<button class="pb ghost danger" data-act="askDelTpl">Posten löschen</button>' : ''}`);
  }
}
function key(k) {
  let a = Q.a;
  if (k === '⌫') a = a.slice(0, -1);
  else if (k === ',') { if (!a.includes(',')) a = (a || '0') + ','; }
  else if (a.length < 10 && !/,\d\d$/.test(a) && !(a === '' && k === '0')) a += k;
  Q.a = a; $('#am').textContent = (a || '0') + NB + '€'; buzz(6);
}
function bookEntry() {
  const e = { id: uid(), t: Q.t, c: Q.c, s: Q.s, a: amt(), d: ymd(daysAgo(Q.back)) };
  S.entries.push(e); closeSheet(); save(); go(false); buzz([12, 40, 12]);
  toast(`Gebucht · ${eur(e.a)} · ${e.s}`, () => { S.entries = S.entries.filter(x => x !== e); save(); go(false); });
}
function saveTpl() {
  const a = amt(), q = Q;
  if (q.mode === 'tpl') {
    const f = S.fixed.find(x => x.id === q.eid); closeSheet(); if (!f) return;
    const old = { a: f.a, d: f.d }; f.a = a; f.d = q.day; runFixed(); save(); go(false); buzz([12, 40, 12]);
    toast('Gespeichert · gilt ab der nächsten Buchung', () => { f.a = old.a; f.d = old.d; save(); go(false); });
    return;
  }
  const f = { id: uid(), t: q.t, c: q.c, s: q.s, a, d: q.day, since: NOW.k, skip: [] };
  S.fixed.push(f); runFixed(); closeSheet(); save(); go(false); buzz([12, 40, 12]);
  toast(`${q.s} · jeden Monat am ${q.day}.`, () => { S.fixed = S.fixed.filter(x => x !== f); S.entries = S.entries.filter(e => e.fx !== f.id); save(); go(false); });
}
function editTpl(id) {
  const f = S.fixed.find(x => x.id === id); if (!f) return;
  Q = { mode: 'tpl', eid: id, t: f.t, c: f.c, s: f.s, a: String(f.a).replace('.', ','), st: 'amt', rec: true, back: 0, day: f.d };
  renderQ(); openSheet();
}
function entrySheet(id) {
  const e = S.entries.find(x => x.id === id); if (!e) return;
  const c = cat(e.t, e.c) || ['', '•'];
  Q = { mode: 'entryview', eid: id };
  showSheet(`<div class="ctr"><div class="ib">${c[1]}</div><b class="h2">${esc(e.s)}</b><div class="big num ${e.t === 'inc' ? 'pos' : ''}" style="font-size:38px">${e.t === 'inc' ? '+' : '−'}${eur(e.a)}</div><small>${esc(e.c)} · ${dmy(e.d)}${e.d.slice(0, 4)}${e.fx ? ' · wiederkehrend' : ''}</small></div>
    <button class="pb" data-act="entryEdit">Betrag ändern</button><button class="pb ghost danger" data-act="entryDel">Löschen</button>`);
  openSheet();
}
function catDetail(key) {
  const [t, n] = key.split('|'), c = cat(t, n) || ['', '•'], l = monthEntries(UI.mo).filter(e => e.t === t && e.c === n), g = {};
  l.forEach(e => g[e.s] = (g[e.s] || 0) + e.a);
  const mx = Math.max(1, ...Object.values(g));
  Q = { mode: 'view' };
  showSheet(`<div class="ctr"><div class="ib">${c[1]}</div><b class="h2">${esc(n)}</b><div class="big num">${eur(sum(l))}</div><small>${MN[+UI.mo.slice(5) - 1]} · ${l.length} ${l.length === 1 ? 'Buchung' : 'Buchungen'}</small></div>
    ${Object.entries(g).sort((a, b) => b[1] - a[1]).map(([s, v]) => `<div style="padding:9px 0"><div class="sum"><b>${esc(s)}</b><b class="num">${eur(v)}</b></div><div class="bar"><i style="width:${v / mx * 100}%;background:var(--p)"></i></div></div>`).join('')}`);
  openSheet();
}

/* ---------- Kategorien bearbeiten ---------- */
const EMOJIS = '🛒 🍽️ ☕ 🍕 🍔 🥐 🍷 🥦 🚗 ⛽ 🚌 🚆 🚲 ✈️ 🏖️ 🏠 🛋️ 🔧 💡 📱 💻 🎮 🎬 🎟️ 🎵 📚 🎓 👕 👟 👜 💄 🧴 🧼 🧺 🐶 🐱 🌱 🎁 🎂 👶 🧸 💊 🩺 🦷 👓 🏋️ ⚽ 🏊 💼 💰 🏦 💳 📈 🐷 🧾 🛡️ ⚖️ 📦 ✂️ 🔑 🚿 📺 ☁️ 📰 ✨ ❤️ ⭐ 🏷️'.split(' ');
const nUnder = n => `${n} ${n === 1 ? 'Unterkategorie' : 'Unterkategorien'}`;
function viewCats() {
  const t = CTYPES[UI.ctype], all = CATS(t), shown = all.filter(c => !c[3]), hid = all.filter(c => c[3]);
  const row = (c, dim) => `<button class="rw ${dim ? 'dim' : ''}" data-act="catEdit" data-n="${esc(c[0])}"><div class="ib">${esc(c[1])}</div><div><b>${esc(c[0])}</b><br><small>${nUnder(c[2].length)}</small></div><span class="chev">›</span></button>`;
  return `<div class="hd"><button class="rb" data-act="closeSub" aria-label="Zurück">‹</button><div class="title" style="font-size:26px">Kategorien</div><span style="width:44px"></span></div>
  ${seg(['Ausgaben', 'Fixkosten', 'Einnahmen'], UI.ctype, 'ctype')}
  <div class="card" style="margin-top:14px">${shown.length ? shown.map(c => row(c)).join('') : '<p class="empty">Hier gibt es noch keine Kategorien.</p>'}
    <button class="pb" style="margin-top:12px" data-act="catNew">Kategorie hinzufügen</button></div>
  ${hid.length ? `<div class="card"><b>Ausgeblendet</b><p class="empty" style="padding:4px 0 6px">Erscheinen nicht beim Erfassen, bleiben aber in der Statistik.</p>${hid.map(c => row(c, true)).join('')}</div>` : ''}`;
}
function openCatEdit(t, orig) {
  const c = orig == null ? null : cat(t, orig);
  Q = { mode: 'catedit', st: 'catedit', t, orig: c ? c[0] : null, n: c ? c[0] : '', i: c ? c[1] : '🏷️', hidden: c ? c[3] : 0, pick: !c,
    subs: c ? c[2].map(n => ({ n, o: n, h: 0 })).concat((c[4] || []).map(n => ({ n, o: n, h: 1 }))) : [{ n: '', o: null, h: 0 }] };
  renderCatEdit(); openSheet();
}
function syncCat() {
  const n = $('#ce-name'); if (n) Q.n = n.value;
  $$('.ce-sub').forEach(el => { const s = Q.subs[+el.dataset.k]; if (s) s.n = el.value; });
}
function renderCatEdit() {
  const q = Q, used = q.orig != null ? usage(q.t, q.orig) : 0;
  const rows = q.subs.map((s, k) => s.h
    ? `<div class="srow dim"><span class="grow">${esc(s.n)}</span><small>ausgeblendet</small><button class="rb sm" data-act="subRestore" data-k="${k}" aria-label="${esc(s.n)} wieder einblenden">↺</button></div>`
    : `<div class="srow"><input class="in ce-sub" data-k="${k}" type="text" maxlength="24" value="${esc(s.n)}" placeholder="Name der Unterkategorie" autocomplete="off" aria-label="Unterkategorie"><button class="rb sm" data-act="subDel" data-k="${k}" aria-label="Unterkategorie entfernen">×</button></div>`).join('');
  showSheet(`<div class="ce-top"><button class="ib big-ib" id="ce-icon" data-act="ePick" aria-label="Symbol wählen">${esc(q.i)}</button><input id="ce-name" class="in" type="text" maxlength="24" value="${esc(q.n)}" placeholder="Name der Kategorie" autocomplete="off" aria-label="Name der Kategorie"></div>
    ${q.pick ? `<div class="eg">${EMOJIS.map(e => `<button data-act="eSet" data-e="${e}" aria-label="Symbol ${e}">${e}</button>`).join('')}</div><div class="own"><small>Oder ein eigenes Symbol von der Emoji-Tastatur</small><input id="ce-emoji" class="in" type="text" placeholder="😀" autocomplete="off" aria-label="Eigenes Symbol"></div>` : ''}
    <small>Unterkategorien</small><div class="subs">${rows}</div>
    <button class="chip" data-act="subAdd">+ Unterkategorie</button>
    <div style="height:16px"></div>
    <button class="pb" data-act="catSave">Speichern</button>
    ${q.orig == null ? '' : q.hidden ? '<button class="pb ghost" data-act="catRestore">Wieder einblenden</button>' : `<button class="pb ghost danger" data-act="askDelCat">${used ? 'Kategorie ausblenden' : 'Kategorie löschen'}</button>`}`);
}
function saveCat() {
  syncCat();
  const q = Q, t = q.t, list = CATS(t), name = cname(q.n);
  if (!name) return toast('Gib der Kategorie einen Namen.');
  if (list.some(c => c[0].toLowerCase() === name.toLowerCase() && c[0] !== q.orig)) return toast('Diese Kategorie gibt es schon.');
  const subs = [], seen = new Set();
  for (const s of q.subs) {
    let n = cname(s.n);
    if (!n) { if (s.o && usage(t, q.orig, s.o)) n = s.o; else continue; }
    if (seen.has(n.toLowerCase())) return toast(`„${n}“ gibt es in dieser Kategorie schon.`);
    seen.add(n.toLowerCase()); subs.push({ n, o: s.o, h: s.h });
  }
  const vs = subs.filter(s => !s.h), hs = subs.filter(s => s.h);
  if (!vs.length) {
    const d = hs.find(s => s.n.toLowerCase() === name.toLowerCase());
    if (d) { d.h = 0; vs.push(d); hs.splice(hs.indexOf(d), 1); } else vs.push({ n: name, o: null, h: 0 });
  }
  if (q.orig != null) {   // Umbenennen: bestehende Buchungen und Fixposten ziehen mit
    const sm = new Map(subs.filter(s => s.o && s.o !== s.n).map(s => [s.o, s.n]));
    if (name !== q.orig || sm.size) {
      const apply = x => { if (x.t !== t || x.c !== q.orig) return; if (sm.has(x.s)) x.s = sm.get(x.s); x.c = name; };
      S.entries.forEach(apply); S.fixed.forEach(apply);
    }
  }
  const rec = [name, firstGlyph(q.i) || '🏷️', vs.map(s => s.n), q.hidden ? 1 : 0, hs.map(s => s.n)];
  if (q.orig == null) list.push(rec); else list[list.findIndex(c => c[0] === q.orig)] = rec;
  closeSheet(); save(); go(false); toast('Gespeichert');
}

/* ---------- Backup ---------- */
function download(name, text, type) {
  const u = URL.createObjectURL(new Blob([text], { type })), a = document.createElement('a');
  a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000);
}
const previewNote = () => toast('In der Vorschau nicht möglich. In der installierten App speichert das eine Datei.');
function exportJson() {
  if (PREVIEW) return previewNote();
  download(`fino-backup-${ymd(NOW.date)}.json`, JSON.stringify({ app: 'fino', version: 1, exported: new Date().toISOString(), data: S }), 'application/json');
  S.lastBackup = Date.now(); save(); toast('Backup gespeichert'); go(false);
}
function exportCsv() {
  if (PREVIEW) return previewNote();
  const safe = x => { x = String(x); return /^[=+\-@]/.test(x) ? "'" + x : x; };
  const rows = [['Datum', 'Typ', 'Kategorie', 'Unterkategorie', 'Betrag in EUR']];
  S.entries.slice().sort((a, b) => a.d.localeCompare(b.d) || a.id - b.id).forEach(e =>
    rows.push([e.d.split('-').reverse().join('.'), TYPES[e.t], safe(e.c), safe(e.s), (e.t === 'inc' ? e.a : -e.a).toFixed(2).replace('.', ',')]));
  download(`fino-buchungen-${ymd(NOW.date)}.csv`, '﻿' + rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\r\n'), 'text/csv');
  toast('Tabelle gespeichert');
}
function sanitize(raw) {
  const D = raw && raw.data ? raw.data : raw;
  if (!D || !Array.isArray(D.entries) || !Array.isArray(D.fixed)) return null;
  const o = blank(); let dropped = 0;
  o.cats = cleanCats(D.cats) || cloneCats(DEFAULT_CATS);
  const okMonth = x => typeof x === 'string' && /^\d{4}-\d{2}$/.test(x), okDate = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
  const okCat = (t, c) => CTYPES.includes(t) && o.cats[t].some(x => x[0] === c), okAmt = a => typeof a === 'number' && isFinite(a) && a > 0 && a < 1e9;
  const map = new Map();
  for (const f of D.fixed) {
    if (!f || !['fix', 'inc'].includes(f.t) || !okCat(f.t, f.c) || typeof f.s !== 'string' || !okAmt(f.a) || !(f.d >= 1 && f.d <= 31) || !okMonth(f.since)) { dropped++; continue; }
    const id = o.nextId++; map.set(f.id, id);
    o.fixed.push({ id, t: f.t, c: f.c, s: f.s.slice(0, 40), a: Math.round(f.a * 100) / 100, d: Math.round(f.d), since: f.since, skip: Array.isArray(f.skip) ? f.skip.filter(okMonth) : [] });
  }
  for (const e of D.entries) {
    if (!e || !okCat(e.t, e.c) || typeof e.s !== 'string' || !okAmt(e.a) || !okDate(e.d)) { dropped++; continue; }
    const x = { id: o.nextId++, t: e.t, c: e.c, s: e.s.slice(0, 40), a: Math.round(e.a * 100) / 100, d: e.d };
    if (e.fx != null && map.has(e.fx)) x.fx = map.get(e.fx);
    o.entries.push(x);
  }
  const s = D.settings || {};
  o.settings = { theme: [0, 1, 2].includes(s.theme) ? s.theme : 0, limit: Math.min(1500, Math.max(100, +s.limit || 600)), auto: s.auto === 0 ? 0 : 1 };
  o.demo = false; o.lastBackup = Date.now();
  return { state: o, dropped };
}

/* ---------- Aktionen (Klicks) ---------- */
let deferredInstall = null;
const act = {
  tab(el) { if (subOpen) closeSub(false, true); UI.tab = +el.dataset.i; $('#main').scrollTop = 0; go(); },
  fab() { openAdd({}); },
  month(el) { stepMonth(+el.dataset.d); },
  setmonth(el) { UI.mo = el.dataset.k; go(false); },
  statf(el) { moveSeg(el); setTimeout(() => { UI.f = +el.dataset.i; go(false); }, 230); },
  catd(el) { catDetail(el.dataset.k); },
  entry(el) { entrySheet(+el.dataset.id); },
  tpl(el) { editTpl(+el.dataset.id); },
  recNew() { openAdd({ rec: true, t: 'fix' }); },
  /* Kategorien */
  openCats() { openSub('cats'); },
  closeSub() { closeSub(false); },
  ctype(el) { moveSeg(el); UI.ctype = +el.dataset.i; setTimeout(() => go(false), 230); },
  catNew() { openCatEdit(CTYPES[UI.ctype], null); },
  catEdit(el) { openCatEdit(CTYPES[UI.ctype], el.dataset.n); },
  ePick() { syncCat(); Q.pick = !Q.pick; renderCatEdit(); },
  eSet(el) { syncCat(); Q.i = el.dataset.e; Q.pick = false; renderCatEdit(); },
  subAdd() { syncCat(); Q.subs.push({ n: '', o: null, h: 0 }); renderCatEdit(); const l = $$('.ce-sub'); if (l.length) l[l.length - 1].focus(); },
  subDel(el) {
    syncCat(); const k = +el.dataset.k, s = Q.subs[k]; if (!s) return;
    if (s.o && usage(Q.t, Q.orig, s.o)) { s.h = 1; toast('Ausgeblendet, weil schon Buchungen dazu gehören.'); } else Q.subs.splice(k, 1);
    renderCatEdit();
  },
  subRestore(el) { syncCat(); const s = Q.subs[+el.dataset.k]; if (s) s.h = 0; renderCatEdit(); },
  catSave: saveCat,
  askDelCat() {
    const t = Q.t, orig = Q.orig, c = orig == null ? null : cat(t, orig); if (!c) return;
    const n = usage(t, orig);
    if (n) confirmSheet('Kategorie ausblenden?', `${n} ${n === 1 ? 'Buchung gehört' : 'Buchungen gehören'} zu „${orig}“. Sie bleiben in der Statistik, die Kategorie erscheint nur nicht mehr beim Erfassen.`, 'Ausblenden', () => { c[3] = 1; save(); go(false); toast('Ausgeblendet'); });
    else confirmSheet('Kategorie löschen?', `„${orig}“ und ihre Unterkategorien werden gelöscht.`, 'Löschen', () => { const l = CATS(t); l.splice(l.indexOf(c), 1); save(); go(false); toast('Gelöscht'); });
  },
  catRestore() { const c = cat(Q.t, Q.orig); if (c) c[3] = 0; closeSheet(); save(); go(false); toast('Wieder eingeblendet'); },
  theme(el) { moveSeg(el); S.settings.theme = +el.dataset.i; applyTheme(); save(); },
  sw(el) { const k = el.dataset.k; S.settings[k] = S.settings[k] ? 0 : 1; el.classList.toggle('on', !!S.settings[k]); el.setAttribute('aria-checked', !!S.settings[k]); if (k === 'auto' && runFixed()) toast('Fällige Posten gebucht'); save(); },
  exportJson, exportCsv,
  importJson() { if (PREVIEW) previewNote(); else $('#imp').click(); },
  async install() { if (!deferredInstall) return; deferredInstall.prompt(); try { await deferredInstall.userChoice; } catch (e) {} deferredInstall = null; go(false); },
  askWipe() { confirmSheet('Alle Daten löschen?', 'Alle Buchungen und wiederkehrenden Posten werden endgültig gelöscht. Mach vorher ein Backup, falls du sie noch brauchst.', 'Alles löschen', () => { S = Object.assign(blank(), { settings: S.settings, cats: S.cats }); save(); UI.tab = 0; go(); toast('Alle Daten gelöscht'); }); },
  askClearDemo() { confirmSheet('Mit leerer App starten?', 'Die Beispieldaten werden entfernt. Deine Einstellungen bleiben.', 'Beispieldaten entfernen', () => { S = Object.assign(blank(), { settings: S.settings, cats: S.cats }); save(); UI.tab = 0; go(); }); },
  askDemo() { const run = () => { S = Object.assign(seedDemo(), { settings: S.settings }); save(); UI.tab = 0; go(); }; if (S.entries.length || S.fixed.length) confirmSheet('Beispieldaten laden?', 'Deine aktuellen Daten und Kategorien werden dabei ersetzt.', 'Ersetzen', run); else run(); },
  confirmOk() { const fn = Q && Q.fn; closeSheet(); if (fn) fn(); },
  close() { closeSheet(); },
  undo() { const t = $('#toast'); if (t._u) t._u(); t._u = null; t.classList.remove('o'); },
  /* Erfassen */
  qtype(el) { moveSeg(el); Q.t = el.dataset.t; const d = $('#dt'); if (d) d.hidden = Q.t === 'fix'; },
  date() { Q.back = (Q.back + 1) % 3; $('#dt').textContent = DATE_LABEL[Q.back]; },
  key(el) { key(el.dataset.k); },
  next() {
    if (amt() <= 0) { $('#am').animate([{ transform: 'translateX(-10px)' }, { transform: 'translateX(10px)' }, { transform: 'none' }], 220); buzz(30); return; }
    if (Q.mode === 'entry') {
      const e = S.entries.find(x => x.id === Q.eid), old = e.a, a = amt(); e.a = a; closeSheet(); save(); go(false);
      toast('Betrag geändert', () => { e.a = old; save(); go(false); });
    } else { Q.st = Q.mode === 'tpl' ? 'day' : 'cat'; renderQ(); }
  },
  back() { Q.st = Q.st === 'sub' ? 'cat' : Q.st === 'day' ? (Q.mode === 'tpl' ? 'amt' : 'cat') : 'amt'; renderQ(); },
  pickCat(el) {
    const c = vis(Q.t)[+el.dataset.ci];
    if (c[2].length === 1) return choose(c[0], c[2][0]);
    Q.c = c[0]; Q.st = 'sub'; renderQ();
  },
  pick(el) { const [ci, si] = el.dataset.q.split(',').map(Number), c = vis(Q.t)[ci]; choose(c[0], c[2][si]); },
  saveTpl,
  askDelTpl() {
    const id = Q.eid, f = S.fixed.find(x => x.id === id); if (!f) return;
    confirmSheet('Posten löschen?', `${f.s} wird nicht mehr automatisch gebucht. Bisherige Buchungen bleiben erhalten.`, 'Löschen', () => {
      S.fixed = S.fixed.filter(x => x !== f); save(); go(false);
      toast(`${f.s} gelöscht`, () => { S.fixed.push(f); save(); go(false); });
    });
  },
  entryEdit() {
    const e = S.entries.find(x => x.id === Q.eid); if (!e) return;
    Q = { mode: 'entry', eid: e.id, t: e.t, c: e.c, s: e.s, a: String(e.a).replace('.', ','), st: 'amt', rec: false, back: 0, day: 1 }; renderQ();
  },
  entryDel() {
    const e = S.entries.find(x => x.id === Q.eid); if (!e) return;
    const f = e.fx ? S.fixed.find(x => x.id === e.fx) : null, mk = e.d.slice(0, 7);
    S.entries = S.entries.filter(x => x !== e); if (f && !f.skip.includes(mk)) f.skip.push(mk);
    closeSheet(); save(); go(false);
    toast('Buchung gelöscht', () => { S.entries.push(e); if (f) f.skip = f.skip.filter(x => x !== mk); save(); go(false); });
  }
};
function choose(c, s) { Q.c = c; Q.s = s; if (needsDay()) { Q.st = 'day'; renderQ(); } else bookEntry(); }
function stepMonth(d) {
  const nk = shift(UI.mo, d), m = $('#main');
  if (nk > NOW.k || nk < minMonth()) { m.animate([{ transform: 'none' }, { transform: `translateX(${-d * 14}px)` }, { transform: 'none' }], { duration: 260 }); return; }
  UI.mo = nk; go(false);
  m.animate([{ transform: `translateX(${d * 36}px)`, opacity: .2 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,1.2,.3,1)' });
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el) { const f = act[el.dataset.act]; if (f) f(el, e); return; }
  if (e.target.id === 'sc') closeSheet();
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'lim') { const v = +t.value; S.settings.limit = v; t.style.setProperty('--v', (v - 100) / 14 + '%'); $('#lv').textContent = e0(v); save(); }
  else if (t.id === 'ce-emoji' && Q) { const g = firstGlyph(t.value); if (g) { Q.i = g; const b = $('#ce-icon'); if (b) b.textContent = g; } }
  else if (t.id === 'day' && Q) {
    const v = +t.value; if (v !== Q.day) buzz(4);
    Q.day = v; t.style.setProperty('--v', (v - 1) / 30 * 100 + '%'); $('#dv').textContent = v + '.';
    $('#dh').textContent = v > 28 ? 'In kürzeren Monaten wird am letzten Tag des Monats gebucht.' : '';
  }
});
let tx = null;
$('#main').addEventListener('touchstart', e => { tx = [e.touches[0].clientX, e.touches[0].clientY]; }, { passive: true });
$('#main').addEventListener('touchend', e => {
  if (!tx || UI.tab !== 1) { tx = null; return; }
  const dx = e.changedTouches[0].clientX - tx[0], dy = e.changedTouches[0].clientY - tx[1]; tx = null;
  if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) stepMonth(dx < 0 ? 1 : -1);
}, { passive: true });
$('#imp').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  let r = null;
  try { r = sanitize(JSON.parse(await f.text())); } catch (err) {}
  if (!r) return toast('Das ist kein gültiges Fino-Backup.');
  confirmSheet('Backup einspielen?', `Deine aktuellen Daten werden ersetzt durch ${r.state.entries.length} Buchungen und ${r.state.fixed.length} wiederkehrende Posten.${r.dropped ? ` ${r.dropped} ungültige Einträge werden übersprungen.` : ''}`, 'Einspielen',
    () => { S = r.state; UI.mo = NOW.k; runFixed(); applyTheme(); save(); UI.tab = 0; go(); toast('Backup eingespielt'); });
});
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; if (UI.tab === 3 && S) go(false); });
document.addEventListener('visibilitychange', () => {
  if (!S) return;
  if (document.hidden) { flush(); return; }
  const k0 = NOW.k, d0 = NOW.d; tick(); if (k0 !== NOW.k) UI.mo = NOW.k;
  const ch = runFixed(); if (ch) save();
  if (ch || d0 !== NOW.d) go(false);
});
window.addEventListener('pagehide', () => { if (S) flush(); });

/* ---------- Start ---------- */
async function checkPersist() {
  try { if (navigator.storage && navigator.storage.persist) UI.persist = (await navigator.storage.persisted()) || (await navigator.storage.persist()); } catch (e) {}
}
async function init() {
  tick();
  const st = await load();
  S = st ? migrate(st) : seedDemo();
  UI.mo = NOW.k;
  runFixed(); applyTheme(); go(); save();
  checkPersist().then(() => { if (UI.tab === 3) go(false); });
  try {
    const a = new URLSearchParams(location.search).get('add');
    if (['out', 'fix', 'inc'].includes(a)) { history.replaceState(null, '', location.pathname); openAdd({ t: a }); }
  } catch (e) {}
  if (!PREVIEW && 'serviceWorker' in navigator && location.protocol !== 'file:') {
    const had = !!navigator.serviceWorker.controller;   // beim allerersten Start gibt es noch keinen Vorgänger
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) toast('Neue Version ist da', () => location.reload(), 'Neu laden', 12000); });
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
