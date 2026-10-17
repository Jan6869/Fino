'use strict';
/* Fino – lokale Finanz-App.
   Alles läuft im Browser. Die Daten liegen in der IndexedDB dieses Geräts und werden nie versendet. */

const VERSION = 5;                               // gleiche Zahl wie CACHE in sw.js (fino-v5)
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

/* ---------- Bewegung: Federn statt fester Dauer ---------- */
/* damping 1 = ohne Überschwingen, kleiner = federnd; resp = Antwortzeit in Sekunden (keine Dauer).
   Eine Feder startet immer beim aktuellen Wert und kann jederzeit mit Anfangsgeschwindigkeit neu gestartet werden. */
const RM = window.matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rubber = (o, dimn, c = .55) => (o * dimn * c) / (dimn + c * Math.abs(o));
function spring({ from, to, v = 0, zeta = 1, resp = .4, eps = .01, step, done }) {
  if (RM.matches) { step(to); if (done) done(); return { stop() {} }; }
  const w = 2 * Math.PI / resp, k = w * w, c = 2 * zeta * w;
  let x = from, vel = v, last = performance.now(), raf = 0, dead = false;
  const frame = now => {
    if (dead) return;
    let dt = Math.min((now - last) / 1000, 1 / 20); last = now;
    while (dt > 0) { const h = Math.min(dt, 1 / 240); vel += (-k * (x - to) - c * vel) * h; x += vel * h; dt -= h; }
    if (Math.abs(x - to) < eps && Math.abs(vel) < eps * 8) { dead = true; step(to); if (done) done(); return; }
    step(x); raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return { stop() { dead = true; cancelAnimationFrame(raf); } };
}

/* ---------- Symbole ---------- */
const PATHS = {
  back: 'M14.5 5.5 8 12l6.5 6.5', fwd: 'M9.5 5.5 16 12l-6.5 6.5', plus: 'M12 5v14M5 12h14', x: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  del: 'M9.2 5.5h9.3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9.2L3.5 12zM12.8 9.8l4.4 4.4M17.2 9.8l-4.4 4.4',
  down: 'M12 4v11M7.5 10.8 12 15.3l4.5-4.5M5 19.5h14', up: 'M12 15.5V4.5M7.5 9 12 4.5 16.5 9M5 19.5h14',
  table: 'M4 5.5h16v13H4zM4 10h16M4 14.5h16M10 5.5v13', spark: 'M12 3.5l1.9 5.3 5.3 1.9-5.3 1.9L12 17.9l-1.9-5.3-5.3-1.9 5.3-1.9zM18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z',
  phone: 'M7.5 3.5h9a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5a1.5 1.5 0 0 1 1.5-1.5zM12 8v6M9.5 11.8 12 14.3l2.5-2.5',
  grid: 'M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z', trash: 'M5 7h14M9.5 7V5h5v2M7 7l.9 12h8.2L17 7M10.5 10.5v5.5M13.5 10.5v5.5',
  restore: 'M4.5 12a7.5 7.5 0 1 0 2.4-5.5M4.5 4.5V9H9', lock: 'M7.5 11V8.5a4.5 4.5 0 0 1 9 0V11M6 11h12v8.5H6z', minus: 'M6 12h12'
};
const ic = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${PATHS[n]}"/></svg>`;
const ico = (n, col) => `<span class="ico ${col}">${ic(n)}</span>`;
const CHV = '<svg class="chv" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6"/></svg>';

/* ---------- Ringe und Donuts ---------- */
UI.geo = {}; UI.arc = {};
function arcGeo(r, w, vals, total, gap = 1.2, round = true) {
  const cap = round ? (w / 2) / (2 * Math.PI * r) * 100 : 0;
  const live = vals.filter(v => total > 0 && v / total * 100 >= .4).length;
  let off = 0;
  return vals.map(v => {
    const p = total > 0 ? v / total * 100 : 0;
    if (p < .4) { off += p; return { s: off, l: 0 }; }
    let l, s;
    if (live === 1) { l = 100; s = 0; } else { l = Math.max(0, p - gap - 2 * cap); s = off + (p - l) / 2; }
    off += p; return { s, l };
  });
}
function oneGeo(r, w, p) {
  if (p < .4) return { s: 0, l: 0 };
  const cap = (w / 2) / (2 * Math.PI * r) * 100;
  return p >= 99.6 ? { s: 0, l: 100 } : { s: cap, l: Math.max(0, p - 2 * cap) };
}
const circ = (r, w, col, g, round = true) => `<circle class="sg${round ? '' : ' bt'}" cx="100" cy="100" r="${r}" pathLength="100" data-s="${g.s.toFixed(3)}" data-l="${g.l.toFixed(3)}" style="stroke:${col};stroke-width:${w};stroke-dasharray:${g.l.toFixed(3)} 100;stroke-dashoffset:${(-g.s).toFixed(3)}${g.l <= 0 ? ';visibility:hidden' : ''}"/>`;
/* Die Bögen laufen per Feder von ihrer jetzigen Form in die neue (beim ersten Zeigen aus dem Nichts). */
function settleArcs(root, full) {
  $$('svg[data-geo]', root).forEach(svg => {
    const id = svg.dataset.geo, cs = $$('.sg', svg);
    const to = cs.map(c => ({ s: +c.dataset.s, l: +c.dataset.l }));
    const prev = full ? null : UI.geo[id];
    const from = (prev && prev.length === to.length ? prev : to.map(t => ({ s: t.s, l: 0 }))).map(a => ({ s: a.s, l: a.l }));
    const cur = from.map(a => ({ s: a.s, l: a.l }));
    UI.geo[id] = cur;
    if (UI.arc[id]) UI.arc[id].stop();
    UI.arc[id] = spring({
      from: 0, to: 1, zeta: 1, resp: .85, eps: .002,
      step: t => cs.forEach((c, i) => {
        const s = from[i].s + (to[i].s - from[i].s) * t, l = from[i].l + (to[i].l - from[i].l) * t;
        cur[i].s = s; cur[i].l = l;
        c.style.strokeDasharray = l.toFixed(3) + ' 100'; c.style.strokeDashoffset = (-s).toFixed(3);
        c.style.visibility = (l > .02 || from[i].l > .02 || to[i].l > .02) ? 'visible' : 'hidden';
      })
    });
  });
}
function countTo(el, from, to) {
  if (UI.cnt) UI.cnt.stop();
  el.classList.toggle('s', e0(to).length > 8);
  UI.cnt = spring({ from, to, zeta: 1, resp: .75, eps: .4, step: x => { el.textContent = e0(x); UI.lastFree = x; } });
}

/* ---------- Bausteine ---------- */
const seg = (labels, i, a, data, key) => `<div class="seg" data-key="${key || a}" style="--n:${labels.length}"><i style="transform:translateX(${i * 100}%)"></i>${labels.map((t, j) => `<button data-act="${a}" data-i="${j}"${data ? ` data-t="${data[j]}"` : ''}>${t}</button>`).join('')}</div>`;
const moveSeg = el => { el.parentNode.firstChild.style.transform = `translateX(${el.dataset.i * 100}%)`; };
const row = e => {
  const c = cat(e.t, e.c) || ['', '•'];
  return `<button class="row" data-act="entry" data-id="${e.id}"><span class="ico">${esc(c[1])}</span><span class="rt"><b>${esc(e.s)}</b><small>${esc(e.c)} · ${dmy(e.d)}${e.fx ? ' · wiederkehrend' : ''}</small></span><span class="am ${e.t === 'inc' ? 'pos' : ''}">${e.t === 'inc' ? '+' : '−'}${eur(e.a)}</span></button>`;
};
const OR = ['var(--o1)', 'var(--o2)', 'var(--o3)', 'var(--o4)', 'var(--o5)'];
const rise = i => 'rise r' + i;

/* ---------- Ansicht: Start ---------- */
function viewStart() {
  const m = monthStats(NOW.k), left = dim(NOW.k) - NOW.d + 1;
  const spent = m.fixTotal + m.vr, noInc = m.incTotal <= 0, total = Math.max(m.incTotal, spent);
  /* Außenring = Einnahmen. Innenring = Ausgaben + Frei, zusammen so groß wie die Einnahmen. */
  const outerP = total > 0 ? m.incTotal / total * 100 : 0, freeNow = Math.max(0, m.free);
  const inner = arcGeo(76, 22, [spent, noInc ? 0 : freeNow], total), outer = oneGeo(94, 7, outerP);
  const nInc = m.l.filter(e => e.t === 'inc').length, nOut = m.l.filter(e => e.t !== 'inc').length;
  const cnt = (n, w) => `${n} ${n === 1 ? w : w + 'en'}`;
  let lab, val, sub = '', cls = '';
  if (noInc) { lab = spent > 0 ? 'Ausgegeben' : 'Dieser Monat'; val = spent; sub = spent > 0 ? 'Noch keine Einnahmen' : 'Noch keine Buchungen'; }
  else if (m.free < 0) { lab = 'Überzogen'; val = m.free; cls = 'neg'; sub = 'bei ' + e0(m.incTotal) + ' Einnahmen'; }
  else { lab = 'Noch verfügbar'; val = m.free; sub = 'von ' + e0(m.incTotal) + ' Einnahmen'; }
  const aria = `${lab} ${e0(val)}. Einnahmen ${e0(m.incTotal)}, Ausgaben ${e0(spent)}, davon Fixkosten ${e0(m.fixTotal)}, frei ${e0(freeNow)}.`;
  const ring = `<svg viewBox="0 0 200 200" role="img" aria-label="${esc(aria)}" data-geo="ring"><g transform="rotate(-90 100 100)"><circle class="tr t1" cx="100" cy="100" r="94" style="stroke-width:7"/>${circ(94, 7, 'var(--c1)', outer)}<circle class="tr t0" cx="100" cy="100" r="76" style="stroke-width:22"/>${circ(76, 22, 'var(--c2)', inner[0])}${circ(76, 22, 'var(--c3)', inner[1])}</g></svg>`;
  const perDay = m.free > 0 ? e0(m.free / left) : e0(0);
  const lim = S.settings.limit, over = m.vr > lim;
  const recent = m.l.slice().sort((a, b) => b.d.localeCompare(a.d) || b.id - a.id).slice(0, 6);
  const needBackup = !S.demo && S.entries.length >= 20 && Date.now() - (S.lastBackup || 0) > 30 * 864e5;
  const month = MN[+NOW.k.slice(5) - 1];
  return `
  <div class="lt" data-title="${month}"><small class="eb">Tag ${NOW.d} von ${dim(NOW.k)}</small><h1>${month}</h1></div>
  ${S.demo ? '<button class="note" data-act="askClearDemo"><b>Beispieldaten.</b> Tippe hier, um mit einer leeren App zu starten.</button>' : ''}
  ${needBackup ? '<button class="note" data-act="tab" data-i="3"><b>Zeit für ein Backup.</b> Deine Daten liegen nur auf diesem Handy.</button>' : ''}
  <div class="card ${rise(0)}">
    <div class="ringw">${ring}
      <div class="ct"><small class="lab">${lab}</small><div class="big num ${cls}" id="cu" data-v="${val}">${e0(0)}</div><small>${sub}</small></div></div>
    <div class="lgd">
      <div><small><span class="dot" style="background:var(--c1)"></span>Einnahmen</small><b>${e0(m.incTotal)}</b><small>${m.incOpen > 0 ? e0(m.incOpen) + ' offen' : cnt(nInc, 'Buchung')}</small></div>
      <div><small><span class="dot" style="background:var(--c2)"></span>Ausgaben</small><b>${e0(spent)}</b><small>${m.fixOpen > 0 ? e0(m.fixOpen) + ' offen' : cnt(nOut, 'Buchung')}</small></div>
      <div><small><span class="dot" style="background:var(--c3)"></span>Frei</small><b>${e0(freeNow)}</b><small>übrig</small></div>
    </div>
  </div>
  <div class="card ${rise(1)}">
    <div class="sum"><div><small>Pro Tag verfügbar</small><div class="big num" style="font-size:2.125rem">${perDay}</div></div><small style="text-align:right">noch ${left} ${left === 1 ? 'Tag' : 'Tage'}<br>inkl. heute</small></div>
    <div style="margin-top:18px"><div class="sum"><small>Variable Ausgaben</small><small class="num ${over ? 'neg' : ''}"><b>${e0(m.vr)}</b> von ${e0(lim)}</small></div>
    <div class="bar"><i style="width:${Math.min(100, m.vr / lim * 100)}%;background:${over ? 'var(--neg)' : 'var(--c2)'}"></i></div></div>
  </div>
  <h2 class="sh2">Zuletzt gebucht</h2>
  ${recent.length ? `<div class="grp ${rise(2)}">${recent.map(row).join('')}</div>` : `<div class="card ${rise(2)}"><p class="empty">Noch nichts gebucht. Tippe auf das Plus, um deine erste Ausgabe einzutragen.</p></div>`}`;
}

/* ---------- Ansicht: Statistik ---------- */
const mswitch = () => `<div class="msw"><button class="nbtn glass" data-act="month" data-d="-1" aria-label="Vorheriger Monat" ${UI.mo <= minMonth() ? 'disabled' : ''}>${ic('back')}</button><div class="mid"><small>${UI.mo.slice(0, 4)}</small><b>${MN[+UI.mo.slice(5) - 1]}</b></div><button class="nbtn glass" data-act="month" data-d="1" aria-label="Nächster Monat" ${UI.mo >= NOW.k ? 'disabled' : ''}>${ic('fwd')}</button></div>`;
function viewStat() {
  const k = UI.mo, all = monthEntries(k);
  const ex = all.filter(e => e.t !== 'inc' && (UI.f === 0 || e.t === (UI.f === 1 ? 'fix' : 'out')));
  const tot = sum(ex), g = {};
  ex.forEach(e => { const key = e.t + '|' + e.c; g[key] = (g[key] || 0) + e.a; });
  const gs = Object.entries(g).sort((a, b) => b[1] - a[1]);
  const top = gs.slice(0, 5), rest = gs.slice(5).reduce((a, x) => a + x[1], 0);
  const vals = top.map(x => x[1]).concat(rest > 0 ? [rest] : []), cols = OR.slice(0, top.length).concat(rest > 0 ? ['var(--rest)'] : []);
  const geo = arcGeo(80, 24, vals, tot, .9, false);
  const donut = `<svg viewBox="0 0 200 200" role="img" aria-label="Ausgaben ${esc(e0(tot))}" data-geo="donut"><g transform="rotate(-90 100 100)"><circle class="tr t0" cx="100" cy="100" r="80" style="stroke-width:24"/>${geo.map((a, i) => circ(80, 24, cols[i], a, false)).join('')}</g></svg>`;
  const months = [5, 4, 3, 2, 1, 0].map(i => shift(NOW.k, -i));
  const dt = months.map(m => { const l = monthEntries(m); return { m, inc: sum(l, 'inc'), ex: sum(l, 'fix') + sum(l, 'out') }; });
  const mx = Math.max(1, ...dt.map(x => Math.max(x.inc, x.ex)));
  const incAll = sum(all, 'inc'), exAll = sum(all, 'fix') + sum(all, 'out'), frAll = incAll - exAll;
  return `<div class="lt" data-title="Statistik"><h1>Statistik</h1></div>${mswitch()}
  <div class="card ${rise(0)}">
    <div class="ringw" style="width:min(236px,100%)">${donut}<div class="ct" style="padding:0 18%"><small class="lab">Ausgaben</small><div class="big num d">${e0(tot)}</div></div></div>
    <div style="margin-top:18px;display:flex">${seg(['Alle', 'Fix', 'Variabel'], UI.f, 'statf')}</div>
  </div>
  <h2 class="sh2">Kategorien</h2>
  <div class="grp ${rise(1)}">${gs.length ? gs.map(([key, v], i) => {
    const [t, n] = key.split('|'), c = cat(t, n) || ['', '•'], p = v / (tot || 1) * 100;
    return `<button class="row" data-act="catd" data-k="${esc(key)}"><span class="ico">${esc(c[1])}</span><span class="rt"><b>${esc(n)}</b><span class="bar" style="margin-top:6px"><i style="width:${v / gs[0][1] * 100}%;background:${i < 5 ? OR[i] : 'var(--rest)'}"></i></span></span><span class="am">${e0(v)}<small>${Math.round(p)} %</small></span></button>`;
  }).join('') : '<p class="empty" style="padding:16px">In diesem Monat gibt es keine Ausgaben.</p>'}</div>
  <h2 class="sh2">Verlauf</h2>
  <div class="card ${rise(2)}">
    <div class="sum"><small>Letzte 6 Monate</small><small>Sparquote <b class="num">${incAll ? Math.round((incAll - exAll) / incAll * 100) : 0} %</b></small></div>
    <div class="bc">${dt.map(x => `<button class="bm ${x.m === k ? 'on' : ''}" data-act="setmonth" data-k="${x.m}" aria-label="${MN[+x.m.slice(5) - 1]}: Einnahmen ${e0(x.inc)}, Ausgaben ${e0(x.ex)}"><span class="bp">
      <i class="bx" style="height:${x.inc / mx * 100}%;background:var(--c1)"></i><i class="bx" style="height:${x.ex / mx * 100}%;background:var(--c2)"></i></span><small>${MN[+x.m.slice(5) - 1].slice(0, 3)}</small></button>`).join('')}</div>
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
    const when = st === 'done' ? `am ${dayOf(f)}. gebucht` : st === 'skip' ? 'übersprungen' : st === 'due' ? 'fällig' : `in ${n} ${n === 1 ? 'Tag' : 'Tagen'}`;
    return `<button class="row" data-act="tpl" data-id="${f.id}"><span class="ico">${esc(c[1])}</span><span class="rt"><b>${esc(f.s)}</b><small>${esc(f.c)}</small></span><span class="am ${f.t === 'inc' ? 'pos' : ''}">${f.t === 'inc' ? '+' : ''}${eur(f.a)}<small>${when}</small></span></button>`;
  };
  const upcoming = S.fixed.filter(f => ['next', 'due'].includes(stOf(f))).sort((a, b) => dayOf(a) - dayOf(b));
  const done = S.fixed.filter(f => ['done', 'skip'].includes(stOf(f))).sort((a, b) => dayOf(a) - dayOf(b));
  const head = `<div class="lt" data-title="Fixkosten"><h1>Fixkosten</h1></div>`;
  if (!S.fixed.length) return head + `<div class="card ${rise(0)}"><b>Noch nichts angelegt</b><p class="empty">Lege Miete, Versicherungen, Abos und dein Gehalt einmal an. Fino bucht sie danach jeden Monat von selbst.</p><button class="btn" style="margin-top:16px" data-act="recNew">Ersten Posten anlegen</button></div>`;
  return head + `
  ${S.settings.auto ? '' : '<button class="note" data-act="tab" data-i="3"><b>Automatisch buchen ist aus.</b> Fällige Posten werden nicht gebucht.</button>'}
  <div class="card ${rise(0)}"><small>Fixkosten pro Monat</small><div class="big num" style="margin-top:2px">${e0(tot)}</div>
    ${inc > 0 ? `<div class="bar" style="margin-top:14px"><i style="width:${Math.min(100, tot / inc * 100)}%;background:var(--c2)"></i></div><small style="display:block;margin-top:8px">${Math.round(tot / inc * 100)} % deiner regelmäßigen Einnahmen</small>` : `<small style="display:block;margin-top:6px">${fx.length} Posten, werden automatisch gebucht</small>`}</div>
  <h2 class="sh2">Als Nächstes fällig</h2>
  ${upcoming.length ? `<div class="grp ${rise(1)}">${upcoming.map(line).join('')}</div>` : `<div class="card ${rise(1)}"><p class="empty">Diesen Monat ist alles gebucht.</p></div>`}
  ${done.length ? `<h2 class="sh2">Diesen Monat gebucht</h2><div class="grp ${rise(2)}">${done.map(line).join('')}</div>` : ''}`;
}

/* ---------- Ansicht: Mehr ---------- */
function viewMore() {
  const s = S.settings, days = S.lastBackup ? Math.floor((Date.now() - S.lastBackup) / 864e5) : null;
  const bk = days === null ? 'noch nie' : days === 0 ? 'heute' : `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}`;
  const R = (a, col, icn, title, subt, danger) => `<button class="row" data-act="${a}">${ico(icn, col)}<span class="rt"><b class="${danger ? 'neg' : ''}">${title}</b>${subt ? `<small>${subt}</small>` : ''}</span>${danger ? '' : CHV}</button>`;
  return `<div class="lt" data-title="Mehr"><h1>Mehr</h1></div>
  <div class="card ${rise(0)}"><small>Darstellung</small><div style="margin-top:10px;display:flex">${seg(['Auto', 'Hell', 'Dunkel'], s.theme, 'theme')}</div></div>
  <div class="grp ${rise(1)}">${R('openCats', 'b', 'grid', 'Kategorien bearbeiten', 'Gruppen, Untergruppen und Symbole')}</div>
  <div class="card ${rise(2)}"><div class="sum"><b>Limit für variable Ausgaben</b><b class="num" id="lv">${e0(s.limit)}</b></div><small>pro Monat, erscheint als Balken auf dem Start</small>
    <input type="range" id="lim" min="100" max="1500" step="50" value="${s.limit}" style="--v:${(s.limit - 100) / 14}%;margin-top:12px" aria-label="Limit für variable Ausgaben"></div>
  <div class="grp ${rise(3)}"><div class="row" style="cursor:default"><span class="rt"><b>Fixkosten automatisch buchen</b></span><button class="sw ${s.auto ? 'on' : ''}" data-act="sw" data-k="auto" role="switch" aria-checked="${!!s.auto}" aria-label="Fixkosten automatisch buchen"></button></div></div>
  <h2 class="sh2">Deine Daten</h2>
  <div class="grp ${rise(4)}">
    ${R('exportJson', 'g', 'down', 'Backup speichern', 'Letztes Backup: ' + bk)}
    ${R('importJson', 'b', 'up', 'Backup einspielen')}
    ${R('exportCsv', 'o', 'table', 'Tabelle exportieren', 'CSV für Excel und Co.')}
    ${deferredInstall ? R('install', 'k', 'phone', 'App installieren') : ''}
    ${R('askDemo', 'p', 'spark', 'Beispieldaten laden')}
    ${R('askWipe', 'r', 'trash', 'Alle Daten löschen', '', true)}
  </div>
  <div class="card ${rise(5)}" style="display:flex;gap:14px;align-items:flex-start">${ico('lock', 'g')}<div><b>Komplett lokal</b><p class="empty" style="padding:2px 0 0">Kein Konto, keine Cloud, keine Verbindung ins Internet. Die Daten liegen auf diesem Gerät${UI.persist === true ? ' und sind vor automatischem Löschen geschützt' : UI.persist === false ? '. Der Browser könnte sie bei Speichermangel löschen, ein Backup schützt davor' : ''}.${PREVIEW ? ' Das ist die Online-Vorschau: Offline-Modus und Backup-Dateien gibt es in der installierten App.' : ''}</p></div></div>
  <p style="text-align:center;padding:4px 0 8px"><small>Fino · Version ${VERSION}</small></p>`;
}

/* ---------- Ansicht: Kategorien (Unterseite) ---------- */
const nUnder = n => `${n} ${n === 1 ? 'Unterkategorie' : 'Unterkategorien'}`;
function viewCats() {
  const t = CTYPES[UI.ctype], all = CATS(t), shown = all.filter(c => !c[3]), hid = all.filter(c => c[3]);
  const rw = (c, d) => `<button class="row ${d ? 'dim' : ''}" data-act="catEdit" data-n="${esc(c[0])}"><span class="ico">${esc(c[1])}</span><span class="rt"><b>${esc(c[0])}</b><small>${nUnder(c[2].length)}</small></span>${CHV}</button>`;
  return `<div class="lt" data-title="Kategorien"><h1>Kategorien</h1></div>
  <div style="display:flex;margin-bottom:14px">${seg(['Ausgaben', 'Fixkosten', 'Einnahmen'], UI.ctype, 'ctype')}</div>
  ${shown.length ? `<div class="grp">${shown.map(c => rw(c)).join('')}</div>` : '<div class="card"><p class="empty">Hier gibt es noch keine Kategorien.</p></div>'}
  <button class="btn sec" data-act="catNew">Kategorie hinzufügen</button>
  ${hid.length ? `<h2 class="sh2">Ausgeblendet</h2><p class="cap" style="margin:-4px 4px 10px">Erscheinen nicht beim Erfassen, bleiben aber in der Statistik.</p><div class="grp">${hid.map(c => rw(c, true)).join('')}</div>` : ''}`;
}

/* ---------- Anzeigen ---------- */
const main = $('#main'), p0 = $('#p0'), elApp = $('#app'), elSh = $('#sh'), elSv = $('#sv'), elScrim = $('#scrim'), elAl = $('#al'), elAlb = $('#alb');
const navBtn = (act, icn, label, extra = '') => `<button class="nbtn glass" data-act="${act}" aria-label="${label}" ${extra}>${ic(icn)}</button>`;
const backBtn = label => `<button class="nbtn" data-act="closeSub" aria-label="Zurück">${ic('back')}<span>${label}</span></button>`;
function setBar(pg, left, title, right) {
  $('.nl', pg).innerHTML = left; $('.nt', pg).textContent = title; $('.nr', pg).innerHTML = right;
}
function onScroll(e) {
  const sc = e.currentTarget, pg = sc.parentNode, t = sc.scrollTop, lt = $('.lt', sc);
  const lim = lt ? lt.offsetTop + lt.offsetHeight - 54 : 24;
  pg.style.setProperty('--sp', clamp(t / 18, 0, 1).toFixed(3));
  pg.style.setProperty('--tp', clamp((t - lim + 16) / 18, 0, 1).toFixed(3));
}
main.addEventListener('scroll', onScroll, { passive: true });
/* Neu zeichnen, ohne dass der Umschalter springt: die Markierung gleitet von der alten zur neuen Stelle. */
function paint(root, html) {
  const idx = s => parseFloat((s.firstChild.style.transform.match(/-?[\d.]+/) || [0])[0]) / 100;
  const old = {}; $$('.seg[data-key]', root).forEach(s => { old[s.dataset.key] = idx(s); });
  root.innerHTML = html;
  $$('.seg[data-key]', root).forEach(s => {
    const o = old[s.dataset.key], n = idx(s), t = s.firstChild;
    if (o != null && o !== n) { t.style.transition = 'none'; t.style.transform = `translateX(${o * 100}%)`; void t.offsetWidth; t.style.transition = ''; t.style.transform = `translateX(${n * 100}%)`; }
  });
}
function go(full = true) {
  main.classList.toggle('still', !full);
  main.classList.toggle('pan', UI.tab === 1);
  if (full) UI.geo = {};
  paint(main, [viewStart, viewStat, viewFix, viewMore][UI.tab]());
  const lt = $('.lt', main), titles = ['Start', 'Statistik', 'Fixkosten', 'Mehr'];
  setBar(p0, '', lt ? lt.dataset.title : titles[UI.tab], UI.tab === 2 ? navBtn('recNew', 'plus', 'Neuen wiederkehrenden Posten anlegen') : '');
  onScroll({ currentTarget: main });
  $$('#nav button').forEach((b, i) => { b.classList.toggle('on', i === UI.tab); b.setAttribute('aria-current', i === UI.tab ? 'page' : 'false'); });
  $('.th').style.transform = `translateX(${UI.tab * 100}%)`;
  settleArcs(main, full);
  const c = $('#cu');
  if (c) { const to = +c.dataset.v; countTo(c, (full || UI.lastFree == null) ? 0 : UI.lastFree, to); }
  if (UI.sub) renderSub();
}
function applyTheme() {
  const t = S.settings.theme, d = document.documentElement;
  if (t) d.dataset.theme = ['', 'light', 'dark'][t]; else d.removeAttribute('data-theme');
  $$('meta[name=theme-color]').forEach(m => {
    if (m.dataset.c === undefined) { m.dataset.c = m.content; m.dataset.m = m.media; }
    if (t) { m.removeAttribute('media'); m.content = t === 2 ? '#000000' : '#f2f2f7'; } else { m.setAttribute('media', m.dataset.m); m.content = m.dataset.c; }
  });
}
let toastT;
function toast(msg, undo, label = 'Rückgängig', ms = 4600) {
  const t = $('#toast'); t.innerHTML = '<span></span>' + (undo ? '<button data-act="undo"></button>' : '');
  t.firstChild.textContent = msg; if (undo) t.lastChild.textContent = label; t._u = undo; t.classList.add('o');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('o'), ms);
}

/* ---------- Verlauf: Zurück-Geste schließt zuerst Hinweis, dann Blatt, dann Unterseite ---------- */
const NAV = { stack: [], skip: 0 };
const navPush = l => { NAV.stack.push(l); if (!PREVIEW) try { history.pushState({ f: 1 }, ''); } catch (e) {} };
function navClose(ls) {
  let n = 0;
  for (const l of ls) { const i = NAV.stack.lastIndexOf(l); if (i >= 0) { NAV.stack.splice(i, 1); n++; } }
  if (n && !PREVIEW) { NAV.skip++; try { history.go(-n); } catch (e) { NAV.skip--; } }
}
window.addEventListener('popstate', () => {
  if (NAV.skip > 0) { NAV.skip--; return; }
  const l = NAV.stack.pop(); if (l) l.close(true);
});

/* ---------- Unterseite (schiebt von rechts herein, geht denselben Weg zurück) ---------- */
const Sub = { x: 0, anim: null, layer: null };
function subPaint(x) {
  Sub.x = x; const p1 = $('#p1'); if (!p1) return;
  p1.style.transform = `translate3d(${(1 - x) * 100}%,0,0)`;
  p0.style.transform = `translate3d(${-x * 26}%,0,0)`;
  const d = $('.dim', p0); if (d) d.style.opacity = (x * .14).toFixed(3);
}
function renderSub() {
  const p1 = $('#p1'); if (!p1) return;
  const sc = $('.sc', p1); paint(sc, viewCats());
  onScroll({ currentTarget: sc });
}
function openSub(name) {
  if (UI.sub) return;
  UI.sub = name;
  const p1 = document.createElement('section'); p1.className = 'pg over'; p1.id = 'p1';
  p1.innerHTML = `<header class="nb"><div class="nl">${backBtn('Mehr')}</div><div class="nt">Kategorien</div><div class="nr"></div></header><div class="sc" id="sub"></div>`;
  $('#pages').appendChild(p1);
  const d = document.createElement('div'); d.className = 'dim'; p0.appendChild(d);
  $('#sub').addEventListener('scroll', onScroll, { passive: true });
  Sub.layer = { close: () => closeSub(true) }; navPush(Sub.layer);
  renderSub(); subPaint(0);
  if (Sub.anim) Sub.anim.stop();
  Sub.anim = spring({ from: 0, to: 1, zeta: 1, resp: .46, eps: .002, step: subPaint });
}
function closeSub(fromPop) {
  if (!UI.sub) return;
  UI.sub = null; if (!fromPop) navClose([Sub.layer]);
  if (Sub.anim) Sub.anim.stop();
  Sub.anim = spring({
    from: Sub.x, to: 0, zeta: 1, resp: .4, eps: .002, step: subPaint,
    done: () => { if (UI.sub) return; const p1 = $('#p1'); if (p1) p1.remove(); const d = $('.dim', p0); if (d) d.remove(); p0.style.transform = ''; }
  });
}

/* ---------- Unteres Blatt: ziehbar, mit Schwung, schiebt die App dahinter zurück ---------- */
const Sh = { y: 0, h: 0, open: false, anim: null, layer: null };
function shPaint(y) {
  Sh.y = y; elSh.style.transform = `translate3d(0,${y}px,0)`;
  const p = Sh.h ? clamp(1 - y / Sh.h, 0, 1) : 0;
  elScrim.style.opacity = p.toFixed(3);
  elApp.style.transform = p > 0 ? `translate3d(0,${(9 * p).toFixed(2)}px,0) scale(${(1 - .065 * p).toFixed(4)})` : '';
  elApp.style.borderRadius = (28 * p).toFixed(1) + 'px';
}
/* touch-action gilt nur bis zum nächsten Scroll-Container: darum am Inhalt (#sv), nicht am Blatt. Scrollt der Inhalt, zieht nur der Griff. */
const fitSheet = () => { elSv.style.touchAction = elSv.scrollHeight > elSv.clientHeight + 1 ? 'pan-y' : 'none'; };
function showSheet(html, { tall = false, dir = 0 } = {}) {
  elSh.classList.toggle('tall', tall);
  elSv.innerHTML = `<div class="vw">${html}</div>`;
  if (Sh.open) { Sh.h = elSh.offsetHeight; fitSheet(); elSv.scrollTop = 0; }
  if (dir && !RM.matches) elSv.firstChild.animate([{ opacity: 0, transform: `translateX(${dir * 26}px)` }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1)' });
}
function openSheet() {
  if (Sh.open) return;
  const wasHidden = elSh.hidden;
  Sh.open = true; Sh.layer = { close: fromPop => closeSheet(fromPop) }; navPush(Sh.layer);
  elSh.hidden = false; elScrim.hidden = false;
  Sh.h = elSh.offsetHeight; fitSheet(); elSv.scrollTop = 0;
  if (wasHidden) shPaint(Sh.h);
  elApp.style.willChange = 'transform';
  if (Sh.anim) Sh.anim.stop();
  if (RM.matches) { shPaint(0); return; }
  Sh.anim = spring({ from: Sh.y, to: 0, zeta: 1, resp: .38, eps: .3, step: shPaint });
}
function closeSheet(fromPop, v = 0) {
  if (!Sh.open) return;
  Sh.open = false; Q = null; if (!fromPop) navClose([Sh.layer]);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (Sh.anim) Sh.anim.stop();
  Sh.anim = spring({
    from: Sh.y, to: Sh.h, v, zeta: 1, resp: .36, eps: .5, step: shPaint,
    done: () => { if (Sh.open) return; elSh.hidden = true; elScrim.hidden = true; elApp.style.transform = ''; elApp.style.borderRadius = ''; elApp.style.willChange = ''; elSv.innerHTML = ''; }
  });
}
/* Ziehen: das Blatt folgt dem Finger 1:1. Beim Loslassen wird die Geschwindigkeit übernommen und
   aus ihr der Ruhepunkt vorausberechnet. Nach oben gibt es einen weichen Widerstand. */
const project = (v, rate = .99) => (v / 1000) * rate / (1 - rate);
const Drag = { until: 0 };
(function () {
  let d = null, hist = [];
  elSh.addEventListener('pointerdown', e => {
    if (!Sh.open || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const inGz = !!e.target.closest('#gz');
    if (!inGz && e.target.closest('input,textarea,[data-nodrag]')) return;
    d = { id: e.pointerId, x0: e.clientX, y0: e.clientY, live: false, gz: inGz };
    hist = [[e.timeStamp, e.clientY]];
  });
  elSh.addEventListener('pointermove', e => {
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.live) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dx) > Math.abs(dy) || (!d.gz && (dy < 0 || elSv.scrollTop > 0))) { d = null; return; }
      d.live = true; if (Sh.anim) Sh.anim.stop();
      d.base = Sh.y; d.start = e.clientY;
      try { elSh.setPointerCapture(e.pointerId); } catch (err) {}
    }
    let y = d.base + (e.clientY - d.start);
    if (y < 0) y = -rubber(-y, 260);
    shPaint(y);
    hist.push([e.timeStamp, e.clientY]); while (hist.length > 2 && e.timeStamp - hist[0][0] > 100) hist.shift();
  });
  const end = e => {
    if (!d || e.pointerId !== d.id) return;
    const live = d.live; d = null; if (!live) return;
    Drag.until = performance.now() + 350;
    const a = hist[0], b = hist[hist.length - 1], dt = Math.max(1, b[0] - a[0]);
    const v = e.type === 'pointercancel' ? 0 : (b[1] - a[1]) / dt * 1000;
    const rest = Sh.y + project(v);
    if (v > 1100 || (v > -400 && rest > Sh.h * .5)) { buzz(8); closeSheet(false, v); }
    else Sh.anim = spring({ from: Sh.y, to: 0, v, zeta: .82, resp: .42, eps: .3, step: shPaint });
  };
  elSh.addEventListener('pointerup', end); elSh.addEventListener('pointercancel', end);
})();

/* ---------- Bestätigungsfenster ---------- */
const Al = { open: false, layer: null, fn: null, anim: null };
function alPaint(p) { elAl.style.setProperty('--ao', p.toFixed(3)); elAlb.style.opacity = clamp(p * 1.4, 0, 1).toFixed(3); elAlb.style.transform = RM.matches ? '' : `scale(${(.86 + .14 * p).toFixed(4)})`; Al.p = p; }
function confirmDialog(title, text, okLabel, fn) {
  Al.fn = fn; Al.open = true; Al.layer = { close: fromPop => alertClose(fromPop) }; navPush(Al.layer);
  elAlb.innerHTML = `<div class="at"><b>${esc(title)}</b><p>${esc(text)}</p></div><button class="ab dg" data-act="alOk">${esc(okLabel)}</button><button class="ab bold" data-act="alNo">Abbrechen</button>`;
  elAl.hidden = false; if (Al.anim) Al.anim.stop();
  Al.anim = spring({ from: Al.p || 0, to: 1, zeta: .78, resp: .34, eps: .002, step: alPaint });
}
function alertClose(fromPop) {
  if (!Al.open) return;
  Al.open = false; if (!fromPop) navClose([Al.layer]);
  if (Al.anim) Al.anim.stop();
  Al.anim = spring({ from: Al.p, to: 0, zeta: 1, resp: .22, eps: .01, step: alPaint, done: () => { if (!Al.open) elAl.hidden = true; } });
}

/* ---------- Erfassen ---------- */
const DATE_LABEL = ['Heute', 'Gestern', 'Vorgestern'];
function openAdd(o) {
  Q = Object.assign({ mode: 'new', t: 'out', a: '', st: 'amt', rec: false, back: 0, day: Math.min(NOW.d, 28) }, o);
  renderQ(); openSheet();
}
const amt = () => parseFloat((Q.a || '0').replace(',', '.')) || 0;
const needsDay = () => Q.t === 'fix' || Q.rec;
const xBtn = `<button class="cbtn" data-act="close" aria-label="Schließen">${ic('x')}</button>`;
const qhdr = () => `<div class="sht"><button class="cbtn" data-act="back" aria-label="Zurück">${ic('back')}</button><div class="ttl">${Q.a || '0'}${NB}€${needsDay() ? '<small> / Monat</small>' : ''}</div>${xBtn}</div>`;
const KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, ',', 0, 'del'];
let lastSt = 'amt';
const ORDER = { amt: 0, cat: 1, sub: 2, day: 3 };
function renderQ() {
  const q = Q; if (!q) return;
  if (q.st === 'catedit') return renderCatEdit();
  const dir = Sh.open && ORDER[q.st] != null && q.st !== lastSt ? (ORDER[q.st] > ORDER[lastSt] ? 1 : -1) : 0;
  lastSt = q.st;
  const opt = { tall: true, dir };
  if (q.st === 'amt') {
    const labels = q.rec ? ['Fixkosten', 'Einnahme'] : ['Ausgabe', 'Fix', 'Einnahme'], types = q.rec ? ['fix', 'inc'] : ['out', 'fix', 'inc'];
    const head = (q.mode === 'new')
      ? `<div class="sht">${seg(labels, types.indexOf(q.t), 'qtype', types, 'qtype')}${xBtn}</div>`
      : `<div class="sht"><span style="width:36px"></span><div class="ttl">${esc(q.s)}</div>${xBtn}</div><div class="ctr" style="margin:0"><span class="ico lg">${esc((cat(q.t, q.c) || ['', '•'])[1])}</span></div>`;
    showSheet(`${head}<div class="amt" id="am"><span class="av ${q.a ? '' : 'z'}">${q.a || '0'}</span><span class="cur">${NB}€</span></div>
      <div class="cen">${q.mode === 'new' && !q.rec ? `<button class="chip" id="dt" data-act="date" ${q.t === 'fix' ? 'hidden' : ''}>${DATE_LABEL[q.back]}</button>` : ''}</div>
      <div class="sp"></div>
      <div class="kp">${KEYS.map(k => `<button class="k" data-act="key" data-k="${k}" aria-label="${k === 'del' ? 'Löschen' : k}">${k === 'del' ? ic('del') : k}</button>`).join('')}</div>
      <button class="btn" data-act="next">${q.mode === 'entry' ? 'Speichern' : 'Weiter'}</button>`, opt);
  } else if (q.st === 'cat') {
    const fq = {}, list = vis(q.t);
    if (!q.rec && q.t !== 'fix') S.entries.filter(e => e.t === q.t).forEach(e => { const k = e.c + '|' + e.s; fq[k] = (fq[k] || 0) + 1; });
    const quick = Object.entries(fq).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => {
      const [c, s] = k.split('|'), ci = list.findIndex(x => x[0] === c), si = ci < 0 ? -1 : list[ci][2].indexOf(s);
      return si < 0 ? '' : `<button class="pl" data-act="pick" data-q="${ci},${si}"><span>${esc(list[ci][1])}</span>${esc(s)}</button>`;
    }).join('');
    showSheet(`${qhdr()}${quick ? `<span class="fl2">Schnellwahl</span><div class="qk">${quick}</div>` : ''}<span class="fl2">Kategorie</span>
      ${list.length ? `<div class="cg">${list.map((c, i) => `<button class="cb" style="--i:${i}" data-act="pickCat" data-ci="${i}"><span class="ico">${esc(c[1])}</span><span>${esc(c[0])}</span></button>`).join('')}</div>` : '<p class="empty">Hier gibt es noch keine Kategorien. Lege sie unter Mehr > Kategorien an.</p>'}`, opt);
  } else if (q.st === 'sub') {
    const list = vis(q.t), ci = list.findIndex(x => x[0] === q.c), c = list[ci];
    showSheet(`${qhdr()}<div class="ctr"><span class="ico lg">${esc(c[1])}</span><b class="h2">${esc(c[0])}</b></div><div class="sheet-grp">${c[2].map((s, si) => `<button class="row plain" data-act="pick" data-q="${ci},${si}"><span class="rt"><b>${esc(s)}</b></span>${CHV}</button>`).join('')}</div>`, opt);
  } else if (q.st === 'day') {
    const c = cat(q.t, q.c) || ['', '•'];
    showSheet(`${qhdr()}<div class="ctr"><span class="ico lg">${esc(c[1])}</span><b class="h2">${esc(q.s)}</b></div>
      <div class="dayv">${q.t === 'inc' ? 'Kommt' : 'Wird abgebucht'} jeden Monat am<b id="dv">${q.day}.</b></div>
      <input type="range" id="day" min="1" max="31" step="1" value="${q.day}" style="--v:${(q.day - 1) / 30 * 100}%" aria-label="Tag im Monat">
      <p class="empty" id="dh" style="text-align:center;min-height:44px">${q.day > 28 ? 'In kürzeren Monaten wird am letzten Tag des Monats gebucht.' : ''}</p>
      <div class="sp"></div>
      <button class="btn" data-act="saveTpl">${q.mode === 'tpl' ? 'Speichern' : 'Anlegen'}</button>
      ${q.mode === 'tpl' ? '<button class="btn danger" data-act="askDelTpl">Posten löschen</button>' : ''}`, opt);
  }
}
function key(k) {
  let a = Q.a;
  if (k === 'del') a = a.slice(0, -1);
  else if (k === ',') { if (!a.includes(',')) a = (a || '0') + ','; }
  else if (a.length < 10 && !/,\d\d$/.test(a) && !(a === '' && k === '0')) a += k;
  Q.a = a; const av = $('#am .av'); av.textContent = a || '0'; av.classList.toggle('z', !a); buzz(5);
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
  lastSt = 'amt'; renderQ(); openSheet();
}
function entrySheet(id) {
  const e = S.entries.find(x => x.id === id); if (!e) return;
  const c = cat(e.t, e.c) || ['', '•'];
  Q = { mode: 'entryview', eid: id };
  showSheet(`<div class="sht"><span style="width:36px"></span><span></span>${xBtn}</div><div class="ctr"><span class="ico lg">${esc(c[1])}</span><b class="h2">${esc(e.s)}</b><div class="big num ${e.t === 'inc' ? 'pos' : ''}">${e.t === 'inc' ? '+' : '−'}${eur(e.a)}</div><small>${esc(e.c)} · ${dmy(e.d)}${e.d.slice(0, 4)}${e.fx ? ' · wiederkehrend' : ''}</small></div>
    <button class="btn" data-act="entryEdit">Betrag ändern</button><button class="btn danger" data-act="entryDel">Löschen</button>`);
  openSheet();
}
function catDetail(key) {
  const [t, n] = key.split('|'), c = cat(t, n) || ['', '•'], l = monthEntries(UI.mo).filter(e => e.t === t && e.c === n), g = {};
  l.forEach(e => g[e.s] = (g[e.s] || 0) + e.a);
  const mx = Math.max(1, ...Object.values(g));
  Q = { mode: 'view' };
  showSheet(`<div class="sht"><span style="width:36px"></span><span></span>${xBtn}</div><div class="ctr"><span class="ico lg">${esc(c[1])}</span><b class="h2">${esc(n)}</b><div class="big num">${eur(sum(l))}</div><small>${MN[+UI.mo.slice(5) - 1]} · ${l.length} ${l.length === 1 ? 'Buchung' : 'Buchungen'}</small></div>
    <div class="sheet-grp" style="padding:4px 16px">${Object.entries(g).sort((a, b) => b[1] - a[1]).map(([s, v]) => `<div style="padding:10px 0"><div class="sum"><b style="font-weight:500">${esc(s)}</b><span class="num">${eur(v)}</span></div><div class="bar"><i style="width:${v / mx * 100}%;background:var(--tint)"></i></div></div>`).join('')}</div>`);
  openSheet();
}

/* ---------- Kategorien bearbeiten ---------- */
const EMOJIS = '🛒 🍽️ ☕ 🍕 🍔 🥐 🍷 🥦 🚗 ⛽ 🚌 🚆 🚲 ✈️ 🏖️ 🏠 🛋️ 🔧 💡 📱 💻 🎮 🎬 🎟️ 🎵 📚 🎓 👕 👟 👜 💄 🧴 🧼 🧺 🐶 🐱 🌱 🎁 🎂 👶 🧸 💊 🩺 🦷 👓 🏋️ ⚽ 🏊 💼 💰 🏦 💳 📈 🐷 🧾 🛡️ ⚖️ 📦 ✂️ 🔑 🚿 📺 ☁️ 📰 ✨ ❤️ ⭐ 🏷️'.split(' ');
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
    ? `<div class="srow dim"><span class="grow">${esc(s.n)}</span><small>ausgeblendet</small><button class="cbtn sm" data-act="subRestore" data-k="${k}" aria-label="${esc(s.n)} wieder einblenden">${ic('restore')}</button></div>`
    : `<div class="srow"><button class="minus" data-act="subDel" data-k="${k}" aria-label="Unterkategorie entfernen">${ic('minus')}</button><input class="in ce-sub" data-k="${k}" type="text" maxlength="24" value="${esc(s.n)}" placeholder="Name der Unterkategorie" autocomplete="off" aria-label="Unterkategorie"></div>`).join('');
  showSheet(`<div class="sht"><span style="width:36px"></span><div class="ttl">${q.orig == null ? 'Neue Kategorie' : 'Kategorie'}</div>${xBtn}</div>
    <div class="ce-top"><button class="ico lg" id="ce-icon" data-act="ePick" aria-label="Symbol wählen">${esc(q.i)}</button><input id="ce-name" class="in" type="text" maxlength="24" value="${esc(q.n)}" placeholder="Name der Kategorie" autocomplete="off" aria-label="Name der Kategorie"></div>
    ${q.pick ? `<div class="eg" data-nodrag>${EMOJIS.map(e => `<button data-act="eSet" data-e="${e}" aria-label="Symbol ${e}">${e}</button>`).join('')}</div><div class="own"><span class="fl2" style="margin:0 4px">Oder ein eigenes Symbol von der Emoji-Tastatur</span><input id="ce-emoji" class="in" type="text" placeholder="😀" autocomplete="off" aria-label="Eigenes Symbol"></div>` : ''}
    <span class="fl2">Unterkategorien</span><div class="subs">${rows}</div>
    <button class="chip" data-act="subAdd" style="align-self:flex-start">+ Unterkategorie</button>
    <div class="sp" style="min-height:18px"></div>
    <button class="btn" data-act="catSave">Speichern</button>
    ${q.orig == null ? '' : q.hidden ? '<button class="btn sec" data-act="catRestore">Wieder einblenden</button>' : `<button class="btn danger" data-act="askDelCat">${used ? 'Kategorie ausblenden' : 'Kategorie löschen'}</button>`}`, { tall: true });
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
  tab(el) { if (UI.sub) closeSub(false); UI.tab = +el.dataset.i; main.scrollTop = 0; go(); },
  fab() { openAdd({}); },
  month(el) { stepMonth(+el.dataset.d); },
  setmonth(el) { UI.mo = el.dataset.k; go(false); },
  statf(el) { UI.f = +el.dataset.i; go(false); },
  catd(el) { catDetail(el.dataset.k); },
  entry(el) { entrySheet(+el.dataset.id); },
  tpl(el) { editTpl(+el.dataset.id); },
  recNew() { openAdd({ rec: true, t: 'fix' }); },
  /* Kategorien */
  openCats() { openSub('cats'); },
  closeSub() { closeSub(false); },
  ctype(el) { UI.ctype = +el.dataset.i; renderSub(); },
  catNew() { openCatEdit(CTYPES[UI.ctype], null); },
  catEdit(el) { openCatEdit(CTYPES[UI.ctype], el.dataset.n); },
  ePick() { syncCat(); Q.pick = !Q.pick; renderCatEdit(); },
  eSet(el) { syncCat(); Q.i = el.dataset.e; Q.pick = false; renderCatEdit(); },
  subAdd() { syncCat(); Q.subs.push({ n: '', o: null, h: 0 }); renderCatEdit(); const l = $$('.ce-sub'); if (l.length) { l[l.length - 1].focus(); l[l.length - 1].scrollIntoView({ block: 'center' }); } },
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
    if (n) confirmDialog('Kategorie ausblenden?', `${n} ${n === 1 ? 'Buchung gehört' : 'Buchungen gehören'} zu „${orig}“. Sie bleiben in der Statistik, die Kategorie erscheint nur nicht mehr beim Erfassen.`, 'Ausblenden', () => { c[3] = 1; save(); go(false); toast('Ausgeblendet'); });
    else confirmDialog('Kategorie löschen?', `„${orig}“ und ihre Unterkategorien werden gelöscht.`, 'Löschen', () => { const l = CATS(t); l.splice(l.indexOf(c), 1); save(); go(false); toast('Gelöscht'); });
  },
  catRestore() { const c = cat(Q.t, Q.orig); if (c) c[3] = 0; closeSheet(); save(); go(false); toast('Wieder eingeblendet'); },
  theme(el) { moveSeg(el); S.settings.theme = +el.dataset.i; applyTheme(); save(); },
  sw(el) { const k = el.dataset.k; S.settings[k] = S.settings[k] ? 0 : 1; el.classList.toggle('on', !!S.settings[k]); el.setAttribute('aria-checked', !!S.settings[k]); buzz(8); if (k === 'auto' && runFixed()) toast('Fällige Posten gebucht'); save(); },
  exportJson, exportCsv,
  importJson() { if (PREVIEW) previewNote(); else $('#imp').click(); },
  async install() { if (!deferredInstall) return; deferredInstall.prompt(); try { await deferredInstall.userChoice; } catch (e) {} deferredInstall = null; go(false); },
  askWipe() { confirmDialog('Alle Daten löschen?', 'Alle Buchungen und wiederkehrenden Posten werden endgültig gelöscht. Mach vorher ein Backup, falls du sie noch brauchst.', 'Alles löschen', () => { S = Object.assign(blank(), { settings: S.settings, cats: S.cats }); save(); UI.tab = 0; go(); toast('Alle Daten gelöscht'); }); },
  askClearDemo() { confirmDialog('Mit leerer App starten?', 'Die Beispieldaten werden entfernt. Deine Einstellungen bleiben.', 'Beispieldaten entfernen', () => { S = Object.assign(blank(), { settings: S.settings, cats: S.cats }); save(); UI.tab = 0; go(); }); },
  askDemo() { const run = () => { S = Object.assign(seedDemo(), { settings: S.settings }); save(); UI.tab = 0; go(); }; if (S.entries.length || S.fixed.length) confirmDialog('Beispieldaten laden?', 'Deine aktuellen Daten und Kategorien werden dabei ersetzt.', 'Ersetzen', run); else run(); },
  alOk() { const fn = Al.fn, ls = [Al.layer]; if (Sh.open) ls.push(Sh.layer); alertClose(true); closeSheet(true); navClose(ls); if (fn) fn(); },
  alNo() { alertClose(false); },
  close() { closeSheet(); },
  undo() { const t = $('#toast'); if (t._u) t._u(); t._u = null; t.classList.remove('o'); },
  /* Erfassen */
  qtype(el) { moveSeg(el); Q.t = el.dataset.t; const d = $('#dt'); if (d) d.hidden = Q.t === 'fix'; },
  date() { Q.back = (Q.back + 1) % 3; $('#dt').textContent = DATE_LABEL[Q.back]; },
  key(el) { key(el.dataset.k); },
  next() {
    if (amt() <= 0) { $('#am').animate([{ transform: 'translateX(-10px)' }, { transform: 'translateX(9px)' }, { transform: 'translateX(-5px)' }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.9,.3,1)' }); buzz(30); return; }
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
    confirmDialog('Posten löschen?', `${f.s} wird nicht mehr automatisch gebucht. Bisherige Buchungen bleiben erhalten.`, 'Löschen', () => {
      S.fixed = S.fixed.filter(x => x !== f); save(); go(false);
      toast(`${f.s} gelöscht`, () => { S.fixed.push(f); save(); go(false); });
    });
  },
  entryEdit() {
    const e = S.entries.find(x => x.id === Q.eid); if (!e) return;
    Q = { mode: 'entry', eid: e.id, t: e.t, c: e.c, s: e.s, a: String(e.a).replace('.', ','), st: 'amt', rec: false, back: 0, day: 1 }; lastSt = 'amt'; renderQ();
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

/* Monatswechsel: Inhalt gleitet per Feder herein (von der Seite, in die gewischt wurde) */
let mAnim = null;
const mPaint = x => { main.style.transform = `translate3d(${x}px,0,0)`; };
function stepMonth(d, x0 = 0, v0 = 0) {
  const nk = shift(UI.mo, d); if (mAnim) mAnim.stop();
  if (nk > NOW.k || nk < minMonth()) {
    mAnim = spring({ from: x0, to: 0, v: v0, zeta: .62, resp: .42, eps: .3, step: mPaint, done: () => { main.style.transform = ''; } });
    return;
  }
  UI.mo = nk; go(false);
  const W = main.clientWidth;
  mAnim = spring({
    from: d * W * .3, to: 0, zeta: 1, resp: .5, eps: .3,
    step: x => { mPaint(x); main.style.opacity = (1 - clamp(Math.abs(x) / (W * .3), 0, 1) * .85).toFixed(3); },
    done: () => { main.style.transform = ''; main.style.opacity = ''; }
  });
}
(function () {   // Wischen zwischen den Monaten (Statistik): der Inhalt folgt dem Finger
  let d = null, hist = [];
  main.addEventListener('pointerdown', e => {
    if (UI.tab !== 1 || UI.sub || Sh.open || (e.pointerType === 'mouse' && e.button !== 0)) return;
    d = { id: e.pointerId, x0: e.clientX, y0: e.clientY, live: false, x: 0 }; hist = [[e.timeStamp, e.clientX]];
  });
  main.addEventListener('pointermove', e => {
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.live) {
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
      if (Math.abs(dy) >= Math.abs(dx)) { d = null; return; }
      if (mAnim) mAnim.stop();
      d.live = true; d.start = e.clientX; main.style.opacity = '';
      try { main.setPointerCapture(e.pointerId); } catch (err) {}
    }
    let x = e.clientX - d.start;
    if ((x < 0 && UI.mo >= NOW.k) || (x > 0 && UI.mo <= minMonth())) x = rubber(x, 320);
    d.x = x; mPaint(x);
    hist.push([e.timeStamp, e.clientX]); while (hist.length > 2 && e.timeStamp - hist[0][0] > 100) hist.shift();
  });
  const end = e => {
    if (!d || e.pointerId !== d.id) return;
    const live = d.live, x = d.x; d = null; if (!live) return;
    Drag.until = performance.now() + 350;
    const a = hist[0], b = hist[hist.length - 1], v = e.type === 'pointercancel' ? 0 : (b[0] - a[0] > 0 ? (b[1] - a[1]) / (b[0] - a[0]) * 1000 : 0);
    const rest = x + project(v);
    stepMonth(rest < -110 ? 1 : rest > 110 ? -1 : 0, x, v);
  };
  main.addEventListener('pointerup', end); main.addEventListener('pointercancel', end);
})();

/* Nach einer Wischgeste soll kein versehentlicher Tipp ausgelöst werden */
document.addEventListener('click', e => { if (performance.now() < Drag.until) { e.stopPropagation(); e.preventDefault(); } }, true);
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el) { const f = act[el.dataset.act]; if (f) f(el, e); return; }
  if (e.target === elScrim) closeSheet();
  else if (e.target === elAl) alertClose(false);
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const l = NAV.stack[NAV.stack.length - 1]; if (l) { NAV.stack.pop(); l.close(true); if (!PREVIEW) { NAV.skip++; try { history.back(); } catch (err) { NAV.skip--; } } }
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
$('#imp').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  let r = null;
  try { r = sanitize(JSON.parse(await f.text())); } catch (err) {}
  if (!r) return toast('Das ist kein gültiges Fino-Backup.');
  confirmDialog('Backup einspielen?', `Deine aktuellen Daten werden ersetzt durch ${r.state.entries.length} Buchungen und ${r.state.fixed.length} wiederkehrende Posten.${r.dropped ? ` ${r.dropped} ungültige Einträge werden übersprungen.` : ''}`, 'Einspielen',
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
  checkPersist().then(() => { if (UI.tab === 3 && !UI.sub) go(false); });
  try {
    const a = new URLSearchParams(location.search).get('add');
    if (['out', 'fix', 'inc'].includes(a)) { history.replaceState(null, '', location.pathname); openAdd({ t: a }); }
  } catch (e) {}
  if (!PREVIEW && 'serviceWorker' in navigator && location.protocol !== 'file:') {
    let had = !!navigator.serviceWorker.controller;     // beim allerersten Start gibt es noch keinen Vorgänger
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) toast('Neue Version ist da', () => location.reload(), 'Neu laden', 12000); had = true; });
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
