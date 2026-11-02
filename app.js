'use strict';
// stutWith: stutter a photo. Cut it into slices and repeat the slice at the anchor outwards, each copy nudged a
// little further on. Nothing is generated: every slice is a window onto the photo.

const $ = s => document.querySelector(s);
const EDGE = 14; // the page margin, the same as --edge in style.css: the Menu tab's and, on a phone, the photo's
const ACCENT = '#0bdb00', YELLOW = '#f8cd46', PAD = 56, MAX_SIDE = 2400, HISTORY = 60; // PAD keeps the photo clear of the corner buttons
const STARTER = 'starter.jpg'; // ships alongside the app

const DIRS = [
  { id: 'h',     label: 'Across', tip: 'Slices side by side' },
  { id: 'v',     label: 'Down',   tip: 'Slices stacked' },
  { id: 'both',  label: 'Both',   tip: 'A grid: Slices across, Bands down' },
  { id: 'rings', label: 'Rings',  tip: 'Frames round the anchor' },
];
const RHYTHMS = [
  { id: 'even',   label: 'Even',   tip: 'Even widths' },
  { id: 'tight',  label: 'Tight',  tip: 'Thin at the anchor' },
  { id: 'loose',  label: 'Loose',  tip: 'Wide at the anchor' },
  { id: 'random', label: 'Random', tip: 'Random widths' },
];
const FALLOFFS = [
  { id: 'hard', label: 'Hard', tip: 'Full strength inside Reach' },
  { id: 'fade', label: 'Fade', tip: 'Fades out from the anchor' },
  { id: 'grow', label: 'Grow', tip: 'Grows out from the anchor' },
];
const EDGES = [
  { id: 'stop',    label: 'Stop',    tip: 'Stops at the photo\'s edge' },
  { id: 'wrap',    label: 'Wrap',    tip: 'Repeats past the edge' },
  { id: 'reflect', label: 'Reflect', tip: 'Mirrors past the edge' },
];
const SORTS = [
  { id: 'off',   label: 'Sort Off',    tip: 'No sorting' },
  { id: 'dark',  label: 'Dark First',  tip: 'Darkest slices first' },
  { id: 'light', label: 'Light First', tip: 'Lightest slices first' },
];
const STEPS = { dir: DIRS, rhythm: RHYTHMS, falloff: FALLOFFS, sort: SORTS, edge: EDGES };
const STEP_PREFIX = { edge: 'Edge ' };
const SLIDERS = {
  step:    { fmt: v => v + '%', tip: 'How far each copy moves. 100% is untouched' },
  slices:  { tip: 'How many slices' },
  bands:   { tip: 'Cuts the other way' },
  reach:   { fmt: v => v + '%', tip: 'How far the stutter reaches' },
  bend:    { tip: 'Curves the spacing of the copies' },
  stagger: { tip: 'Slants it band by band' },
  jitter:  { tip: 'Random nudges' },
  angle:   { fmt: v => v + '°', tip: 'Turns the slices' },
  light:   { tip: 'Up: light parts stutter. Down: dark parts' },
  feather: { tip: 'Blend between anchors' },
};
// sliders show no number, so hovering or dragging one reads it out, e.g. Step 30%
const reading = k => `${$('#' + k).getAttribute('aria-label')} ${(SLIDERS[k].fmt || String)(P[k])}`;
const TIPS = {
  flip:    'Mirror every other copy',
  zigzag:  'Reverse every other band',
  lines:   'Show the grid',
  mark:    'Show the anchors',
  anchors: 'Up to three anchors',
  stack:   'Bake it in, stutter again',
  dice:    'Random everything',
  upload:  'Use your own photo',
  undo:    'Undo', redo: 'Redo',
  reset:   'Back to the start',
  save:    'Save as JPG',
};
const DEFAULTS = { dir: 0, step: 30, slices: 24, bands: 1, reach: 100, bend: 0, stagger: 0, jitter: 0, angle: 0, light: 0, feather: 0, sort: 0, rhythm: 0, falloff: 0, flip: false, zigzag: false, edge: 0, pts: [[.5, .5]], seed: 1 };
// where each anchor first lands, and the most there can be
const SPOTS = [[.5, .5], [.2, .5], [.8, .5]];

const cv = $('#cv'), ctx = cv.getContext('2d'), stage = $('#stage');
// out holds just the picture, at screen resolution: what's drawn under the anchors and lines
const out = document.createElement('canvas'), octx = out.getContext('2d');

// P is every setting; pts is the anchors, [x, y] as photo fractions. A snapshot of P and src is one undo step
const clone = o => ({ ...o, pts: o.pts.map(p => p.slice()) });
let src = null, orig = null, P = clone(DEFAULTS), undos = [], redos = [];
let lines = false, mark = true, dirty = true, raf = 0, geom = null, geoms = [], active = 0;
let W = 0, H = 0, dpr = 1, fit = { x: 0, y: 0, w: 0, h: 0 };

const wrap = (v, n) => (v % n + n) % n;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const line = (n, at) => Array.from({ length: n }, (_, k) => at(k));
const even = n => line(n + 1, k => k / n);
const slot = (G, f) => { let k = 0; while (k < G.length - 2 && f >= G[k + 1]) k++; return k; };
const newSeed = () => Math.random() * 2 ** 31 | 0;
// a steady random 0..1 for slice i of band j, so jitter and random cuts hold still until Dice throws again
const hash = (i, j, s) => { let t = Math.imul(i + 1, 374761393) + Math.imul(j + 1, 668265263) + Math.imul(s, 2246822519) | 0; t = Math.imul(t ^ t >>> 13, 1274126177); return ((t ^ t >>> 16) >>> 0) / 4294967296; };
const id = key => STEPS[key][P[key]].id;

// ---------- source ----------
function toCanvas(img) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const s = Math.min(1, MAX_SIDE / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * s); c.height = Math.round(h * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

function loadImage(url, cors) {
  return new Promise((ok, no) => {
    const i = new Image();
    if (cors) i.crossOrigin = 'anonymous';
    i.onload = () => ok(i); i.onerror = no; i.src = url;
  });
}

async function loadFile(f) {
  if (!f || !f.type.startsWith('image/')) return;
  const url = URL.createObjectURL(f);
  try { start(toCanvas(await loadImage(url))); }
  catch { say('Couldn\'t read that image', true); }
  finally { URL.revokeObjectURL(url); }
}

// offline fallback so there's always something to stutter
function testCard() {
  const c = document.createElement('canvas'); c.width = 1600; c.height = 1067;
  const g = c.getContext('2d'), cs = ['#1b2fe0', '#e3241b', '#ffd200', '#13b53a', '#fff', '#000', ACCENT];
  cs.forEach((col, k) => { g.fillStyle = col; g.fillRect(k * c.width / cs.length, 0, c.width / cs.length + 1, c.height); });
  g.fillStyle = '#000'; g.beginPath(); g.arc(800, 533, 380, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.font = '600 150px "JetBrains Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('IMG', 800, 460); g.fillText('SOUP', 800, 610);
  return c;
}

function start(c) {
  orig = src = c; undos = []; redos = []; view = { z: 1, x: 0, y: 0 };
  layout();
}

// ---------- stutter ----------
// where the slices are cut, 0..1, packed round the anchor a by Rhythm
function cuts(n, a, T, salt = 0) {
  const r = RHYTHMS[T.rhythm].id;
  if (r === 'random') {
    const w = line(n, k => .25 + hash(k, salt, T.seed) * 1.5), sum = w.reduce((s, v) => s + v, 0);
    let acc = 0; return [0, ...w.map(v => Math.min(1, (acc += v) / sum))];
  }
  if (r === 'even') return even(n);
  const q = r === 'tight' ? 2 : .5;
  return line(n + 1, k => {
    const t = k / n;
    return t < a ? a - a * ((a - t) / a) ** q : a + (1 - a) * ((t - a) / (1 - a || 1)) ** q;
  });
}

// how strongly the stutter lands r of the way out to the edge of Reach (0 at the anchor). Feather softens Hard's
// cliff at the edge of Reach into a slope
const falloff = (r, T) => {
  if (r > 1) return 0;
  const f = FALLOFFS[T.falloff].id;
  return f === 'fade' ? 1 - r : f === 'grow' ? r : T.feather ? clamp((1 - r) / (T.feather / 100 * .6), 0, 1) : 1;
};

// the window a slice from a0 to a1 shows, along one axis: [start, width] as 0..1 fractions of the photo.
// Its middle sits at A + u·step, u being how far the slice is from the anchor A, so at 100% every slice shows
// itself and at 0% they all show the anchor. Bend curves u, Falloff blends back to the slice itself, Jitter throws
// it; m (from Light) weakens the whole stutter for this slice
function place(a0, a1, A, T, sgn, rnd, m = 1) {
  const w = a1 - a0, u = (a0 + a1) / 2 - A, e = m * falloff(Math.abs(u) / Math.max(T.reach / 100, 1e-3), T);
  const go = sgn * T.step / 100 * Math.sign(u) * Math.abs(u) ** 2 ** (T.bend / 50);
  return [A + go * e + u * (1 - e) + (rnd * 2 - 1) * T.jitter / 100 * .2 * e - w / 2, w];
}

// draw part of the photo into d, mirrored if asked. A window reaching past the photo is cut where it crosses each
// edge; each piece comes from the photo stopped at the edge, repeated (wrap) or flipped on every other repeat (reflect)
function blit(g, s, d, fx, fy) {
  if (d[2] < 1 || d[3] < 1) return;
  const W = src.width, H = src.height, e = EDGES[P.edge].id;
  let [sx, sy, sw, sh] = s;
  if (e === 'stop') { sw = Math.min(sw, W); sh = Math.min(sh, H); sx = clamp(sx, 0, W - sw); sy = clamp(sy, 0, H - sh); }
  if (fx || fy) { g.save(); g.translate(d[0] + (fx ? d[2] : 0), d[1] + (fy ? d[3] : 0)); g.scale(fx ? -1 : 1, fy ? -1 : 1); d = [0, 0, d[2], d[3]]; }
  if (sx >= 0 && sy >= 0 && sx + sw <= W && sy + sh <= H) g.drawImage(src, sx, sy, sw, sh, ...d);
  else {
    const spans = (a, len, n) => { const o = []; for (let p = a; p < a + len - 1e-6;) { const k = Math.floor(p / n), e = Math.min(a + len, (k + 1) * n); o.push([p, e, k]); p = e; } return o; };
    for (const [x0, x1, kx] of spans(sx, sw, W)) for (const [y0, y1, ky] of spans(sy, sh, H)) {
      const mx = e === 'reflect' && kx & 1, my = e === 'reflect' && ky & 1, lw = x1 - x0, lh = y1 - y0;
      let lx = x0 - kx * W, ly = y0 - ky * H;
      if (mx) lx = W - lx - lw;
      if (my) ly = H - ly - lh;
      const dx = d[0] + (x0 - sx) / sw * d[2], dy = d[1] + (y0 - sy) / sh * d[3], dw = lw / sw * d[2], dh = lh / sh * d[3];
      if (!mx && !my) { g.drawImage(src, lx, ly, lw, lh, dx, dy, dw, dh); continue; }
      g.save(); g.translate(dx + (mx ? dw : 0), dy + (my ? dh : 0)); g.scale(mx ? -1 : 1, my ? -1 : 1);
      g.drawImage(src, lx, ly, lw, lh, 0, 0, dw, dh); g.restore();
    }
  }
  if (fx || fy) g.restore();
}

// ---------- brightness ----------
// a summed table of the photo's brightness, 256px on its long side, so any rectangle's average is four lookups.
// A photo opened from disk (file://) may not let its pixels be read: then blind is set and everything counts as
// mid-grey, so Light and Sort do nothing
let sat = null, satFor = null, satW = 0, satH = 0, lo = 0, hi = 1, blind = false;
function lumTable() {
  if (satFor === src) return sat;
  satFor = src;
  const s = 256 / Math.max(src.width, src.height), w = satW = Math.max(1, Math.round(src.width * s)), h = satH = Math.max(1, Math.round(src.height * s));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0, w, h);
  let px;
  try { px = g.getImageData(0, 0, w, h).data; blind = false; } catch { blind = true; return sat = null; }
  sat = new Float64Array((w + 1) * (h + 1)); lo = 1; hi = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4, v = (.2126 * px[o] + .7152 * px[o + 1] + .0722 * px[o + 2]) / 255, i = (y + 1) * (w + 1) + x + 1;
    lo = Math.min(lo, v); hi = Math.max(hi, v);
    sat[i] = v + sat[i - 1] + sat[i - w - 1] - sat[i - w - 2];
  }
  return sat;
}
// the average brightness of the photo from x0, y0 to x1, y1 (photo fractions), 0 its darkest to 1 its lightest
function shade(x0, y0, x1, y1) {
  const S = lumTable();
  if (!S) return .5;
  const W1 = satW + 1, a = clamp(Math.floor(Math.min(x0, x1) * satW), 0, satW - 1), b = clamp(Math.floor(Math.min(y0, y1) * satH), 0, satH - 1);
  const c = clamp(Math.ceil(Math.max(x0, x1) * satW), a + 1, satW), d = clamp(Math.ceil(Math.max(y0, y1) * satH), b + 1, satH);
  const v = (S[d * W1 + c] - S[b * W1 + c] - S[d * W1 + a] + S[b * W1 + a]) / ((c - a) * (d - b));
  return hi > lo ? (v - lo) / (hi - lo) : .5;
}
// Light: how much of the stutter a part of the photo this bright takes
const lit = (b, T) => { const L = Math.abs(T.light) / 100; return 1 - L + L * (T.light > 0 ? b : 1 - b); };
// Sort: hand the windows ws ([p, pw, q, qw]) out again in order of how bright they show, darkest or lightest first;
// each slice keeps its own size and takes the middle of the window it's given
function sorted(ws, key, T) {
  const up = SORTS[T.sort].id === 'dark', by = ws.map((w, i) => [key(w), i]).sort((a, b) => up ? a[0] - b[0] : b[0] - a[0]);
  return ws.map((w, i) => { const o = ws[by[i][1]]; return [o[0] + o[1] / 2 - w[1] / 2, w[1], o[2] + o[3] / 2 - w[3] / 2, w[3]]; });
}

// Feather: how much each anchor pulls on a slice whose middle is at x, y (photo fractions). The nearest pulls fully
// and any other within the blend zone a little less the further it is beyond the nearest, so at a seam the two
// pull equally. There's always some blend, so anchors never meet in a hard line: Feather 0 is a narrow zone and
// 100 a wide one. With one anchor there's nothing to blend (null)
function pulls(T, F, x, y) {
  if (T.pts.length < 2) return null;
  const d = T.pts.map(([ax, ay]) => Math.hypot((x - ax) * F.w, (y - ay) * F.h)), near = Math.min(...d), zone = (.06 + T.feather / 100 * .4) * Math.max(F.w, F.h);
  const w = d.map(v => Math.max(0, 1 - (v - near) / zone)), sum = w.reduce((a, b) => a + b, 0);
  return w.map(v => v / sum);
}

// whether the box x0, y0 to x1, y1 (px) reaches into V, the part of g that will show; no V, all of it shows
const hits = (V, x0, y0, x1, y1) => !V || x1 > V.x0 && x0 < V.x1 && y1 > V.y0 && y0 < V.y1;

// draw the stutter for one anchor (T.ax, T.ay) into frame F ({x, y, w, h} in px) with settings T. The stutter
// runs along p (x for Across, y for Down); bands split the other axis, q. Both stutters q too, cut into Bands rows.
// Slices outside V are skipped (unless Sort needs every window to hand them out)
function render(g, F, T, V) {
  g.imageSmoothingQuality = 'high';
  const d = DIRS[T.dir].id;
  if (d === 'rings') return rings(g, F, T);
  if (T.angle) return tilted(g, F, T, (T.angle + (d === 'v' ? 90 : 0)) * Math.PI / 180, V);
  const across = d !== 'v', both = d === 'both';
  const Ap = across ? T.ax : T.ay, Aq = across ? T.ay : T.ax;
  const pc = cuts(T.slices, clamp(Ap, 0, 1), T), qc = both ? cuts(T.bands, clamp(Aq, 0, 1), T, 1) : even(T.bands);
  const iA = slot(pc, Ap), jA = slot(qc, Aq), tilt = T.stagger / 100;
  const [P0, PW, Q0, QW] = across ? [F.x, F.w, F.y, F.h] : [F.y, F.h, F.x, F.w];
  const [SP, SQ] = across ? [src.width, src.height] : [src.height, src.width];
  const ep = pc.map(v => P0 + Math.round(v * PW)), eq = qc.map(v => Q0 + Math.round(v * QW));
  // a part of the photo along p and q, as x0, y0, x1, y1 for shade
  const area = (p0, p1, q0, q1) => across ? [p0, q0, p1, q1] : [q0, p0, q1, p1];
  const shows = (i, j) => T.sort || hits(V, ...area(ep[i], ep[i + 1], eq[j], eq[j + 1]));
  const draws = [];
  for (let j = 0; j < qc.length - 1; j++) {
    // Stagger moves each band's anchor by how far the band is from the anchor; Zigzag reverses every other band
    const Ab = Ap + tilt * ((qc[j] + qc[j + 1]) / 2 - Aq), sgn = T.zigzag && (j - jA) & 1 ? -1 : 1;
    let ws = line(pc.length - 1, i => {
      if (!shows(i, j)) return null;
      const m = T.light ? lit(shade(...area(pc[i], pc[i + 1], qc[j], qc[j + 1])), T) : 1, rp = hash(i, j, T.seed), rq = hash(j, i, T.seed + 7);
      const mid = (pc[i] + pc[i + 1]) / 2, qm = (qc[j] + qc[j + 1]) / 2, pw = pulls(T, F, ...(across ? [mid, qm] : [qm, mid]));
      // the window each anchor (at Bp, Bq along p and q) would give this slice
      const at = (Bp, Bq) => [place(pc[i], pc[i + 1], Bp + tilt * (qm - Bq), T, sgn, rp, m)[0], both ? place(qc[j], qc[j + 1], Bq, T, 1, rq, m)[0] : qc[j]];
      let [sp, sq] = at(Ap, Aq);
      // with Feather, near a seam the window is the anchors' windows mixed by how hard each pulls
      if (pw) [sp, sq] = T.pts.reduce(([a, b], [x, y], k) => { if (!pw[k]) return [a, b]; const [u, v] = at(...(across ? [x, y] : [y, x])); return [a + pw[k] * u, b + pw[k] * v]; }, [0, 0]);
      return [sp, pc[i + 1] - pc[i], sq, qc[j + 1] - qc[j]];
    });
    if (T.sort) ws = sorted(ws, w => shade(...area(w[0], w[0] + w[1], w[2], w[2] + w[3])), T);
    ws.forEach((w, i) => {
      if (!w) return;
      const [sp, spw, sq, sqw] = w, fp = T.flip && (i - iA) & 1, fq = both && T.flip && (j - jA) & 1;
      const s = [sp * SP, sq * SQ, spw * SP, sqw * SQ], r = [ep[i], eq[j], ep[i + 1] - ep[i], eq[j + 1] - eq[j]];
      draws.push(across ? { s, r, fx: fp, fy: fq, i } : { s: [s[1], s[0], s[3], s[2]], r: [r[1], r[0], r[3], r[2]], fx: fq, fy: fp, i });
    });
  }
  for (const { s, r, fx, fy } of draws) blit(g, s, r, fx, fy);
  geom = { across, pc, qc };
}

// Angle: the same stutter on slices turned round the anchor// Angle: the same stutter on slices turned round the anchor by th, p along the slant and q across it. A turned
// slice can't be a plain window, so each is drawn as the photo shifted along the slant, clipped to the slice
function tilted(g, F, T, th, V) {
  const both = DIRS[T.dir].id === 'both', ux = Math.cos(th), uy = Math.sin(th), vx = -uy, vy = ux, k = src.width / F.w;
  const A = [F.x + T.ax * F.w, F.y + T.ay * F.h], corners = [[F.x, F.y], [F.x + F.w, F.y], [F.x, F.y + F.h], [F.x + F.w, F.y + F.h]];
  const ps = corners.map(([x, y]) => (x - A[0]) * ux + (y - A[1]) * uy), qs = corners.map(([x, y]) => (x - A[0]) * vx + (y - A[1]) * vy);
  const p0 = Math.min(...ps), PL = Math.max(...ps) - p0, q0 = Math.min(...qs), QL = Math.max(...qs) - q0, Ap = -p0 / PL, Aq = -q0 / QL;
  const pc = cuts(T.slices, clamp(Ap, 0, 1), T), qc = both ? cuts(T.bands, clamp(Aq, 0, 1), T, 1) : even(T.bands);
  const iA = slot(pc, Ap), jA = slot(qc, Aq), tilt = T.stagger / 100;
  // the point p, q of the way along the turned axes, in px; each slice grows by half a pixel so no seam shows
  const pt = (p, q) => [A[0] + (p0 + p * PL) * ux + (q0 + q * QL) * vx, A[1] + (p0 + p * PL) * uy + (q0 + q * QL) * vy];
  const gp = .5 / PL, gq = .5 / QL;
  // the part of the photo a box of px covers, shifted by dx, dy px, as x0, y0, x1, y1 for shade
  const area = (bx, by, bw, bh, dx = 0, dy = 0) => [(bx + dx - F.x) / F.w, (by + dy - F.y) / F.h, (bx + dx + bw - F.x) / F.w, (by + dy + bh - F.y) / F.h];
  for (let j = 0; j < qc.length - 1; j++) {
    const Ab = Ap + tilt * ((qc[j] + qc[j + 1]) / 2 - Aq), sgn = T.zigzag && (j - jA) & 1 ? -1 : 1;
    // each slice's turned outline, the box round it, and how far along and across the slant its picture shifts
    let cells = line(pc.length - 1, i => {
      const mp = (pc[i] + pc[i + 1]) / 2, mq = (qc[j] + qc[j + 1]) / 2;
      const poly = [pt(pc[i] - gp, qc[j] - gq), pt(pc[i + 1] + gp, qc[j] - gq), pt(pc[i + 1] + gp, qc[j + 1] + gq), pt(pc[i] - gp, qc[j + 1] + gq)];
      const xs = poly.map(q => q[0]), ys = poly.map(q => q[1]), bx = Math.floor(Math.min(...xs)), by = Math.floor(Math.min(...ys));
      const bw = Math.ceil(Math.max(...xs)) - bx, bh = Math.ceil(Math.max(...ys)) - by;
      if (!T.sort && !hits(V, bx, by, bx + bw, by + bh)) return null;
      const m = T.light ? lit(shade(...area(bx, by, bw, bh)), T) : 1;
      const rp = hash(i, j, T.seed), rq = hash(j, i, T.seed + 7), [cx, cy] = pt(mp, mq), pw = pulls(T, F, (cx - F.x) / F.w, (cy - F.y) / F.h);
      // how far along and across the slant the picture shifts with the anchor at Bp, Bq (fractions of p and q)
      const shift = (Bp, Bq) => {
        const [sp, spw] = place(pc[i], pc[i + 1], Bp + tilt * (mq - Bq), T, sgn, rp, m);
        return [(sp + spw / 2 - mp) * PL, both ? (([sq, sqw]) => (sq + sqw / 2 - mq) * QL)(place(qc[j], qc[j + 1], Bq, T, 1, rq, m)) : 0];
      };
      // with Feather, near a seam the shifts every anchor would give are mixed by how hard each pulls; the other
      // anchors are measured along this anchor's own slant
      const [ou, ov] = !pw ? shift(Ap, Aq) : T.pts.reduce(([a, b], [x, y], k) => {
        if (!pw[k]) return [a, b];
        const X = F.x + x * F.w - A[0], Y = F.y + y * F.h - A[1], [u, v] = shift((X * ux + Y * uy - p0) / PL, (X * vx + Y * vy - q0) / QL);
        return [a + pw[k] * u, b + pw[k] * v];
      }, [0, 0]);
      return { mp, mq, poly, bx, by, bw, bh, ou, ov };
    });
    if (T.sort) {
      const key = c => shade(...area(c.bx, c.by, c.bw, c.bh, c.ou * ux + c.ov * vx, c.ou * uy + c.ov * vy));
      const order = sorted(cells.map((c, i) => [i, 0, 0, 0]), w => key(cells[w[0]]), T).map(w => cells[w[0]]);
      cells = cells.map((c, i) => ({ ...c, ou: order[i].ou, ov: order[i].ov }));
    }
    cells.forEach((cell, i) => {
      if (!cell) return;
      const { mp, mq, poly, bx, by, bw, bh, ou, ov } = cell, c = pt(mp, mq);
      g.save(); g.beginPath(); poly.forEach((q, n) => n ? g.lineTo(...q) : g.moveTo(...q)); g.closePath(); g.clip();
      // Flip mirrors the slice along the slant (and across it, in Both) about its own middle
      if (T.flip && (i - iA) & 1) mirror(g, c, ux, uy);
      if (both && T.flip && (j - jA) & 1) mirror(g, c, vx, vy);
      blit(g, [(bx - F.x + ou * ux + ov * vx) * k, (by - F.y + ou * uy + ov * vy) * k, bw * k, bh * k], [bx, by, bw, bh]);
      g.restore();
    });
  }
  // the cut lines, as fractions of the frame, for Lines
  const fr = ([x, y]) => [(x - F.x) / F.w, (y - F.y) / F.h], segs = [];
  for (const v of pc.slice(1, -1)) segs.push([...fr(pt(v, 0)), ...fr(pt(v, 1)), 0]);
  for (const v of qc.slice(1, -1)) segs.push([...fr(pt(0, v)), ...fr(pt(1, v)), 1]);
  geom = { segs };
}
// reflect the canvas in the line through c at right angles to the unit direction u
function mirror(g, c, ux, uy) {
  const a = 1 - 2 * ux * ux, b = -2 * ux * uy, d = 1 - 2 * uy * uy;
  g.transform(a, b, b, d, c[0] - a * c[0] - b * c[1], c[1] - b * c[0] - d * c[1]);
}

// Rings: frames nested round the anchor, outermost first. Frame t (0 at the anchor, 1 the whole photo) shows a
// window of size 1 + (t − 1)·step pinned at the anchor: at 100% that's the frame itself, at 0% the whole photo.
// Past 100% inner windows shrink through nothing and out the other side: there the ring shows its window turned
// half round, as if seen through the anchor. No ring zooms in more than 3×, so none blows up a sliver into a blur.
// Bands cuts every ring into strips across, each with its own Jitter; Stagger slides them by how far they are from
// the anchor, and Zigzag mirrors every other one
// With ops, nothing is drawn: each ring's drawing is added to ops with its size t, for compose to interleave
function rings(g, F, T, ops) {
  const n = T.slices, ts = cuts(n, 0, T).slice(1), ax = T.ax, ay = T.ay;
  const W = src.width, H = src.height, s = T.step / 100, p = 2 ** (T.bend / 50);
  // each ring's frame (x0, y0, w, h in px), how strong the stutter is there, and its window's size z
  let rs = ts.map((t, k) => {
    const x0 = F.x + Math.round(ax * (1 - t) * F.w), y0 = F.y + Math.round(ay * (1 - t) * F.h);
    const w = F.x + Math.round((ax + t * (1 - ax)) * F.w) - x0, h = F.y + Math.round((ay + t * (1 - ay)) * F.h) - y0;
    const m = T.light ? lit(shade(ax * (1 - t), ay * (1 - t), ax + t * (1 - ax), ay + t * (1 - ay)), T) : 1;
    const e = m * falloff(t / Math.max(T.reach / 100, 1e-3), T), z0 = t * (1 - e) + (1 + (t ** p - 1) * s) * e;
    return { t, x0, y0, w, h, e, z: Math.max(Math.abs(z0), t / 3, .002), turn: z0 < 0 };
  });
  // Sort hands the windows out again, darkest or lightest to the innermost ring
  if (T.sort) {
    const order = sorted(rs.map((r, i) => [i, 0, 0, 0]), w => { const { z } = rs[w[0]]; return shade(ax * (1 - z), ay * (1 - z), ax * (1 - z) + z, ay * (1 - z) + z); }, T).map(w => rs[w[0]]);
    rs = rs.map((r, i) => ({ ...r, z: order[i].z, turn: order[i].turn }));
  }
  for (let k = n - 1; k >= 0; k--) {
    const { t, x0, y0, w, h, e, z, turn } = rs[k];
    const ring = () => {
    const sx = ax * (1 - z) * W, sy = ay * (1 - z) * H, sw = z * W, sh = z * H, m = T.bands;
    for (let j = 0; j < m; j++) {
      const a = Math.round(j * h / m), b = Math.round((j + 1) * h / m), qm = (y0 + (a + b) / 2 - F.y) / F.h;
      const jx = (hash(k, j, T.seed) * 2 - 1) * T.jitter / 100 * .2 * e, jy = m > 1 ? 0 : (hash(k, 1, T.seed) * 2 - 1) * T.jitter / 100 * .2 * e;
      const dx = (jx + T.stagger / 100 * (qm - ay) * e) * W, zig = T.zigzag && j & 1;
      const sr = [sx + dx, sy + jy * H + sh * a / h, sw, sh * (b - a) / h], dr = [x0, y0 + a, w, b - a], fx = (!!(T.flip && (n - 1 - k) & 1) !== turn) !== !!zig;
      blit(g, sr, dr, fx, turn);
    }
    };
    ops ? ops.push({ t, ring }) : ring();
  }
  geom = { rings: ts, ax, ay };
}

// the part of the photo nearest anchor n of pts, as a polygon in px: every other anchor cuts off its own side
function region(pts, n, F) {
  const at = ([x, y]) => [F.x + x * F.w, F.y + y * F.h], a = at(pts[n]), big = 1e6;
  let poly = [[-big, -big], [big, -big], [big, big], [-big, big]];
  pts.forEach((pt, m) => {
    if (m === n) return;
    const b = at(pt), nx = b[0] - a[0], ny = b[1] - a[1], c = (nx * (a[0] + b[0]) + ny * (a[1] + b[1])) / 2, keep = q => nx * q[0] + ny * q[1] <= c, cut = [];
    poly.forEach((q, k) => {
      const r = poly[(k + 1) % poly.length];
      if (keep(q)) cut.push(q);
      if (keep(q) !== keep(r)) { const t = (c - nx * q[0] - ny * q[1]) / (nx * (r[0] - q[0]) + ny * (r[1] - q[1])); cut.push([q[0] + t * (r[0] - q[0]), q[1] + t * (r[1] - q[1])]); }
    });
    poly = cut;
  });
  return poly;
}

// the whole picture into g, with the photo's frame at F: each anchor's stutter on its own part of the photo, every
// one also underneath the parts of anchors after it, so no seam shows between them. Feather is done slice by slice,
// in render. Each anchor only draws the slices near its own part that are on g, so more anchors cost no more drawing
function compose(g, F, T) {
  if ((T.light || T.sort) && !lumTable() && blind) say('Light and Sort need a local server (see README)', true);
  geoms = [];
  // Rings with several anchors aren't split into parts: every anchor's rings are drawn together, biggest first,
  // so the tunnels overlap ring by ring and meet along ring edges, never a straight seam
  if (DIRS[T.dir].id === 'rings' && T.pts.length > 1) {
    const ops = [];
    for (const [ax, ay] of T.pts) { g.imageSmoothingQuality = 'high'; rings(g, F, { ...T, ax, ay }, ops); geoms.push({ ...geom, reg: null }); }
    ops.sort((a, b) => b.t - a.t).forEach(o => o.ring());
    return;
  }
  // what of the photo is on g, and a few px of slack round each part for the seams' soft edges
  const S = { x0: Math.max(F.x, 0), y0: Math.max(F.y, 0), x1: Math.min(F.x + F.w, g.canvas.width), y1: Math.min(F.y + F.h, g.canvas.height) }, pad = 3;
  T.pts.forEach(([ax, ay], n) => {
    // drawn clipped to where it's nearer than every anchor before it, but only where it's nearest of all
    const reg = n ? region(T.pts.slice(0, n + 1), n, F) : null, own = T.pts.length > 1 ? region(T.pts, n, F) : null;
    const xs = own ? own.map(q => q[0]) : [], ys = own ? own.map(q => q[1]) : [];
    const V = own ? { x0: Math.max(S.x0, Math.min(...xs) - pad), y0: Math.max(S.y0, Math.min(...ys) - pad), x1: Math.min(S.x1, Math.max(...xs) + pad), y1: Math.min(S.y1, Math.max(...ys) + pad) } : S;
    g.save();
    if (reg) { g.beginPath(); reg.forEach((q, k) => k ? g.lineTo(...q) : g.moveTo(...q)); g.closePath(); g.clip(); }
    render(g, F, { ...T, ax, ay }, V);
    g.restore();
    geoms.push({ ...geom, reg: own ? own.map(([x, y]) => [(x - F.x) / F.w, (y - F.y) / F.h]) : null });
  });
}

// ---------- drawing ----------
function layout() {
  dpr = devicePixelRatio || 1;
  const b = stage.getBoundingClientRect(); W = b.width; H = b.height;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  if (src) {
    // fit the whole picture, rings past the photo included; fit itself stays the photo's own rect
    // on a phone with the menu open, the photo fits in the room between its two halves, leaving space for the
    // ruler marks above and the hover bar below
    const B = box(P), bw = B.x1 - B.x0, bh = B.y1 - B.y0, phone = W <= 700, px = phone ? EDGE : PAD;
    let top = PAD, bottom = PAD;
    if (phone) {
      top = bottom = 44;
      if (!$('#menu').hidden) { top = $('#menuTop').getBoundingClientRect().bottom + 14; bottom = H - $('#menuBottom').getBoundingClientRect().top + 26; }
    }
    const s = Math.max(.01, Math.min((W - 2 * px) / (bw * src.width), (H - top - bottom) / (bh * src.height)));
    base = { w: src.width * s, h: src.height * s };
    base.x = (W - bw * base.w) / 2 - B.x0 * base.w; base.y = top + (H - top - bottom - bh * base.h) / 2 - B.y0 * base.h;
    fitKey = boxKey();
    look();
  }
  paint(); ui();
}

// ---------- view ----------
// base is the photo fitted to the window; view zooms it by z and moves it by x, y (css px). fit is where the photo
// sits on screen now: base with the view on top
let base = { x: 0, y: 0, w: 0, h: 0 }, view = { z: 1, x: 0, y: 0 };
const Z_MIN = .5, Z_MAX = 16;
function look() {
  fit = { w: base.w * view.z, h: base.h * view.z };
  fit.x = W / 2 + (base.x - W / 2) * view.z + view.x; fit.y = H / 2 + (base.y - H / 2) * view.z + view.y;
  // the hover info sits just under the photo, its left edge on the photo's, kept on screen
  Object.assign($('#tip').style, { left: clamp(fit.x, 8, W - 120) + 'px', top: clamp(fit.y + fit.h + TIP_GAP, 8, H - 28) + 'px', maxWidth: Math.max(120, Math.min(fit.w, W - 16)) + 'px' });
  paint();
}
// zoom by k round the point px, py (css px), so whatever is under it stays there
function zoomAt(px, py, k) {
  const z = clamp(view.z * k, Z_MIN, Z_MAX); k = z / view.z;
  const cx = W / 2 + view.x, cy = H / 2 + view.y; // where the window's middle has been moved to
  view.x += (px - cx) * (1 - k); view.y += (py - cy) * (1 - k); view.z = z;
  look();
}
const panBy = (dx, dy) => { view.x += dx; view.y += dy; look(); };
const home = () => { view = { z: 1, x: 0, y: 0 }; look(); };

const frame = () => ({ x: Math.round(fit.x * dpr), y: Math.round(fit.y * dpr), w: Math.round(fit.w * dpr), h: Math.round(fit.h * dpr) });
function paint() { dirty = true; kick(); }
function kick() { if (!raf) raf = requestAnimationFrame(tick); }
function tick(now) {
  raf = 0;
  // refit once the picture's size has changed, but not mid-drag, so the anchor stays under the pointer
  if (src && !dragging && boxKey() !== fitKey) return layout();
  draw();
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (!src) return;
  // out is the size of the window, so however far in you zoom only what's on screen is drawn
  const f = frame(), T = P, R = { x: f.x, y: f.y, w: f.w, h: f.h };
  if (out.width !== cv.width || out.height !== cv.height) { out.width = cv.width; out.height = cv.height; dirty = true; }
  // the picture is kept to the photo's own edges: slanted slices reach past its corners
  if (dirty) {
    octx.clearRect(0, 0, out.width, out.height);
    octx.save(); octx.beginPath(); octx.rect(f.x, f.y, f.w, f.h); octx.clip();
    compose(octx, f, T); octx.restore(); dirty = false;
  }
  ctx.drawImage(out, 0, 0);
  overlay(f, T, R);
  drawTicks(f);
}

// ---------- ticks ----------
// a ruler of small marks above the photo at every cut's x, and right of it at every cut's y. They glide to where
// the cuts are whenever the cuts move. Sizes in css px
const TICK_GAP = 2, TICK_LEN = 8, TIP_GAP = 2; // the same 2px gap as between the controls
let ticks = { top: [], right: [] };
const inside = (poly, x, y) => poly.reduce((c, [ax, ay], k) => { const [bx, by] = poly[(k + 1) % poly.length]; return (ay > y) !== (by > y) && x < ax + (bx - ax) * (y - ay) / (by - ay) ? !c : c; }, false);
// where the cuts are, as photo fractions: x for the top ruler, y for the right one. With several anchors a cut only
// counts if some of it lies in its anchor's part of the photo
function cutsOnRulers() {
  const top = [], right = [], seen = (G, at) => !G.reg || line(11, k => at(k / 10)).some(([x, y]) => inside(G.reg, x, y));
  for (const G of geoms) {
    if (G.rings) for (const t of G.rings) { if (t < 1) { top.push(G.ax * (1 - t), G.ax + t * (1 - G.ax)); right.push(G.ay * (1 - t), G.ay + t * (1 - G.ay)); } }
    else if (G.segs) {
      // slanted cuts come in two sets, slices and bands (0 and 1). Each ruler follows one set, so its marks keep
      // an even beat: the steeper set where it crosses the top edge, the flatter one where it crosses the right
      const steep = [0, 1].map(fam => { const g = G.segs.find(q => q[4] === fam); return g ? Math.abs((g[3] - g[1]) * fit.h) / (Math.abs((g[2] - g[0]) * fit.w) || 1e-9) : -1; });
      const up = steep[0] >= steep[1] ? 0 : 1;
      for (const [x0, y0, x1, y1, fam] of G.segs) {
        if (fam === up && y0 * y1 <= 0 && y0 !== y1) top.push(x0 + (x1 - x0) * -y0 / (y1 - y0));
        if (fam !== up && (x0 - 1) * (x1 - 1) <= 0 && x0 !== x1) right.push(y0 + (y1 - y0) * (1 - x0) / (x1 - x0));
      }
    } else {
      const [xs, ys] = G.across ? [G.pc, G.qc] : [G.qc, G.pc];
      for (const x of xs.slice(1, -1)) if (seen(G, k => [x, k])) top.push(x);
      for (const y of ys.slice(1, -1)) if (seen(G, k => [k, y])) right.push(y);
    }
  }
  const tidy = a => [...new Set(a.filter(v => v > 0 && v < 1).map(v => Math.round(v * 1e4) / 1e4))].sort((a, b) => a - b);
  return { top: tidy(top), right: tidy(right) };
}
function drawTicks(f) {
  const to = cutsOnRulers(), lw = Math.max(1, Math.round(dpr)), o = lw / 2 % 1;
  let moving = false;
  // each mark eases to its cut; when the number of cuts changes they just jump
  for (const k of ['top', 'right']) {
    if (ticks[k].length !== to[k].length) { ticks[k] = to[k]; continue; }
    ticks[k] = ticks[k].map((v, n) => { const d = to[k][n] - v; if (Math.abs(d) > 1e-4) { moving = true; return v + d * .3; } return to[k][n]; });
  }
  ctx.strokeStyle = 'rgba(17,17,17,.3)'; ctx.lineWidth = lw; ctx.beginPath();
  const g = TICK_GAP * dpr, l = TICK_LEN * dpr;
  for (const v of ticks.top) { const x = Math.round(f.x + v * f.w) + o; ctx.moveTo(x, f.y - g - l); ctx.lineTo(x, f.y - g); }
  for (const v of ticks.right) { const y = Math.round(f.y + v * f.h) + o; ctx.moveTo(f.x + f.w + g, y); ctx.lineTo(f.x + f.w + g + l, y); }
  ctx.stroke();
  if (moving) kick();
}

// the slice lines and the anchors, drawn over the picture and never saved
function overlay(f, T, R) {
  const lw = Math.max(1, Math.round(dpr)), o = lw / 2 % 1, X = v => f.x + v * f.w, Y = v => f.y + v * f.h;
  if (lines) for (const G of geoms) {
    // each anchor's lines stay on its own part of the photo
    ctx.save(); ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
    if (G.reg) { ctx.beginPath(); G.reg.forEach(([x, y], k) => k ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); ctx.closePath(); ctx.clip(); }
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = lw; ctx.beginPath();
    // rings are stacked, nearer ones on top, so each ring's outline hides behind the rings inside it: outermost
    // first, each ring repaints its own patch of picture over the outlines drawn so far, then draws its outline
    if (G.rings) for (const t of [...G.rings].reverse()) {
      const x0 = Math.round(f.x + G.ax * (1 - t) * f.w), y0 = Math.round(f.y + G.ay * (1 - t) * f.h), w = Math.round(t * f.w), h = Math.round(t * f.h);
      if (w < 1 || h < 1) continue;
      ctx.drawImage(out, x0, y0, w, h, x0, y0, w, h);
      ctx.strokeRect(x0 + o, y0 + o, w, h);
    } else if (G.segs) for (const [x0, y0, x1, y1] of G.segs) { ctx.moveTo(X(x0), Y(y0)); ctx.lineTo(X(x1), Y(y1)); }
    else {
      const [P0, PW, Q0, QW] = G.across ? [f.x, f.w, f.y, f.h] : [f.y, f.h, f.x, f.w];
      const seg = (p, a, b) => G.across ? (ctx.moveTo(p, a), ctx.lineTo(p, b)) : (ctx.moveTo(a, p), ctx.lineTo(b, p));
      for (const v of G.pc.slice(1, -1)) seg(P0 + Math.round(v * PW) + o, Q0, Q0 + QW);
      for (const v of G.qc.slice(1, -1)) { const q = Q0 + Math.round(v * QW) + o; G.across ? (ctx.moveTo(P0, q), ctx.lineTo(P0 + PW, q)) : (ctx.moveTo(q, P0), ctx.lineTo(q, P0 + PW)); }
    }
    ctx.stroke(); ctx.restore();
  }
  if (mark) T.pts.forEach(([ax, ay], n) => {
    // a flat black square with a yellow dot, like the Menu tab; the one arrows nudge has a solid dot, the others a ring
    const x = Math.round(X(ax)), y = Math.round(Y(ay)), r = Math.round(7 * dpr);
    ctx.fillStyle = '#000'; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    ctx.fillStyle = ctx.strokeStyle = YELLOW; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); ctx.arc(x, y, 3 * dpr, 0, Math.PI * 2);
    n === active || T.pts.length === 1 ? ctx.fill() : ctx.stroke();
  });
}

// the full-size picture, as it is this moment
function bake() {
  const T = P, B = box(T), c = document.createElement('canvas');
  c.width = Math.round((B.x1 - B.x0) * src.width); c.height = Math.round((B.y1 - B.y0) * src.height);
  compose(c.getContext('2d'), { x: -B.x0 * src.width, y: -B.y0 * src.height, w: src.width, h: src.height }, T);
  return [c, B];
}

// the part of the picture that gets drawn, in photo fractions: always just the photo, so nothing (not even rings
// round an anchor off the photo) spills past it
const box = () => ({ x0: 0, y0: 0, x1: 1, y1: 1 });
const boxKey = () => Object.values(box(P)).join();
let fitKey = '';

// ---------- history ----------
const snap = () => ({ src, P: clone(P) });
function restore(s) {
  const resized = s.src.width !== src.width || s.src.height !== src.height;
  src = s.src; P = clone(s.P); active = Math.min(active, P.pts.length - 1);
  resized ? layout() : (paint(), ui());
}
function push() { undos.push(snap()); if (undos.length > HISTORY) undos.shift(); redos = []; }
function undo() { if (!undos.length) return; redos.push(snap()); restore(undos.pop()); }
function redo() { if (!redos.length) return; undos.push(snap()); restore(redos.pop()); }

// change settings as one undo step
function change(o, msg) {
  if (!src) return;
  push(); Object.assign(P, o);
  paint(); ui(); if (msg) say(msg);
}

function cycle(key, d) {
  const list = STEPS[key], v = wrap(P[key] + d, list.length);
  // Both needs rows: arriving with a single band, it gets as many rows as there are slices
  change({ [key]: v, ...(key === 'dir' && list[v].id === 'both' && P.bands < 2 && { bands: Math.min(P.slices, 60) }) });
  tip(list[P[key]].tip);
}

// Stack bakes what's on screen in, so the same stutter runs again on top of itself. Anchors off the photo move to
// the same spots on the bigger, stacked photo
function stack() {
  if (!src) return;
  push(); const [c, B] = bake(), bw = B.x1 - B.x0, bh = B.y1 - B.y0; src = toCanvas(c);
  P.pts = P.pts.map(([x, y]) => [(x - B.x0) / bw, (y - B.y0) / bh]);
  layout(); say('Stacked');
}
function reset() { if (!orig || !undos.length) return; push(); src = orig; P = clone(DEFAULTS); active = 0; layout(); }

// one to three anchors; a new one lands on its usual spot
function setAnchors(n) {
  n = clamp(n, 1, SPOTS.length);
  if (!src || n === P.pts.length) return;
  change({ pts: line(n, k => (P.pts[k] || SPOTS[k]).slice()) });
  active = Math.min(active, n - 1);
  tip(TIPS.anchors);
}

// throw every setting at random, mostly within the ranges that look good
function dice() {
  const R = (a, b) => a + Math.random() * (b - a), I = (a, b) => Math.round(R(a, b)), pick = n => Math.random() * n | 0, often = p => Math.random() < p;
  const dir = pick(DIRS.length);
  change({
    dir, step: often(.15) ? I(110, 220) : I(-40, 70), slices: DIRS[dir].id === 'rings' ? I(4, 40) : I(6, 90), bands: DIRS[dir].id === 'both' ? I(4, 40) : often(.5) ? 1 : I(2, 16),
    reach: often(.5) ? 100 : I(25, 90), bend: often(.5) ? 0 : I(-80, 80), stagger: often(.6) ? 0 : I(-80, 80), jitter: often(.6) ? 0 : I(5, 45),
    rhythm: pick(RHYTHMS.length), falloff: pick(FALLOFFS.length), flip: often(.25), zigzag: often(.25), seed: newSeed(),
    angle: often(.6) || DIRS[dir].id === 'rings' ? 0 : I(-60, 60), light: often(.6) ? 0 : I(-100, 100), sort: often(.75) ? 0 : 1 + pick(2), feather: often(.6) ? 0 : I(10, 70),
    pts: line(often(.65) ? 1 : I(2, 3), () => [R(.15, .85), R(.15, .85)]),
  }, 'Dice thrown');
}

// ---------- pointer ----------
function locate(e) {
  const b = cv.getBoundingClientRect(), x = e.clientX - b.left - fit.x, y = e.clientY - b.top - fit.y;
  return { fx: x / fit.w, fy: y / fit.h, in: x >= -12 && y >= -12 && x < fit.w + 12 && y < fit.h + 12 };
}
// anchors can leave the photo, up to a photo's width or height past each edge, so the stutter can grow from off-picture
const A_MIN = -1, A_MAX = 2;
// the anchor nearest the pointer and how far it is, in css px
function nearest(e) {
  const p = locate(e);
  return P.pts.reduce((b, [x, y], n) => { const d = Math.hypot((p.fx - x) * fit.w, (p.fy - y) * fit.h); return d < b[1] ? [n, d] : b; }, [0, Infinity]);
}
const moveAnchor = e => { const p = locate(e); P.pts[active] = [clamp(p.fx, A_MIN, A_MAX), clamp(p.fy, A_MIN, A_MAX)]; paint(); };
// on the photo, or on an anchor wherever it is
const grabbable = e => locate(e).in || nearest(e)[1] < 16;

let dragging = false, panning = null, spaceDown = false;
// fingers on a touch screen: two of them pinch and move the view
const fingers = new Map();
let pinch = null;
const twoFingers = () => { const [a, b] = [...fingers.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) }; };
cv.addEventListener('pointerdown', e => {
  if (!src) return;
  if (e.pointerType === 'touch') {
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.size === 2) { dragging = false; pinch = twoFingers(); cv.setPointerCapture(e.pointerId); return; }
  }
  // Space or the middle button moves the view
  if (spaceDown || e.button === 1) { e.preventDefault(); cv.setPointerCapture(e.pointerId); panning = { x: e.clientX, y: e.clientY }; cv.style.cursor = 'grabbing'; return; }
  if (!grabbable(e)) return;
  active = nearest(e)[0];
  cv.setPointerCapture(e.pointerId); push(); dragging = true; cv.style.cursor = 'grabbing';
  moveAnchor(e); ui();
});
cv.addEventListener('pointermove', e => {
  if (fingers.has(e.pointerId)) fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && fingers.size === 2) {
    const now = twoFingers(), b = cv.getBoundingClientRect();
    panBy(now.x - pinch.x, now.y - pinch.y); zoomAt(now.x - b.left, now.y - b.top, now.d / pinch.d); pinch = now;
    return;
  }
  if (panning) { panBy(e.clientX - panning.x, e.clientY - panning.y); panning = { x: e.clientX, y: e.clientY }; return; }
  if (dragging) return moveAnchor(e);
  if (spaceDown) { cv.style.cursor = 'grab'; return; }
  // a hand over an anchor, as it's there to be dragged; a crosshair elsewhere on the photo
  cv.style.cursor = !src ? 'default' : nearest(e)[1] < 16 ? 'grab' : locate(e).in ? 'crosshair' : 'default';
});
const endDrag = e => {
  fingers.delete(e.pointerId); if (fingers.size < 2) pinch = null;
  if (panning) { panning = null; cv.style.cursor = spaceDown ? 'grab' : 'default'; }
  if (dragging) cv.style.cursor = 'grab';
  dragging = false; ui(); kick();
};
cv.addEventListener('pointerup', endDrag);
cv.addEventListener('pointercancel', endDrag);
cv.addEventListener('dblclick', () => {
  const home = line(P.pts.length, k => SPOTS[k].slice());
  if (src && P.pts.some((p, k) => p[0] !== home[k][0] || p[1] !== home[k][1])) change({ pts: home });
});
cv.addEventListener('contextmenu', e => e.preventDefault());
// scrolling moves the view; a trackpad pinch (which arrives as a scroll with Ctrl held) or Ctrl/Cmd + scroll zooms
// round the pointer
cv.addEventListener('wheel', e => {
  if (!src) return;
  e.preventDefault();
  const b = cv.getBoundingClientRect(), px = e.deltaMode === 1 ? 16 : 1;
  if (e.ctrlKey || e.metaKey) zoomAt(e.clientX - b.left, e.clientY - b.top, Math.exp(-e.deltaY * px * .01));
  else panBy(-e.deltaX * px, -e.deltaY * px);
}, { passive: false });
// Safari sends its trackpad pinch as gesture events instead
let gesture = 1;
cv.addEventListener('gesturestart', e => { e.preventDefault(); gesture = 1; });
cv.addEventListener('gesturechange', e => { e.preventDefault(); const b = cv.getBoundingClientRect(); zoomAt(e.clientX - b.left, e.clientY - b.top, e.scale / gesture); gesture = e.scale; });
addEventListener('keyup', e => { if (e.key === ' ') { spaceDown = false; if (!panning) cv.style.cursor = 'default'; } });
addEventListener('blur', () => { spaceDown = false; });

// ---------- bar ----------
let tipT = 0;
function tip(msg) { const t = $('#tip'); t.textContent = msg; t.hidden = !msg; }
function say(msg, flash) {
  const t = $('#tip'); tip(msg); t.classList.toggle('flash', !!flash);
  clearTimeout(tipT); tipT = setTimeout(() => { t.classList.remove('flash'); tip(''); }, 1800);
}

function ui() {
  // sliders fill as far as they're turned
  for (const k in SLIDERS) {
    const el = $('#' + k); el.value = P[k];
    el.parentElement.style.setProperty('--v', (P[k] - el.min) / (el.max - el.min) * 100);
  }
  for (const k in STEPS) $(`#${k}Name`).textContent = (STEP_PREFIX[k] || '') + STEPS[k][P[k]].label;
  for (const k of ['flip', 'zigzag']) { $('#' + k).classList.toggle('on', P[k]); $('#' + k).setAttribute('aria-pressed', P[k]); }
  for (const [k, on] of [['lines', lines], ['mark', mark]]) { $('#' + k).classList.toggle('on', on); $('#' + k).setAttribute('aria-pressed', on); }
  $('#anchorsName').textContent = P.pts.length + (P.pts.length > 1 ? ' Anchors' : ' Anchor');
  $('#anchorsPrev').disabled = P.pts.length <= 1; $('#anchorsNext').disabled = P.pts.length >= SPOTS.length;
  $('#angle').disabled = DIRS[P.dir].id === 'rings';
  $('#undo').disabled = !undos.length;
  $('#redo').disabled = !redos.length;
  $('#reset').disabled = !undos.length;
  for (const b of ['#stack', '#save', '#dice']) $(b).disabled = !src;
}

// sliders: dragging one is a single undo step
let editing = false;
for (const k in SLIDERS) {
  const el = $('#' + k);
  el.oninput = () => {
    if (!src) return;
    if (!editing) { push(); editing = true; }
    P[k] = +el.value; paint(); ui(); tip(reading(k));
  };
  el.onchange = () => { editing = false; };
  el.onpointerup = () => el.blur(); // hand the keys back to the page after a drag
}
for (const k in STEPS) {
  $(`#${k}Prev`).onclick = () => cycle(k, -1);
  $(`#${k}Next`).onclick = $(`#${k}Name`).onclick = () => cycle(k, 1);
}
// hovering a control explains it in the bar
for (const el of document.querySelectorAll('[data-tip]')) {
  const k = el.dataset.tip;
  // sliders show no number, so hovering one reads it out first
  el.onmouseenter = () => tip(STEPS[k] ? STEPS[k][P[k]].tip : SLIDERS[k] ? `${reading(k)} · ${SLIDERS[k].tip}` : TIPS[k]);
  el.onmouseleave = () => { if (!$('#tip').classList.contains('flash')) tip(''); };
}

const toggle = k => change({ [k]: !P[k] });
function toggleView(k) { k === 'lines' ? lines = !lines : mark = !mark; ui(); draw(); }

$('#file').onchange = e => { loadFile(e.target.files[0]); e.target.value = ''; };
$('#stack').onclick = stack;
$('#flip').onclick = () => toggle('flip');
$('#zigzag').onclick = () => toggle('zigzag');
$('#lines').onclick = () => toggleView('lines');
$('#mark').onclick = () => toggleView('mark');
$('#dice').onclick = dice;
$('#undo').onclick = undo;
$('#redo').onclick = redo;
$('#reset').onclick = reset;
$('#save').onclick = () => save();
$('#anchorsPrev').onclick = () => setAnchors(P.pts.length - 1);
$('#anchorsNext').onclick = $('#anchorsName').onclick = () => setAnchors(P.pts.length % SPOTS.length + 1);

// corner buttons open their sheets
function toggleSheet(btn, sheet, open = $(sheet).hidden) {
  $(sheet).hidden = !open;
  $(btn).setAttribute('aria-expanded', open);
}
// on a phone the menu takes room from the photo, so opening or closing it fits the photo again
$('#menuBtn').onclick = () => { toggleSheet('#menuBtn', '#menu'); if (W <= 700) layout(); };
$('#aboutBtn').onclick = () => toggleSheet('#aboutBtn', '#aboutText');

// ---------- saving ----------
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// the picture at full size as a JPG, on white wherever it's empty
function save() {
  if (!src) return;
  const [c] = bake(), w = document.createElement('canvas'), g = w.getContext('2d');
  w.width = c.width; w.height = c.height; g.fillStyle = '#fff'; g.fillRect(0, 0, w.width, w.height); g.drawImage(c, 0, 0);
  w.toBlob(b => download(b, 'stutwith.jpg'), 'image/jpeg', .92);
}

// ---------- keys, drop, paste ----------
addEventListener('keydown', e => {
  if (e.target.matches?.('input, textarea')) return;
  const k = e.key.toLowerCase(), mod = e.metaKey || e.ctrlKey;
  if (mod) {
    if (k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (k === 'y') { e.preventDefault(); redo(); }
    else if (k === 's') { e.preventDefault(); save(); }
    return;
  }
  const nudge = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[k];
  if (nudge && src) {
    e.preventDefault(); const s = e.shiftKey ? .05 : .01, pts = P.pts.map(p => p.slice()), [x, y] = pts[active];
    pts[active] = [clamp(x + nudge[0] * s, A_MIN, A_MAX), clamp(y + nudge[1] * s, A_MIN, A_MAX)];
    return change({ pts });
  }
  if (k >= '1' && k <= String(SPOTS.length)) return setAnchors(+k);
  switch (k) {
    case 'd': cycle('dir', e.shiftKey ? -1 : 1); break;
    case 'e': cycle('edge', 1); break;
    case '[': case '-': change({ slices: clamp(P.slices - 1, 2, 120) }); break;
    case ']': case '=': case '+': change({ slices: clamp(P.slices + 1, 2, 120) }); break;
    case 's': stack(); break;
    case 'n': dice(); break;
    case 'f': toggle('flip'); break;
    case 'z': toggle('zigzag'); break;
    case 'l': case 'g': toggleView('lines'); break;
    case 'a': toggleView('mark'); break;
    case 'u': $('#file').click(); break;
    case 'h': $('#menuBtn').click(); break;
    case 'escape': toggleSheet('#menuBtn', '#menu', false); if (W <= 700) layout(); toggleSheet('#aboutBtn', '#aboutText', false); break;
    case '0': home(); break;
    case ' ': e.preventDefault(); if (!spaceDown) { spaceDown = true; if (!dragging) cv.style.cursor = 'grab'; } break;
  }
});

let dragDepth = 0;
addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; $('#drop').hidden = false; });
addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#drop').hidden = true; } });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); dragDepth = 0; $('#drop').hidden = true; loadFile(e.dataTransfer.files[0]); });
// Cmd/Ctrl+V swaps in a copied image: a picture or image file on the clipboard, or failing that the first image in
// something copied off a web page (that one only loads if its site allows it)
addEventListener('paste', async e => {
  if (e.target.matches?.('input, textarea')) return;
  const d = e.clipboardData, f = [...d.files, ...[...d.items].filter(i => i.kind === 'file').map(i => i.getAsFile())].find(f => f?.type.startsWith('image/'));
  if (f) { e.preventDefault(); return loadFile(f); }
  const url = new DOMParser().parseFromString(d.getData('text/html'), 'text/html').querySelector('img')?.src || d.getData('text/plain').trim();
  if (!/^(https?:|data:image\/)/.test(url)) return;
  e.preventDefault();
  try { start(toCanvas(await loadImage(url, !url.startsWith('data:')))); }
  catch { if (/\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(url) || /<img/i.test(d.getData('text/html'))) say('Couldn\'t paste that image: save it and drop it in instead', true); }
});

new ResizeObserver(layout).observe(stage);

loadImage(STARTER).then(img => start(toCanvas(img))).catch(() => start(testCard()));
ui();
